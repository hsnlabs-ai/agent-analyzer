import React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  DollarSign,
  Gauge,
  Layers,
} from "lucide-react";
import type {
  DiagnosticReport,
  SubadditiveParallelProof,
  TopologyNode,
} from "../types/analyzer";

interface NodeTelemetryInspectorProps {
  selectedNode: TopologyNode | null;
  diagnostics: DiagnosticReport;
  subadditivityProof: SubadditiveParallelProof;
}

export const NodeTelemetryInspector: React.FC<NodeTelemetryInspectorProps> = ({
  selectedNode,
  diagnostics,
  subadditivityProof,
}) => {
  return (
    <div className="flex flex-col h-full bg-slate-950/90 border border-slate-800/90 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/75">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Node Telemetry & Diagnostics
          </span>
        </div>
        {selectedNode && (
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
              selectedNode.verification_status === "REPLAY_VERIFIED"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : "bg-amber-500/15 text-amber-300 border-amber-500/40"
            }`}
          >
            {selectedNode.verification_status}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
        {/* Selected Node Details */}
        {selectedNode ? (
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-mono uppercase text-cyan-400">
                  {selectedNode.node_type} · Discovered in W{selectedNode.discovered_in_wave}
                </div>
                <h3 className="text-sm font-bold text-slate-100">{selectedNode.label}</h3>
                <div className="text-[11px] font-mono text-slate-400">
                  id: <span className="text-slate-300">{selectedNode.node_id}</span>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-xs font-bold text-emerald-400">
                  {(selectedNode.confidence * 100).toFixed(0)}% conf
                </div>
                <div className="text-[10px] text-slate-400">
                  {selectedNode.sample_count} samples ({selectedNode.pass_count}-pass)
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-cyan-400" /> Avg / P95 Net
                </div>
                <div className="text-xs font-mono font-semibold text-slate-100 mt-0.5">
                  {Math.round(selectedNode.avg_latency_ms)}ms /{" "}
                  {Math.round(selectedNode.p95_latency_ms)}ms
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Cpu className="w-3 h-3 text-purple-400" /> Model Tier
                </div>
                <div className="text-xs font-mono font-semibold text-slate-100 mt-0.5 truncate">
                  {selectedNode.inferred_model_tier}
                </div>
              </div>

              <div className="bg-slate-950/80 border border-slate-800/80 rounded-lg p-2">
                <div className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-amber-400" /> Temp Band
                </div>
                <div className="text-xs font-mono font-semibold text-slate-100 mt-0.5">
                  {selectedNode.temperature_band} ({selectedNode.inferred_temperature.toFixed(2)})
                </div>
              </div>
            </div>

            {selectedNode.state_keys.length > 0 && (
              <div className="text-[11px] font-mono text-slate-300 bg-slate-950/70 px-2.5 py-1.5 rounded-lg border border-slate-800">
                <span className="text-slate-400">Mutated State Keys: </span>
                {selectedNode.state_keys.join(", ")}
              </div>
            )}

            {selectedNode.evidence.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  Surface Evidence
                </div>
                {selectedNode.evidence.map((ev, idx) => (
                  <p
                    key={idx}
                    className="text-[11px] text-slate-300 bg-slate-950/60 p-2 rounded border border-slate-800/80 font-mono"
                  >
                    {ev}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 text-center text-xs text-slate-400">
            Select any node in the LangGraph Blueprint Studio to inspect its net inference latency, model tier, temperature band, and verification proof.
          </div>
        )}

        {/* Wave 4 Subadditivity Equation Card */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">
              Wave 4 Parallel Send() Subadditivity Proof
            </span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                subadditivityProof.parallel_confirmed
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {subadditivityProof.parallel_confirmed ? "PARALLEL CONFIRMED" : "PENDING W4"}
            </span>
          </div>
          <p className="text-xs font-mono text-slate-200 bg-slate-950/80 p-2 rounded border border-slate-800">
            {subadditivityProof.equation_summary}
          </p>
        </div>

        {/* Economic & Architectural Diagnostics */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Cost & Bottleneck Diagnostics
            </span>
            <span className="text-xs font-mono text-emerald-400 flex items-center gap-0.5">
              <DollarSign className="w-3.5 h-3.5" />
              {diagnostics.estimated_cost_per_1k_sessions_usd.toFixed(2)} / 1k sessions
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="bg-slate-950/80 p-2 rounded border border-slate-800 text-slate-300">
              <span className="text-slate-400 block text-[10px]">Guardrail Gate (W1)</span>
              {diagnostics.guardrail_verdict}
            </div>
            <div className="bg-slate-950/80 p-2 rounded border border-slate-800 text-slate-300">
              <span className="text-slate-400 block text-[10px]">Memory Checkpointer (W5)</span>
              {diagnostics.checkpointer_verdict}
            </div>
          </div>

          {diagnostics.bottlenecks.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Run through Wave 4–5 to generate bottleneck findings.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {diagnostics.bottlenecks.map((item) => (
                <div
                  key={item.id}
                  className="bg-slate-950/85 border border-slate-800 rounded-lg p-2.5 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                      {item.title}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                      {item.severity} · {item.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">{item.description}</p>
                  <p className="text-[11px] text-cyan-300 font-mono">
                    Fix: {item.recommendation}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
