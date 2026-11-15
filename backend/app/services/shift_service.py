"""Business rules for opening, closing, and listing cashier shifts."""

from datetime import datetime, time, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from bson import ObjectId
from bson.decimal128 import Decimal128
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.models.user import ASSIGNED_SHIFTS


STORE_TIMEZONE = ZoneInfo("Asia/Jakarta")
SHIFT_WINDOWS = {
    "shift_1": (time(7, 0), time(15, 0)),
    "shift_2": (time(15, 0), time(22, 0)),
}


class ShiftAlreadyOpenError(Exception):
    """Raised when a store already has an open shift."""


class ShiftNotFoundError(Exception):
    """Raised when a requested shift does not exist."""


class ShiftNotOpenError(Exception):
    """Raised when a requested shift is already closed."""


class ShiftOwnershipError(Exception):
    """Raised when a cashier attempts to close another cashier's shift."""


class ShiftNotEndedError(Exception):
    """Raised when a cashier tries to close before the scheduled end."""


class ShiftPendingSalesError(Exception):
    """Raised when a shift still has pending sales."""


def _isoformat(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _as_store_local(value):
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(STORE_TIMEZONE)


def public_shift(document):
    sales_total = document.get("sales_total", 0)
    if isinstance(sales_total, Decimal128):
        value = sales_total.to_decimal()
        sales_total = int(value) if value == value.to_integral_value() else float(value)
    elif isinstance(sales_total, Decimal):
        sales_total = int(sales_total) if sales_total == sales_total.to_integral_value() else float(sales_total)
    return {
        "id": str(document["_id"]),
        "cashier_id": str(document["cashier_id"]),
        "cashier": document["cashier_name"],
        "cashier_name": document["cashier_name"],
        "employee_id": document.get("employee_id"),
        "assigned_shift": document.get("shift_type", document.get("assigned_shift")),
        "shift_type": document.get("shift_type", document.get("assigned_shift")),
        "status": document["status"],
        "opened_at": _isoformat(document["opened_at"]),
        "closed_at": _isoformat(document.get("closed_at")),
        "closed_by": str(document["closed_by"]) if document.get("closed_by") else None,
        "closed_by_name": document.get("closed_by_name"),
        "closed_by_role": document.get("closed_by_role"),
        "reason": document.get("close_reason", document.get("closing_reason", "")),
        "close_reason": document.get("close_reason", document.get("closing_reason", "")),
        "sales_total": sales_total,
        "transaction_count": document.get("transaction_count", 0),
    }


def get_shift_snapshot(collection, user):
    open_document = collection.find_one({"status": "open"})
    query = {} if user["role"] == "manager" else {"cashier_id": user["_id"]}
    history = collection.find(query).sort("opened_at", 1)
    shifts = list(history)
    shift_ids = [document["_id"] for document in shifts]
    if open_document and open_document["_id"] not in shift_ids:
        shift_ids.append(open_document["_id"])
    totals = {}
    if shift_ids:
        totals = {
            row["_id"]: {
                "sales_total": row["sales_total"],
                "transaction_count": row["transaction_count"],
            }
            for row in collection.database["sales"].aggregate(
                [
                    {
                        "$match": {
                            "shift_id": {"$in": shift_ids},
                            "status": "completed",
                            "payment_status": "paid",
                        }
                    },
                    {
                        "$group": {
                            "_id": "$shift_id",
                            "sales_total": {"$sum": "$total"},
                            "transaction_count": {"$sum": 1},
                        }
                    },
                ]
            )
        }
    for document in shifts:
        document.update(totals.get(document["_id"], {}))
    if open_document:
        open_document.update(totals.get(open_document["_id"], {}))
    return {
        "open_shift": public_shift(open_document) if open_document else None,
        "shifts": [public_shift(document) for document in shifts],
    }


def open_shift(collection, user, session=None):
    if user.get("role") != "cashier":
        raise PermissionError("Hanya kasir yang dapat membuka shift.")
    assigned_shift = user.get("assigned_shift")
    if assigned_shift not in ASSIGNED_SHIFTS:
        raise ValueError("Kasir belum memiliki penugasan shift yang valid.")

    document = {
        "cashier_id": user["_id"],
        "cashier_name": user["name"],
        "employee_id": user.get("employee_id"),
        "shift_type": assigned_shift,
        "status": "open",
        "active_lock": "store",
        "opened_at": datetime.now(timezone.utc),
        "activity_version": 0,
    }
    try:
        result = collection.insert_one(document, session=session)
    except DuplicateKeyError as error:
        raise ShiftAlreadyOpenError("Sudah ada shift yang sedang berjalan.") from error
    document["_id"] = result.inserted_id
    return public_shift(document)


def close_shift(collection, shift_id, user, reason="", session=None):
    if not ObjectId.is_valid(shift_id):
        raise ShiftNotFoundError("Shift tidak ditemukan.")
    document = collection.find_one(
        {"_id": ObjectId(shift_id)},
        session=session,
    )
    if not document:
        raise ShiftNotFoundError("Shift tidak ditemukan.")
    if document.get("status") != "open":
        raise ShiftNotOpenError("Shift ini sudah ditutup.")
    if user["role"] == "cashier" and document["cashier_id"] != user["_id"]:
        raise ShiftOwnershipError("Kasir hanya dapat menutup shift miliknya.")
    if user["role"] == "cashier":
        shift_type = document.get("shift_type", document.get("assigned_shift"))
        _, end_time = SHIFT_WINDOWS[shift_type]
        opened_local = _as_store_local(document["opened_at"])
        shift_end = datetime.combine(
            opened_local.date(), end_time, tzinfo=STORE_TIMEZONE
        )
        if datetime.now(STORE_TIMEZONE) < shift_end:
            raise ShiftNotEndedError(
                f"Shift hanya dapat ditutup mulai pukul {end_time:%H.%M} WIB."
            )
    if user["role"] == "manager" and not reason.strip():
        raise ValueError("Alasan penutupan paksa wajib diisi.")

    pending_sale = collection.database["sales"].find_one(
        {"shift_id": document["_id"], "status": "pending"},
        session=session,
    )
    if pending_sale:
        raise ShiftPendingSalesError(
            "Shift tidak dapat ditutup selama masih ada transaksi pending."
        )

    changes = {
        "status": "closed",
        "closed_at": datetime.now(timezone.utc),
        "close_reason": reason.strip(),
        "closed_by": user["_id"],
        "closed_by_name": user["name"],
        "closed_by_role": user["role"],
    }
    result = collection.find_one_and_update(
        {"_id": document["_id"], "status": "open"},
        {
            "$set": changes,
            "$unset": {"active_lock": ""},
            "$inc": {"activity_version": 1},
        },
        return_document=ReturnDocument.AFTER,
        session=session,
    )
    if not result:
        raise ShiftNotOpenError("Shift ini sudah ditutup.")
    return public_shift(result)
