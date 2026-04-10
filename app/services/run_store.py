import asyncio
import json
import logging
import time
import uuid
from abc import ABC, abstractmethod
from threading import Lock
from typing import Any

from app.config import settings

try:
    import redis.asyncio as redis_asyncio
except Exception:  # pragma: no cover - optional dependency import guard
    redis_asyncio = None

try:
    import asyncpg
except Exception:  # pragma: no cover - optional dependency import guard
    asyncpg = None

logger = logging.getLogger(__name__)


class RunStore(ABC):
    @abstractmethod
    async def save(self, run_id: str, payload: dict[str, Any], ttl_seconds: int) -> None:
        """Persist a run payload with TTL."""

    @abstractmethod
    async def get(self, run_id: str) -> dict[str, Any] | None:
        """Fetch a run payload by run ID."""


class InMemoryRunStore(RunStore):
    def __init__(self) -> None:
        self._lock = Lock()
        self._items: dict[str, tuple[float, dict[str, Any]]] = {}

    async def save(self, run_id: str, payload: dict[str, Any], ttl_seconds: int) -> None:
        expires_at = time.time() + ttl_seconds
        with self._lock:
            self._items[run_id] = (expires_at, payload)

    async def get(self, run_id: str) -> dict[str, Any] | None:
        now = time.time()
        with self._lock:
            stored = self._items.get(run_id)
            if not stored:
                return None

            expires_at, payload = stored
            if expires_at <= now:
                self._items.pop(run_id, None)
                return None

            return payload


class RedisRunStore(RunStore):
    def __init__(self, redis_url: str) -> None:
        if redis_asyncio is None:
            raise RuntimeError("redis package is required for Redis-backed run store")

        self._redis = redis_asyncio.from_url(redis_url, decode_responses=True)
        self._prefix = "synsoc:run"

    def _key(self, run_id: str) -> str:
        return f"{self._prefix}:{run_id}"

    async def save(self, run_id: str, payload: dict[str, Any], ttl_seconds: int) -> None:
        key = self._key(run_id)
        await self._redis.set(key, json.dumps(payload), ex=ttl_seconds)

    async def get(self, run_id: str) -> dict[str, Any] | None:
        key = self._key(run_id)
        raw = await self._redis.get(key)
        if not raw:
            return None
        return json.loads(raw)


class PostgresRunStore(RunStore):
    def __init__(self, database_url: str) -> None:
        if asyncpg is None:
            raise RuntimeError("asyncpg package is required for Postgres-backed run store")

        self._database_url = database_url
        self._pool = None
        self._init_lock = asyncio.Lock()

    async def _ensure_ready(self) -> None:
        if self._pool is not None:
            return

        async with self._init_lock:
            if self._pool is not None:
                return

            pool = await asyncpg.create_pool(
                dsn=self._database_url,
                min_size=1,
                max_size=5,
                command_timeout=10,
            )

            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS pipeline_runs (
                        run_id TEXT PRIMARY KEY,
                        owner_id TEXT NULL,
                        created_at BIGINT NOT NULL,
                        expires_at BIGINT NOT NULL,
                        payload_json TEXT NOT NULL
                    )
                    """
                )
                await conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS pipeline_runs_expires_at_idx
                    ON pipeline_runs (expires_at)
                    """
                )

            self._pool = pool

    async def save(self, run_id: str, payload: dict[str, Any], ttl_seconds: int) -> None:
        await self._ensure_ready()
        now = int(time.time())
        created_at = int(payload.get("created_at") or now)
        expires_at = created_at + ttl_seconds
        owner_id = payload.get("owner_id")
        payload_json = json.dumps(payload)

        async with self._pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO pipeline_runs (run_id, owner_id, created_at, expires_at, payload_json)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (run_id)
                DO UPDATE SET
                    owner_id = EXCLUDED.owner_id,
                    created_at = EXCLUDED.created_at,
                    expires_at = EXCLUDED.expires_at,
                    payload_json = EXCLUDED.payload_json
                """,
                run_id,
                owner_id,
                created_at,
                expires_at,
                payload_json,
            )

    async def get(self, run_id: str) -> dict[str, Any] | None:
        await self._ensure_ready()
        now = int(time.time())

        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT payload_json
                FROM pipeline_runs
                WHERE run_id = $1 AND expires_at > $2
                """,
                run_id,
                now,
            )
            if row is None:
                await conn.execute(
                    """
                    DELETE FROM pipeline_runs
                    WHERE run_id = $1 AND expires_at <= $2
                    """,
                    run_id,
                    now,
                )
                return None

        payload_json = row["payload_json"]
        if isinstance(payload_json, dict):
            return payload_json
        return json.loads(payload_json)


def _create_run_store() -> RunStore:
    if settings.database_url:
        try:
            logger.info("Using Postgres-backed run store")
            return PostgresRunStore(settings.database_url)
        except Exception:
            logger.exception(
                "Failed to initialize Postgres run store, falling back to Redis/in-memory"
            )

    if settings.redis_url:
        try:
            logger.info("Using Redis-backed run store")
            return RedisRunStore(settings.redis_url)
        except Exception:
            logger.exception("Failed to initialize Redis run store, falling back to in-memory")

    logger.warning("Using in-memory run store; run persistence is process-local")
    return InMemoryRunStore()


_run_store = _create_run_store()


def create_run_id() -> str:
    return uuid.uuid4().hex


async def save_pipeline_run(
    run_id: str,
    result_payload: dict[str, Any],
    owner_id: str | None = None,
) -> None:
    payload = {
        "run_id": run_id,
        "owner_id": owner_id,
        "created_at": int(time.time()),
        "result": result_payload,
    }
    await _run_store.save(run_id, payload, settings.run_result_ttl_seconds)


async def get_pipeline_run(run_id: str) -> dict[str, Any] | None:
    return await _run_store.get(run_id)
