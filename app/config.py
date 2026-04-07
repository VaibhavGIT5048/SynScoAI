import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _read_required(name: str) -> str:
    value = os.getenv(name)
    if value is None or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value.strip()


def _read_required_int(name: str, *, minimum: int = 1) -> int:
    raw = _read_required(name)
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer.") from exc

    if value < minimum:
        raise RuntimeError(f"{name} must be >= {minimum}.")
    return value


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


@dataclass(frozen=True)
class Settings:
    openai_api_key: str
    openai_model: str
    allowed_origins: list[str]
    rate_limit_per_minute_ip: int
    sim_limit_per_day_visitor: int
    max_concurrent_sim_per_visitor: int
    request_timeout_seconds: int
    max_input_chars_topic: int
    max_input_chars_context: int


_OPENAI_MODEL = _read_required("OPENAI_MODEL")
if _OPENAI_MODEL != "gpt-5.4-nano":
    raise RuntimeError("OPENAI_MODEL must be set to gpt-5.4-nano.")

settings = Settings(
    openai_api_key=_read_required("OPENAI_API_KEY"),
    openai_model=_OPENAI_MODEL,
    allowed_origins=_parse_origins(_read_required("ALLOWED_ORIGINS")),
    rate_limit_per_minute_ip=_read_required_int("RATE_LIMIT_PER_MINUTE_IP"),
    sim_limit_per_day_visitor=_read_required_int("SIM_LIMIT_PER_DAY_VISITOR"),
    max_concurrent_sim_per_visitor=_read_required_int("MAX_CONCURRENT_SIM_PER_VISITOR"),
    request_timeout_seconds=_read_required_int("REQUEST_TIMEOUT_SECONDS"),
    max_input_chars_topic=_read_required_int("MAX_INPUT_CHARS_TOPIC"),
    max_input_chars_context=_read_required_int("MAX_INPUT_CHARS_CONTEXT"),
)
