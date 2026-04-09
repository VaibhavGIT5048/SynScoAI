import asyncio
import ipaddress
import logging
import secrets
import time
from abc import ABC, abstractmethod
from collections import defaultdict, deque
from datetime import datetime, timezone
from threading import Lock
from typing import Awaitable, Callable, TypeVar

from fastapi import HTTPException, Request

from app.config import settings

try:
    import redis.asyncio as redis_asyncio
except Exception:  # pragma: no cover - optional dependency import guard
    redis_asyncio = None

T = TypeVar("T")

logger = logging.getLogger(__name__)


class SimulationStateStore(ABC):
    @abstractmethod
    async def check_ip_rate_limit(self, ip: str, per_minute_limit: int) -> bool:
        """Return True when the request is allowed, False when over the limit."""

    @abstractmethod
    async def reserve_slot(
        self,
        visitor: str,
        day_key: str,
        daily_limit: int,
        concurrent_limit: int,
    ) -> tuple[bool, str | None]:
        """Try to reserve a slot. Returns (success, failure_reason)."""

    @abstractmethod
    async def release_slot(self, visitor: str) -> None:
        """Release one active slot for the visitor if present."""


class InMemoryStateStore(SimulationStateStore):
    def __init__(self) -> None:
        self._lock = Lock()
        self._ip_minute_hits: dict[str, deque[float]] = defaultdict(deque)
        self._visitor_daily_count: dict[str, int] = defaultdict(int)
        self._visitor_active_count: dict[str, int] = defaultdict(int)

    async def check_ip_rate_limit(self, ip: str, per_minute_limit: int) -> bool:
        now = time.time()
        cutoff = now - 60

        with self._lock:
            hits = self._ip_minute_hits[ip]
            while hits and hits[0] <= cutoff:
                hits.popleft()

            if len(hits) >= per_minute_limit:
                return False

            hits.append(now)
            return True

    async def reserve_slot(
        self,
        visitor: str,
        day_key: str,
        daily_limit: int,
        concurrent_limit: int,
    ) -> tuple[bool, str | None]:
        with self._lock:
            used_today = self._visitor_daily_count[day_key]
            if used_today >= daily_limit:
                return False, "daily"

            active_count = self._visitor_active_count[visitor]
            if active_count >= concurrent_limit:
                return False, "concurrent"

            self._visitor_daily_count[day_key] = used_today + 1
            self._visitor_active_count[visitor] = active_count + 1

        return True, None

    async def release_slot(self, visitor: str) -> None:
        with self._lock:
            current = self._visitor_active_count.get(visitor, 0)
            if current <= 1:
                self._visitor_active_count.pop(visitor, None)
            else:
                self._visitor_active_count[visitor] = current - 1

    # Compatibility helper for tests.
    def clear_all(self) -> None:
        with self._lock:
            self._ip_minute_hits.clear()
            self._visitor_daily_count.clear()
            self._visitor_active_count.clear()


class RedisStateStore(SimulationStateStore):
    _RESERVE_SCRIPT = """
local day_key = KEYS[1]
local active_key = KEYS[2]
local daily_limit = tonumber(ARGV[1])
local concurrent_limit = tonumber(ARGV[2])
local day_ttl = tonumber(ARGV[3])

local used_today = tonumber(redis.call('GET', day_key) or '0')
if used_today >= daily_limit then
  return {0, 'daily'}
end

local active = tonumber(redis.call('GET', active_key) or '0')
if active >= concurrent_limit then
  return {0, 'concurrent'}
end

redis.call('INCR', day_key)
redis.call('EXPIRE', day_key, day_ttl)
redis.call('INCR', active_key)
redis.call('EXPIRE', active_key, 86400)

return {1, 'ok'}
"""

    _RELEASE_SCRIPT = """
local active_key = KEYS[1]
local current = tonumber(redis.call('GET', active_key) or '0')
if current <= 1 then
  redis.call('DEL', active_key)
else
  redis.call('DECR', active_key)
end
return 1
"""

    def __init__(self, redis_url: str) -> None:
        if redis_asyncio is None:
            raise RuntimeError("redis package is required for Redis-backed state store")

        self._redis = redis_asyncio.from_url(redis_url, decode_responses=True)
        self._prefix = "synsoc"

    def _key(self, *parts: str) -> str:
        return f"{self._prefix}:{':'.join(parts)}"

    async def check_ip_rate_limit(self, ip: str, per_minute_limit: int) -> bool:
        now = time.time()
        cutoff = now - 60
        member = f"{time.time_ns()}-{secrets.token_hex(4)}"
        key = self._key("rl", "ip", ip)

        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(key, "-inf", cutoff)
            pipe.zcard(key)
            pipe.zadd(key, {member: now})
            pipe.expire(key, 120)
            results = await pipe.execute()

        current_count = int(results[1])
        return current_count < per_minute_limit

    async def reserve_slot(
        self,
        visitor: str,
        day_key: str,
        daily_limit: int,
        concurrent_limit: int,
    ) -> tuple[bool, str | None]:
        day_storage_key = self._key("quota", "daily", day_key)
        active_storage_key = self._key("quota", "active", visitor)
        result = await self._redis.eval(
            self._RESERVE_SCRIPT,
            2,
            day_storage_key,
            active_storage_key,
            daily_limit,
            concurrent_limit,
            172800,
        )

        success = bool(result and int(result[0]) == 1)
        if success:
            return True, None

        reason = "daily"
        if len(result) > 1:
            reason = str(result[1])
        return False, reason

    async def release_slot(self, visitor: str) -> None:
        active_storage_key = self._key("quota", "active", visitor)
        await self._redis.eval(self._RELEASE_SCRIPT, 1, active_storage_key)

_trusted_proxy_networks: tuple[ipaddress._BaseNetwork, ...] = ()
if settings.trusted_proxy_ips:
    parsed_networks = []
    for raw in settings.trusted_proxy_ips:
        try:
            parsed_networks.append(ipaddress.ip_network(raw, strict=False))
        except ValueError:
            logger.warning("Ignoring invalid TRUSTED_PROXY_IPS entry: %s", raw)
    _trusted_proxy_networks = tuple(parsed_networks)


def _create_state_store() -> SimulationStateStore:
    if settings.redis_url:
        try:
            logger.info("Using Redis-backed simulation state store")
            return RedisStateStore(settings.redis_url)
        except Exception:
            logger.exception("Failed to initialize Redis store, falling back to in-memory state")

    logger.warning("Using in-memory simulation state store; limits are process-local")
    return InMemoryStateStore()


_state_store = _create_state_store()


def _is_trusted_proxy(ip: str | None) -> bool:
    if not ip or not _trusted_proxy_networks:
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in network for network in _trusted_proxy_networks)


def _parse_first_valid_ip(value: str) -> str | None:
    for candidate in [item.strip() for item in value.split(",")]:
        if not candidate:
            continue
        try:
            ipaddress.ip_address(candidate)
            return candidate
        except ValueError:
            continue
    return None


def _client_ip(request: Request) -> str:
    direct_ip = request.client.host if request.client and request.client.host else None

    # Only trust forwarding headers when traffic is known to come from a trusted proxy.
    if settings.trust_proxy_headers and _is_trusted_proxy(direct_ip):
        forwarded_for = request.headers.get("x-forwarded-for", "").strip()
        forwarded_ip = _parse_first_valid_ip(forwarded_for)
        if forwarded_ip:
            return forwarded_ip

        real_ip = request.headers.get("x-real-ip", "").strip()
        parsed_real_ip = _parse_first_valid_ip(real_ip)
        if parsed_real_ip:
            return parsed_real_ip

    if direct_ip:
        return direct_ip
    return "unknown"


def _visitor_id(request: Request) -> str:
    # Do not trust client-provided visitor IDs for enforcement decisions.
    return f"ip:{_client_ip(request)}"


def _utc_day() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def enforce_ip_rate_limit(request: Request) -> None:
    ip = _client_ip(request)
    allowed = await _state_store.check_ip_rate_limit(ip, settings.rate_limit_per_minute_ip)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests from this IP. Please retry in a minute.",
        )


async def reserve_visitor_simulation_slot(request: Request) -> str:
    visitor = _visitor_id(request)
    day_key = f"{_utc_day()}:{visitor}"

    reserved, reason = await _state_store.reserve_slot(
        visitor,
        day_key,
        settings.sim_limit_per_day_visitor,
        settings.max_concurrent_sim_per_visitor,
    )

    if not reserved:
        if reason == "concurrent":
            raise HTTPException(
                status_code=429,
                detail="Concurrent simulation limit reached for this visitor.",
            )

        raise HTTPException(
            status_code=429,
            detail="Daily simulation limit reached for this visitor.",
        )

    return visitor


async def release_visitor_simulation_slot(visitor: str) -> None:
    await _state_store.release_slot(visitor)


def reset_inmemory_state_for_tests() -> None:
    if isinstance(_state_store, InMemoryStateStore):
        _state_store.clear_all()


async def run_guarded_request(
    request: Request,
    operation: Callable[[], Awaitable[T]],
) -> T:
    await enforce_ip_rate_limit(request)
    try:
        return await asyncio.wait_for(operation(), timeout=settings.request_timeout_seconds)
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Request timed out.") from exc


async def run_guarded_simulation(
    request: Request,
    operation: Callable[[], Awaitable[T]],
) -> T:
    await enforce_ip_rate_limit(request)
    visitor = await reserve_visitor_simulation_slot(request)

    try:
        return await asyncio.wait_for(operation(), timeout=settings.request_timeout_seconds)
    except asyncio.TimeoutError as exc:
        raise HTTPException(status_code=504, detail="Simulation request timed out.") from exc
    finally:
        await release_visitor_simulation_slot(visitor)
