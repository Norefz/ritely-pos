"""Business rules for opening, closing, and listing cashier shifts."""

from datetime import datetime, timezone

from bson import ObjectId
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.models.user import ASSIGNED_SHIFTS


class ShiftAlreadyOpenError(Exception):
    """Raised when a store already has an open shift."""


class ShiftNotFoundError(Exception):
    """Raised when a requested shift does not exist."""


class ShiftNotOpenError(Exception):
    """Raised when a requested shift is already closed."""


class ShiftOwnershipError(Exception):
    """Raised when a cashier attempts to close another cashier's shift."""


def _isoformat(value):
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def public_shift(document):
    return {
        "id": str(document["_id"]),
        "cashier_id": str(document["cashier_id"]),
        "cashier": document["cashier_name"],
        "cashier_name": document["cashier_name"],
        "employee_id": document.get("employee_id"),
        "assigned_shift": document["assigned_shift"],
        "status": document["status"],
        "opened_at": _isoformat(document["opened_at"]),
        "closed_at": _isoformat(document.get("closed_at")),
        "reason": document.get("closing_reason", ""),
        "sales_total": document.get("sales_total", 0),
        "transaction_count": document.get("transaction_count", 0),
    }


def get_shift_snapshot(collection, user):
    open_document = collection.find_one({"status": "open"})
    query = {} if user["role"] == "manager" else {"cashier_id": user["_id"]}
    history = collection.find(query).sort("opened_at", 1)
    return {
        "open_shift": public_shift(open_document) if open_document else None,
        "shifts": [public_shift(document) for document in history],
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
        "assigned_shift": assigned_shift,
        "status": "open",
        "active_lock": "store",
        "opened_at": datetime.now(timezone.utc),
        "sales_total": 0,
        "transaction_count": 0,
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
    if user["role"] == "manager" and not reason.strip():
        raise ValueError("Alasan penutupan paksa wajib diisi.")

    changes = {
        "status": "closed",
        "closed_at": datetime.now(timezone.utc),
        "closing_reason": reason.strip(),
        "closed_by": user["_id"],
        "closed_by_role": user["role"],
    }
    result = collection.find_one_and_update(
        {"_id": document["_id"], "status": "open"},
        {"$set": changes, "$unset": {"active_lock": ""}},
        return_document=ReturnDocument.AFTER,
        session=session,
    )
    if not result:
        raise ShiftNotOpenError("Shift ini sudah ditutup.")
    return public_shift(result)
