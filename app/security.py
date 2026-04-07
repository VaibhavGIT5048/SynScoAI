import asyncio
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from threading import Lock
from typing import Awaitable, Callable, TypeVar

from fastapi import HTTPException, Request

from app.config import settings

T = TypeVar("T")

_lock = Lock()
_ip_minute_hits: dict[str, deque[float]] = defaultdict(deque)
_visitor_daily_count: dict[str, int] = defaultdict(int)
_visitor_active_count: dict[str, int] = defaultdict(int)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").strip()
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _visitor_id(request: Request) -> str:
    explicit_id = request.headers.get("x-visitor-id", "").strip()
    if explicit_id:
        return explicit_id[:128]
    return f"ip:{_client_ip(request)}"


def _utc_day() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def enforce_ip_rate_limit(request: Request) -> None:
    ip = _client_ip(request)
    now = time.time()
    cutoff = now - 60

    with _lock:
        hits = _ip_minute_hits[ip]
        while hits and hits[0] <= cutoff:
            hits.popleft()

        if len(hits) >= settings.rate_limit_per_minute_ip:
            raise HTTPException(
                status_code=429,
                detail="Too many requests from this IP. Please retry in a minute.",
            )

        hits.append(now)


def reserve_visitor_simulation_slot(request: Request) -> str:
    visitor = _visitor_id(request)
    day_key = f"{_utc_day()}:{visitor}"

    with _lock:
        used_today = _visitor_daily_count[day_key]
        if used_today >= settings.sim_limit_per_day_visitor:
            raise HTTPException(
                status_code=429,
                detail="Daily simulation limit reached for this visitor.",
            )

        active_count = _visitor_active_count[visitor]
        if active_count >= settings.max_concurrent_sim_per_visitor:
            raise HTTPException(
                status_code=429,
                detail="Concurrent simulation limit reached for this visitor.",
            )

        _visitor_daily_count[day_key] = used_today + 1
        _visitor_active_count[visitor] = active_count + 1

    return visitor


def release_visitor_simulation_slot(visitor: str) -> None:
    with _lock:
        current = _visitor_active_count.get(visitor, 0)
        if current <= 1:
            _visitor_active_count.pop(visitor, None)
        else:
            _visitor_active_count[visitor] = current - 1


async def run_guarded_request(
    request: Request,
    operation: Callable[[], Awaitable[T]],
) -> T:
    enforce_ip_rate_limit(request)
    try:
        return await asyncio.wait_for(operation(), timeout=settings.request_timeout_seconds)
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Request timed out.") from exc


async def run_guarded_simulation(
    request: Request,
    operation: Callable[[], Awaitable[T]],
) -> T:
    enforce_ip_rate_limit(request)
    visitor = reserve_visitor_simulation_slot(request)

    try:
        return await asyncio.wait_for(operation(), timeout=settings.request_timeout_seconds)
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Simulation request timed out.") from exc
    finally:
        release_visitor_simulation_slot(visitor)
