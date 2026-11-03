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
    <div className="flex flex-col h-full bg-white border border-[#e2e8f0] rounded-2xl shadow-2xs overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#0284c7]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[#07090e]">
            Node Telemetry & Diagnostics
          </span>
        </div>
        {selectedNode && (
          <span
            className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
              selectedNode.verification_status === "REPLAY_VERIFIED"
                ? "bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]"
                : "bg-[#fffbeb] text-[#b45309] border-[#fde68a]"
            }`}
          >
            {selectedNode.verification_status}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-[#fcfcfc]">
        {/* Selected Node Details */}
        {selectedNode ? (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-3 space-y-2.5 shadow-2xs">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[10px] font-mono font-semibold uppercase text-[#0284c7]">
                  {selectedNode.node_type} · Discovered in W{selectedNode.discovered_in_wave}
                </div>
                <h3 className="text-sm font-bold text-[#07090e]">{selectedNode.label}</h3>
                <div className="text-[11px] font-mono text-[#64748b]">
                  id: <span className="text-[#334155] font-semibold">{selectedNode.node_id}</span>
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="text-xs font-bold text-[#047857]">
                  {(selectedNode.confidence * 100).toFixed(0)}% conf
                </div>
                <div className="text-[10px] text-[#64748b]">
                  {selectedNode.sample_count} samples ({selectedNode.pass_count}-pass)
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-2">
                <div className="text-[10px] text-[#64748b] flex items-center gap-1 font-medium">
                  <Gauge className="w-3 h-3 text-[#0284c7]" /> Avg / P95 Net
                </div>
                <div className="text-xs font-mono font-bold text-[#07090e] mt-0.5">
                  {Math.round(selectedNode.avg_latency_ms)}ms /{" "}
                  {Math.round(selectedNode.p95_latency_ms)}ms
                </div>
              </div>

              <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-2">
                <div className="text-[10px] text-[#64748b] flex items-center gap-1 font-medium">
                  <Cpu className="w-3 h-3 text-[#7c3aed]" /> Model Tier
                </div>
                <div className="text-xs font-mono font-bold text-[#07090e] mt-0.5 truncate">
                  {selectedNode.inferred_model_tier}
                </div>
              </div>

              <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-2">
                <div className="text-[10px] text-[#64748b] flex items-center gap-1 font-medium">
                  <Layers className="w-3 h-3 text-[#d97706]" /> Temp Band
                </div>
                <div className="text-xs font-mono font-bold text-[#07090e] mt-0.5">
                  {selectedNode.temperature_band} ({selectedNode.inferred_temperature.toFixed(2)})
                </div>
              </div>
            </div>

            {selectedNode.state_keys.length > 0 && (
              <div className="text-[11px] font-mono text-[#334155] bg-[#f8fafc] px-2.5 py-1.5 rounded-lg border border-[#e2e8f0]">
                <span className="text-[#64748b]">Mutated State Keys: </span>
                <span className="font-semibold">{selectedNode.state_keys.join(", ")}</span>
              </div>
            )}

            {selectedNode.evidence.length > 0 && (
              <div className="space-y-1">
                <div className="text-[10px] uppercase tracking-wider text-[#64748b] font-bold">
                  Surface Evidence
                </div>
                {selectedNode.evidence.map((ev, idx) => (
                  <p
                    key={idx}
                    className="text-[11px] text-[#334155] bg-[#f8fafc] p-2 rounded border border-[#e2e8f0] font-mono"
                  >
                    {ev}
                  </p>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white border border-[#e2e8f0] rounded-xl p-4 text-center text-xs text-[#64748b]">
            Select any node in the LangGraph Blueprint Studio to inspect its net inference latency, model tier, temperature band, and verification proof.
          </div>
        )}

        {/* Wave 4 Subadditivity Equation Card */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-3 space-y-1.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#b45309]">
              Wave 4 Parallel Send() Subadditivity Proof
            </span>
            <span
              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${
                subadditivityProof.parallel_confirmed
                  ? "bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]"
                  : "bg-[#f8fafc] text-[#64748b] border-[#e2e8f0]"
              }`}
            >
              {subadditivityProof.parallel_confirmed ? "PARALLEL CONFIRMED" : "PENDING W4"}
            </span>
          </div>
          <p className="text-xs font-mono text-[#07090e] bg-[#f8fafc] p-2 rounded border border-[#e2e8f0]">
            {subadditivityProof.equation_summary}
          </p>
        </div>

        {/* Economic & Architectural Diagnostics */}
        <div className="bg-white border border-[#e2e8f0] rounded-xl p-3 space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#07090e]">
              Cost & Bottleneck Diagnostics
            </span>
            <span className="text-xs font-mono font-bold text-[#047857] flex items-center gap-0.5">
              <DollarSign className="w-3.5 h-3.5" />
              {diagnostics.estimated_cost_per_1k_sessions_usd.toFixed(2)} / 1k sessions
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="bg-[#f8fafc] p-2 rounded border border-[#e2e8f0] text-[#07090e] font-medium">
              <span className="text-[#64748b] block text-[10px] font-normal">Guardrail Gate (W1)</span>
              {diagnostics.guardrail_verdict}
            </div>
            <div className="bg-[#f8fafc] p-2 rounded border border-[#e2e8f0] text-[#07090e] font-medium">
              <span className="text-[#64748b] block text-[10px] font-normal">Memory Checkpointer (W5)</span>
              {diagnostics.checkpointer_verdict}
            </div>
          </div>

          {diagnostics.bottlenecks.length === 0 ? (
            <div className="flex items-center gap-2 text-xs text-[#64748b] py-1">
              <CheckCircle2 className="w-4 h-4 text-[#059669]" />
              <span>Run through Wave 4–5 to generate bottleneck findings.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {diagnostics.bottlenecks.map((item) => (
                <div
                  key={item.id}
                  className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-2.5 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#07090e] flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-[#d97706]" />
                      {item.title}
                    </span>
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#fffbeb] text-[#b45309] border border-[#fde68a]">
                      {item.severity} · {item.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#334155]">{item.description}</p>
                  <p className="text-[11px] text-[#0284c7] font-mono font-medium">
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
