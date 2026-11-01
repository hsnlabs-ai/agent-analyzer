export type TransportMode = "SIMULATION" | "LIVE_WHATSAPP";
export type ScanStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED";
export type DeliveryStatus = "DELIVERED" | "TIMEOUT" | "TRANSPORT_ERROR";
export type NodeType =
  | "START_NODE"
  | "STATIC_GUARDRAIL"
  | "SEMANTIC_ROUTER"
  | "CORE_LLM_RAG"
  | "TOOL_NODE"
  | "PARALLEL_TOOL_NODE"
  | "JOIN_BARRIER"
  | "HUMAN_HANDOFF_INTERRUPT"
  | "STATEFUL_CHECKPOINTER"
  | "UNKNOWN_BLACKBOX_NODE"
  | "END_NODE";

export type EdgeType =
  | "SEQUENTIAL"
  | "CONDITIONAL_OR"
  | "PARALLEL_AND"
  | "INTERRUPT_GATE"
  | "LOOP_BACK";

export type VerificationStatus =
  | "UNVERIFIED_HYPOTHESIS"
  | "SINGLE_PASS_HYPOTHESIS"
  | "REPLAY_VERIFIED";

export type ExportFormat = "python" | "mermaid" | "json" | "markdown";

export interface TargetScanSummary {
  id: string;
  target_name: string;
  target_phone: string;
  target_description: string;
  transport_mode: TransportMode;
  waha_session: string;
  status: ScanStatus;
  current_wave: number;
  current_pass: number;
  active_phase: string;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProbeTurn {
  id: string;
  scan_id: string;
  wave_index: number;
  pass_index: number;
  turn_index: number;
  probe_category: string;
  prompt_text: string;
  response_text: string;
  delivery_status: DeliveryStatus;
  status_code: number;
  raw_rtt_ms: number;
  ws_ping_ms: number;
  net_inference_ms: number;
  prompt_tokens_est: number;
  completion_tokens_est: number;
  tokens_per_sec: number;
  jitter_phase_ms: Record<string, number>;
  inferred_node_id: string | null;
  created_at: string;
}

export interface TopologyNode {
  scan_id: string;
  node_id: string;
  label: string;
  node_type: NodeType;
  discovered_in_wave: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  min_latency_ms: number;
  max_latency_ms: number;
  avg_tokens_per_sec: number;
  inferred_model_tier: string;
  inferred_temperature: number;
  temperature_band: string;
  lexical_divergence: number;
  confidence: number;
  sample_count: number;
  pass_count: number;
  verification_status: VerificationStatus;
  super_step_group: string | null;
  interrupt_before: boolean;
  state_keys: string[];
  evidence: string[];
}

export interface TopologyEdge {
  scan_id: string;
  edge_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: EdgeType;
  condition_label: string;
  probability: number;
  traversal_count: number;
  avg_transition_ms: number;
  discovered_in_wave: number;
  verification_status: VerificationStatus;
}

export interface SubadditiveParallelProof {
  isolated_a_ms: number;
  isolated_b_ms: number;
  compound_ab_ms: number;
  additive_sum_ms: number;
  parallel_max_ms: number;
  subadditivity_ratio: number;
  parallel_confirmed: boolean;
  super_step_group: string;
  equation_summary: string;
}

export interface TopologyReport {
  scan_id: string;
  target_name: string;
  target_phone: string;
  transport_mode: TransportMode;
  current_wave: number;
  max_wave_filter: number | null;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  subadditivity_proof: SubadditiveParallelProof;
  checkpointer_verified: boolean;
  state_persistence_type: string;
  replay_verified_nodes_count: number;
  total_discovered_nodes_count: number;
}

export interface DiagnosticBottleneck {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: "LATENCY" | "TOKEN_DRAIN" | "GUARDRAIL" | "CONCURRENCY" | "STATE_MEMORY";
  node_id: string;
  title: string;
  description: string;
  latency_ms: number;
  token_drain_est: number;
  recommendation: string;
}

export interface DiagnosticReport {
  scan_id: string;
  bottlenecks: DiagnosticBottleneck[];
  avg_net_latency_ms: number;
  p95_net_latency_ms: number;
  max_net_latency_ms: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  estimated_cost_per_1k_sessions_usd: number;
  checkpointer_verdict: string;
  guardrail_verdict: string;
}

export interface WAHASessionStatus {
  session_name: string;
  base_url: string;
  reachable: boolean;
  status: string;
  ws_ping_ms: number;
  connected_phone: string | null;
  qr_available: boolean;
  message: string;
}

export interface AnalyzerSettingsResponse {
  llm_provider: string;
  llm_model: string;
  has_gemini_key: boolean;
  gemini_key_hint: string;
  has_openai_key: boolean;
  openai_key_hint: string;
  has_anthropic_key: boolean;
  anthropic_key_hint: string;
  waha_base_url: string;
  waha_session_name: string;
  has_waha_api_key: boolean;
  waha_api_key_hint: string;
  sim_jitter_sleep_scale: number;
  live_jitter_sleep_scale: number;
  min_turn_gap_s: number;
}

export interface AnalyzerSnapshotResponse {
  scans: TargetScanSummary[];
  active_scan: TargetScanSummary;
  topology: TopologyReport;
  diagnostics: DiagnosticReport;
  turns: ProbeTurn[];
  waha: WAHASessionStatus;
  settings: AnalyzerSettingsResponse;
  meta: Record<string, string>;
}

export interface ExportPayloadResponse {
  scan_id: string;
  format: ExportFormat;
  filename: string;
  mime_type: string;
  content: string;
}
