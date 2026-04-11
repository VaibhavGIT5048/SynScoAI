from typing import Any

from fastapi import HTTPException, Request
import httpx

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


async def _introspect_token_with_supabase(token: str) -> str:
    issuer = settings.supabase_jwt_issuer
    service_role_key = settings.supabase_service_role_key
    if not issuer or not service_role_key:
        raise HTTPException(status_code=503, detail="JWT verification is not configured.")

    user_endpoint = f"{issuer.rstrip('/')}/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": service_role_key,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(user_endpoint, headers=headers)
    except httpx.HTTPError:
        raise HTTPException(status_code=503, detail="Authentication provider is unavailable.")

    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Invalid or expired access token.")
    if response.status_code >= 400:
        raise HTTPException(status_code=503, detail="Authentication provider is unavailable.")

    payload = response.json()
    user_id = payload.get("id")
    if not isinstance(user_id, str) or not user_id.strip():
        raise HTTPException(status_code=401, detail="Access token is missing subject claim.")

    return user_id


async def get_request_user_id(request: Request, *, required: bool) -> str | None:
    token = _extract_bearer_token(request.headers.get("Authorization"))
    if not token:
        if required:
            raise HTTPException(status_code=401, detail="Missing bearer token.")
        return None

    if settings.supabase_jwt_secret:
        payload = _decode_supabase_token(token)
        return str(payload["sub"])

    return await _introspect_token_with_supabase(token)
