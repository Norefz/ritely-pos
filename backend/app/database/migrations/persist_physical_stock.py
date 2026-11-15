"""Persist physical stock on products and rename old opname count fields."""

import os
import sys

from pymongo.errors import PyMongoError

from app.config import Config
from app.database.mongo import get_database


INITIAL_PHYSICAL_VARIANCE = {"MNM-001": -2, "BPO-001": 3}


def main():
    database_name = Config.MONGO_DB_NAME
    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV", "").lower() == "production":
        print("Migration stok fisik tidak dapat dijalankan dari deployment.")
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
        products = database["master_product"]
        opnames = database["stock_opnames"]
        audits = database["audit_logs"]

        history_conflicts = opnames.count_documents(
            {"counted_stock": {"$exists": True}, "physical_stock": {"$exists": True}}
        )
        audit_conflicts = audits.count_documents(
            {
                "action": "stock_opname_completed",
                "details.counted_stock": {"$exists": True},
                "details.physical_stock": {"$exists": True},
            }
        )
        if history_conflicts or audit_conflicts:
            print(
                "Migration dihentikan karena ada dokumen opname dengan kedua "
                "nama field. Tidak ada data yang diubah."
            )
            return 1

        products_with_history = set(opnames.distinct("product_id"))
        initialized_products = 0
        for product in products.find(
            {"physical_stock": {"$exists": False}},
            {"sku": 1, "stock": 1},
        ):
            stock = int(product.get("stock", 0))
            variance = (
                0
                if product["_id"] in products_with_history
                else INITIAL_PHYSICAL_VARIANCE.get(product.get("sku"), 0)
            )
            physical_stock = max(0, stock + variance)
            result = products.update_one(
                {"_id": product["_id"], "physical_stock": {"$exists": False}},
                {"$set": {"physical_stock": physical_stock}},
            )
            initialized_products += result.modified_count

        renamed_opnames = opnames.update_many(
            {"counted_stock": {"$exists": True}},
            {"$rename": {"counted_stock": "physical_stock"}},
        )
        renamed_audits = audits.update_many(
            {
                "action": "stock_opname_completed",
                "details.counted_stock": {"$exists": True},
            },
            {"$rename": {"details.counted_stock": "details.physical_stock"}},
        )

        remaining_products = products.count_documents(
            {"physical_stock": {"$exists": False}}
        )
        remaining_opnames = opnames.count_documents(
            {"counted_stock": {"$exists": True}}
        )
        remaining_audits = audits.count_documents(
            {
                "action": "stock_opname_completed",
                "details.counted_stock": {"$exists": True},
            }
        )
    except (PyMongoError, ValueError) as error:
        print(
            "Migration gagal ("
            f"{type(error).__name__}). Periksa koneksi dan akses ke MongoDB."
        )
        return 1

    print(f"Database: {database_name}")
    print(f"Produk diberi physical_stock: {initialized_products}")
    print(f"Riwayat opname diganti nama: {renamed_opnames.modified_count}")
    print(f"Audit opname diganti nama: {renamed_audits.modified_count}")
    print(f"Produk tanpa physical_stock: {remaining_products}")
    print(f"Riwayat dengan counted_stock tersisa: {remaining_opnames}")
    print(f"Audit dengan counted_stock tersisa: {remaining_audits}")
    if remaining_products or remaining_opnames or remaining_audits:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
