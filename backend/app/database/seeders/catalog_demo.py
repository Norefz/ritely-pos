"""Seed a sample product catalog into an isolated development/demo database."""

import os
import re
import sys
from datetime import datetime, timezone
from decimal import Decimal

from bson import Decimal128
from pymongo.errors import PyMongoError
from pymongo.collation import Collation

from app.config import Config
from app.database.indexes import ensure_indexes
from app.database.mongo import get_database


CATEGORIES = (
    "Minuman",
    "Makanan",
    "Bahan pokok",
    "Kebutuhan rumah",
    "Perawatan diri",
)

# SKU is the stable seed identity. $setOnInsert keeps manager edits and stock
# changes intact when this seeder is run again.
PRODUCTS = (
    ("MNM-001", "Air mineral 600 ml", "Minuman", 3500, 48, 10),
    ("MNM-002", "Teh melati 350 ml", "Minuman", 4500, 24, 8),
    ("MNM-003", "Susu UHT cokelat 250 ml", "Minuman", 7000, 6, 10),
    ("MNM-004", "Kopi instan 3-in-1", "Minuman", 1500, 80, 20),
    ("MNM-005", "Jus jeruk 250 ml", "Minuman", 6000, 15, 5),
    ("MKN-001", "Roti tawar", "Makanan", 15000, 12, 5),
    ("MKN-002", "Biskuit kelapa 300 g", "Makanan", 12000, 18, 5),
    ("MKN-003", "Mi instan goreng", "Makanan", 3500, 60, 15),
    ("MKN-004", "Mi instan kuah ayam", "Makanan", 3500, 45, 15),
    ("MKN-005", "Keripik singkong 80 g", "Makanan", 8000, 10, 5),
    ("BPO-001", "Beras premium 5 kg", "Bahan pokok", 75000, 20, 5),
    ("BPO-002", "Gula pasir 1 kg", "Bahan pokok", 17000, 16, 5),
    ("BPO-003", "Minyak goreng 1 L", "Bahan pokok", 18000, 14, 5),
    ("BPO-004", "Telur ayam 1 kg", "Bahan pokok", 30000, 9, 5),
    ("BPO-005", "Tepung terigu 1 kg", "Bahan pokok", 12000, 13, 4),
    ("RMH-001", "Tisu wajah 200 lembar", "Kebutuhan rumah", 15000, 4, 5),
    ("RMH-002", "Sabun cuci piring 750 ml", "Kebutuhan rumah", 16500, 16, 5),
    ("RMH-003", "Detergen bubuk 800 g", "Kebutuhan rumah", 22000, 11, 4),
    ("RMH-004", "Kantong sampah isi 10", "Kebutuhan rumah", 8000, 20, 5),
    ("RMH-005", "Pembersih lantai 700 ml", "Kebutuhan rumah", 13500, 7, 4),
    ("PRD-001", "Sabun mandi 90 g", "Perawatan diri", 4000, 30, 8),
    ("PRD-002", "Sampo 170 ml", "Perawatan diri", 17500, 9, 4),
    ("PRD-003", "Pasta gigi 120 g", "Perawatan diri", 12000, 14, 5),
    ("PRD-004", "Sikat gigi dewasa", "Perawatan diri", 9000, 17, 5),
    ("PRD-005", "Deodoran roll-on 50 ml", "Perawatan diri", 18000, 8, 4),
)


def validate_target():
    environment = os.getenv("RITELY_ENVIRONMENT", "").strip().lower()
    database_name = Config.MONGO_DB_NAME.strip()
    database_tokens = set(re.split(r"[^a-z0-9]+", database_name.lower()))

    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV", "").lower() == "production":
        raise ValueError("Demo seeder tidak boleh dijalankan pada deployment Vercel.")
    if environment not in {"development", "demo"}:
        raise ValueError("Set RITELY_ENVIRONMENT=development atau demo sebelum menjalankan seeder.")
    if not database_tokens.intersection({"dev", "development", "demo"}):
        raise ValueError(
            "Gunakan database terpisah bernama dengan akhiran -dev, "
            "-development, atau -demo. Database produksi tidak boleh diisi data demo."
        )


def seed_catalog(database):
    categories = database["categories"]
    products = database["master_product"]
    now = datetime.now(timezone.utc)
    category_collation = Collation(locale="en", strength=2)

    created_categories = 0
    category_ids = {}
    for name in CATEGORIES:
        result = categories.update_one(
            {"name": name},
            {"$setOnInsert": {"name": name, "is_active": True}},
            upsert=True,
            collation=category_collation,
        )
        created_categories += int(result.upserted_id is not None)
        category_ids[name] = categories.find_one(
            {"name": name}, {"_id": 1}, collation=category_collation
        )["_id"]

    created_products = 0
    for sku, name, category, price, stock, minimum_stock in PRODUCTS:
        result = products.update_one(
            {"sku": sku},
            {
                "$setOnInsert": {
                    "sku": sku,
                    "name": name,
                    "category_id": category_ids[category],
                    "selling_price": Decimal128(Decimal(price)),
                    "stock": stock,
                    "minimum_stock": minimum_stock,
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                }
            },
            upsert=True,
        )
        created_products += int(result.upserted_id is not None)

    return created_categories, created_products


def main():
    try:
        validate_target()
        database = get_database(
            Config.MONGO_URI,
            Config.MONGO_DB_NAME,
            Config.MONGO_SERVER_SELECTION_TIMEOUT_MS,
        )
        ensure_indexes(database)
        created_categories, created_products = seed_catalog(database)
    except (PyMongoError, ValueError) as error:
        print(f"Seeder katalog demo gagal: {error}")
        return 1

    print(
        "Seeder katalog demo selesai: "
        f"{created_categories} kategori baru, {created_products} produk baru; "
        f"{len(CATEGORIES)} kategori dan {len(PRODUCTS)} SKU diperiksa."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
