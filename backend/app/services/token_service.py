"""JWT access token creation and validation."""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt


def create_access_token(user_id, secret_key, issuer, expires_minutes):
    if not isinstance(expires_minutes, int) or expires_minutes <= 0:
        raise ValueError("JWT_ACCESS_TOKEN_MINUTES harus lebih dari 0.")
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=expires_minutes)
    payload = {
        "sub": str(user_id),
        "jti": str(uuid4()),
        "iat": now,
        "exp": expires_at,
        "iss": issuer,
    }
    token = jwt.encode(payload, secret_key, algorithm="HS256")
    return token, expires_at


def decode_access_token(token, secret_key, issuer):
    try:
        return jwt.decode(
            token,
            secret_key,
            algorithms=["HS256"],
            issuer=issuer,
            options={"require": ["sub", "jti", "iat", "exp", "iss"]},
        )
    except jwt.InvalidTokenError:
        return None
