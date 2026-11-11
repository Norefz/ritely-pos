"""Validation and serialization for users collection documents."""

from datetime import datetime, timezone


USER_ROLES = {"manager", "cashier"}
ASSIGNED_SHIFTS = {"shift_1", "shift_2"}


def build_user_document(data, password_hash):
    name = data.get("name")
    username = data.get("username")
    role = data.get("role")

    if not isinstance(name, str):
        raise ValueError("Nama pengguna wajib berupa teks.")
    if not isinstance(username, str):
        raise ValueError("Username wajib berupa teks.")
    if not isinstance(role, str):
        raise ValueError("Role wajib berupa teks.")

    name = name.strip()
    username = username.strip().lower()
    role = role.strip().lower()

    if not name:
        raise ValueError("Nama pengguna wajib diisi.")
    if not username:
        raise ValueError("Username wajib diisi.")
    if role not in USER_ROLES:
        raise ValueError("Role harus manager atau cashier.")
    if not password_hash:
        raise ValueError("Password hash wajib diisi.")
    is_active = data.get("is_active", True)
    if not isinstance(is_active, bool):
        raise ValueError("is_active harus berupa boolean.")

    document = {
        "name": name,
        "username": username,
        "password_hash": password_hash,
        "role": role,
        "is_active": is_active,
        "created_at": datetime.now(timezone.utc),
    }

    assigned_shift = data.get("assigned_shift")
    if role == "cashier":
        if assigned_shift not in ASSIGNED_SHIFTS:
            raise ValueError("Kasir wajib ditugaskan ke shift_1 atau shift_2.")
        document["assigned_shift"] = assigned_shift
    elif assigned_shift is not None:
        raise ValueError("Akun manager tidak menggunakan assigned_shift.")

    return document


def public_user(document):
    """Return API-safe user fields; never expose password_hash."""
    created_at = document["created_at"]
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    result = {
        "id": str(document["_id"]),
        "name": document["name"],
        "username": document["username"],
        "role": document["role"],
        "is_active": document["is_active"],
        "created_at": created_at.astimezone(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
    }
    if document["role"] == "cashier":
        result["assigned_shift"] = document["assigned_shift"]
    return result
