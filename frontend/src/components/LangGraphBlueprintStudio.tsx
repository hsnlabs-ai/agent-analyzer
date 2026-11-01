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
  START_NODE: { stroke: "#38bdf8", badgeBg: "rgba(56,189,248,0.16)", text: "#7dd3fc" },
  END_NODE: { stroke: "#38bdf8", badgeBg: "rgba(56,189,248,0.16)", text: "#7dd3fc" },
  STATIC_GUARDRAIL: { stroke: "#10b981", badgeBg: "rgba(16,185,129,0.16)", text: "#6ee7b7" },
  SEMANTIC_ROUTER: { stroke: "#a855f7", badgeBg: "rgba(168,85,247,0.16)", text: "#d8b4fe" },
  CORE_LLM_RAG: { stroke: "#06b6d4", badgeBg: "rgba(6,182,212,0.16)", text: "#67e8f9" },
  TOOL_NODE: { stroke: "#f59e0b", badgeBg: "rgba(245,158,11,0.16)", text: "#fcd34d" },
  PARALLEL_TOOL_NODE: { stroke: "#f59e0b", badgeBg: "rgba(245,158,11,0.16)", text: "#fcd34d" },
  JOIN_BARRIER: { stroke: "#ec4899", badgeBg: "rgba(236,72,153,0.16)", text: "#f9a8d4" },
  HUMAN_HANDOFF_INTERRUPT: { stroke: "#ef4444", badgeBg: "rgba(239,68,68,0.18)", text: "#fca5a5" },
  STATEFUL_CHECKPOINTER: { stroke: "#eab308", badgeBg: "rgba(234,179,8,0.16)", text: "#fde047" },
  UNKNOWN_BLACKBOX_NODE: { stroke: "#64748b", badgeBg: "rgba(100,116,139,0.2)", text: "#cbd5e1" },
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
    <div className="flex flex-col h-full bg-slate-950/90 border border-slate-800/90 rounded-xl overflow-hidden">
      {/* Studio Top Bar + Time-Travel Wave Scrubber */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/75 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
            <GitBranch className="w-4 h-4" />
            <span>LangGraph StateGraph Blueprint</span>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            {nodes.length} Nodes · {edges.length} Edges
          </span>
          {subadditivityProof.parallel_confirmed && scrubWave >= 4 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono">
              Send() Ratio: {subadditivityProof.subadditivity_ratio.toFixed(2)} (&lt; 0.72)
            </span>
          )}
        </div>

        {/* Time-Travel Wave Scrubber W0..W5 */}
        <div className="flex items-center gap-1 bg-slate-950/90 p-1 rounded-lg border border-slate-800">
          <span className="text-[11px] text-slate-400 px-2 font-medium">Wave Scrubber:</span>
          {WAVE_LABELS.map((item) => {
            const isUnlocked = item.wave <= maxWaveReached || item.wave === 0;
            const isCurrent = scrubWave === item.wave;
            return (
              <button
                key={item.wave}
                type="button"
                onClick={() => onScrubWaveChange(item.wave)}
                title={`${item.short}: ${item.title}`}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all ${
                  isCurrent
                    ? "bg-cyan-500 text-slate-950 font-bold shadow-sm"
                    : isUnlocked
                    ? "text-slate-300 hover:bg-slate-800"
                    : "text-slate-600 hover:text-slate-400"
                }`}
              >
                {item.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive SVG Directed Graph Canvas */}
      <div className="relative flex-1 overflow-auto bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px]">
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
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#a855f7" />
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
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
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
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
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
                fill="rgba(245, 158, 11, 0.05)"
                stroke="#f59e0b"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              <text
                x={648}
                y={186}
                fill="#fbbf24"
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
              stroke = "#a855f7";
              dash = "5 4";
              marker = "url(#arrow-or)";
            } else if (edge.edge_type === "PARALLEL_AND") {
              stroke = "#f59e0b";
              marker = "url(#arrow-and)";
            } else if (edge.edge_type === "INTERRUPT_GATE") {
              stroke = "#ef4444";
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
                    fill="#94a3b8"
                    fontSize={9.5}
                    fontFamily="monospace"
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
                  fill={isSelected ? "#0f172a" : "#090d16"}
                  stroke={isSelected ? "#22d3ee" : palette.stroke}
                  strokeWidth={isSelected ? 2.6 : isVerified ? 2 : 1.5}
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
                  fill={isVerified ? "#34d399" : "#fbbf24"}
                  fontSize={8.5}
                  fontFamily="monospace"
                >
                  {isVerified ? "2-PASS ✓" : "1-PASS ?"}
                </text>

                {/* Node Title */}
                <text
                  x={10}
                  y={36}
                  fill="#f1f5f9"
                  fontSize={11}
                  fontWeight={600}
                >
                  {node.label.length > 21 ? `${node.label.slice(0, 20)}…` : node.label}
                </text>

                {/* Node Telemetry Footer */}
                <text
                  x={10}
                  y={52}
                  fill="#94a3b8"
                  fontSize={9.5}
                  fontFamily="monospace"
                >
                  {node.avg_latency_ms > 0 ? `${Math.round(node.avg_latency_ms)}ms` : "0ms"} ·{" "}
                  {node.inferred_model_tier.slice(0, 14)}
                </text>

                <text
                  x={10}
                  y={66}
                  fill={node.interrupt_before ? "#f87171" : "#64748b"}
                  fontSize={8.5}
                  fontFamily="monospace"
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
      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800 bg-slate-900/70 text-[11px] text-slate-400 flex-wrap gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
            <span>Guardrail Gate (&lt;250ms)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Conditional OR Router</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Parallel Send() Super-Step</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-red-400" />
            <span>HITL interrupt_before</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-yellow-400" />
            <span>Canary Checkpointer (W5)</span>
          </span>
        </div>
        <div className="font-mono text-slate-400">
          Solid Border = <span className="text-emerald-400">REPLAY_VERIFIED (2/2)</span> · Dashed ={" "}
          <span className="text-amber-300">SINGLE_PASS_HYPOTHESIS</span>
        </div>
      </div>
    </div>
  );
};
