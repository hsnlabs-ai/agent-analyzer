"""Sequential Single-Probe (N = 1) 6-Wave Execution Coordinator with Two-Pass Replay."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from typing import Any, Literal

from agent_analyzer.bridge.whatsapp_client import (
    SimulatedTargetTransport,
    TurnDeliveryResult,
    WAHATransportError,
    WAHAWhatsAppClient,
)
from agent_analyzer.inspector.analyzer import (
    TopologyAnalyzer,
    map_category_to_canonical_node_id,
)
from agent_analyzer.inspector.models import ProbeTurn, TopologyReport
from agent_analyzer.runner.jitter import HumanJitterEngine
from agent_analyzer.runner.probes import build_wave_probe_plan
from agent_analyzer.store.sqlite_store import AnalyzerSQLiteStore, utc_now_iso

EventBroadcaster = Callable[[str, str, dict[str, Any]], Awaitable[None]]


class WaveProtocolRunner:
    """Orchestrates W0..W5 sequential probing, Two-Pass replay verification, and live events."""

    def __init__(
        self,
        store: AnalyzerSQLiteStore,
        analyzer: TopologyAnalyzer,
        waha_client: WAHAWhatsAppClient,
        sim_transport: SimulatedTargetTransport | None = None,
        jitter_engine: HumanJitterEngine | None = None,
        broadcaster: EventBroadcaster | None = None,
    ) -> None:
        self.store = store
        self.analyzer = analyzer
        self.waha_client = waha_client
        self.sim_transport = sim_transport or SimulatedTargetTransport()
        self.jitter_engine = jitter_engine or HumanJitterEngine()
        self.broadcaster = broadcaster
        self._stop_flags: set[str] = set()

    def stop_scan(self, scan_id: str) -> None:
        """Signal an active scan to pause cleanly after the current turn."""
        self._stop_flags.add(scan_id)

    async def _emit(self, event_type: str, scan_id: str, payload: dict[str, Any]) -> None:
        if self.broadcaster is not None:
            await self.broadcaster(event_type, scan_id, payload)

    async def _on_jitter_phase(self, scan_id: str, phase_name: str, duration_ms: int) -> None:
        self.store.update_scan_state(scan_id, active_phase=phase_name)
        await self._emit(
            "probe_phase",
            scan_id,
            {"active_phase": phase_name, "duration_ms": duration_ms},
        )

    async def run_scan(
        self,
        scan_id: str,
        target_wave: int | Literal["ALL"] = "ALL",
        reset_first: bool = False,
        fast_sim_override: bool = False,
    ) -> TopologyReport:
        """Execute either a single wave (1..5) or the full W1..W5 sequence for scan_id."""
        self._stop_flags.discard(scan_id)
        if reset_first:
            self.store.reset_scan_to_w0(scan_id)
            self.sim_transport.reset_thread(scan_id)

        scan = self.store.get_scan(scan_id)
        if scan is None:
            raise ValueError(f"Unknown scan_id '{scan_id}'.")

        if target_wave == "ALL":
            start_wave = max(1, scan.current_wave + 1) if scan.current_wave < 5 else 1
            if reset_first or scan.current_wave == 0:
                start_wave = 1
            waves_to_run = list(range(start_wave, 6))
        else:
            w_idx = int(target_wave)
            if w_idx == 0:
                self.store.reset_scan_to_w0(scan_id)
                report = self.analyzer.build_topology_report(scan_id, max_wave=0)
                await self._emit("wave_updated", scan_id, {"current_wave": 0, "status": "IDLE"})
                return report
            waves_to_run = [max(1, min(5, w_idx))]

        settings = self.store.get_settings()
        sim_scale = 0.0 if fast_sim_override else settings.sim_jitter_sleep_scale
        live_scale = settings.live_jitter_sleep_scale
        min_gap_s = settings.min_turn_gap_s

        self.store.update_scan_state(
            scan_id,
            status="RUNNING",
            active_phase="STARTING_WAVE",
            error_code=None,
            error_message=None,
        )

        existing_turns = self.store.list_probe_turns(scan_id)
        turn_counter = len(existing_turns)
        prev_reply_text = existing_turns[-1].response_text if existing_turns else ""

        try:
            for wave_idx in waves_to_run:
                if scan_id in self._stop_flags:
                    self.store.update_scan_state(
                        scan_id, status="PAUSED", active_phase="IDLE"
                    )
                    break

                probe_plan = build_wave_probe_plan(wave_idx, scan.target_description)
                for spec in probe_plan:
                    if scan_id in self._stop_flags:
                        self.store.update_scan_state(
                            scan_id, status="PAUSED", active_phase="IDLE"
                        )
                        break

                    self.store.update_scan_state(
                        scan_id,
                        status="RUNNING",
                        current_wave=wave_idx,
                        current_pass=spec.pass_index,
                    )

                    delays = self.jitter_engine.compute_turn_delays(
                        prev_reply_text=prev_reply_text,
                        next_prompt_text=spec.prompt_text,
                        transport_mode=scan.transport_mode,
                        sim_scale=sim_scale,
                        live_scale=live_scale,
                        min_turn_gap_s=min_gap_s,
                    )
                    await self.jitter_engine.execute_paced_phases(
                        scan_id, delays, self._on_jitter_phase
                    )

                    self.store.update_scan_state(
                        scan_id, active_phase="WAITING_TARGET_REPLY"
                    )
                    await self._emit(
                        "probe_phase",
                        scan_id,
                        {"active_phase": "WAITING_TARGET_REPLY", "duration_ms": 0},
                    )

                    if scan.transport_mode == "LIVE_WHATSAPP":
                        delivery: TurnDeliveryResult = (
                            await self.waha_client.send_and_receive(
                                target_phone=scan.target_phone,
                                prompt_text=spec.prompt_text,
                            )
                        )
                    else:
                        delivery = await self.sim_transport.send_and_receive(
                            scan_id=scan_id,
                            probe_category=spec.probe_category,
                            prompt_text=spec.prompt_text,
                            pass_index=spec.pass_index,
                        )

                    turn_counter += 1
                    inferred_node = (
                        map_category_to_canonical_node_id(
                            spec.probe_category,
                            delivery.net_inference_ms,
                            delivery.response_text,
                        )
                        if delivery.delivery_status == "DELIVERED"
                        else None
                    )
                    recorded_turn = ProbeTurn(
                        id=f"turn-{uuid.uuid4().hex[:12]}",
                        scan_id=scan_id,
                        wave_index=wave_idx,
                        pass_index=spec.pass_index,
                        turn_index=turn_counter,
                        probe_category=spec.probe_category,
                        prompt_text=spec.prompt_text,
                        response_text=delivery.response_text,
                        delivery_status=delivery.delivery_status,
                        status_code=delivery.status_code,
                        raw_rtt_ms=delivery.raw_rtt_ms,
                        ws_ping_ms=delivery.ws_ping_ms,
                        net_inference_ms=delivery.net_inference_ms,
                        prompt_tokens_est=delivery.prompt_tokens_est,
                        completion_tokens_est=delivery.completion_tokens_est,
                        tokens_per_sec=delivery.tokens_per_sec,
                        jitter_phase_ms=delays.to_dict(),
                        inferred_node_id=inferred_node,
                        created_at=utc_now_iso(),
                    )
                    self.store.insert_probe_turn(recorded_turn)
                    prev_reply_text = delivery.response_text

                    # Incrementally reconstruct and persist topology after every turn
                    self.analyzer.reconstruct_and_persist_topology(scan_id)
                    await self._emit(
                        "turn_recorded",
                        scan_id,
                        {"turn": recorded_turn.model_dump(), "wave_index": wave_idx},
                    )

                await self._emit(
                    "wave_updated",
                    scan_id,
                    {"current_wave": wave_idx, "status": "RUNNING"},
                )

            final_scan = self.store.get_scan(scan_id)
            if final_scan and final_scan.status != "PAUSED":
                new_status = "COMPLETED" if final_scan.current_wave >= 5 else "IDLE"
                self.store.update_scan_state(
                    scan_id,
                    status=new_status,
                    active_phase="IDLE",
                )
                await self._emit(
                    "wave_updated",
                    scan_id,
                    {"current_wave": final_scan.current_wave, "status": new_status},
                )
        except WAHATransportError as exc:
            self.store.update_scan_state(
                scan_id,
                status="FAILED",
                active_phase="IDLE",
                error_code=exc.error_code,
                error_message=exc.message,
            )
            await self._emit(
                "scan_error",
                scan_id,
                {"error_code": exc.error_code, "error_message": exc.message},
            )
            raise
        except Exception as exc:
            self.store.update_scan_state(
                scan_id,
                status="FAILED",
                active_phase="IDLE",
                error_code="RUNNER_ERROR",
                error_message=str(exc),
            )
            await self._emit(
                "scan_error",
                scan_id,
                {"error_code": "RUNNER_ERROR", "error_message": str(exc)},
            )
            raise

        return self.analyzer.build_topology_report(scan_id, max_wave=None)
