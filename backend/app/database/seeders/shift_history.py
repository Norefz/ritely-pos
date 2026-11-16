"""Seed clearly marked sample shift history into a development database."""

import argparse
import os
import random
import re
import sys
import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from pymongo.errors import PyMongoError

from app.config import Config
from app.database.indexes import ensure_indexes
from app.database.mongo import get_database


STORE_TIMEZONE = ZoneInfo("Asia/Jakarta")
SCHEDULES = {
    "shift_1": (time(7, 0), time(15, 0)),
    "shift_2": (time(15, 0), time(22, 0)),
}
DEMO_MARKER = "sample_shift_history_v1"
DEMO_SALES_MARKER = "sample_shift_sales_v1"


def validate_target():
    environment = os.getenv("RITELY_ENVIRONMENT", "").strip().lower()
    database_name = Config.MONGO_DB_NAME.strip()
    database_tokens = set(re.split(r"[^a-z0-9]+", database_name.lower()))
    confirmed_database = os.getenv("RITELY_CONFIRM_DATABASE", "").strip()

    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV", "").lower() == "production":
        raise ValueError("Seeder shift hanya dapat dijalankan secara lokal.")
    if environment != "development":
        raise ValueError("Set RITELY_ENVIRONMENT=development sebelum menjalankan seeder.")
    if (
        not database_tokens.intersection({"dev", "development"})
        and confirmed_database != database_name
    ):
        raise ValueError(
            "Gunakan database terpisah bernama dengan akhiran -dev atau "
            "-development. Jika nama database yang dipilih berbeda, set "
            "RITELY_CONFIRM_DATABASE sama persis dengan MONGO_DB_NAME."
        )


def _make_shift(cashier, shift_type, shift_date, timing, demo_batch):
    start_time, end_time = SCHEDULES[shift_type]
    opened_local = datetime.combine(
        shift_date, start_time, tzinfo=STORE_TIMEZONE
    ) + timedelta(minutes=random.randint(0, 10))

    if timing == "on_time":
        delay_minutes = random.randint(0, 5)
    elif timing == "late":
        delay_minutes = random.randint(6, 30)
    else:
        delay_minutes = random.randint(31, 120)

    closed_local = datetime.combine(
        shift_date, end_time, tzinfo=STORE_TIMEZONE
    ) + timedelta(minutes=delay_minutes)
    now = datetime.now(timezone.utc)
    return {
        "cashier_id": cashier["_id"],
        "cashier_name": cashier["name"],
        "employee_id": cashier.get("employee_id"),
        "shift_type": shift_type,
        "status": "closed",
        "opened_at": opened_local.astimezone(timezone.utc),
        "closed_at": closed_local.astimezone(timezone.utc),
        "close_reason": "",
        "closed_by": cashier["_id"],
        "closed_by_name": cashier["name"],
        "closed_by_role": "cashier",
        "activity_version": 1,
        "created_at": now,
        "demo_seed": DEMO_MARKER,
        "demo_batch": demo_batch,
    }


def seed_shift_history(
    database,
    count=50,
    days=60,
    replace=False,
    start_date=None,
    end_date=None,
):
    if not 1 <= count <= 500:
        raise ValueError("Jumlah shift harus antara 1 dan 500.")
    if not 1 <= days <= 365:
        raise ValueError("Rentang hari harus antara 1 dan 365.")
    if (start_date is None) != (end_date is None):
        raise ValueError("Isi --start-date dan --end-date bersamaan.")
    if start_date and end_date < start_date:
        raise ValueError("--end-date tidak boleh sebelum --start-date.")

    users = database["users"]
    cashiers = list(
        users.find(
            {"role": "cashier"},
            {"name": 1, "employee_id": 1, "assigned_shift": 1},
        )
    )
    if not cashiers:
        raise ValueError("Buat setidaknya satu akun kasir sebelum mengisi riwayat shift.")

    shifts = database["shifts"]
    existing_demo_count = shifts.count_documents({"demo_seed": DEMO_MARKER})
    if existing_demo_count and not replace:
        raise ValueError(
            f"Sudah ada {existing_demo_count} shift dummy. Gunakan --replace "
            "untuk mengganti hanya data dummy ini."
        )
    on_time_count = int(count * 0.8)
    remaining = count - on_time_count
    timings = (
        ["on_time"] * on_time_count
        + ["late"] * ((remaining + 1) // 2)
        + ["overdue"] * (remaining // 2)
    )
    random.shuffle(timings)

    today = datetime.now(STORE_TIMEZONE).date()
    demo_batch = uuid.uuid4().hex
    documents = []
    for timing in timings:
        cashier = random.choice(cashiers)
        shift_type = cashier.get("assigned_shift")
        if shift_type not in SCHEDULES:
            shift_type = random.choice(tuple(SCHEDULES))
        if start_date:
            date_span = (end_date - start_date).days
            shift_date = start_date + timedelta(days=random.randint(0, date_span))
        else:
            shift_date = today - timedelta(days=random.randint(1, days))
        documents.append(
            _make_shift(cashier, shift_type, shift_date, timing, demo_batch)
        )

    if documents:
        shifts.insert_many(documents)
    if replace and existing_demo_count:
        database["sales"].delete_many({"demo_seed": DEMO_SALES_MARKER})
        shifts.delete_many(
            {"demo_seed": DEMO_MARKER, "demo_batch": {"$ne": demo_batch}}
        )
    return {
        "total": len(documents),
        "on_time": on_time_count,
        "late": timings.count("late"),
        "overdue": timings.count("overdue"),
        "first_date": min(document["opened_at"] for document in documents)
        .astimezone(STORE_TIMEZONE)
        .date(),
        "last_date": max(document["opened_at"] for document in documents)
        .astimezone(STORE_TIMEZONE)
        .date(),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description="Isi riwayat shift dummy untuk development.")
    parser.add_argument("--count", type=int, default=50, help="Jumlah shift (1–500).")
    parser.add_argument("--days", type=int, default=60, help="Sebar data ke hari sebelumnya (1–365).")
    parser.add_argument(
        "--start-date",
        type=date.fromisoformat,
        help="Tanggal awal inclusive, format YYYY-MM-DD.",
    )
    parser.add_argument(
        "--end-date",
        type=date.fromisoformat,
        help="Tanggal akhir inclusive, format YYYY-MM-DD.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Hapus hanya shift dummy dari seeder ini sebelum membuat data baru.",
    )
    args = parser.parse_args(argv)

    try:
        validate_target()
        database = get_database(
            Config.MONGO_URI,
            Config.MONGO_DB_NAME,
            Config.MONGO_SERVER_SELECTION_TIMEOUT_MS,
        )
        ensure_indexes(database)
        result = seed_shift_history(
            database,
            args.count,
            args.days,
            args.replace,
            args.start_date,
            args.end_date,
        )
    except (PyMongoError, ValueError) as error:
        print(f"Seeder riwayat shift gagal: {error}")
        return 1

    print(
        "Seeder riwayat shift selesai: "
        f"{result['total']} shift ({result['on_time']} tepat waktu/hijau, "
        f"{result['late']} terlambat/kuning, {result['overdue']} terlambat lama/merah) "
        f"pada {result['first_date']}–{result['last_date']}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
