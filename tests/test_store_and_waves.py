"""Unit tests for the 5-table SQLite WAL store, W0..W5 progressive topology reconstruction,
and Two-Pass Replay Verification (including timeout outlier isolation)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from agent_analyzer.bridge.whatsapp_client import WAHAWhatsAppClient
from agent_analyzer.inspector.analyzer import TopologyAnalyzer
from agent_analyzer.inspector.models import ProbeTurn
from agent_analyzer.runner.wave_runner import WaveProtocolRunner
from agent_analyzer.store.sqlite_store import DEFAULT_SCAN_ID, AnalyzerSQLiteStore


def test_five_table_schema_and_default_w0_scan(tmp_path: Path) -> None:
    db_path = tmp_path / "analyzer.sqlite3"
    store = AnalyzerSQLiteStore(db_path=db_path)

    conn = sqlite3.connect(str(db_path))
    tables = {
        row[0]
        for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    }
    conn.close()

    assert tables == {
        "target_scans",
        "probe_turns",
        "topology_nodes",
        "topology_edges",
        "analyzer_settings",
    }

    scans = store.list_scans()
    assert len(scans) == 1
    default_scan = scans[0]
    assert default_scan.id == DEFAULT_SCAN_ID
    assert default_scan.current_wave == 0
    assert default_scan.transport_mode == "SIMULATION"
    assert default_scan.status == "IDLE"

    analyzer = TopologyAnalyzer(store)
    w0_report = analyzer.build_topology_report(default_scan.id)
    node_types = {n.node_type for n in w0_report.nodes}
    assert node_types == {"START_NODE", "UNKNOWN_BLACKBOX_NODE", "END_NODE"}
    assert len(w0_report.edges) == 2
    store.close()


async def test_progressive_waves_w1_to_w5_and_time_travel(tmp_path: Path) -> None:
    db_path = tmp_path / "analyzer.sqlite3"
    store = AnalyzerSQLiteStore(db_path=db_path)
    analyzer = TopologyAnalyzer(store)
    waha = WAHAWhatsAppClient()
    runner = WaveProtocolRunner(store=store, analyzer=analyzer, waha_client=waha)
    scan_id = DEFAULT_SCAN_ID

    # Execute Waves W1..W5 sequentially with fast_sim_override
    for wave_idx in range(1, 6):
        report = await runner.run_scan(
            scan_id=scan_id,
            target_wave=wave_idx,
            fast_sim_override=True,
        )
        scan = store.get_scan(scan_id)
        assert scan is not None
        assert scan.current_wave == wave_idx
        assert len(report.nodes) >= 3

    final_scan = store.get_scan(scan_id)
    assert final_scan is not None
    assert final_scan.status == "COMPLETED"
    assert final_scan.current_wave == 5

    w5_report = analyzer.build_topology_report(scan_id)
    node_ids = {n.node_id for n in w5_report.nodes}
    assert "w1_static_guardrail" in node_ids
    assert "w2_semantic_router" in node_ids
    assert "w2_order_sql_tool" in node_ids
    assert "w2_pix_rag_branch" in node_ids
    assert "w2_hitl_interrupt" in node_ids
    assert "w3_core_llm_synthesizer" in node_ids
    assert "w4_parallel_tool_a" in node_ids
    assert "w4_parallel_tool_b" in node_ids
    assert "w4_join_barrier" in node_ids
    assert "w5_stateful_checkpointer" in node_ids

    # Verify Two-Pass Replay Verification promoted discovered nodes to REPLAY_VERIFIED
    non_sentinel = [
        n
        for n in w5_report.nodes
        if n.node_type not in ("START_NODE", "END_NODE", "UNKNOWN_BLACKBOX_NODE")
    ]
    assert all(n.verification_status == "REPLAY_VERIFIED" for n in non_sentinel)

    # Verify W4 subadditive parallel proof
    assert w5_report.subadditivity_proof.parallel_confirmed is True
    assert (
        w5_report.subadditivity_proof.compound_ab_ms
        < w5_report.subadditivity_proof.additive_sum_ms
    )

    # Verify W5 stateful MemorySaver checkpointer detection
    assert w5_report.checkpointer_verified is True

    # Non-destructive Time-Travel Scrubber: max_wave=0, 1, 2, 3, 4, 5
    w0_scrub = analyzer.build_topology_report(scan_id, max_wave=0)
    assert {n.node_type for n in w0_scrub.nodes} == {
        "START_NODE",
        "UNKNOWN_BLACKBOX_NODE",
        "END_NODE",
    }

    w1_scrub = analyzer.build_topology_report(scan_id, max_wave=1)
    assert all(n.discovered_in_wave <= 1 for n in w1_scrub.nodes)
    assert any(n.node_type == "STATIC_GUARDRAIL" for n in w1_scrub.nodes)
    assert not any(n.discovered_in_wave > 1 for n in w1_scrub.nodes)

    w2_scrub = analyzer.build_topology_report(scan_id, max_wave=2)
    assert all(n.discovered_in_wave <= 2 for n in w2_scrub.nodes)
    assert any(n.node_type == "SEMANTIC_ROUTER" for n in w2_scrub.nodes)

    # Confirm underlying W5 state was NOT mutated by time-travel queries
    w5_after = analyzer.build_topology_report(scan_id)
    assert len(w5_after.nodes) == len(w5_report.nodes)
    await waha.aclose()
    store.close()


async def test_timeout_outlier_never_creates_spurious_node(tmp_path: Path) -> None:
    db_path = tmp_path / "analyzer.sqlite3"
    store = AnalyzerSQLiteStore(db_path=db_path)
    analyzer = TopologyAnalyzer(store)
    waha = WAHAWhatsAppClient()
    runner = WaveProtocolRunner(store=store, analyzer=analyzer, waha_client=waha)
    scan_id = DEFAULT_SCAN_ID

    await runner.run_scan(scan_id=scan_id, target_wave=1, fast_sim_override=True)
    baseline_nodes = analyzer.build_topology_report(scan_id).nodes

    # Inject a 26,000ms TIMEOUT turn and reconstruct topology
    store.insert_probe_turn(
        ProbeTurn(
            id="turn-timeout-outlier",
            scan_id=scan_id,
            wave_index=2,
            pass_index=1,
            turn_index=99,
            probe_category="W2_ORDER_SQL_BRANCH",
            prompt_text="Consulte o pedido #BR-9042",
            response_text="[TARGET_REPLY_TIMEOUT_26S]",
            delivery_status="TIMEOUT",
            status_code=408,
            raw_rtt_ms=26000,
            ws_ping_ms=45,
            net_inference_ms=25955,
            prompt_tokens_est=12,
            completion_tokens_est=0,
            tokens_per_sec=0.0,
            jitter_phase_ms={"TOTAL_JITTER_MS": 2000},
            inferred_node_id=None,
            created_at="2026-11-01T12:00:00Z",
        )
    )
    after_report = analyzer.reconstruct_and_persist_topology(scan_id)
    assert len(after_report.nodes) == len(baseline_nodes)
    assert not any(n.avg_latency_ms >= 20000 for n in after_report.nodes)
    await waha.aclose()
    store.close()
