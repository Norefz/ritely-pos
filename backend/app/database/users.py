"""Access to the MongoDB users collection."""

from flask import current_app

from app.database.mongo import get_database


def get_users_collection():
    database = get_database(
        current_app.config["MONGO_URI"],
        current_app.config["MONGO_DB_NAME"],
        current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
    )
    collection = database["users"]
    collection.create_index("username", unique=True, name="uq_users_username")
    return collection
