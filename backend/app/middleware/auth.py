"""JWT authentication and role guards."""

from functools import wraps

from bson import ObjectId
from flask import current_app, g, jsonify, request
from pymongo.errors import PyMongoError

from app.database.revoked_tokens import get_revoked_tokens_collection
from app.database.users import get_users_collection
from app.services.token_service import decode_access_token


def authenticate_request():
    authorization = request.headers.get("Authorization", "")
    scheme, separator, token = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer" or not token.strip():
        return None, None

    payload = decode_access_token(
        token.strip(),
        current_app.config.get("JWT_SECRET_KEY", ""),
        current_app.config["JWT_ISSUER"],
    )
    if not payload or not ObjectId.is_valid(payload.get("sub")):
        return None, None

    revoked = get_revoked_tokens_collection().find_one({"jti": payload["jti"]})
    if revoked:
        return None, None

    user = get_users_collection().find_one(
        {"_id": ObjectId(payload["sub"]), "is_active": True}
    )
    return user, payload


def manager_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_app.config.get("JWT_SECRET_KEY"):
            return jsonify(error="auth_not_configured"), 503
        try:
            user, payload = authenticate_request()
        except (PyMongoError, ValueError):
            current_app.logger.exception("Could not authorize manager request")
            return jsonify(error="database_unavailable"), 503
        if not user:
            return jsonify(error="authentication_required"), 401
        if user["role"] != "manager":
            return jsonify(error="manager_role_required"), 403
        g.current_user = user
        g.jwt_payload = payload
        return view(*args, **kwargs)

    return wrapped
