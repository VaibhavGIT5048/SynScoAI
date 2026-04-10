from typing import Any

from fastapi import HTTPException, Request

from app.config import settings

try:
    import jwt
    from jwt import InvalidTokenError
except Exception:  # pragma: no cover - optional dependency import guard
    jwt = None

    class InvalidTokenError(Exception):
        """Fallback error type when PyJWT is unavailable."""


def _extract_bearer_token(auth_header: str | None) -> str | None:
    if not auth_header:
        return None

    parts = auth_header.strip().split(" ", maxsplit=1)
    if len(parts) != 2 or parts[0].lower() != "bearer" or not parts[1].strip():
        raise HTTPException(status_code=401, detail="Invalid Authorization header format.")

    return parts[1].strip()


def _decode_supabase_token(token: str) -> dict[str, Any]:
    if jwt is None:
        raise HTTPException(status_code=503, detail="JWT verification dependency is unavailable.")

    secret = settings.supabase_jwt_secret
    if not secret:
        raise HTTPException(status_code=503, detail="JWT verification is not configured.")

    decode_kwargs: dict[str, Any] = {
        "key": secret,
        "algorithms": ["HS256"],
        "options": {
            "require": ["sub", "exp"],
            "verify_aud": bool(settings.supabase_jwt_audience),
        },
    }

    if settings.supabase_jwt_audience:
        decode_kwargs["audience"] = settings.supabase_jwt_audience

    if settings.supabase_jwt_issuer:
        decode_kwargs["issuer"] = settings.supabase_jwt_issuer

    try:
        payload = jwt.decode(token, **decode_kwargs)
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid or expired access token.")

    sub = payload.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail="Access token is missing subject claim.")

    return payload


def get_request_user_id(request: Request, *, required: bool) -> str | None:
    token = _extract_bearer_token(request.headers.get("Authorization"))
    if not token:
        if required:
            raise HTTPException(status_code=401, detail="Missing bearer token.")
        return None

    payload = _decode_supabase_token(token)
    return str(payload["sub"])
