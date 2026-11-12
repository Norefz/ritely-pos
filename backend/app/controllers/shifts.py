"""Cashier shift endpoints."""

from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, current_app, jsonify, request
from pymongo.errors import PyMongoError

from app.database.mongo import get_client
from app.database.shifts import get_shifts_collection
from app.middleware.auth import authenticate_request
from app.services.shift_service import (
    ShiftAlreadyOpenError,
    ShiftNotFoundError,
    ShiftNotOpenError,
    ShiftOwnershipError,
    close_shift,
    get_shift_snapshot,
    open_shift,
)


shifts_bp = Blueprint("shifts", __name__, url_prefix="/api/shifts")


def _database():
    return get_client(
        current_app.config["MONGO_URI"],
        current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
    )[current_app.config["MONGO_DB_NAME"]]


def _authorized_user():
    if not current_app.config.get("JWT_SECRET_KEY"):
        return None, (jsonify(error="auth_not_configured"), 503)
    try:
        user, _ = authenticate_request()
    except (PyMongoError, ValueError):
        current_app.logger.exception("Shift request could not authenticate user")
        return None, (jsonify(error="database_unavailable"), 503)
    if not user:
        return None, (jsonify(error="authentication_required"), 401)
    return user, None


def _audit_log(session, user, action, shift, reason=""):
    _database()["audit_logs"].insert_one(
        {
            "user_id": user["_id"],
            "action": action,
            "entity": "shifts",
            "entity_id": ObjectId(shift["id"]),
            "details": {
                "employee_id": shift.get("employee_id"),
                "assigned_shift": shift["assigned_shift"],
                "reason": reason,
            },
            "created_at": datetime.now(timezone.utc),
        },
        session=session,
    )


@shifts_bp.get("")
def get_shifts():
    user, error = _authorized_user()
    if error:
        return error
    try:
        return jsonify(get_shift_snapshot(get_shifts_collection(), user)), 200
    except PyMongoError:
        current_app.logger.exception("Could not load cashier shifts")
        return jsonify(error="database_unavailable"), 503


@shifts_bp.post("/open")
def post_open_shift():
    user, error = _authorized_user()
    if error:
        return error
    if user["role"] != "cashier":
        return jsonify(error="cashier_role_required"), 403

    try:
        collection = get_shifts_collection()
        client = get_client(
            current_app.config["MONGO_URI"],
            current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
        )
        with client.start_session() as session:
            with session.start_transaction():
                shift = open_shift(collection, user, session=session)
                _audit_log(session, user, "shift_opened", shift)
    except ShiftAlreadyOpenError:
        return jsonify(error="shift_already_open"), 409
    except ValueError as error:
        return jsonify(error="invalid_shift", message=str(error)), 400
    except PyMongoError:
        current_app.logger.exception("Could not open cashier shift")
        return jsonify(error="database_unavailable"), 503
    return jsonify(shift=shift), 201


@shifts_bp.post("/<shift_id>/close")
def post_close_shift(shift_id):
    user, error = _authorized_user()
    if error:
        return error
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify(error="json_object_required"), 400
    reason = data.get("reason", "")
    if not isinstance(reason, str):
        return jsonify(error="invalid_reason"), 400
    if user["role"] == "manager" and not reason.strip():
        return jsonify(error="closing_reason_required"), 400

    try:
        collection = get_shifts_collection()
        client = get_client(
            current_app.config["MONGO_URI"],
            current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
        )
        with client.start_session() as session:
            with session.start_transaction():
                shift = close_shift(
                    collection,
                    shift_id,
                    user,
                    reason=reason,
                    session=session,
                )
                _audit_log(session, user, "shift_closed", shift, reason)
    except ShiftNotFoundError:
        return jsonify(error="shift_not_found"), 404
    except ShiftNotOpenError:
        return jsonify(error="shift_not_open"), 409
    except ShiftOwnershipError:
        return jsonify(error="shift_not_owned"), 403
    except PyMongoError:
        current_app.logger.exception("Could not close cashier shift")
        return jsonify(error="database_unavailable"), 503
    return jsonify(shift=shift), 200
