"""Seed the product catalog into a development database."""

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
    ("MNM-006", "Air mineral 1,5 L", "Minuman", 6000, 36, 10),
    ("MNM-007", "Teh hijau 350 ml", "Minuman", 5000, 28, 8),
    ("MNM-008", "Susu UHT plain 1 L", "Minuman", 19000, 18, 5),
    ("MNM-009", "Kopi hitam instan 10 sachet", "Minuman", 12000, 24, 5),
    ("MNM-010", "Minuman isotonik 500 ml", "Minuman", 7000, 30, 8),
    ("MKN-001", "Roti tawar", "Makanan", 15000, 12, 5),
    ("MKN-002", "Biskuit kelapa 300 g", "Makanan", 12000, 18, 5),
    ("MKN-003", "Mi instan goreng", "Makanan", 3500, 60, 15),
    ("MKN-004", "Mi instan kuah ayam", "Makanan", 3500, 45, 15),
    ("MKN-005", "Keripik singkong 80 g", "Makanan", 8000, 10, 5),
    ("MKN-006", "Roti cokelat", "Makanan", 8000, 22, 5),
    ("MKN-007", "Wafer cokelat 200 g", "Makanan", 10000, 20, 5),
    ("MKN-008", "Mi instan rasa soto", "Makanan", 3500, 40, 12),
    ("MKN-009", "Bubur instan ayam 50 g", "Makanan", 5000, 18, 5),
    ("MKN-010", "Kacang atom 100 g", "Makanan", 9000, 16, 5),
    ("BPO-001", "Beras premium 5 kg", "Bahan pokok", 75000, 20, 5),
    ("BPO-002", "Gula pasir 1 kg", "Bahan pokok", 17000, 16, 5),
    ("BPO-003", "Minyak goreng 1 L", "Bahan pokok", 18000, 14, 5),
    ("BPO-004", "Telur ayam 1 kg", "Bahan pokok", 30000, 9, 5),
    ("BPO-005", "Tepung terigu 1 kg", "Bahan pokok", 12000, 13, 4),
    ("BPO-006", "Beras medium 5 kg", "Bahan pokok", 65000, 24, 5),
    ("BPO-007", "Garam halus 500 g", "Bahan pokok", 4000, 32, 8),
    ("BPO-008", "Margarin 200 g", "Bahan pokok", 7000, 20, 5),
    ("BPO-009", "Madu 250 ml", "Bahan pokok", 28000, 12, 4),
    ("BPO-010", "Kecap manis 600 ml", "Bahan pokok", 16000, 18, 5),
    ("RMH-001", "Tisu wajah 200 lembar", "Kebutuhan rumah", 15000, 4, 5),
    ("RMH-002", "Sabun cuci piring 750 ml", "Kebutuhan rumah", 16500, 16, 5),
    ("RMH-003", "Detergen bubuk 800 g", "Kebutuhan rumah", 22000, 11, 4),
    ("RMH-004", "Kantong sampah isi 10", "Kebutuhan rumah", 8000, 20, 5),
    ("RMH-005", "Pembersih lantai 700 ml", "Kebutuhan rumah", 13500, 7, 4),
    ("RMH-006", "Detergen cair 700 ml", "Kebutuhan rumah", 18000, 18, 5),
    ("RMH-007", "Pewangi pakaian 800 ml", "Kebutuhan rumah", 17000, 16, 5),
    ("RMH-008", "Pembersih kaca 500 ml", "Kebutuhan rumah", 14000, 12, 4),
    ("RMH-009", "Spons cuci piring isi 3", "Kebutuhan rumah", 6000, 24, 5),
    ("RMH-010", "Tisu toilet isi 10", "Kebutuhan rumah", 22000, 14, 4),
    ("PRD-001", "Sabun mandi 90 g", "Perawatan diri", 4000, 30, 8),
    ("PRD-002", "Sampo 170 ml", "Perawatan diri", 17500, 9, 4),
    ("PRD-003", "Pasta gigi 120 g", "Perawatan diri", 12000, 14, 5),
    ("PRD-004", "Sikat gigi dewasa", "Perawatan diri", 9000, 17, 5),
    ("PRD-005", "Deodoran roll-on 50 ml", "Perawatan diri", 18000, 8, 4),
    ("PRD-006", "Pembersih wajah 100 g", "Perawatan diri", 18000, 14, 5),
    ("PRD-007", "Body lotion 200 ml", "Perawatan diri", 22000, 12, 4),
    ("PRD-008", "Hand sanitizer 100 ml", "Perawatan diri", 9000, 20, 5),
    ("PRD-009", "Pembalut wanita isi 10", "Perawatan diri", 15000, 18, 5),
    ("PRD-010", "Cotton bud isi 100", "Perawatan diri", 7000, 22, 5),
)
INITIAL_PHYSICAL_VARIANCE = {"MNM-001": -2, "BPO-001": 3}


def validate_target():
    environment = os.getenv("RITELY_ENVIRONMENT", "").strip().lower()
    database_name = Config.MONGO_DB_NAME.strip()
    database_tokens = set(re.split(r"[^a-z0-9]+", database_name.lower()))
    confirmed_database = os.getenv("RITELY_CONFIRM_DATABASE", "").strip()

    if os.getenv("VERCEL") or os.getenv("VERCEL_ENV", "").lower() == "production":
        raise ValueError("Seeder katalog hanya dapat dijalankan secara lokal.")
    if environment != "development":
        raise ValueError("Set RITELY_ENVIRONMENT=development sebelum menjalankan seeder.")
    if (
        not database_tokens.intersection({"dev", "development"})
        and confirmed_database != database_name
    ):
        raise ValueError(
            "Gunakan database terpisah bernama dengan akhiran -dev, "
            "atau -development. Jika nama database yang dipilih berbeda, set "
            "RITELY_CONFIRM_DATABASE sama persis dengan MONGO_DB_NAME."
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
                    "physical_stock": max(
                        0, stock + INITIAL_PHYSICAL_VARIANCE.get(sku, 0)
                    ),
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
        print(f"Seeder katalog gagal: {error}")
        return 1

    print(
        "Seeder katalog selesai: "
        f"{created_categories} kategori baru, {created_products} produk baru; "
        f"{len(CATEGORIES)} kategori dan {len(PRODUCTS)} SKU diperiksa."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
