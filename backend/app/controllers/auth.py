"""JWT login, current-user, and logout endpoints."""

from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request
from pymongo.errors import PyMongoError

from app.database.revoked_tokens import get_revoked_tokens_collection
from app.database.users import get_users_collection
from app.middleware.auth import authenticate_request
from app.models.user import public_user
from app.services.token_service import create_access_token
from app.services.user_service import get_user_by_username, verify_password


auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def _auth_not_configured():
    return not current_app.config.get("JWT_SECRET_KEY")


@auth_bp.post("/login")
def login():
    if _auth_not_configured():
        return jsonify(error="auth_not_configured"), 503
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify(error="json_object_required"), 400
    username = data.get("username")
    password = data.get("password")
    if (
        not isinstance(username, str)
        or not username.strip()
        or not isinstance(password, str)
        or not password
    ):
        return jsonify(error="username_and_password_required"), 400

    try:
        user = get_user_by_username(get_users_collection(), username)
    except (PyMongoError, ValueError):
        current_app.logger.exception("Login could not query MongoDB")
        return jsonify(error="database_unavailable"), 503

    if (
        not user
        or not user.get("is_active")
        or not verify_password(password, user.get("password_hash"))
    ):
        return jsonify(error="invalid_credentials"), 401

    try:
        access_token, expires_at = create_access_token(
            user["_id"],
            current_app.config["JWT_SECRET_KEY"],
            current_app.config["JWT_ISSUER"],
            current_app.config["JWT_ACCESS_TOKEN_MINUTES"],
        )
    except ValueError:
        current_app.logger.exception("JWT token configuration is invalid")
        return jsonify(error="auth_not_configured"), 503

    return jsonify(
        access_token=access_token,
        token_type="Bearer",
        expires_at=expires_at.astimezone(timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
        user=public_user(user),
    ), 200


@auth_bp.get("/me")
def current_user():
    if _auth_not_configured():
        return jsonify(error="auth_not_configured"), 503
    try:
        user, _ = authenticate_request()
    except (PyMongoError, ValueError):
        current_app.logger.exception("Current-user check could not query MongoDB")
        return jsonify(error="database_unavailable"), 503
    if not user:
        return jsonify(error="authentication_required"), 401
    return jsonify(user=public_user(user)), 200


@auth_bp.post("/logout")
def logout():
    if _auth_not_configured():
        return jsonify(error="auth_not_configured"), 503
    try:
        user, payload = authenticate_request()
        if not user:
            return jsonify(error="authentication_required"), 401
        expires_at = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        get_revoked_tokens_collection().insert_one(
            {
                "jti": payload["jti"],
                "user_id": user["_id"],
                "expires_at": expires_at,
                "revoked_at": datetime.now(timezone.utc),
            }
        )
    except PyMongoError:
        current_app.logger.exception("Logout could not revoke JWT")
        return jsonify(error="database_unavailable"), 503
    return jsonify(status="logged_out"), 200
