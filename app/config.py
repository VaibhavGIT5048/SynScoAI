import os
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv

load_dotenv()


def _read_required(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value.strip()


def _read_optional(name: str) -> Optional[str]:
    value = os.getenv(name)
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _read_required_int(name: str, *, minimum: int = 1) -> int:
    raw = _read_required(name)
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer.") from exc

    if value < minimum:
        raise RuntimeError(f"{name} must be >= {minimum}.")
    return value


def _read_int(name: str, default: int, *, minimum: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default

    try:
        value = int(raw.strip())
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer.") from exc

    if value < minimum:
        raise RuntimeError(f"{name} must be >= {minimum}.")
    return value


def _read_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default

    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False

    raise RuntimeError(f"{name} must be a boolean value.")


def _parse_origins(raw_origins: str) -> list[str]:
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    if not origins:
        raise RuntimeError("ALLOWED_ORIGINS must include at least one origin.")
    if "*" in origins:
        raise RuntimeError("ALLOWED_ORIGINS cannot include '*'.")

    for origin in origins:
        if not origin.startswith("http://") and not origin.startswith("https://"):
            raise RuntimeError(
                "Each ALLOWED_ORIGINS entry must start with http:// or https://"
            )

    return origins


def _parse_optional_csv(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    openai_api_key: str
    openai_model: str
    openai_model_graph: str
    openai_model_agents: str
    openai_model_simulation: str
    openai_model_report: str
    allowed_origins: list[str]
    rate_limit_per_minute_ip: int
    sim_limit_per_day_visitor: int
    max_concurrent_sim_per_visitor: int
    request_timeout_seconds: int
    max_input_chars_topic: int
    max_input_chars_context: int
    redis_url: Optional[str]
    trust_proxy_headers: bool
    trusted_proxy_ips: list[str]
    pipeline_stream_node_concurrency: int
    run_result_ttl_seconds: int


_OPENAI_MODEL = _read_required("OPENAI_MODEL")
_OPENAI_MODEL_GRAPH = _read_optional("OPENAI_MODEL_GRAPH") or _OPENAI_MODEL
_OPENAI_MODEL_AGENTS = _read_optional("OPENAI_MODEL_AGENTS") or _OPENAI_MODEL
_OPENAI_MODEL_SIMULATION = _read_optional("OPENAI_MODEL_SIMULATION") or "gpt-5.4-nano"
_OPENAI_MODEL_REPORT = _read_optional("OPENAI_MODEL_REPORT") or _OPENAI_MODEL

settings = Settings(
    openai_api_key=_read_required("OPENAI_API_KEY"),
    openai_model=_OPENAI_MODEL,
    openai_model_graph=_OPENAI_MODEL_GRAPH,
    openai_model_agents=_OPENAI_MODEL_AGENTS,
    openai_model_simulation=_OPENAI_MODEL_SIMULATION,
    openai_model_report=_OPENAI_MODEL_REPORT,
    allowed_origins=_parse_origins(_read_required("ALLOWED_ORIGINS")),
    rate_limit_per_minute_ip=_read_required_int("RATE_LIMIT_PER_MINUTE_IP"),
    sim_limit_per_day_visitor=_read_required_int("SIM_LIMIT_PER_DAY_VISITOR"),
    max_concurrent_sim_per_visitor=_read_required_int("MAX_CONCURRENT_SIM_PER_VISITOR"),
    request_timeout_seconds=_read_required_int("REQUEST_TIMEOUT_SECONDS"),
    max_input_chars_topic=_read_required_int("MAX_INPUT_CHARS_TOPIC"),
    max_input_chars_context=_read_required_int("MAX_INPUT_CHARS_CONTEXT"),
    redis_url=_read_optional("REDIS_URL"),
    trust_proxy_headers=_read_bool("TRUST_PROXY_HEADERS", default=False),
    trusted_proxy_ips=_parse_optional_csv(_read_optional("TRUSTED_PROXY_IPS")),
    pipeline_stream_node_concurrency=_read_int("PIPELINE_STREAM_NODE_CONCURRENCY", default=4),
    run_result_ttl_seconds=_read_int("RUN_RESULT_TTL_SECONDS", default=86400, minimum=60),
)
