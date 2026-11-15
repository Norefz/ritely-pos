"""Remove the unused note field from saved stock opname and audit records."""

import os
import sys

from pymongo.errors import PyMongoError

from app.config import Config
from app.database.mongo import get_database


def main():
    database_name = Config.MONGO_DB_NAME
    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV", "").lower() == "production":
        print("Migration stock opname tidak dapat dijalankan dari deployment.")
        return 1
    if not database_name or os.getenv("RITELY_CONFIRM_DATABASE") != database_name:
        print(
            "Migration dibatalkan. Set RITELY_CONFIRM_DATABASE sama persis "
            "dengan MONGO_DB_NAME untuk mengonfirmasi database target."
        )
        return 1

    try:
        database = get_database(
            Config.MONGO_URI,
            database_name,
            Config.MONGO_SERVER_SELECTION_TIMEOUT_MS,
        )
        opnames = database["stock_opnames"].update_many(
            {"note": {"$exists": True}},
            {"$unset": {"note": ""}},
        )
        audits = database["audit_logs"].update_many(
            {
                "action": "stock_opname_completed",
                "details.note": {"$exists": True},
            },
            {"$unset": {"details.note": ""}},
        )
        remaining_opname_notes = database["stock_opnames"].count_documents(
            {"note": {"$exists": True}}
        )
        remaining_audit_notes = database["audit_logs"].count_documents(
            {
                "action": "stock_opname_completed",
                "details.note": {"$exists": True},
            }
        )
    except (PyMongoError, ValueError) as error:
        print(
            "Migration gagal ("
            f"{type(error).__name__}). Periksa koneksi dan akses ke MongoDB."
        )
        return 1

    print(f"Database: {database_name}")
    print(f"Field note di riwayat opname dihapus: {opnames.modified_count}")
    print(f"Field note di audit opname dihapus: {audits.modified_count}")
    print(f"Field note tersisa di riwayat opname: {remaining_opname_notes}")
    print(f"Field note tersisa di audit opname: {remaining_audit_notes}")
    if remaining_opname_notes or remaining_audit_notes:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
