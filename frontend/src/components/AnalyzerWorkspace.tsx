import React from "react";
import {
  Download,
  FileCode2,
  FileJson,
  FileText,
  GitBranch,
  Play,
  RotateCcw,
  Square,
  StepForward,
} from "lucide-react";
import type {
  DiagnosticReport,
  ExportFormat,
  ProbeTurn,
  TargetScanSummary,
  TopologyReport,
} from "../types/analyzer";
import { LangGraphBlueprintStudio } from "./LangGraphBlueprintStudio";
import { LiveProbeTranscript } from "./LiveProbeTranscript";
import { NodeTelemetryInspector } from "./NodeTelemetryInspector";

interface AnalyzerWorkspaceProps {
  scan: TargetScanSummary;
  topology: TopologyReport;
  diagnostics: DiagnosticReport;
  turns: ProbeTurn[];
  scrubWave: number;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onScrubWaveChange: (wave: number) => void;
  onRunAllWaves: () => void;
  onRunNextWave: () => void;
  onStopScan: () => void;
  onResetScan: () => void;
  onOpenExport: (format: ExportFormat) => void;
}

export const AnalyzerWorkspace: React.FC<AnalyzerWorkspaceProps> = ({
  scan,
  topology,
  diagnostics,
  turns,
  scrubWave,
  selectedNodeId,
  onSelectNode,
  onScrubWaveChange,
  onRunAllWaves,
  onRunNextWave,
  onStopScan,
  onResetScan,
  onOpenExport,
}) => {
  const isRunning = scan.status === "RUNNING";
  const nextWaveIndex = Math.min(5, scan.current_wave + 1);
  const selectedNode =
    topology.nodes.find((n) => n.node_id === selectedNodeId) ??
    topology.nodes[0] ??
    null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950">
      {/* Top Action & Status Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-800/90 bg-slate-900/75 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-slate-100">{scan.target_name}</h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                {scan.target_phone}
              </span>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded-full border ${
                  scan.transport_mode === "LIVE_WHATSAPP"
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                    : "bg-purple-500/15 text-purple-300 border-purple-500/40"
                }`}
              >
                {scan.transport_mode}
              </span>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded-full ${
                  scan.status === "RUNNING"
                    ? "bg-cyan-500/20 text-cyan-300 animate-pulse"
                    : scan.status === "COMPLETED"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : scan.status === "FAILED"
                    ? "bg-rose-500/20 text-rose-300"
                    : "bg-slate-800 text-slate-400"
                }`}
              >
                {scan.status} · W{scan.current_wave}/5 (Pass {scan.current_pass}/2)
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{scan.target_description}</p>
          </div>
        </div>

        {/* Probe Execution & Export Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isRunning ? (
            <>
              <button
                type="button"
                onClick={onRunAllWaves}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow-sm transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Full W1–W5 Scan</span>
              </button>
              <button
                type="button"
                onClick={onRunNextWave}
                disabled={scan.current_wave >= 5}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 border border-slate-700 transition-colors"
              >
                <StepForward className="w-3.5 h-3.5 text-cyan-400" />
                <span>Step W{nextWaveIndex}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStopScan}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Pause Scan</span>
            </button>
          )}

          <button
            type="button"
            onClick={onResetScan}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
            title="Reset to Wave W0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset W0</span>
          </button>

          <div className="h-5 w-px bg-slate-800 mx-1" />

          {/* 4-Format Post-W5 Export Suite */}
          <div className="flex items-center gap-1 bg-slate-950/90 p-1 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 px-2 flex items-center gap-1">
              <Download className="w-3 h-3 text-cyan-400" /> Export:
            </span>
            <button
              type="button"
              onClick={() => onOpenExport("python")}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-cyan-300 hover:bg-slate-800 transition-colors"
              title="Export Executable LangGraph StateGraph (.py)"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>.py</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenExport("mermaid")}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-purple-300 hover:bg-slate-800 transition-colors"
              title="Export Mermaid Flowchart (.mmd)"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>.mmd</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenExport("json")}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-amber-300 hover:bg-slate-800 transition-colors"
              title="Export Full Topology JSON (.json)"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>.json</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenExport("markdown")}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono text-emerald-300 hover:bg-slate-800 transition-colors"
              title="Export Markdown Diagnostic Report (.md)"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>.md</span>
            </button>
          </div>
        </div>
      </header>

      {scan.error_message && (
        <div className="mx-5 mt-3 px-4 py-2.5 rounded-lg bg-rose-950/70 border border-rose-500/50 text-xs text-rose-200 font-mono flex items-center justify-between">
          <span>
            [{scan.error_code ?? "ERROR"}] {scan.error_message}
          </span>
        </div>
      )}

      {/* Main Studio Split Layout */}
      <div className="flex-1 grid grid-rows-[54%_46%] gap-3 p-4 overflow-hidden">
        {/* Top Row: Full-Width LangGraph Blueprint Studio */}
        <LangGraphBlueprintStudio
          nodes={topology.nodes}
          edges={topology.edges}
          subadditivityProof={topology.subadditivity_proof}
          selectedNodeId={selectedNode?.node_id ?? null}
          onSelectNode={onSelectNode}
          scrubWave={scrubWave}
          maxWaveReached={scan.current_wave}
          onScrubWaveChange={onScrubWaveChange}
        />

        {/* Bottom Row: Live WhatsApp Probe Transcript (left) + Node Telemetry & Diagnostics (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 overflow-hidden">
          <div className="lg:col-span-7 h-full overflow-hidden">
            <LiveProbeTranscript
              turns={turns}
              currentPhase={scan.active_phase}
              selectedNodeId={selectedNode?.node_id ?? null}
              onSelectNode={onSelectNode}
            />
          </div>
          <div className="lg:col-span-5 h-full overflow-hidden">
            <NodeTelemetryInspector
              selectedNode={selectedNode}
              diagnostics={diagnostics}
              subadditivityProof={topology.subadditivity_proof}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
