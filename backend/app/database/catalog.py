"""MongoDB collections for catalog and stock workflows."""

from app.database.mongo import get_database
from flask import current_app


def get_catalog_database():
    return get_database(
        current_app.config["MONGO_URI"],
        current_app.config["MONGO_DB_NAME"],
        current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
    )


def get_categories_collection():
    return get_catalog_database()["categories"]


def get_products_collection():
    return get_catalog_database()["master_product"]


def get_stock_movements_collection():
    return get_catalog_database()["stock_movements"]


def get_stock_opnames_collection():
    return get_catalog_database()["stock_opnames"]
