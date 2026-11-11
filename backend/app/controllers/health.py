"""Health check endpoints."""

from flask import Blueprint, current_app, jsonify
from pymongo.errors import PyMongoError

from app.database.mongo import ping_mongodb


health_bp = Blueprint("health", __name__, url_prefix="/api/health")


@health_bp.get("/db")
def database_health():
    uri = current_app.config.get("MONGO_URI", "").strip()
    if not uri:
        return (
            jsonify(
                status="not_configured",
                database="mongodb",
                message="MONGO_URI belum diisi.",
            ),
            503,
        )

    try:
        ping_mongodb(
            uri,
            current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
        )
    except PyMongoError:
        current_app.logger.exception("MongoDB connection check failed")
        return (
            jsonify(
                status="disconnected",
                database="mongodb",
                message="MongoDB tidak dapat dijangkau. Periksa URI dan akses jaringan.",
            ),
            503,
        )

    return jsonify(status="connected", database="mongodb"), 200
