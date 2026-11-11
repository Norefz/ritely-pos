"""Access to the MongoDB JWT revocation collection."""

from flask import current_app

from app.database.mongo import get_database


def get_revoked_tokens_collection():
    database = get_database(
        current_app.config["MONGO_URI"],
        current_app.config["MONGO_DB_NAME"],
        current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
    )
    collection = database["revoked_tokens"]
    collection.create_index("jti", unique=True, name="uq_revoked_tokens_jti")
    collection.create_index(
        "expires_at", expireAfterSeconds=0, name="ttl_revoked_tokens_expiry"
    )
    return collection
