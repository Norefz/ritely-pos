"""User account persistence and password handling."""

import bcrypt
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from app.models.user import ASSIGNED_SHIFTS, build_user_document, public_user


class DuplicateUsernameError(Exception):
    """Raised when a username is already in use."""


def _hash_password(password, bcrypt_rounds):
    if not isinstance(password, str) or not password:
        raise ValueError("Password wajib diisi.")
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise ValueError("Password tidak boleh lebih dari 72 byte.")
    if not isinstance(bcrypt_rounds, int) or not 4 <= bcrypt_rounds <= 31:
        raise ValueError("BCRYPT_ROUNDS harus berada di antara 4 dan 31.")
    return bcrypt.hashpw(
        password_bytes, bcrypt.gensalt(rounds=bcrypt_rounds)
    ).decode("utf-8")


def create_user(collection, data, bcrypt_rounds=12, session=None):
    password = data.get("password")
    password_hash = _hash_password(password, bcrypt_rounds)
    document = build_user_document(data, password_hash)

    try:
        result = collection.insert_one(document, session=session)
    except DuplicateKeyError as error:
        raise DuplicateUsernameError("Username sudah digunakan.") from error

    document["_id"] = result.inserted_id
    return public_user(document)


def get_user_by_username(collection, username):
    return collection.find_one({"username": username.strip().lower()})


def verify_password(password, password_hash):
    if not isinstance(password, str) or not isinstance(password_hash, str):
        return False
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"), password_hash.encode("utf-8")
        )
    except ValueError:
        return False


def list_users(collection):
    return [public_user(document) for document in collection.find().sort("name", 1)]


def update_cashier(collection, user_id, changes, bcrypt_rounds=12, session=None):
    """Update the cashier fields allowed by the SRS account workflow."""
    if not ObjectId.is_valid(user_id):
        return None

    user = collection.find_one(
        {"_id": ObjectId(user_id), "role": "cashier"}, session=session
    )
    if not user:
        return None

    updates = {}
    if "name" in changes:
        name = str(changes["name"]).strip()
        if not name:
            raise ValueError("Nama pengguna wajib diisi.")
        updates["name"] = name
    if "is_active" in changes:
        if not isinstance(changes["is_active"], bool):
            raise ValueError("is_active harus berupa boolean.")
        updates["is_active"] = changes["is_active"]
    if "assigned_shift" in changes:
        if changes["assigned_shift"] not in ASSIGNED_SHIFTS:
            raise ValueError("assigned_shift harus shift_1 atau shift_2.")
        updates["assigned_shift"] = changes["assigned_shift"]
    if "password" in changes:
        updates["password_hash"] = _hash_password(
            changes["password"], bcrypt_rounds
        )

    if updates:
        collection.update_one(
            {"_id": user["_id"]}, {"$set": updates}, session=session
        )
        user.update(updates)
    return public_user(user)
