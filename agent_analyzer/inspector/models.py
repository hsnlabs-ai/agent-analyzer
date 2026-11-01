"""Canonical Pydantic models for Agent Analyzer SQLite persistence, REST/WS API, and Exporters."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

TransportMode = Literal["SIMULATION", "LIVE_WHATSAPP"]
ScanStatus = Literal["IDLE", "RUNNING", "PAUSED", "COMPLETED", "FAILED"]
DeliveryStatus = Literal["DELIVERED", "TIMEOUT", "TRANSPORT_ERROR"]
NodeType = Literal[
    "START_NODE",
    "STATIC_GUARDRAIL",
    "SEMANTIC_ROUTER",
    "CORE_LLM_RAG",
    "TOOL_NODE",
    "PARALLEL_TOOL_NODE",
    "JOIN_BARRIER",
    "HUMAN_HANDOFF_INTERRUPT",
    "STATEFUL_CHECKPOINTER",
    "UNKNOWN_BLACKBOX_NODE",
    "END_NODE",
]
EdgeType = Literal[
    "SEQUENTIAL",
    "CONDITIONAL_OR",
    "PARALLEL_AND",
    "INTERRUPT_GATE",
    "LOOP_BACK",
]
VerificationStatus = Literal[
    "UNVERIFIED_HYPOTHESIS",
    "SINGLE_PASS_HYPOTHESIS",
    "REPLAY_VERIFIED",
]
ExportFormat = Literal["python", "mermaid", "json", "markdown"]


class TargetScanSummary(BaseModel):
    """Metadata and live progress of a target bot scan."""

    id: str
    target_name: str
    target_phone: str
    target_description: str = ""
    transport_mode: TransportMode = "SIMULATION"
    waha_session: str = "default"
    status: ScanStatus = "IDLE"
    current_wave: int = 0
    current_pass: int = 1
    active_phase: str = "IDLE"
    error_code: str | None = None
    error_message: str | None = None
    created_at: str
    updated_at: str


class ProbeTurn(BaseModel):
    """Single recorded probe turn across W0..W5 and Pass 1 / Pass 2."""

    id: str
    scan_id: str
    wave_index: int
    pass_index: int = 1
    turn_index: int
    probe_category: str
    prompt_text: str
    response_text: str
    delivery_status: DeliveryStatus = "DELIVERED"
    status_code: int = 200
    raw_rtt_ms: int
    ws_ping_ms: int
    net_inference_ms: int
    prompt_tokens_est: int = 0
    completion_tokens_est: int = 0
    tokens_per_sec: float = 0.0
    jitter_phase_ms: dict[str, int] = Field(default_factory=dict)
    inferred_node_id: str | None = None
    created_at: str


class TopologyNode(BaseModel):
    """Canonical discovered LangGraph node with full latency and behavioral telemetry."""

    scan_id: str
    node_id: str
    label: str
    node_type: NodeType
    discovered_in_wave: int = 0
    avg_latency_ms: int = 0
    p95_latency_ms: int = 0
    min_latency_ms: int = 0
    max_latency_ms: int = 0
    avg_tokens_per_sec: float = 0.0
    inferred_model_tier: str = "UNKNOWN"
    inferred_temperature: float = 0.0
    temperature_band: str = "UNKNOWN"
    lexical_divergence: float = 0.0
    confidence: float = 0.0
    sample_count: int = 0
    pass_count: int = 1
    verification_status: VerificationStatus = "UNVERIFIED_HYPOTHESIS"
    super_step_group: str | None = None
    interrupt_before: bool = False
    state_keys: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)


class TopologyEdge(BaseModel):
    """Canonical directed transition edge in the reconstructed LangGraph StateGraph."""

    scan_id: str
    edge_id: str
    source_node_id: str
    target_node_id: str
    edge_type: EdgeType = "SEQUENTIAL"
    condition_label: str = ""
    probability: float = 1.0
    traversal_count: int = 1
    avg_transition_ms: int = 0
    discovered_in_wave: int = 0
    verification_status: VerificationStatus = "SINGLE_PASS_HYPOTHESIS"


class SubadditiveParallelProof(BaseModel):
    """Wave 4 subadditive latency proof verifying parallel Send() fan-out vs. sequential tools."""

    isolated_a_ms: int = 0
    isolated_b_ms: int = 0
    compound_ab_ms: int = 0
    additive_sum_ms: int = 0
    parallel_max_ms: int = 0
    subadditivity_ratio: float = 1.0
    parallel_confirmed: bool = False
    super_step_group: str = "parallel_super_step_w4"
    equation_summary: str = "Awaiting Wave 4 compound probe triad."


class TopologyReport(BaseModel):
    """Complete reconstructed topology for a target scan at an optional max_wave filter."""

    scan_id: str
    target_name: str
    target_phone: str
    transport_mode: TransportMode
    current_wave: int
    max_wave_filter: int | None = None
    nodes: list[TopologyNode] = Field(default_factory=list)
    edges: list[TopologyEdge] = Field(default_factory=list)
    subadditivity_proof: SubadditiveParallelProof = Field(
        default_factory=SubadditiveParallelProof
    )
    checkpointer_verified: bool = False
    state_persistence_type: str = "UNPROBED"
    replay_verified_nodes_count: int = 0
    total_discovered_nodes_count: int = 0


class DiagnosticBottleneck(BaseModel):
    """Architectural bottleneck, latency anomaly, or token-drain finding."""

    id: str
    severity: Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
    category: Literal["LATENCY", "TOKEN_DRAIN", "GUARDRAIL", "CONCURRENCY", "STATE_MEMORY"]
    node_id: str
    title: str
    description: str
    latency_ms: int = 0
    token_drain_est: int = 0
    recommendation: str


class DiagnosticReport(BaseModel):
    """Aggregated latency, token-drain economics, and bottleneck report for a scan."""

    scan_id: str
    bottlenecks: list[DiagnosticBottleneck] = Field(default_factory=list)
    avg_net_latency_ms: int = 0
    p95_net_latency_ms: int = 0
    max_net_latency_ms: int = 0
    total_prompt_tokens: int = 0
    total_completion_tokens: int = 0
    estimated_cost_per_1k_sessions_usd: float = 0.0
    checkpointer_verdict: str = "Awaiting Wave 5 Canary Recall Probe."
    guardrail_verdict: str = "Awaiting Wave 1 Boundary & Injection Probe."


class WAHASessionStatus(BaseModel):
    """Live status of the single WAHA WhatsApp Web session on :3001."""

    session_name: str = "default"
    base_url: str = "http://localhost:3001"
    reachable: bool = False
    status: str = "OFFLINE"
    ws_ping_ms: int = 0
    connected_phone: str | None = None
    qr_available: bool = False
    message: str = "WAHA bridge not probed yet."


class AnalyzerSettingsResponse(BaseModel):
    """Sanitized runtime settings returned by GET /api/settings (masks raw API keys)."""

    llm_provider: str = "gemini"
    llm_model: str = "gemini-2.5-flash"
    has_gemini_key: bool = False
    gemini_key_hint: str = ""
    has_openai_key: bool = False
    openai_key_hint: str = ""
    has_anthropic_key: bool = False
    anthropic_key_hint: str = ""
    waha_base_url: str = "http://localhost:3001"
    waha_session_name: str = "default"
    has_waha_api_key: bool = False
    waha_api_key_hint: str = ""
    sim_jitter_sleep_scale: float = 0.08
    live_jitter_sleep_scale: float = 0.35
    min_turn_gap_s: float = 2.0


class AnalyzerSettingsUpdate(BaseModel):
    """Partial update payload for PUT /api/settings."""

    llm_provider: str | None = None
    llm_model: str | None = None
    gemini_api_key: str | None = None
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    waha_base_url: str | None = None
    waha_session_name: str | None = None
    waha_api_key: str | None = None
    sim_jitter_sleep_scale: float | None = None
    live_jitter_sleep_scale: float | None = None
    min_turn_gap_s: float | None = None


class CreateScanRequest(BaseModel):
    """Payload for POST /api/scans."""

    target_name: str = Field(..., min_length=1, max_length=120)
    target_phone: str = Field(..., min_length=8, max_length=24)
    target_description: str = Field(
        default="Retail e-commerce & Pix customer support WhatsApp assistant"
    )
    transport_mode: TransportMode = "SIMULATION"
    waha_session: str = "default"


class RunScanRequest(BaseModel):
    """Payload for POST /api/scans/{scan_id}/run."""

    target_wave: int | Literal["ALL"] = "ALL"
    reset_first: bool = False
    wait: bool = False
    fast_sim_override: bool = False


class ExportPayloadResponse(BaseModel):
    """Payload returned by GET /api/scans/{scan_id}/export/{format}."""

    scan_id: str
    format: ExportFormat
    filename: str
    mime_type: str
    content: str


class AnalyzerSnapshotResponse(BaseModel):
    """Bootstrap state returned by GET /api/state and broadcast on /ws/analyzer."""

    scans: list[TargetScanSummary]
    active_scan: TargetScanSummary
    topology: TopologyReport
    diagnostics: DiagnosticReport
    turns: list[ProbeTurn]
    waha: WAHASessionStatus
    settings: AnalyzerSettingsResponse
    meta: dict[str, Any] = Field(default_factory=dict)
