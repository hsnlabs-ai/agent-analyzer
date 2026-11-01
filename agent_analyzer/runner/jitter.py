"""Biomimetic Pacing & Anti-Ban Jitter Engine for Single-Probe WhatsApp Scans."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from agent_analyzer.config import (
    LIVE_JITTER_SLEEP_SCALE_FLOOR,
    LIVE_MIN_TURN_GAP_FLOOR_S,
)
from agent_analyzer.inspector.models import TransportMode


@dataclass(slots=True)
class TurnJitterDelays:
    """Computed phase durations (ms) prior to dispatching a probe turn."""

    generating_ms: int
    reading_ms: int
    thinking_ms: int
    typing_ms: int
    total_ms: int

    def to_dict(self) -> dict[str, int]:
        return {
            "GENERATING_PROBE": self.generating_ms,
            "JITTER_READING": self.reading_ms,
            "JITTER_THINKING": self.thinking_ms,
            "JITTER_TYPING": self.typing_ms,
            "TOTAL_JITTER_MS": self.total_ms,
        }


class HumanJitterEngine:
    """Calculates biomimetic reading, thinking, and typing delays and enforces the live >=2.0s floor."""

    def compute_turn_delays(
        self,
        prev_reply_text: str,
        next_prompt_text: str,
        transport_mode: TransportMode,
        sim_scale: float = 0.08,
        live_scale: float = 0.35,
        min_turn_gap_s: float = 2.0,
    ) -> TurnJitterDelays:
        prev_words = max(4, len((prev_reply_text or "").split()))
        next_chars = max(12, len(next_prompt_text or ""))

        # Base unscaled human rhythm (ms)
        base_gen_ms = 240
        base_read_ms = min(2200, max(380, prev_words * 55))
        base_think_ms = 620
        base_type_ms = min(3200, max(540, next_chars * 24))

        if transport_mode == "LIVE_WHATSAPP":
            scale = max(LIVE_JITTER_SLEEP_SCALE_FLOOR, float(live_scale))
            min_total_ms = int(round(max(LIVE_MIN_TURN_GAP_FLOOR_S, float(min_turn_gap_s)) * 1000))
        else:
            scale = max(0.0, min(1.0, float(sim_scale)))
            min_total_ms = 0

        gen_ms = max(1, int(round(base_gen_ms * scale))) if scale > 0 else 0
        read_ms = max(1, int(round(base_read_ms * scale))) if scale > 0 else 0
        think_ms = max(1, int(round(base_think_ms * scale))) if scale > 0 else 0
        type_ms = max(1, int(round(base_type_ms * scale))) if scale > 0 else 0
        total_ms = gen_ms + read_ms + think_ms + type_ms

        if min_total_ms > 0 and total_ms < min_total_ms:
            deficit = min_total_ms - total_ms
            # Distribute the remaining floor across reading, thinking, and typing
            read_add = deficit // 3
            think_add = deficit // 3
            type_add = deficit - read_add - think_add
            read_ms += read_add
            think_ms += think_add
            type_ms += type_add
            total_ms = gen_ms + read_ms + think_ms + type_ms

        return TurnJitterDelays(
            generating_ms=gen_ms,
            reading_ms=read_ms,
            thinking_ms=think_ms,
            typing_ms=type_ms,
            total_ms=total_ms,
        )

    async def execute_paced_phases(
        self,
        scan_id: str,
        delays: TurnJitterDelays,
        phase_callback: Callable[[str, str, int], Awaitable[None]] | None = None,
    ) -> None:
        """Sequentially emit phase status notifications and sleep for each phase duration."""
        phases = [
            ("GENERATING_PROBE", delays.generating_ms),
            ("JITTER_READING", delays.reading_ms),
            ("JITTER_THINKING", delays.thinking_ms),
            ("JITTER_TYPING", delays.typing_ms),
        ]
        for phase_name, duration_ms in phases:
            if phase_callback is not None:
                await phase_callback(scan_id, phase_name, duration_ms)
            if duration_ms > 0:
                await asyncio.sleep(duration_ms / 1000.0)
