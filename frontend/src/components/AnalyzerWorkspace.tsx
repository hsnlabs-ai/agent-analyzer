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
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#f5f5f5]">
      {/* Top Action & Status Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-[#e2e8f0] bg-white flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-[#07090e]">{scan.target_name}</h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#f8fafc] text-[#0284c7] border border-[#cbd5e1]">
                {scan.target_phone}
              </span>
              <span
                className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                  scan.transport_mode === "LIVE_WHATSAPP"
                    ? "bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]"
                    : "bg-[#f0f9ff] text-[#0284c7] border-[#bae6fd]"
                }`}
              >
                {scan.transport_mode}
              </span>
              <span
                className={`text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                  scan.status === "RUNNING"
                    ? "bg-[#f0f9ff] text-[#0284c7] border-[#7dd3fc] animate-pulse"
                    : scan.status === "COMPLETED"
                    ? "bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]"
                    : scan.status === "FAILED"
                    ? "bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]"
                    : "bg-[#f8fafc] text-[#64748b] border-[#e2e8f0]"
                }`}
              >
                {scan.status} · W{scan.current_wave}/5 (Pass {scan.current_pass}/2)
              </span>
            </div>
            <p className="text-xs text-[#64748b] mt-0.5">{scan.target_description}</p>
          </div>
        </div>

        {/* Probe Execution & Export Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isRunning ? (
            <>
              <button
                type="button"
                onClick={onRunAllWaves}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#07090e] hover:bg-[#1e293b] text-white shadow-2xs transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-current text-[#52B4FD]" />
                <span>Run Full W1–W5 Scan</span>
              </button>
              <button
                type="button"
                onClick={onRunNextWave}
                disabled={scan.current_wave >= 5}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-[#f8fafc] disabled:opacity-40 text-[#07090e] border border-[#cbd5e1] shadow-2xs transition-colors"
              >
                <StepForward className="w-3.5 h-3.5 text-[#0284c7]" />
                <span>Step W{nextWaveIndex}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStopScan}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-[#fffbeb] hover:bg-[#fef3c7] text-[#b45309] border border-[#fde68a] transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Pause Scan</span>
            </button>
          )}

          <button
            type="button"
            onClick={onResetScan}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-[#f8fafc] text-[#334155] border border-[#e2e8f0] transition-colors"
            title="Reset to Wave W0"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset W0</span>
          </button>

          <div className="h-5 w-px bg-[#e2e8f0] mx-1" />

          {/* 4-Format Post-W5 Export Suite */}
          <div className="flex items-center gap-1 bg-[#f8fafc] p-1 rounded-lg border border-[#e2e8f0]">
            <span className="text-[11px] font-medium text-[#64748b] px-2 flex items-center gap-1">
              <Download className="w-3 h-3 text-[#0284c7]" /> Export:
            </span>
            <button
              type="button"
              onClick={() => onOpenExport("python")}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-medium text-[#0284c7] hover:bg-white transition-colors"
              title="Export Executable LangGraph StateGraph (.py)"
            >
              <FileCode2 className="w-3.5 h-3.5" />
              <span>.py</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenExport("mermaid")}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-medium text-[#7e22ce] hover:bg-white transition-colors"
              title="Export Mermaid Flowchart (.mmd)"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>.mmd</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenExport("json")}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-medium text-[#b45309] hover:bg-white transition-colors"
              title="Export Full Topology JSON (.json)"
            >
              <FileJson className="w-3.5 h-3.5" />
              <span>.json</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenExport("markdown")}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-medium text-[#047857] hover:bg-white transition-colors"
              title="Export Markdown Diagnostic Report (.md)"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>.md</span>
            </button>
          </div>
        </div>
      </header>

      {scan.error_message && (
        <div className="mx-5 mt-3 px-4 py-2.5 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-xs text-[#991b1b] font-mono flex items-center justify-between">
          <span>
            [{scan.error_code ?? "ERROR"}] {scan.error_message}
          </span>
        </div>
      )}

      {/* Main Studio Split Layout */}
      <div className="flex-1 grid grid-rows-[54%_46%] gap-3.5 p-4 overflow-hidden">
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 overflow-hidden">
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
