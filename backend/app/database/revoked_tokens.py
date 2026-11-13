"""Access to the MongoDB JWT revocation collection."""

from flask import current_app

from app.database.mongo import get_database


def get_revoked_tokens_collection():
    database = get_database(
        current_app.config["MONGO_URI"],
        current_app.config["MONGO_DB_NAME"],
        current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
    )
    return database["revoked_tokens"]
