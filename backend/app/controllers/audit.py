"""Manager-only audit log query endpoint."""

from datetime import timezone

from bson import ObjectId
from flask import Blueprint, current_app, jsonify
from pymongo.errors import PyMongoError

from app.database.mongo import get_client
from app.middleware.auth import manager_required


audit_bp = Blueprint("audit", __name__, url_prefix="/api/audit-logs")


def _database():
    return get_client(
        current_app.config["MONGO_URI"],
        current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
    )[current_app.config["MONGO_DB_NAME"]]


def _json_value(value):
    if isinstance(value, ObjectId):
        return str(value)
    if hasattr(value, "isoformat"):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(value, dict):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


@audit_bp.get("")
@manager_required
def get_audit_logs():
    try:
        database = _database()
        documents = list(
            database["audit_logs"].find().sort("created_at", -1).limit(500)
        )
        user_ids = list(
            {row.get("user_id") for row in documents if isinstance(row.get("user_id"), ObjectId)}
        )
        users = {
            user["_id"]: user.get("name", "Pengguna")
            for user in database["users"].find(
                {"_id": {"$in": user_ids}}, {"name": 1}
            )
        } if user_ids else {}

        logs = []
        for row in documents:
            created_at = row.get("created_at")
            logs.append(
                {
                    "id": str(row["_id"]),
                    "created_at": _json_value(created_at),
                    "user_name": users.get(row.get("user_id"), "Sistem"),
                    "action": row.get("action", "activity_recorded"),
                    "entity": row.get("entity", ""),
                    "entity_id": _json_value(row.get("entity_id")),
                    "details": _json_value(row.get("details") or {}),
                }
            )
        return jsonify(logs=logs), 200
    except PyMongoError:
        current_app.logger.exception("Could not list audit logs")
        return jsonify(error="database_unavailable"), 503
