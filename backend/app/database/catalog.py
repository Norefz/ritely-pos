"""MongoDB collections and indexes for catalog and stock workflows."""

from pymongo.collation import Collation

from app.database.mongo import get_database
from flask import current_app


def get_catalog_database():
    return get_database(
        current_app.config["MONGO_URI"],
        current_app.config["MONGO_DB_NAME"],
        current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
    )


def get_categories_collection():
    collection = get_catalog_database()["categories"]
    collection.create_index(
        [("name", 1)],
        unique=True,
        collation=Collation(locale="en", strength=2),
        name="uq_categories_name_ci",
    )
    return collection


def get_products_collection():
    collection = get_catalog_database()["master_product"]
    collection.create_index("sku", unique=True, name="uq_master_product_sku")
    collection.create_index(
        [("category_id", 1), ("is_active", 1)],
        name="idx_master_product_category_active",
    )
    return collection


def get_stock_movements_collection():
    collection = get_catalog_database()["stock_movements"]
    collection.create_index(
        [("product_id", 1), ("created_at", -1)],
        name="idx_stock_movements_product_created",
    )
    return collection


def get_stock_opnames_collection():
    collection = get_catalog_database()["stock_opnames"]
    collection.create_index(
        [("submitted_at", -1)],
        name="idx_stock_opnames_submitted_at",
    )
    collection.create_index(
        [("submitted_by", 1), ("submitted_at", -1)],
        name="idx_stock_opnames_submitter_time",
    )
    return collection
