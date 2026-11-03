import React, { useMemo } from "react";
import { Cpu, GitBranch, Layers, ShieldAlert, Sparkles, Zap } from "lucide-react";
import type {
  SubadditiveParallelProof,
  TopologyEdge,
  TopologyNode,
} from "../types/analyzer";

interface LangGraphBlueprintStudioProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  subadditivityProof: SubadditiveParallelProof;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  scrubWave: number;
  maxWaveReached: number;
  onScrubWaveChange: (wave: number) => void;
}

const NODE_COORDS: Record<string, { x: number; y: number }> = {
  __start__: { x: 110, y: 260 },
  guardrail_gate: { x: 300, y: 260 },
  semantic_router: { x: 500, y: 260 },
  rag_synthesizer: { x: 740, y: 95 },
  tool_erp_invoice: { x: 740, y: 220 },
  tool_logistics_carrier: { x: 740, y: 335 },
  human_handoff_gate: { x: 740, y: 455 },
  parallel_join_barrier: { x: 965, y: 275 },
  memory_checkpointer: { x: 1150, y: 260 },
  __end__: { x: 1330, y: 260 },
};

const NODE_COLOR_MAP: Record<string, { stroke: string; badgeBg: string; text: string }> = {
  START_NODE: { stroke: "#0284c7", badgeBg: "#e0f2fe", text: "#0369a1" },
  END_NODE: { stroke: "#0284c7", badgeBg: "#e0f2fe", text: "#0369a1" },
  STATIC_GUARDRAIL: { stroke: "#059669", badgeBg: "#d1fae5", text: "#047857" },
  SEMANTIC_ROUTER: { stroke: "#7c3aed", badgeBg: "#ede9fe", text: "#6d28d9" },
  CORE_LLM_RAG: { stroke: "#0284c7", badgeBg: "#e0f2fe", text: "#0369a1" },
  TOOL_NODE: { stroke: "#d97706", badgeBg: "#fef3c7", text: "#b45309" },
  PARALLEL_TOOL_NODE: { stroke: "#d97706", badgeBg: "#fef3c7", text: "#b45309" },
  JOIN_BARRIER: { stroke: "#db2777", badgeBg: "#fce7f3", text: "#be185d" },
  HUMAN_HANDOFF_INTERRUPT: { stroke: "#dc2626", badgeBg: "#fee2e2", text: "#b91c1c" },
  STATEFUL_CHECKPOINTER: { stroke: "#ca8a04", badgeBg: "#fef9c3", text: "#a16207" },
  UNKNOWN_BLACKBOX_NODE: { stroke: "#64748b", badgeBg: "#f1f5f9", text: "#475569" },
};

const WAVE_LABELS: { wave: number; short: string; title: string }[] = [
  { wave: 0, short: "W0", title: "Surface Recon" },
  { wave: 1, short: "W1", title: "Guardrail Gate" },
  { wave: 2, short: "W2", title: "Semantic Router" },
  { wave: 3, short: "W3", title: "Temperature & Tier" },
  { wave: 4, short: "W4", title: "Parallel Send() & HITL" },
  { wave: 5, short: "W5", title: "Canary Memory" },
];

export const LangGraphBlueprintStudio: React.FC<LangGraphBlueprintStudioProps> = ({
  nodes,
  edges,
  subadditivityProof,
  selectedNodeId,
  onSelectNode,
  scrubWave,
  maxWaveReached,
  onScrubWaveChange,
}) => {
  const positionedNodes = useMemo(() => {
    return nodes.map((node, index) => {
      const preset = NODE_COORDS[node.node_id];
      const x = preset ? preset.x : 220 + (index % 5) * 230;
      const y = preset ? preset.y : 140 + Math.floor(index / 5) * 160;
      return { ...node, x, y };
    });
  }, [nodes]);

  const nodeLookup = useMemo(() => {
    const map = new Map<string, TopologyNode & { x: number; y: number }>();
    positionedNodes.forEach((n) => map.set(n.node_id, n));
    return map;
  }, [positionedNodes]);

  const showParallelBox = useMemo(() => {
    return (
      scrubWave >= 4 &&
      nodeLookup.has("tool_erp_invoice") &&
      nodeLookup.has("tool_logistics_carrier")
    );
  }, [scrubWave, nodeLookup]);

  return (
    <div className="flex flex-col h-full bg-white border border-[#e2e8f0] rounded-2xl shadow-2xs overflow-hidden">
      {/* Studio Top Bar + Time-Travel Wave Scrubber */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc] flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-[#0284c7] font-bold text-xs uppercase tracking-wider">
            <GitBranch className="w-4 h-4" />
            <span>LangGraph StateGraph Blueprint</span>
          </div>
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white text-[#334155] border border-[#cbd5e1]">
            {nodes.length} Nodes · {edges.length} Edges
          </span>
          {subadditivityProof.parallel_confirmed && scrubWave >= 4 && (
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#fffbeb] text-[#b45309] border border-[#fde68a] font-mono font-semibold">
              Send() Ratio: {subadditivityProof.subadditivity_ratio.toFixed(2)} (&lt; 0.72)
            </span>
          )}
        </div>

        {/* Time-Travel Wave Scrubber W0..W5 */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-[#e2e8f0] shadow-2xs">
          <span className="text-[11px] text-[#64748b] px-2 font-semibold">Wave Scrubber:</span>
          {WAVE_LABELS.map((item) => {
            const isUnlocked = item.wave <= maxWaveReached || item.wave === 0;
            const isCurrent = scrubWave === item.wave;
            return (
              <button
                key={item.wave}
                type="button"
                onClick={() => onScrubWaveChange(item.wave)}
                title={`${item.short}: ${item.title}`}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all ${
                  isCurrent
                    ? "bg-[#07090e] text-white font-bold shadow-2xs"
                    : isUnlocked
                    ? "text-[#334155] hover:bg-[#f1f5f9] font-medium"
                    : "text-[#94a3b8] hover:text-[#64748b]"
                }`}
              >
                {item.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive SVG Directed Graph Canvas (Millimeter Lab Grid) */}
      <div className="relative flex-1 overflow-auto bg-[#fcfcfc] bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:20px_20px]">
        <svg
          viewBox="0 0 1440 540"
          className="w-full h-full min-w-[980px] min-h-[420px] select-none"
        >
          <defs>
            <marker
              id="arrow-seq"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#64748b" />
            </marker>
            <marker
              id="arrow-or"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#7c3aed" />
            </marker>
            <marker
              id="arrow-and"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#d97706" />
            </marker>
            <marker
              id="arrow-hitl"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#dc2626" />
            </marker>
          </defs>

          {/* Parallel Super-Step Bounding Box (Wave 4 Send() Fan-Out) */}
          {showParallelBox && (
            <g>
              <rect
                x={635}
                y={168}
                width={215}
                height={225}
                rx={14}
                fill="rgba(245, 158, 11, 0.06)"
                stroke="#d97706"
                strokeWidth={1.6}
                strokeDasharray="6 4"
              />
              <text
                x={648}
                y={186}
                fill="#b45309"
                fontSize={10}
                fontFamily="monospace"
                fontWeight="bold"
              >
                Send() Parallel Super-Step (W4)
              </text>
            </g>
          )}

          {/* Directed Edges */}
          {edges.map((edge) => {
            const src = nodeLookup.get(edge.source_node_id);
            const dst = nodeLookup.get(edge.target_node_id);
            if (!src || !dst) return null;

            const x1 = src.x + 78;
            const y1 = src.y;
            const x2 = dst.x - 78;
            const y2 = dst.y;
            const cx1 = x1 + (x2 - x1) * 0.45;
            const cx2 = x1 + (x2 - x1) * 0.55;
            const pathData = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;

            let stroke = "#64748b";
            let dash = "";
            let marker = "url(#arrow-seq)";
            if (edge.edge_type === "CONDITIONAL_OR") {
              stroke = "#7c3aed";
              dash = "5 4";
              marker = "url(#arrow-or)";
            } else if (edge.edge_type === "PARALLEL_AND") {
              stroke = "#d97706";
              marker = "url(#arrow-and)";
            } else if (edge.edge_type === "INTERRUPT_GATE") {
              stroke = "#dc2626";
              dash = "3 3";
              marker = "url(#arrow-hitl)";
            }

            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2 - 7;

            return (
              <g key={edge.edge_id}>
                <path
                  d={pathData}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={edge.edge_type === "PARALLEL_AND" ? 2.4 : 1.8}
                  strokeDasharray={dash}
                  markerEnd={marker}
                />
                {edge.condition_label && (
                  <text
                    x={midX}
                    y={midY}
                    textAnchor="middle"
                    fill="#475569"
                    fontSize={9.5}
                    fontFamily="monospace"
                    fontWeight="600"
                  >
                    {edge.condition_label} ({Math.round(edge.probability * 100)}%)
                  </text>
                )}
              </g>
            );
          })}

          {/* Topology Nodes */}
          {positionedNodes.map((node) => {
            const palette =
              NODE_COLOR_MAP[node.node_type] ?? NODE_COLOR_MAP.UNKNOWN_BLACKBOX_NODE;
            const isSelected = node.node_id === selectedNodeId;
            const isVerified = node.verification_status === "REPLAY_VERIFIED";

            return (
              <g
                key={node.node_id}
                transform={`translate(${node.x - 80}, ${node.y - 38})`}
                onClick={() => onSelectNode(node.node_id)}
                className="cursor-pointer"
              >
                <rect
                  width={160}
                  height={76}
                  rx={12}
                  fill={isSelected ? "#f0f9ff" : "#ffffff"}
                  stroke={isSelected ? "#0284c7" : palette.stroke}
                  strokeWidth={isSelected ? 2.6 : isVerified ? 1.8 : 1.4}
                  strokeDasharray={isVerified ? undefined : "4 3"}
                />

                {/* Top Wave & Verification Pill */}
                <rect
                  x={8}
                  y={7}
                  width={32}
                  height={15}
                  rx={4}
                  fill={palette.badgeBg}
                />
                <text
                  x={24}
                  y={17.5}
                  textAnchor="middle"
                  fill={palette.text}
                  fontSize={9}
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  W{node.discovered_in_wave}
                </text>

                <text
                  x={150}
                  y={17.5}
                  textAnchor="end"
                  fill={isVerified ? "#047857" : "#b45309"}
                  fontSize={8.5}
                  fontFamily="monospace"
                  fontWeight="600"
                >
                  {isVerified ? "2-PASS ✓" : "1-PASS ?"}
                </text>

                {/* Node Title */}
                <text
                  x={10}
                  y={36}
                  fill="#07090e"
                  fontSize={11}
                  fontWeight={700}
                >
                  {node.label.length > 21 ? `${node.label.slice(0, 20)}…` : node.label}
                </text>

                {/* Node Telemetry Footer */}
                <text
                  x={10}
                  y={52}
                  fill="#475569"
                  fontSize={9.5}
                  fontFamily="monospace"
                >
                  {node.avg_latency_ms > 0 ? `${Math.round(node.avg_latency_ms)}ms` : "0ms"} ·{" "}
                  {node.inferred_model_tier.slice(0, 14)}
                </text>

                <text
                  x={10}
                  y={66}
                  fill={node.interrupt_before ? "#b91c1c" : "#64748b"}
                  fontSize={8.5}
                  fontFamily="monospace"
                  fontWeight={node.interrupt_before ? "600" : "400"}
                >
                  {node.interrupt_before
                    ? "interrupt_before=True"
                    : `conf ${(node.confidence * 100).toFixed(0)}% · ${node.temperature_band}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Bottom Legend Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-[#e2e8f0] bg-[#f8fafc] text-[11px] text-[#475569] flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-[#059669]" />
            <span>Guardrail Gate (&lt;250ms)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#7c3aed]" />
            <span>Conditional OR Router</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-[#d97706]" />
            <span>Parallel Send() Super-Step</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#dc2626]" />
            <span>HITL interrupt_before</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#ca8a04]" />
            <span>Canary Checkpointer (W5)</span>
          </span>
        </div>
        <div className="font-mono text-[#64748b]">
          Solid Border = <span className="text-[#047857] font-semibold">REPLAY_VERIFIED (2/2)</span> · Dashed ={" "}
          <span className="text-[#b45309] font-semibold">SINGLE_PASS_HYPOTHESIS</span>
        </div>
      </div>
    </div>
  );
};
