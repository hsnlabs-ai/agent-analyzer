"""Thread-safe 5-table SQLite WAL store for Agent Analyzer."""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from agent_analyzer.config import (
    LIVE_JITTER_SLEEP_SCALE_FLOOR,
    LIVE_MIN_TURN_GAP_FLOOR_S,
    AnalyzerConfig,
    mask_api_key,
    normalize_e164_phone,
)
from agent_analyzer.inspector.models import (
    AnalyzerSettingsResponse,
    AnalyzerSettingsUpdate,
    ProbeTurn,
    TargetScanSummary,
    TopologyEdge,
    TopologyNode,
)

DEFAULT_SCAN_ID = "default-simulated-scan"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def build_w0_skeleton_nodes_and_edges(
    scan_id: str,
) -> tuple[list[TopologyNode], list[TopologyEdge]]:
    """Build the canonical Wave 0 placeholder topology: START_NODE -> [ ? ] -> END_NODE."""
    nodes = [
        TopologyNode(
            scan_id=scan_id,
            node_id="start_node",
            label="__start__ (WhatsApp Inbound)",
            node_type="START_NODE",
            discovered_in_wave=0,
            confidence=1.0,
            sample_count=0,
            pass_count=2,
            verification_status="REPLAY_VERIFIED",
            state_keys=["messages", "thread_id"],
            evidence=["Entry point for single-probe WhatsApp conversation session."],
        ),
        TopologyNode(
            scan_id=scan_id,
            node_id="unknown_blackbox_node",
            label="[ ? ] Unmapped Target Agent",
            node_type="UNKNOWN_BLACKBOX_NODE",
            discovered_in_wave=0,
            confidence=0.15,
            sample_count=0,
            pass_count=1,
            verification_status="UNVERIFIED_HYPOTHESIS",
            state_keys=["messages"],
            evidence=[
                "Wave 0 initial black-box placeholder. Execute Waves W1..W5 to map internal StateGraph."
            ],
        ),
        TopologyNode(
            scan_id=scan_id,
            node_id="end_node",
            label="__end__ (WhatsApp Outbound)",
            node_type="END_NODE",
            discovered_in_wave=0,
            confidence=1.0,
            sample_count=0,
            pass_count=2,
            verification_status="REPLAY_VERIFIED",
            state_keys=["messages"],
            evidence=["Terminal outbound WhatsApp response boundary."],
        ),
    ]
    edges = [
        TopologyEdge(
            scan_id=scan_id,
            edge_id="edge_w0_start_to_unknown",
            source_node_id="start_node",
            target_node_id="unknown_blackbox_node",
            edge_type="SEQUENTIAL",
            condition_label="inbound_message",
            probability=1.0,
            traversal_count=1,
            avg_transition_ms=0,
            discovered_in_wave=0,
            verification_status="UNVERIFIED_HYPOTHESIS",
        ),
        TopologyEdge(
            scan_id=scan_id,
            edge_id="edge_w0_unknown_to_end",
            source_node_id="unknown_blackbox_node",
            target_node_id="end_node",
            edge_type="SEQUENTIAL",
            condition_label="outbound_reply",
            probability=1.0,
            traversal_count=1,
            avg_transition_ms=0,
            discovered_in_wave=0,
            verification_status="UNVERIFIED_HYPOTHESIS",
        ),
    ]
    return nodes, edges


class AnalyzerSQLiteStore:
    """Synchronous stdlib sqlite3 WAL persistence layer guarded by a re-entrant lock."""

    def __init__(self, db_path: str | Path = "data/analyzer.sqlite3", config: AnalyzerConfig | None = None) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.config = config or AnalyzerConfig.from_env(db_path_override=self.db_path)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self.init_db()
        self.ensure_default_settings()
        self.ensure_default_scan()

    def init_db(self) -> None:
        """Apply WAL pragmas and execute schema.sql DDL."""
        schema_path = Path(__file__).with_name("schema.sql")
        ddl = schema_path.read_text(encoding="utf-8")
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL;")
            self._conn.execute("PRAGMA synchronous=NORMAL;")
            self._conn.execute("PRAGMA foreign_keys=ON;")
            self._conn.execute("PRAGMA busy_timeout=5000;")
            self._conn.executescript(ddl)
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def ensure_default_settings(self) -> None:
        """Seed default runtime settings into analyzer_settings if not already present."""
        now = utc_now_iso()
        defaults = {
            "llm_provider": self.config.llm_provider,
            "llm_model": self.config.llm_model,
            "gemini_api_key": self.config.gemini_api_key,
            "openai_api_key": self.config.openai_api_key,
            "anthropic_api_key": self.config.anthropic_api_key,
            "waha_base_url": self.config.waha_base_url,
            "waha_session_name": self.config.waha_session_name,
            "waha_api_key": self.config.waha_api_key,
            "sim_jitter_sleep_scale": str(self.config.sim_jitter_sleep_scale),
            "live_jitter_sleep_scale": str(self.config.live_jitter_sleep_scale),
            "min_turn_gap_s": str(self.config.min_turn_gap_s),
        }
        with self._lock:
            for key, val in defaults.items():
                self._conn.execute(
                    """
                    INSERT OR IGNORE INTO analyzer_settings (key, value, updated_at)
                    VALUES (?, ?, ?)
                    """,
                    (key, val, now),
                )
            self._conn.commit()

    def ensure_default_scan(self) -> TargetScanSummary:
        """Ensure the zero-config simulated scan ('default-simulated-scan') exists at W0."""
        existing = self.get_scan(DEFAULT_SCAN_ID)
        if existing is not None:
            return existing
        now = utc_now_iso()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO target_scans (
                    id, target_name, target_phone, target_description,
                    transport_mode, waha_session, status,
                    current_wave, current_pass, active_phase,
                    error_code, error_message, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
                """,
                (
                    DEFAULT_SCAN_ID,
                    "Aurora Commerce & Pix Bot (Simulated)",
                    "+5511999990000",
                    "Multi-node retail order SQL, Pix policy RAG, parallel Send() tools & MemorySaver bot",
                    "SIMULATION",
                    "default",
                    "IDLE",
                    0,
                    1,
                    "IDLE",
                    now,
                    now,
                ),
            )
            self._conn.commit()
        w0_nodes, w0_edges = build_w0_skeleton_nodes_and_edges(DEFAULT_SCAN_ID)
        self.replace_scan_topology(DEFAULT_SCAN_ID, w0_nodes, w0_edges)
        scan = self.get_scan(DEFAULT_SCAN_ID)
        assert scan is not None
        return scan

    def list_scans(self) -> list[TargetScanSummary]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT * FROM target_scans
                ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END, created_at DESC
                """,
                (DEFAULT_SCAN_ID,),
            ).fetchall()
        return [self._row_to_scan(r) for r in rows]

    def get_scan(self, scan_id: str) -> TargetScanSummary | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM target_scans WHERE id = ?", (scan_id,)
            ).fetchone()
        return self._row_to_scan(row) if row is not None else None

    def create_scan(
        self,
        target_name: str,
        target_phone: str,
        target_description: str = "",
        transport_mode: str = "SIMULATION",
        waha_session: str = "default",
        scan_id: str | None = None,
    ) -> TargetScanSummary:
        normalized_phone = normalize_e164_phone(target_phone)
        mode = "LIVE_WHATSAPP" if transport_mode == "LIVE_WHATSAPP" else "SIMULATION"
        new_id = scan_id or f"scan-{uuid.uuid4().hex[:10]}"
        now = utc_now_iso()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO target_scans (
                    id, target_name, target_phone, target_description,
                    transport_mode, waha_session, status,
                    current_wave, current_pass, active_phase,
                    error_code, error_message, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'IDLE', 0, 1, 'IDLE', NULL, NULL, ?, ?)
                """,
                (
                    new_id,
                    target_name.strip(),
                    normalized_phone,
                    target_description.strip(),
                    mode,
                    (waha_session or "default").strip(),
                    now,
                    now,
                ),
            )
            self._conn.commit()
        w0_nodes, w0_edges = build_w0_skeleton_nodes_and_edges(new_id)
        self.replace_scan_topology(new_id, w0_nodes, w0_edges)
        created = self.get_scan(new_id)
        assert created is not None
        return created

    def update_scan_state(
        self,
        scan_id: str,
        *,
        status: str | None = None,
        current_wave: int | None = None,
        current_pass: int | None = None,
        active_phase: str | None = None,
        error_code: str | None = "__UNSET__",
        error_message: str | None = "__UNSET__",
    ) -> TargetScanSummary | None:
        fields: list[str] = ["updated_at = ?"]
        params: list[Any] = [utc_now_iso()]
        if status is not None:
            fields.append("status = ?")
            params.append(status)
        if current_wave is not None:
            fields.append("current_wave = ?")
            params.append(int(current_wave))
        if current_pass is not None:
            fields.append("current_pass = ?")
            params.append(int(current_pass))
        if active_phase is not None:
            fields.append("active_phase = ?")
            params.append(active_phase)
        if error_code != "__UNSET__":
            fields.append("error_code = ?")
            params.append(error_code)
        if error_message != "__UNSET__":
            fields.append("error_message = ?")
            params.append(error_message)
        params.append(scan_id)
        with self._lock:
            self._conn.execute(
                f"UPDATE target_scans SET {', '.join(fields)} WHERE id = ?",
                tuple(params),
            )
            self._conn.commit()
        return self.get_scan(scan_id)

    def reset_scan_to_w0(self, scan_id: str) -> TargetScanSummary | None:
        """Delete all probe turns and reset the scan topology back to the W0 placeholder."""
        with self._lock:
            self._conn.execute("DELETE FROM probe_turns WHERE scan_id = ?", (scan_id,))
            self._conn.execute("DELETE FROM topology_nodes WHERE scan_id = ?", (scan_id,))
            self._conn.execute("DELETE FROM topology_edges WHERE scan_id = ?", (scan_id,))
            self._conn.commit()
        w0_nodes, w0_edges = build_w0_skeleton_nodes_and_edges(scan_id)
        self.replace_scan_topology(scan_id, w0_nodes, w0_edges)
        return self.update_scan_state(
            scan_id,
            status="IDLE",
            current_wave=0,
            current_pass=1,
            active_phase="IDLE",
            error_code=None,
            error_message=None,
        )

    def delete_scan(self, scan_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM target_scans WHERE id = ?", (scan_id,))
            self._conn.commit()
            deleted = cur.rowcount > 0
        if scan_id == DEFAULT_SCAN_ID:
            self.ensure_default_scan()
        return deleted

    def insert_probe_turn(self, turn: ProbeTurn) -> ProbeTurn:
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO probe_turns (
                    id, scan_id, wave_index, pass_index, turn_index,
                    probe_category, prompt_text, response_text,
                    delivery_status, status_code, raw_rtt_ms, ws_ping_ms,
                    net_inference_ms, prompt_tokens_est, completion_tokens_est,
                    tokens_per_sec, jitter_phase_ms_json, inferred_node_id, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    turn.id,
                    turn.scan_id,
                    turn.wave_index,
                    turn.pass_index,
                    turn.turn_index,
                    turn.probe_category,
                    turn.prompt_text,
                    turn.response_text,
                    turn.delivery_status,
                    turn.status_code,
                    turn.raw_rtt_ms,
                    turn.ws_ping_ms,
                    turn.net_inference_ms,
                    turn.prompt_tokens_est,
                    turn.completion_tokens_est,
                    turn.tokens_per_sec,
                    json.dumps(turn.jitter_phase_ms),
                    turn.inferred_node_id,
                    turn.created_at,
                ),
            )
            self._conn.commit()
        return turn

    def list_probe_turns(self, scan_id: str, max_wave: int | None = None) -> list[ProbeTurn]:
        with self._lock:
            if max_wave is None:
                rows = self._conn.execute(
                    """
                    SELECT * FROM probe_turns
                    WHERE scan_id = ?
                    ORDER BY wave_index ASC, turn_index ASC
                    """,
                    (scan_id,),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    """
                    SELECT * FROM probe_turns
                    WHERE scan_id = ? AND wave_index <= ?
                    ORDER BY wave_index ASC, turn_index ASC
                    """,
                    (scan_id, int(max_wave)),
                ).fetchall()
        return [self._row_to_turn(r) for r in rows]

    def replace_scan_topology(
        self,
        scan_id: str,
        nodes: list[TopologyNode],
        edges: list[TopologyEdge],
    ) -> None:
        with self._lock:
            self._conn.execute("DELETE FROM topology_nodes WHERE scan_id = ?", (scan_id,))
            self._conn.execute("DELETE FROM topology_edges WHERE scan_id = ?", (scan_id,))
            for node in nodes:
                self._conn.execute(
                    """
                    INSERT INTO topology_nodes (
                        scan_id, node_id, label, node_type, discovered_in_wave,
                        avg_latency_ms, p95_latency_ms, min_latency_ms, max_latency_ms,
                        avg_tokens_per_sec, inferred_model_tier, inferred_temperature,
                        temperature_band, lexical_divergence, confidence,
                        sample_count, pass_count, verification_status,
                        super_step_group, interrupt_before, state_keys_json, evidence_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        scan_id,
                        node.node_id,
                        node.label,
                        node.node_type,
                        node.discovered_in_wave,
                        node.avg_latency_ms,
                        node.p95_latency_ms,
                        node.min_latency_ms,
                        node.max_latency_ms,
                        node.avg_tokens_per_sec,
                        node.inferred_model_tier,
                        node.inferred_temperature,
                        node.temperature_band,
                        node.lexical_divergence,
                        node.confidence,
                        node.sample_count,
                        node.pass_count,
                        node.verification_status,
                        node.super_step_group,
                        1 if node.interrupt_before else 0,
                        json.dumps(node.state_keys),
                        json.dumps(node.evidence),
                    ),
                )
            for edge in edges:
                self._conn.execute(
                    """
                    INSERT INTO topology_edges (
                        scan_id, edge_id, source_node_id, target_node_id,
                        edge_type, condition_label, probability,
                        traversal_count, avg_transition_ms,
                        discovered_in_wave, verification_status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        scan_id,
                        edge.edge_id,
                        edge.source_node_id,
                        edge.target_node_id,
                        edge.edge_type,
                        edge.condition_label,
                        edge.probability,
                        edge.traversal_count,
                        edge.avg_transition_ms,
                        edge.discovered_in_wave,
                        edge.verification_status,
                    ),
                )
            self._conn.commit()

    def list_topology_nodes(self, scan_id: str, max_wave: int | None = None) -> list[TopologyNode]:
        with self._lock:
            if max_wave is None:
                rows = self._conn.execute(
                    """
                    SELECT * FROM topology_nodes
                    WHERE scan_id = ?
                    ORDER BY discovered_in_wave ASC, node_id ASC
                    """,
                    (scan_id,),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    """
                    SELECT * FROM topology_nodes
                    WHERE scan_id = ? AND discovered_in_wave <= ?
                    ORDER BY discovered_in_wave ASC, node_id ASC
                    """,
                    (scan_id, int(max_wave)),
                ).fetchall()
        return [self._row_to_node(r) for r in rows]

    def list_topology_edges(self, scan_id: str, max_wave: int | None = None) -> list[TopologyEdge]:
        with self._lock:
            if max_wave is None:
                rows = self._conn.execute(
                    """
                    SELECT * FROM topology_edges
                    WHERE scan_id = ?
                    ORDER BY discovered_in_wave ASC, edge_id ASC
                    """,
                    (scan_id,),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    """
                    SELECT * FROM topology_edges
                    WHERE scan_id = ? AND discovered_in_wave <= ?
                    ORDER BY discovered_in_wave ASC, edge_id ASC
                    """,
                    (scan_id, int(max_wave)),
                ).fetchall()
        return [self._row_to_edge(r) for r in rows]

    def get_raw_settings_dict(self) -> dict[str, str]:
        with self._lock:
            rows = self._conn.execute("SELECT key, value FROM analyzer_settings").fetchall()
        return {str(r["key"]): str(r["value"]) for r in rows}

    def get_settings(self) -> AnalyzerSettingsResponse:
        raw = self.get_raw_settings_dict()
        has_gemini, gemini_hint = mask_api_key(raw.get("gemini_api_key", ""))
        has_openai, openai_hint = mask_api_key(raw.get("openai_api_key", ""))
        has_anthropic, anthropic_hint = mask_api_key(raw.get("anthropic_api_key", ""))
        has_waha, waha_hint = mask_api_key(raw.get("waha_api_key", ""))
        return AnalyzerSettingsResponse(
            llm_provider=raw.get("llm_provider", "gemini"),
            llm_model=raw.get("llm_model", "gemini-2.5-flash"),
            has_gemini_key=has_gemini,
            gemini_key_hint=gemini_hint,
            has_openai_key=has_openai,
            openai_key_hint=openai_hint,
            has_anthropic_key=has_anthropic,
            anthropic_key_hint=anthropic_hint,
            waha_base_url=raw.get("waha_base_url", "http://localhost:3001"),
            waha_session_name=raw.get("waha_session_name", "default"),
            has_waha_api_key=has_waha,
            waha_api_key_hint=waha_hint,
            sim_jitter_sleep_scale=float(raw.get("sim_jitter_sleep_scale", "0.08")),
            live_jitter_sleep_scale=max(
                LIVE_JITTER_SLEEP_SCALE_FLOOR,
                float(raw.get("live_jitter_sleep_scale", "0.35")),
            ),
            min_turn_gap_s=max(
                LIVE_MIN_TURN_GAP_FLOOR_S,
                float(raw.get("min_turn_gap_s", "2.0")),
            ),
        )

    def update_settings(self, update: AnalyzerSettingsUpdate) -> AnalyzerSettingsResponse:
        now = utc_now_iso()
        updates: dict[str, str] = {}
        if update.llm_provider is not None:
            updates["llm_provider"] = update.llm_provider.strip()
        if update.llm_model is not None:
            updates["llm_model"] = update.llm_model.strip()
        if update.gemini_api_key is not None:
            updates["gemini_api_key"] = update.gemini_api_key.strip()
        if update.openai_api_key is not None:
            updates["openai_api_key"] = update.openai_api_key.strip()
        if update.anthropic_api_key is not None:
            updates["anthropic_api_key"] = update.anthropic_api_key.strip()
        if update.waha_base_url is not None:
            updates["waha_base_url"] = update.waha_base_url.strip().rstrip("/")
        if update.waha_session_name is not None:
            updates["waha_session_name"] = update.waha_session_name.strip() or "default"
        if update.waha_api_key is not None:
            updates["waha_api_key"] = update.waha_api_key.strip()
        if update.sim_jitter_sleep_scale is not None:
            clamped_sim = max(0.0, min(1.0, float(update.sim_jitter_sleep_scale)))
            updates["sim_jitter_sleep_scale"] = str(round(clamped_sim, 3))
        if update.live_jitter_sleep_scale is not None:
            clamped_live = max(
                LIVE_JITTER_SLEEP_SCALE_FLOOR,
                min(2.0, float(update.live_jitter_sleep_scale)),
            )
            updates["live_jitter_sleep_scale"] = str(round(clamped_live, 3))
        if update.min_turn_gap_s is not None:
            clamped_gap = max(LIVE_MIN_TURN_GAP_FLOOR_S, min(30.0, float(update.min_turn_gap_s)))
            updates["min_turn_gap_s"] = str(round(clamped_gap, 2))

        with self._lock:
            for key, val in updates.items():
                self._conn.execute(
                    """
                    INSERT INTO analyzer_settings (key, value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                    """,
                    (key, val, now),
                )
            self._conn.commit()
        return self.get_settings()

    @staticmethod
    def _row_to_scan(row: sqlite3.Row) -> TargetScanSummary:
        return TargetScanSummary(
            id=str(row["id"]),
            target_name=str(row["target_name"]),
            target_phone=str(row["target_phone"]),
            target_description=str(row["target_description"] or ""),
            transport_mode=row["transport_mode"],
            waha_session=str(row["waha_session"] or "default"),
            status=row["status"],
            current_wave=int(row["current_wave"]),
            current_pass=int(row["current_pass"]),
            active_phase=str(row["active_phase"] or "IDLE"),
            error_code=row["error_code"],
            error_message=row["error_message"],
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
        )

    @staticmethod
    def _row_to_turn(row: sqlite3.Row) -> ProbeTurn:
        raw_jitter = row["jitter_phase_ms_json"] or "{}"
        try:
            jitter_map = json.loads(raw_jitter)
        except Exception:
            jitter_map = {}
        return ProbeTurn(
            id=str(row["id"]),
            scan_id=str(row["scan_id"]),
            wave_index=int(row["wave_index"]),
            pass_index=int(row["pass_index"]),
            turn_index=int(row["turn_index"]),
            probe_category=str(row["probe_category"]),
            prompt_text=str(row["prompt_text"]),
            response_text=str(row["response_text"]),
            delivery_status=row["delivery_status"],
            status_code=int(row["status_code"]),
            raw_rtt_ms=int(row["raw_rtt_ms"]),
            ws_ping_ms=int(row["ws_ping_ms"]),
            net_inference_ms=int(row["net_inference_ms"]),
            prompt_tokens_est=int(row["prompt_tokens_est"]),
            completion_tokens_est=int(row["completion_tokens_est"]),
            tokens_per_sec=float(row["tokens_per_sec"]),
            jitter_phase_ms=jitter_map,
            inferred_node_id=row["inferred_node_id"],
            created_at=str(row["created_at"]),
        )

    @staticmethod
    def _row_to_node(row: sqlite3.Row) -> TopologyNode:
        # Handle SQLite case-insensitive column naming ('interrupt_Before' vs 'interrupt_before')
        keys = row.keys()
        interrupt_col = "interrupt_before" if "interrupt_before" in keys else "interrupt_Before"
        return TopologyNode(
            scan_id=str(row["scan_id"]),
            node_id=str(row["node_id"]),
            label=str(row["label"]),
            node_type=row["node_type"],
            discovered_in_wave=int(row["discovered_in_wave"]),
            avg_latency_ms=int(row["avg_latency_ms"]),
            p95_latency_ms=int(row["p95_latency_ms"]),
            min_latency_ms=int(row["min_latency_ms"]),
            max_latency_ms=int(row["max_latency_ms"]),
            avg_tokens_per_sec=float(row["avg_tokens_per_sec"]),
            inferred_model_tier=str(row["inferred_model_tier"]),
            inferred_temperature=float(row["inferred_temperature"]),
            temperature_band=str(row["temperature_band"]),
            lexical_divergence=float(row["lexical_divergence"]),
            confidence=float(row["confidence"]),
            sample_count=int(row["sample_count"]),
            pass_count=int(row["pass_count"]),
            verification_status=row["verification_status"],
            super_step_group=row["super_step_group"],
            interrupt_before=bool(row[interrupt_col]),
            state_keys=json.loads(row["state_keys_json"] or "[]"),
            evidence=json.loads(row["evidence_json"] or "[]"),
        )

    @staticmethod
    def _row_to_edge(row: sqlite3.Row) -> TopologyEdge:
        return TopologyEdge(
            scan_id=str(row["scan_id"]),
            edge_id=str(row["edge_id"]),
            source_node_id=str(row["source_node_id"]),
            target_node_id=str(row["target_node_id"]),
            edge_type=row["edge_type"],
            condition_label=str(row["condition_label"] or ""),
            probability=float(row["probability"]),
            traversal_count=int(row["traversal_count"]),
            avg_transition_ms=int(row["avg_transition_ms"]),
            discovered_in_wave=int(row["discovered_in_wave"]),
            verification_status=row["verification_status"],
        )
