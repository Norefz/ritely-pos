"""Create the first manager account from local environment variables."""

import os
import sys

from pymongo.errors import PyMongoError

from app.config import Config
from app.database.indexes import ensure_indexes
from app.database.mongo import get_database
from app.services.user_service import DuplicateUsernameError, create_user


def main():
    name = os.getenv("INITIAL_MANAGER_NAME", "").strip()
    username = os.getenv("INITIAL_MANAGER_USERNAME", "").strip().lower()
    password = os.getenv("INITIAL_MANAGER_PASSWORD", "")
    if not Config.JWT_SECRET_KEY:
        print("Isi JWT_SECRET_KEY di backend/.env sebelum membuat akun manager.")
        return 1
    if not all((name, username, password)):
        print(
            "Isi INITIAL_MANAGER_NAME, INITIAL_MANAGER_USERNAME, dan "
            "INITIAL_MANAGER_PASSWORD di backend/.env."
        )
        return 1

    try:
        database = get_database(
            Config.MONGO_URI,
            Config.MONGO_DB_NAME,
            Config.MONGO_SERVER_SELECTION_TIMEOUT_MS,
        )
        ensure_indexes(database)
        users = database["users"]
        existing = users.find_one({"username": username})
        if existing:
            if existing.get("role") != "manager":
                print("Username awal sudah dipakai akun non-manager; tidak ada perubahan.")
                return 1
            print("Akun manager awal sudah tersedia; tidak ada perubahan.")
            return 0

        create_user(
            users,
            {"name": name, "username": username, "password": password, "role": "manager"},
            Config.BCRYPT_ROUNDS,
        )
    except (DuplicateUsernameError, ValueError, PyMongoError):
        print("Seeder manager gagal. Periksa MONGO_URI dan akses MongoDB.")
        return 1

    print("Akun manager awal berhasil dibuat.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
