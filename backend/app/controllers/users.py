"""Manager endpoints for cashier account management."""

from datetime import datetime, timezone

from bson import ObjectId
from flask import Blueprint, current_app, g, jsonify, request
from pymongo.errors import PyMongoError

from app.database.mongo import get_client
from app.database.users import get_users_collection
from app.middleware.auth import manager_required
from app.services.user_service import (
    DuplicateUsernameError,
    create_user,
    list_users,
    update_cashier,
)


users_bp = Blueprint("users", __name__, url_prefix="/api/users")


def _audit_log(session, action, entity_id, details):
    _mongo_database()["audit_logs"].insert_one(
        {
            "user_id": g.current_user["_id"],
            "action": action,
            "entity": "users",
            "entity_id": entity_id,
            "details": details,
            "created_at": datetime.now(timezone.utc),
        },
        session=session,
    )


def _mongo_database():
    return get_client(
        current_app.config["MONGO_URI"],
        current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
    )[current_app.config["MONGO_DB_NAME"]]


@users_bp.get("")
@manager_required
def get_users():
    try:
        return jsonify(users=list_users(get_users_collection())), 200
    except PyMongoError:
        current_app.logger.exception("Could not list users")
        return jsonify(error="database_unavailable"), 503


@users_bp.post("")
@manager_required
def post_user():
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify(error="json_object_required"), 400
    payload = {
        "name": data.get("name"),
        "username": data.get("username"),
        "password": data.get("password"),
        "role": "cashier",
        "assigned_shift": data.get("assigned_shift"),
    }
    try:
        collection = get_users_collection()
        client = get_client(
            current_app.config["MONGO_URI"],
            current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
        )
        with client.start_session() as mongo_session:
            with mongo_session.start_transaction():
                user = create_user(
                    collection,
                    payload,
                    current_app.config["BCRYPT_ROUNDS"],
                    session=mongo_session,
                )
                _audit_log(
                    mongo_session,
                    "user_created",
                    ObjectId(user["id"]),
                    {
                        "username": user["username"],
                        "role": user["role"],
                        "assigned_shift": user["assigned_shift"],
                    },
                )
    except DuplicateUsernameError as error:
        return jsonify(error="username_taken", message=str(error)), 409
    except ValueError as error:
        return jsonify(error="invalid_user", message=str(error)), 400
    except PyMongoError:
        current_app.logger.exception("Could not create cashier account")
        return jsonify(error="database_unavailable"), 503
    return jsonify(user=user), 201


@users_bp.patch("/<user_id>")
@manager_required
def patch_user(user_id):
    changes = request.get_json(silent=True)
    if not isinstance(changes, dict):
        return jsonify(error="json_object_required"), 400
    allowed = {"name", "is_active", "assigned_shift", "password"}
    if set(changes) - allowed:
        return jsonify(error="unsupported_user_fields"), 400
    try:
        collection = get_users_collection()
        client = get_client(
            current_app.config["MONGO_URI"],
            current_app.config["MONGO_SERVER_SELECTION_TIMEOUT_MS"],
        )
        with client.start_session() as mongo_session:
            with mongo_session.start_transaction():
                user = update_cashier(
                    collection,
                    user_id,
                    changes,
                    current_app.config["BCRYPT_ROUNDS"],
                    session=mongo_session,
                )
                if user:
                    audit_details = {
                        "username": user["username"],
                        "changed_fields": sorted(changes),
                    }
                    if "password" in changes:
                        audit_details["password_changed"] = True
                    _audit_log(
                        mongo_session,
                        "user_updated",
                        ObjectId(user["id"]),
                        audit_details,
                    )
    except ValueError as error:
        return jsonify(error="invalid_user", message=str(error)), 400
    except PyMongoError:
        current_app.logger.exception("Could not update cashier account")
        return jsonify(error="database_unavailable"), 503
    if not user:
        return jsonify(error="cashier_not_found"), 404
    return jsonify(user=user), 200
