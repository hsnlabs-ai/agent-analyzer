"""Deterministic Post-W5 Exporters (Python LangGraph StateGraph, Mermaid, JSON, Markdown)."""

from __future__ import annotations

import json
import re
from typing import Any

from agent_analyzer import __org_url__, __product_url__, __version__
from agent_analyzer.inspector.models import (
    DiagnosticReport,
    ProbeTurn,
    TopologyReport,
)


def _sanitize_ident(raw_id: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9_]", "_", raw_id).strip("_").lower()
    if not cleaned or cleaned[0].isdigit():
        cleaned = f"node_{cleaned}"
    return cleaned


def export_langgraph_python(report: TopologyReport, diagnostics: DiagnosticReport) -> str:
    """Emit an executable Python LangGraph StateGraph skeleton from the discovered topology."""
    domain_nodes = [
        n
        for n in report.nodes
        if n.node_type not in ("START_NODE", "END_NODE", "UNKNOWN_BLACKBOX_NODE")
    ]
    interrupt_nodes = [n.node_id for n in domain_nodes if n.interrupt_before]

    lines: list[str] = [
        '"""Auto-generated LangGraph StateGraph skeleton reconstructed by Agent Analyzer.',
        "",
        f"Target Bot: {report.target_name} ({report.target_phone})",
        f"Transport Mode: {report.transport_mode} | Wave Coverage: W0..W{report.current_wave}",
        f"Product Page: {__product_url__}",
        '"""',
        "",
        "from typing import Annotated, Any, TypedDict",
        "",
        "from langgraph.checkpoint.memory import MemorySaver",
        "from langgraph.graph import END, START, StateGraph",
        "from langgraph.types import Send, interrupt",
        "",
        "",
        "def _merge_list(left: list[Any], right: list[Any]) -> list[Any]:",
        "    return (left or []) + (right or [])",
        "",
        "",
        "class DiscoveredAgentState(TypedDict, total=False):",
        '    """State schema inferred from black-box behavioral waves W0..W5."""',
        "",
        "    messages: Annotated[list[dict[str, Any]], _merge_list]",
        "    thread_id: str",
        "    guardrail_verdict: str",
        "    intent_route: str",
        "    order_id: str",
        "    rag_chunks: list[str]",
        "    carrier_eta: str",
        "    pix_e2e_id: str",
        "    parallel_results: Annotated[list[dict[str, Any]], _merge_list]",
        "    synthesized_answer: str",
        "",
        "",
    ]

    if not domain_nodes:
        lines.extend(
            [
                "def unknown_blackbox_node(state: DiscoveredAgentState) -> dict[str, Any]:",
                '    """Wave 0 placeholder node before behavioral probing."""',
                '    return {"synthesized_answer": "Unmapped black-box target."}',
                "",
                "",
            ]
        )
    else:
        for node in domain_nodes:
            fn_name = _sanitize_ident(node.node_id)
            lines.append(f"def {fn_name}(state: DiscoveredAgentState) -> dict[str, Any]:")
            lines.append(
                f'    """[{node.node_type}] {node.label} (discovered in W{node.discovered_in_wave}).'
            )
            lines.append(
                f"    Telemetry: avg_L_net={node.avg_latency_ms}ms | p95={node.p95_latency_ms}ms | "
                f"T_hat={node.inferred_temperature:.2f} ({node.temperature_band}) | "
                f"tier={node.inferred_model_tier} | status={node.verification_status}"
            )
            lines.append('    """')
            if node.interrupt_before or node.node_type == "HUMAN_HANDOFF_INTERRUPT":
                lines.append(
                    '    human_decision = interrupt({"reason": "human_escalation", "node": "'
                    + node.node_id
                    + '"})'
                )
                lines.append('    return {"synthesized_answer": str(human_decision)}')
            elif node.node_type == "STATIC_GUARDRAIL":
                lines.append('    return {"guardrail_verdict": "SAFE"}')
            elif node.node_type == "SEMANTIC_ROUTER":
                lines.append('    return {"intent_route": "order_lookup"}')
            elif node.node_type == "PARALLEL_TOOL_NODE":
                lines.append(
                    '    return {"parallel_results": [{"worker": "'
                    + node.node_id
                    + '", "latency_ms": '
                    + str(node.avg_latency_ms)
                    + "}]}"
                )
            else:
                lines.append(
                    '    return {"synthesized_answer": "Executed ' + node.node_id + '"}'
                )
            lines.append("")
            lines.append("")

    # Conditional routing and parallel Send() fan-out helpers
    lines.extend(
        [
            "def route_from_guardrail(state: DiscoveredAgentState) -> str:",
            '    """W1 conditional guardrail edge."""',
            '    if state.get("guardrail_verdict") == "BLOCKED":',
            "        return END",
            '    return "w2_semantic_router"',
            "",
            "",
            "def route_from_semantic_router(state: DiscoveredAgentState) -> str | list[Send]:",
            '    """W2 conditional OR routing & W4 parallel Send() fan-out."""',
            '    route = state.get("intent_route", "order_lookup")',
            '    if route == "parallel_compound":',
            "        return [",
            '            Send("w4_parallel_tool_a", state),',
            '            Send("w4_parallel_tool_b", state),',
            "        ]",
            '    if route == "pix_policy_rag":',
            '        return "w2_pix_rag_branch"',
            '    if route == "human_escalation":',
            '        return "w2_hitl_interrupt"',
            '    return "w2_order_sql_tool"',
            "",
            "",
            "def build_discovered_graph() -> Any:",
            '    """Construct and compile the reverse-engineered LangGraph StateGraph."""',
            "    builder = StateGraph(DiscoveredAgentState)",
        ]
    )

    if not domain_nodes:
        lines.append('    builder.add_node("unknown_blackbox_node", unknown_blackbox_node)')
        lines.append('    builder.add_edge(START, "unknown_blackbox_node")')
        lines.append('    builder.add_edge("unknown_blackbox_node", END)')
    else:
        node_ids = {n.node_id for n in domain_nodes}
        for node in domain_nodes:
            fn_name = _sanitize_ident(node.node_id)
            lines.append(f'    builder.add_node("{node.node_id}", {fn_name})')

        if "w1_static_guardrail" in node_ids and "w2_semantic_router" in node_ids:
            lines.append('    builder.add_edge(START, "w1_static_guardrail")')
            lines.append(
                '    builder.add_conditional_edges("w1_static_guardrail", route_from_guardrail)'
            )
        elif "w1_static_guardrail" in node_ids:
            lines.append('    builder.add_edge(START, "w1_static_guardrail")')
            lines.append('    builder.add_edge("w1_static_guardrail", END)')
        elif "w2_semantic_router" in node_ids:
            lines.append('    builder.add_edge(START, "w2_semantic_router")')

        if "w2_semantic_router" in node_ids:
            lines.append(
                '    builder.add_conditional_edges("w2_semantic_router", route_from_semantic_router)'
            )

        if "w4_parallel_tool_a" in node_ids and "w4_join_barrier" in node_ids:
            lines.append('    builder.add_edge("w4_parallel_tool_a", "w4_join_barrier")')
        if "w4_parallel_tool_b" in node_ids and "w4_join_barrier" in node_ids:
            lines.append('    builder.add_edge("w4_parallel_tool_b", "w4_join_barrier")')

        synth_target = (
            "w3_core_llm_synthesizer"
            if "w3_core_llm_synthesizer" in node_ids
            else ("w5_stateful_checkpointer" if "w5_stateful_checkpointer" in node_ids else None)
        )
        for branch_id in ("w2_order_sql_tool", "w2_pix_rag_branch", "w4_join_barrier"):
            if branch_id in node_ids:
                if synth_target:
                    lines.append(f'    builder.add_edge("{branch_id}", "{synth_target}")')
                else:
                    lines.append(f'    builder.add_edge("{branch_id}", END)')

        if "w2_hitl_interrupt" in node_ids:
            lines.append('    builder.add_edge("w2_hitl_interrupt", END)')

        if "w3_core_llm_synthesizer" in node_ids:
            if "w5_stateful_checkpointer" in node_ids:
                lines.append(
                    '    builder.add_edge("w3_core_llm_synthesizer", "w5_stateful_checkpointer")'
                )
            else:
                lines.append('    builder.add_edge("w3_core_llm_synthesizer", END)')

        if "w5_stateful_checkpointer" in node_ids:
            lines.append('    builder.add_edge("w5_stateful_checkpointer", END)')

    lines.append("    checkpointer = MemorySaver()")
    lines.append(
        f"    return builder.compile(checkpointer=checkpointer, interrupt_before={repr(interrupt_nodes)})"
    )
    lines.append("")
    lines.append("")
    lines.append('if __name__ == "__main__":')
    lines.append("    graph = build_discovered_graph()")
    lines.append(
        f'    print("Compiled reconstructed StateGraph for {report.target_name}:", type(graph).__name__)'
    )
    lines.append("")
    return "\n".join(lines)


def export_mermaid(report: TopologyReport) -> str:
    """Emit a Mermaid flowchart TD diagram with W4 parallel subgraph and node telemetry."""
    lines: list[str] = [
        "flowchart TD",
        "    %% Reconstructed by Agent Analyzer (https://hsnlabs.ai/en/products/agent-analyzer/)",
    ]
    parallel_nodes = [n for n in report.nodes if n.super_step_group]
    regular_nodes = [n for n in report.nodes if not n.super_step_group]

    def _format_node(n: Any) -> str:
        safe_label = n.label.replace('"', "'")
        if n.node_type in ("START_NODE", "END_NODE"):
            return f'    {n.node_id}(["{safe_label}"])'
        if n.node_type == "SEMANTIC_ROUTER":
            return f'    {n.node_id}{{"{safe_label}<br/>L_net={n.avg_latency_ms}ms | {n.verification_status}"}}'
        return (
            f'    {n.node_id}["{safe_label}<br/>'
            f'L_net={n.avg_latency_ms}ms | T_hat={n.inferred_temperature:.2f} | {n.verification_status}"]'
        )

    for node in regular_nodes:
        lines.append(_format_node(node))

    if parallel_nodes:
        lines.append('    subgraph parallel_super_step_w4 ["W4 Parallel Send() Super-Step"]')
        for node in parallel_nodes:
            lines.append("    " + _format_node(node))
        lines.append("    end")

    for edge in report.edges:
        lbl = edge.condition_label.replace('"', "'")
        if edge.edge_type == "PARALLEL_AND":
            lines.append(f'    {edge.source_node_id} ==>|"{lbl}"| {edge.target_node_id}')
        elif edge.edge_type in ("CONDITIONAL_OR", "INTERRUPT_GATE", "LOOP_BACK"):
            lines.append(f'    {edge.source_node_id} -.->|"{lbl}"| {edge.target_node_id}')
        else:
            lines.append(f'    {edge.source_node_id} -->|"{lbl}"| {edge.target_node_id}')

    return "\n".join(lines) + "\n"


def export_topology_json(
    report: TopologyReport,
    diagnostics: DiagnosticReport,
    turns: list[ProbeTurn] | None = None,
) -> str:
    """Emit the complete machine-readable Topology JSON artifact."""
    payload = {
        "schema_version": __version__,
        "generator": "agent-analyzer",
        "product_url": __product_url__,
        "organization_url": __org_url__,
        "scan_metadata": {
            "scan_id": report.scan_id,
            "target_name": report.target_name,
            "target_phone": report.target_phone,
            "transport_mode": report.transport_mode,
            "current_wave": report.current_wave,
            "max_wave_filter": report.max_wave_filter,
            "state_persistence_type": report.state_persistence_type,
            "checkpointer_verified": report.checkpointer_verified,
            "replay_verified_nodes_count": report.replay_verified_nodes_count,
            "total_discovered_nodes_count": report.total_discovered_nodes_count,
        },
        "topology": {
            "nodes": [n.model_dump() for n in report.nodes],
            "edges": [e.model_dump() for e in report.edges],
        },
        "subadditivity_proof": report.subadditivity_proof.model_dump(),
        "diagnostics": diagnostics.model_dump(),
        "probe_turns": [t.model_dump() for t in (turns or [])],
    }
    return json.dumps(payload, indent=2, ensure_ascii=False)


def export_markdown_report(report: TopologyReport, diagnostics: DiagnosticReport) -> str:
    """Emit a Markdown engineering diagnostic, subadditivity, and token-drain cost report."""
    sp = report.subadditivity_proof
    lines: list[str] = [
        f"# Agent Analyzer — Architectural & Latency Diagnostic Report",
        "",
        f"- **Target Bot:** `{report.target_name}` (`{report.target_phone}`)",
        f"- **Scan ID:** `{report.scan_id}`",
        f"- **Transport Mode:** `{report.transport_mode}`",
        f"- **Wave Coverage:** `W0..W{report.current_wave}`",
        f"- **Replay Verification:** `{report.replay_verified_nodes_count}/{report.total_discovered_nodes_count}` domain nodes `REPLAY_VERIFIED (2/2)`",
        f"- **State Persistence Verdict:** `{report.state_persistence_type}`",
        f"- **Generated By:** [Agent Analyzer]({__product_url__}) by [hsnlabs]({__org_url__})",
        "",
        "---",
        "",
        "## 1. Executive Latency & Token-Drain Telemetry",
        "",
        "| Metric | Value |",
        "| :--- | :--- |",
        f"| Average Net Inference Latency (`L_net`) | `{diagnostics.avg_net_latency_ms} ms` |",
        f"| p95 Net Inference Latency (`p95 L_net`) | `{diagnostics.p95_net_latency_ms} ms` |",
        f"| Max Net Inference Latency (`max L_net`) | `{diagnostics.max_net_latency_ms} ms` |",
        f"| Total Prompt Tokens Sampled | `{diagnostics.total_prompt_tokens}` |",
        f"| Total Completion Tokens Sampled | `{diagnostics.total_completion_tokens}` |",
        f"| Estimated Cost per 1,000 Customer Sessions | `${diagnostics.estimated_cost_per_1k_sessions_usd:.2f} USD` |",
        "",
        "## 2. Discovered LangGraph Nodes (`W0..W5`)",
        "",
        "| Wave | Node ID | Type | Avg `L_net` | p95 `L_net` | Velocity | `T_hat` | Verification |",
        "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |",
    ]

    for n in report.nodes:
        lines.append(
            f"| `W{n.discovered_in_wave}` | `{n.node_id}` | `{n.node_type}` | "
            f"`{n.avg_latency_ms} ms` | `{n.p95_latency_ms} ms` | "
            f"`{n.avg_tokens_per_sec:.1f} tok/s` | `{n.inferred_temperature:.2f}` | "
            f"`{n.verification_status} ({n.pass_count}/2)` |"
        )

    lines.extend(
        [
            "",
            "## 3. Wave 4 Subadditive Parallelism Proof (`Send()` Super-Step)",
            "",
            f"- **Isolated Tool A Latency ($L_A$):** `{sp.isolated_a_ms} ms`",
            f"- **Isolated Tool B Latency ($L_B$):** `{sp.isolated_b_ms} ms`",
            f"- **Compound Tool A+B Latency ($L_{{AB}}$):** `{sp.compound_ab_ms} ms`",
            f"- **Sequential Additive Baseline ($L_A + L_B$):** `{sp.additive_sum_ms} ms`",
            f"- **Subadditivity Ratio ($L_{{AB}} / (L_A + L_B)$):** `{sp.subadditivity_ratio:.3f}`",
            f"- **Verdict:** {sp.equation_summary}",
            "",
            "## 4. Guardrail & State Persistence Diagnostics",
            "",
            f"- **Wave 1 Guardrail Verdict:** {diagnostics.guardrail_verdict}",
            f"- **Wave 5 Checkpointer Verdict:** {diagnostics.checkpointer_verdict}",
            "",
            "## 5. Bottlenecks & Optimization Recommendations",
            "",
        ]
    )

    if not diagnostics.bottlenecks:
        lines.append("_No bottlenecks recorded yet. Run Waves W1..W5 to populate diagnostics._")
    else:
        for bn in diagnostics.bottlenecks:
            lines.extend(
                [
                    f"### [{bn.severity}] `{bn.id}` — {bn.title} (`{bn.node_id}`)",
                    f"- **Category:** `{bn.category}` | **p95 Latency:** `{bn.latency_ms} ms` | **Token Drain Est:** `{bn.token_drain_est} tokens`",
                    f"- **Finding:** {bn.description}",
                    f"- **Recommendation:** {bn.recommendation}",
                    "",
                ]
            )

    return "\n".join(lines)
