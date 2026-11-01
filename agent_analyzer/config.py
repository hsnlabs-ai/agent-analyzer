"""Runtime configuration, E.164 target phone validation, and live WhatsApp pacing floors."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

_E164_CLEAN_RE = re.compile(r"[^\d+]")
_E164_VALID_RE = re.compile(r"^\+[1-9]\d{7,14}$")

LIVE_MIN_TURN_GAP_FLOOR_S = 2.0
LIVE_JITTER_SLEEP_SCALE_FLOOR = 0.35


def normalize_e164_phone(raw_phone: str) -> str:
    """Normalize and validate an E.164 phone number (e.g. '+5511999990000').

    Raises ValueError if the input cannot be normalized into a valid 8..15 digit E.164 number.
    """
    cleaned = _E164_CLEAN_RE.sub("", (raw_phone or "").strip())
    if not cleaned:
        raise ValueError("Target phone number must not be empty.")
    if not cleaned.startswith("+"):
        cleaned = f"+{cleaned}"
    if not _E164_VALID_RE.match(cleaned):
        raise ValueError(
            f"Invalid E.164 phone number '{raw_phone}'. Expected '+' followed by 8 to 15 digits."
        )
    return cleaned


def phone_to_waha_chat_id(raw_phone: str) -> str:
    """Convert an E.164 phone number into a WAHA WhatsApp chatId ('<digits>@c.us')."""
    normalized = normalize_e164_phone(raw_phone)
    digits = normalized.lstrip("+")
    return f"{digits}@c.us"


def mask_api_key(secret: str | None) -> tuple[bool, str]:
    """Return (has_key, masked_hint) without exposing raw credentials."""
    val = (secret or "").strip()
    if not val:
        return False, ""
    if len(val) <= 8:
        return True, f"{val[:2]}***"
    return True, f"{val[:4]}...{val[-4:]}"


@dataclass(slots=True)
class AnalyzerConfig:
    """Environment-backed runtime configuration for Agent Analyzer."""

    host: str = "127.0.0.1"
    port: int = 8095
    db_path: Path = Path("data/analyzer.sqlite3")
    waha_base_url: str = "http://localhost:3001"
    waha_session_name: str = "default"
    waha_api_key: str = ""
    llm_provider: str = "gemini"
    llm_model: str = "gemini-2.5-flash"
    gemini_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    sim_jitter_sleep_scale: float = 0.08
    live_jitter_sleep_scale: float = 0.35
    min_turn_gap_s: float = 2.0

    @classmethod
    def from_env(cls, db_path_override: str | Path | None = None) -> AnalyzerConfig:
        raw_db = (
            str(db_path_override)
            if db_path_override is not None
            else os.getenv("ANALYZER_DB_PATH", "data/analyzer.sqlite3")
        )
        sim_scale = max(0.0, min(1.0, float(os.getenv("ANALYZER_SIM_JITTER_SCALE", "0.08"))))
        live_scale = max(
            LIVE_JITTER_SLEEP_SCALE_FLOOR,
            min(2.0, float(os.getenv("ANALYZER_LIVE_JITTER_SCALE", "0.35"))),
        )
        min_gap = max(
            LIVE_MIN_TURN_GAP_FLOOR_S,
            float(os.getenv("ANALYZER_MIN_TURN_GAP_S", "2.0")),
        )
        return cls(
            host=os.getenv("ANALYZER_HOST", "127.0.0.1"),
            port=int(os.getenv("ANALYZER_PORT", "8095")),
            db_path=Path(raw_db),
            waha_base_url=os.getenv("WAHA_BASE_URL", "http://localhost:3001").rstrip("/"),
            waha_session_name=os.getenv("WAHA_SESSION_NAME", "default"),
            waha_api_key=os.getenv("WAHA_API_KEY", ""),
            llm_provider=os.getenv("ANALYZER_LLM_PROVIDER", "gemini"),
            llm_model=os.getenv("ANALYZER_LLM_MODEL", "gemini-2.5-flash"),
            gemini_api_key=os.getenv("GEMINI_API_KEY", ""),
            openai_api_key=os.getenv("OPENAI_API_KEY", ""),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            sim_jitter_sleep_scale=sim_scale,
            live_jitter_sleep_scale=live_scale,
            min_turn_gap_s=min_gap,
        )
