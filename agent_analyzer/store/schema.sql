-- Agent Analyzer 5-Table SQLite WAL Schema
-- Persists all 22 topology_nodes columns and 11 topology_edges columns
-- without any foreign-key dependencies on swarm scouts or missions.

CREATE TABLE IF NOT EXISTS target_scans (
    id TEXT PRIMARY KEY,
    target_name TEXT NOT NULL,
    target_phone TEXT NOT NULL,
    target_description TEXT NOT NULL DEFAULT '',
    transport_mode TEXT NOT NULL CHECK (transport_mode IN ('SIMULATION', 'LIVE_WHATSAPP')),
    waha_session TEXT NOT NULL DEFAULT 'default',
    status TEXT NOT NULL CHECK (status IN ('IDLE', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED')),
    current_wave INTEGER NOT NULL DEFAULT 0 CHECK (current_wave BETWEEN 0 AND 5),
    current_pass INTEGER NOT NULL DEFAULT 1 CHECK (current_pass BETWEEN 1 AND 2),
    active_phase TEXT NOT NULL DEFAULT 'IDLE',
    error_code TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS probe_turns (
    id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL REFERENCES target_scans(id) ON DELETE CASCADE,
    wave_index INTEGER NOT NULL CHECK (wave_index BETWEEN 0 AND 5),
    pass_index INTEGER NOT NULL CHECK (pass_index BETWEEN 1 AND 2),
    turn_index INTEGER NOT NULL,
    probe_category TEXT NOT NULL,
    prompt_text TEXT NOT NULL,
    response_text TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'DELIVERED' CHECK (
        delivery_status IN ('DELIVERED', 'TIMEOUT', 'TRANSPORT_ERROR')
    ),
    status_code INTEGER NOT NULL DEFAULT 200,
    raw_rtt_ms INTEGER NOT NULL,
    ws_ping_ms INTEGER NOT NULL,
    net_inference_ms INTEGER NOT NULL,
    prompt_tokens_est INTEGER NOT NULL DEFAULT 0,
    completion_tokens_est INTEGER NOT NULL DEFAULT 0,
    tokens_per_sec REAL NOT NULL DEFAULT 0.0,
    jitter_phase_ms_json TEXT NOT NULL DEFAULT '{}',
    inferred_node_id TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_probe_turns_scan_wave_pass
    ON probe_turns(scan_id, wave_index, pass_index, turn_index);

CREATE TABLE IF NOT EXISTS topology_nodes (
    scan_id TEXT NOT NULL REFERENCES target_scans(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    label TEXT NOT NULL,
    node_type TEXT NOT NULL CHECK (
        node_type IN (
            'START_NODE',
            'STATIC_GUARDRAIL',
            'SEMANTIC_ROUTER',
            'CORE_LLM_RAG',
            'TOOL_NODE',
            'PARALLEL_TOOL_NODE',
            'JOIN_BARRIER',
            'HUMAN_HANDOFF_INTERRUPT',
            'STATEFUL_CHECKPOINTER',
            'UNKNOWN_BLACKBOX_NODE',
            'END_NODE'
        )
    ),
    discovered_in_wave INTEGER NOT NULL CHECK (discovered_in_wave BETWEEN 0 AND 5),
    avg_latency_ms INTEGER NOT NULL DEFAULT 0,
    p95_latency_ms INTEGER NOT NULL DEFAULT 0,
    min_latency_ms INTEGER NOT NULL DEFAULT 0,
    max_latency_ms INTEGER NOT NULL DEFAULT 0,
    avg_tokens_per_sec REAL NOT NULL DEFAULT 0.0,
    inferred_model_tier TEXT NOT NULL DEFAULT 'UNKNOWN',
    inferred_temperature REAL NOT NULL DEFAULT 0.0,
    temperature_band TEXT NOT NULL DEFAULT 'UNKNOWN',
    lexical_divergence REAL NOT NULL DEFAULT 0.0,
    confidence REAL NOT NULL DEFAULT 0.0,
    sample_count INTEGER NOT NULL DEFAULT 0,
    pass_count INTEGER NOT NULL DEFAULT 1,
    verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED_HYPOTHESIS',
    super_step_group TEXT,
    interrupt_Before INTEGER NOT NULL DEFAULT 0,
    state_keys_json TEXT NOT NULL DEFAULT '[]',
    evidence_json TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (scan_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_topology_nodes_scan_wave
    ON topology_nodes(scan_id, discovered_in_wave);

CREATE TABLE IF NOT EXISTS topology_edges (
    scan_id TEXT NOT NULL REFERENCES target_scans(id) ON DELETE CASCADE,
    edge_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    edge_type TEXT NOT NULL CHECK (
        edge_type IN ('SEQUENTIAL', 'CONDITIONAL_OR', 'PARALLEL_AND', 'INTERRUPT_GATE', 'LOOP_BACK')
    ),
    condition_label TEXT NOT NULL DEFAULT '',
    probability REAL NOT NULL DEFAULT 1.0,
    traversal_count INTEGER NOT NULL DEFAULT 1,
    avg_transition_ms INTEGER NOT NULL DEFAULT 0,
    discovered_in_wave INTEGER NOT NULL CHECK (discovered_in_wave BETWEEN 0 AND 5),
    verification_status TEXT NOT NULL DEFAULT 'SINGLE_PASS_HYPOTHESIS',
    PRIMARY KEY (scan_id, edge_id)
);

CREATE INDEX IF NOT EXISTS idx_topology_edges_scan_wave
    ON topology_edges(scan_id, discovered_in_wave);

CREATE TABLE IF NOT EXISTS analyzer_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
