"""Access to the MongoDB cashier shifts collection."""

from flask import current_app

from app.database.mongo import get_database


def get_shifts_collection():
    database = get_database(
        current_app.config["MONGO_URI"],
        current_app.config["MONGO_DB_NAME"],
        current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
    )
    collection = database["shifts"]
    collection.create_index(
        "active_lock",
        unique=True,
        partialFilterExpression={"status": "open"},
        name="uq_one_open_shift_per_store",
    )
    collection.create_index(
        "status",
        unique=True,
        partialFilterExpression={"status": "open"},
        name="uq_one_open_shift_by_status",
    )
    collection.create_index(
        [("opened_at", 1)],
        name="idx_shifts_opened_at",
    )
    collection.create_index(
        [("cashier_id", 1), ("opened_at", 1)],
        name="idx_shifts_cashier_opened_at",
    )
    return collection
