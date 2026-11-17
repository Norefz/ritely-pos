"""Seed sample completed and cancelled sales for marked sample shifts."""

import os
import random
import re
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from bson import Decimal128, ObjectId
from pymongo.errors import PyMongoError

from app.config import Config
from app.database.indexes import ensure_indexes
from app.database.mongo import get_database


SHIFT_DEMO_MARKER = "sample_shift_history_v1"
SALE_DEMO_MARKER = "sample_shift_sales_v1"
STORE_TIMEZONE = ZoneInfo("Asia/Jakarta")
TRANSACTIONS_PER_SHIFT = 5
MINIMUM_PAID_TRANSACTION_TOTAL = Decimal("50000")


def validate_target():
    environment = os.getenv("RITELY_ENVIRONMENT", "").strip().lower()
    database_name = Config.MONGO_DB_NAME.strip()
    database_tokens = set(re.split(r"[^a-z0-9]+", database_name.lower()))
    confirmed_database = os.getenv("RITELY_CONFIRM_DATABASE", "").strip()

    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV", "").lower() == "production":
        raise ValueError("Seeder transaksi hanya dapat dijalankan secara lokal.")
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


def _decimal(value):
    return value.to_decimal() if isinstance(value, Decimal128) else Decimal(str(value))


def _sale_items(products):
    basket = {}
    for product in random.sample(products, k=min(random.randint(1, 3), len(products))):
        basket[product["_id"]] = [product, random.randint(1, 3)]

    def basket_total():
        return sum(
            (_decimal(product["selling_price"]) * quantity for product, quantity in basket.values()),
            Decimal("0"),
        )

    while basket_total() < MINIMUM_PAID_TRANSACTION_TOTAL:
        product = random.choice(products)
        if product["_id"] in basket:
            basket[product["_id"]][1] += random.randint(1, 3)
        else:
            basket[product["_id"]] = [product, random.randint(1, 3)]

    items = []
    total = Decimal("0")
    for product, quantity in basket.values():
        price = _decimal(product["selling_price"])
        line_total = price * quantity
        total += line_total
        items.append(
            {
                "product_id": product["_id"],
                "sku": product["sku"],
                "product_name": product["name"],
                "quantity": quantity,
                "price": Decimal128(str(price)),
                "line_total": Decimal128(str(line_total)),
            }
        )
    return items, total


def seed_shift_sales(database, replace=False):
    shifts = list(
        database["shifts"]
        .find({"demo_seed": SHIFT_DEMO_MARKER, "status": "closed"})
        .sort("opened_at", 1)
    )
    if not shifts:
        raise ValueError("Belum ada shift dummy. Jalankan seeder shift_history terlebih dahulu.")

    sales = database["sales"]
    existing_count = sales.count_documents({"demo_seed": SALE_DEMO_MARKER})
    if existing_count and not replace:
        raise ValueError(
            f"Sudah ada {existing_count} transaksi dummy. Gunakan --replace "
            "untuk mengganti hanya transaksi dari seeder ini."
        )
    products = list(
        database["master_product"].find(
            {"is_active": True, "selling_price": {"$exists": True}},
            {"sku": 1, "name": 1, "selling_price": 1},
        )
    )
    if not products:
        raise ValueError("Tidak ada produk aktif untuk transaksi dummy.")
    documents = []
    completed_count = 0
    voided_count = 0
    cash_count = 0
    online_paid_count = 0

    for shift in shifts:
        opened_at = shift["opened_at"]
        closed_at = shift["closed_at"]
        if opened_at.tzinfo is None:
            opened_at = opened_at.replace(tzinfo=timezone.utc)
        if closed_at.tzinfo is None:
            closed_at = closed_at.replace(tzinfo=timezone.utc)
        duration_seconds = max(0, int((closed_at - opened_at).total_seconds()))
        receipt_date = opened_at.astimezone(STORE_TIMEZONE).strftime("%Y%m%d")
        transactions = [
            ("completed", "cash"),
            ("completed", "cash"),
            ("completed", "online"),
            ("completed", "online"),
            ("voided", "online"),
        ]
        random.shuffle(transactions)

        for status, payment_method in transactions:
            sale_id = ObjectId()
            receipt_number = f"RTL-{receipt_date}-{str(sale_id).upper()}"
            items, total = _sale_items(products)
            created_at = opened_at + timedelta(
                seconds=random.randint(0, duration_seconds)
            )
            document = {
                "_id": sale_id,
                "receipt_number": receipt_number,
                "client_request_id": f"demo-{sale_id}",
                "cashier_id": shift["cashier_id"],
                "cashier_name": shift["cashier_name"],
                "shift_id": shift["_id"],
                "items": items,
                "subtotal": Decimal128(str(total)),
                "total": Decimal128(str(total)),
                "payment_method": payment_method,
                "payment_status": "paid" if status == "completed" else "failed",
                "status": status,
                "created_at": created_at,
                "demo_seed": SALE_DEMO_MARKER,
                "demo_note": "Sample transaction; inventory and payment provider were not changed.",
            }

            if payment_method == "online":
                document["payment_order_id"] = f"DEMO-{sale_id}"
            if status == "completed":
                document["paid_at"] = created_at
                completed_count += 1
                if payment_method == "cash":
                    document["cash_received"] = Decimal128(str(total))
                    document["change"] = Decimal128("0")
                    cash_count += 1
                else:
                    document["payment_reference"] = f"DEMO-PAY-{sale_id}"
                    online_paid_count += 1
            else:
                document["voided_at"] = created_at
                document["voided_by"] = shift["cashier_id"]
                document["void_reason"] = "Transaksi dummy dibatalkan."
                voided_count += 1

            documents.append(document)

    assert len(documents) == len(shifts) * TRANSACTIONS_PER_SHIFT
    if replace and existing_count:
        sales.delete_many({"demo_seed": SALE_DEMO_MARKER})
    sales.insert_many(documents)
    return {
        "total": len(documents),
        "completed": completed_count,
        "voided": voided_count,
        "cash": cash_count,
        "online_paid": online_paid_count,
    }


def main(argv=None):
    import argparse

    parser = argparse.ArgumentParser(description="Isi transaksi contoh pada shift development.")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Hapus hanya transaksi dummy dari seeder ini sebelum membuat ulang.",
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
        result = seed_shift_sales(database, args.replace)
    except (PyMongoError, ValueError) as error:
        print(f"Seeder transaksi shift gagal: {error}")
        return 1

    print(
        "Seeder transaksi shift selesai: "
        f"{result['total']} transaksi ({result['completed']} berhasil/lunas, "
        f"{result['cash']} tunai, {result['online_paid']} online; "
        f"{result['voided']} dibatalkan). Stok dan Midtrans tidak diubah."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
