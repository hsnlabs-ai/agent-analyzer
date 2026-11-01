"""Unit tests for the 4 post-W5 export generators:
1. Executable Python LangGraph StateGraph skeleton (ast.parse + StateGraph().compile() verified)
2. Mermaid flowchart TD diagram
3. Full Topology JSON bundle
4. Markdown diagnostic report"""

from __future__ import annotations

import ast
import json
from pathlib import Path

from agent_analyzer.bridge.whatsapp_client import WAHAWhatsAppClient
from agent_analyzer.inspector.analyzer import TopologyAnalyzer
from agent_analyzer.inspector.exporters import (
    export_langgraph_python,
    export_markdown_report,
    export_mermaid,
    export_topology_json,
)
from agent_analyzer.runner.wave_runner import WaveProtocolRunner
from agent_analyzer.store.sqlite_store import DEFAULT_SCAN_ID, AnalyzerSQLiteStore


async def test_all_four_exporters_and_langgraph_compile(tmp_path: Path) -> None:
    db_path = tmp_path / "analyzer.sqlite3"
    store = AnalyzerSQLiteStore(db_path=db_path)
    analyzer = TopologyAnalyzer(store)
    waha = WAHAWhatsAppClient()
    runner = WaveProtocolRunner(store=store, analyzer=analyzer, waha_client=waha)
    scan_id = DEFAULT_SCAN_ID

    report = await runner.run_scan(
        scan_id=scan_id,
        target_wave="ALL",
        reset_first=True,
        fast_sim_override=True,
    )
    diagnostics = analyzer.build_diagnostic_report(scan_id)
    turns = store.list_probe_turns(scan_id)

    # 1. Python LangGraph StateGraph exporter: must pass ast.parse AND compile into a runnable graph
    py_code = export_langgraph_python(report, diagnostics)
    tree = ast.parse(py_code)
    assert tree is not None
    assert "StateGraph" in py_code
    assert "MemorySaver" in py_code
    assert "Send(" in py_code

    namespace: dict[str, object] = {}
    exec(compile(py_code, "<langgraph_skeleton>", "exec", dont_inherit=True), namespace)
    assert "build_discovered_graph" in namespace
    build_fn = namespace["build_discovered_graph"]
    assert callable(build_fn)
    compiled_graph = build_fn()
    assert hasattr(compiled_graph, "invoke")

    # 2. Mermaid exporter
    mmd = export_mermaid(report)
    assert mmd.startswith("flowchart TD")
    assert "subgraph parallel_super_step_w4" in mmd
    assert "w1_static_guardrail" in mmd

    # 3. Topology JSON exporter
    raw_json = export_topology_json(report, diagnostics, turns)
    parsed_json = json.loads(raw_json)
    assert parsed_json["generator"] == "agent-analyzer"
    assert parsed_json["scan_metadata"]["scan_id"] == scan_id
    assert len(parsed_json["topology"]["nodes"]) == len(report.nodes)
    assert len(parsed_json["probe_turns"]) == len(turns)

    # 4. Markdown diagnostic report exporter
    md = export_markdown_report(report, diagnostics)
    assert "# Agent Analyzer — Architectural & Latency Diagnostic Report" in md
    assert "## 2. Discovered LangGraph Nodes" in md
    assert "## 3. Wave 4 Subadditive Parallelism Proof" in md
    assert "hsnlabs.ai/en/products/agent-analyzer/" in md

    await waha.aclose()
    store.close()
