import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ExternalLink,
  Plus,
  Settings,
  Smartphone,
  Trash2,
  Wifi,
} from "lucide-react";
import type {
  AnalyzerSettingsResponse,
  AnalyzerSnapshotResponse,
  DiagnosticReport,
  ExportFormat,
  ProbeTurn,
  TargetScanSummary,
  TopologyReport,
  TransportMode,
  WAHASessionStatus,
} from "./types/analyzer";
import { useAnalyzerSocket } from "./hooks/useAnalyzerSocket";
import { AnalyzerWorkspace } from "./components/AnalyzerWorkspace";
import { AnalyzerSettingsView } from "./components/AnalyzerSettingsView";
import { ExportModal } from "./components/ExportModal";

const OrigamiPrismIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5" }) => (
  <svg viewBox="0 0 36 36" fill="none" className={className} aria-hidden="true">
    <polygon points="18,3 32,27 18,22" fill="#52B4FD" fillOpacity="0.88" stroke="#07090e" strokeWidth="1.4" strokeLinejoin="round" />
    <polygon points="18,3 4,27 18,22" fill="#bae6fd" stroke="#07090e" strokeWidth="1.4" strokeLinejoin="round" />
    <polygon points="4,27 18,33 18,22" fill="#38bdf8" stroke="#07090e" strokeWidth="1.4" strokeLinejoin="round" />
    <polygon points="32,27 18,33 18,22" fill="#0284c7" stroke="#07090e" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
);

export const App: React.FC = () => {
  const [snapshot, setSnapshot] = useState<AnalyzerSnapshotResponse | null>(null);
  const [activeView, setActiveView] = useState<"studio" | "settings">("studio");
  const [scrubWave, setScrubWave] = useState<number>(5);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>("__start__");

  // New Target Scan inline modal/drawer state
  const [showNewScanForm, setShowNewScanForm] = useState<boolean>(false);
  const [newTargetName, setNewTargetName] = useState<string>("Mercado Express WhatsApp Bot");
  const [newTargetPhone, setNewTargetPhone] = useState<string>("+5511988887777");
  const [newTargetDesc, setNewTargetDesc] = useState<string>(
    "Retail e-commerce & Pix customer support WhatsApp assistant"
  );
  const [newTransportMode, setNewTransportMode] = useState<TransportMode>("SIMULATION");

  // Export Modal state
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("python");

  const fetchState = useCallback(async (scanId?: string, maxWave?: number) => {
    const params = new URLSearchParams();
    if (scanId) params.set("scan_id", scanId);
    if (maxWave !== undefined) params.set("max_wave", String(maxWave));
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`/api/state${query}`);
    if (!res.ok) return;
    const data = (await res.json()) as AnalyzerSnapshotResponse;
    setSnapshot(data);
    if (maxWave === undefined) {
      setScrubWave(data.active_scan.current_wave);
    }
  }, []);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const activeScanId = snapshot?.active_scan.id ?? "scan-default-sim";

  const handleSnapshot = useCallback((incoming: AnalyzerSnapshotResponse) => {
    setSnapshot(incoming);
    setScrubWave(incoming.active_scan.current_wave);
  }, []);

  const handleTurnRecorded = useCallback(
    (scanId: string, _turn: ProbeTurn, waveIndex: number) => {
      setScrubWave(waveIndex);
      void fetchState(scanId, waveIndex);
    },
    [fetchState]
  );

  const handleWaveUpdated = useCallback(
    (scanId: string, currentWave: number, _status: string) => {
      setScrubWave(currentWave);
      void fetchState(scanId, currentWave);
    },
    [fetchState]
  );

  const handleProbePhase = useCallback(
    (scanId: string, activePhase: string) => {
      setSnapshot((prev) => {
        if (!prev || prev.active_scan.id !== scanId) return prev;
        return {
          ...prev,
          active_scan: {
            ...prev.active_scan,
            active_phase: activePhase,
          },
        };
      });
    },
    []
  );

  const handleScanError = useCallback(
    (scanId: string, errorCode: string, errorMessage: string) => {
      setSnapshot((prev) => {
        if (!prev || prev.active_scan.id !== scanId) return prev;
        return {
          ...prev,
          active_scan: {
            ...prev.active_scan,
            status: "FAILED",
            active_phase: "IDLE",
            error_code: errorCode,
            error_message: errorMessage,
          },
        };
      });
    },
    []
  );

  const { wsConnected } = useAnalyzerSocket({
    activeScanId,
    onSnapshot: handleSnapshot,
    onTurnRecorded: handleTurnRecorded,
    onWaveUpdated: handleWaveUpdated,
    onProbePhase: handleProbePhase,
    onScanError: handleScanError,
  });

  const handleSelectScan = (scanId: string) => {
    setActiveView("studio");
    void fetchState(scanId);
  };

  const handleScrubWaveChange = async (wave: number) => {
    setScrubWave(wave);
    if (!snapshot) return;
    const res = await fetch(
      `/api/scans/${snapshot.active_scan.id}/topology?max_wave=${wave}`
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      scan: TargetScanSummary;
      topology: TopologyReport;
      diagnostics: DiagnosticReport;
      turns: ProbeTurn[];
    };
    setSnapshot((prev) =>
      prev
        ? {
            ...prev,
            active_scan: data.scan,
            topology: data.topology,
            diagnostics: data.diagnostics,
            turns: data.turns,
          }
        : prev
    );
  };

  const handleCreateScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_name: newTargetName,
        target_phone: newTargetPhone,
        target_description: newTargetDesc,
        transport_mode: newTransportMode,
      }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as AnalyzerSnapshotResponse;
    setSnapshot(data);
    setScrubWave(data.active_scan.current_wave);
    setShowNewScanForm(false);
    setActiveView("studio");
  };

  const handleDeleteScan = async (scanId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await fetch(`/api/scans/${scanId}`, { method: "DELETE" });
    if (!res.ok) return;
    const data = (await res.json()) as AnalyzerSnapshotResponse;
    setSnapshot(data);
    setScrubWave(data.active_scan.current_wave);
  };

  const handleRunAllWaves = async () => {
    if (!snapshot) return;
    const resetFirst = snapshot.active_scan.current_wave >= 5;
    await fetch(`/api/scans/${snapshot.active_scan.id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_wave: "ALL", reset_first: resetFirst }),
    });
    void fetchState(snapshot.active_scan.id);
  };

  const handleRunNextWave = async () => {
    if (!snapshot) return;
    const nextW = Math.min(5, snapshot.active_scan.current_wave + 1);
    await fetch(`/api/scans/${snapshot.active_scan.id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_wave: nextW, reset_first: false }),
    });
    void fetchState(snapshot.active_scan.id);
  };

  const handleStopScan = async () => {
    if (!snapshot) return;
    await fetch(`/api/scans/${snapshot.active_scan.id}/stop`, { method: "POST" });
    void fetchState(snapshot.active_scan.id);
  };

  const handleResetScan = async () => {
    if (!snapshot) return;
    const res = await fetch(`/api/scans/${snapshot.active_scan.id}/reset`, {
      method: "POST",
    });
    if (!res.ok) return;
    const data = (await res.json()) as AnalyzerSnapshotResponse;
    setSnapshot(data);
    setScrubWave(0);
  };

  const handleOpenExport = (format: ExportFormat) => {
    setExportFormat(format);
    setExportModalOpen(true);
  };

  const handleSettingsUpdated = (updated: AnalyzerSettingsResponse) => {
    setSnapshot((prev) => (prev ? { ...prev, settings: updated } : prev));
  };

  const handleWahaUpdated = (updated: WAHASessionStatus) => {
    setSnapshot((prev) => (prev ? { ...prev, waha: updated } : prev));
  };

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[#f5f5f5] text-[#07090e] font-mono text-sm">
        Bootstrapping Agent Analyzer Studio (:8095)...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#f5f5f5] text-[#07090e] select-none">
      {/* Shared macOS Studio Titlebar (Aligned with Agents Swarm) */}
      <div className="h-9 flex-shrink-0 flex items-center justify-between px-4 border-b border-[#e2e8f0] bg-[#f5f5f5]">
        <div className="flex items-center gap-3.5">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57] inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e] inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#28c840] inline-block" />
          </div>
          <span className="text-xs font-semibold text-[#64748b] tracking-tight">
            hsnlabs · Agent Analyzer — Interferometric StateGraph Probe Studio
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#334155] bg-white px-2.5 py-0.5 rounded-full border border-[#e2e8f0] shadow-2xs">
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? "bg-[#10b981]" : "bg-[#f59e0b] animate-ping"
              }`}
            />
            <span>{wsConnected ? "Probe Bus Online" : "Reconnecting..."}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar: Target Scans + WAHA Status Pill + Bottom Settings */}
        <aside className="w-72 flex-shrink-0 flex flex-col border-r border-[#e2e8f0] bg-[#f5f5f5]">
          {/* Brand Header */}
          <div className="p-4 border-b border-[#e2e8f0] flex items-center justify-between bg-white">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#f0f9ff] border border-[#bae6fd] flex items-center justify-center shadow-2xs">
                <OrigamiPrismIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold tracking-tight text-[#07090e] flex items-center gap-1.5">
                  <span>agent-analyzer</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#f0f9ff] text-[#0284c7] border border-[#bae6fd]">
                    v0.1.0
                  </span>
                </div>
                <a
                  href="https://hsnlabs.ai/en/products/agent-analyzer/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-[#64748b] hover:text-[#0284c7] flex items-center gap-1"
                >
                  <span>by hsnlabs.ai</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
            </div>
          </div>

          {/* WAHA Bridge Status Pill */}
          <div className="px-3.5 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Smartphone className="w-3.5 h-3.5 text-[#0284c7]" />
              <span className="text-[#334155] font-medium">WAHA (:3001)</span>
            </div>
            <button
              type="button"
              onClick={() => setActiveView("settings")}
              className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border ${
                snapshot.waha.status === "WORKING"
                  ? "bg-[#ecfdf5] text-[#047857] border-[#a7f3d0]"
                  : "bg-white text-[#64748b] border-[#cbd5e1] hover:text-[#07090e]"
              }`}
            >
              {snapshot.waha.status}
            </button>
          </div>

          {/* Target Scans List Header */}
          <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#64748b]">
              Target Scans ({snapshot.scans.length})
            </span>
            <button
              type="button"
              onClick={() => setShowNewScanForm((v) => !v)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white hover:bg-[#f0f9ff] text-[#0284c7] border border-[#bae6fd] shadow-2xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Scan</span>
            </button>
          </div>

          {/* Inline New Target Scan Creator */}
          {showNewScanForm && (
            <form
              onSubmit={handleCreateScan}
              className="mx-3 mb-3 p-3 rounded-xl bg-white border border-[#cbd5e1] shadow-xs space-y-2.5"
            >
              <div className="text-xs font-semibold text-[#0284c7]">
                Create Target Bot Scan
              </div>
              <input
                type="text"
                required
                placeholder="Target Bot Name"
                value={newTargetName}
                onChange={(e) => setNewTargetName(e.target.value)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#e2e8f0] px-2.5 py-1.5 text-xs text-[#07090e]"
              />
              <input
                type="text"
                required
                placeholder="+551****9999"
                value={newTargetPhone}
                onChange={(e) => setNewTargetPhone(e.target.value)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#e2e8f0] px-2.5 py-1.5 text-xs text-[#07090e] font-mono"
              />
              <input
                type="text"
                placeholder="Domain description"
                value={newTargetDesc}
                onChange={(e) => setNewTargetDesc(e.target.value)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#e2e8f0] px-2.5 py-1.5 text-xs text-[#07090e]"
              />
              <select
                value={newTransportMode}
                onChange={(e) => setNewTransportMode(e.target.value as TransportMode)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#e2e8f0] px-2.5 py-1.5 text-xs text-[#07090e] font-mono"
              >
                <option value="SIMULATION">SIMULATION (Local Target)</option>
                <option value="LIVE_WHATSAPP">LIVE_WHATSAPP (WAHA :3001)</option>
              </select>
              <div className="flex items-center justify-end gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNewScanForm(false)}
                  className="px-2.5 py-1 rounded text-xs text-[#64748b] hover:text-[#07090e]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded-lg text-xs font-semibold bg-[#07090e] text-white hover:bg-[#1e293b]"
                >
                  Create
                </button>
              </div>
            </form>
          )}

          {/* Target Scans List */}
          <div className="flex-1 overflow-y-auto px-3 space-y-2">
            {snapshot.scans.map((scan) => {
              const isSelected =
                scan.id === snapshot.active_scan.id && activeView === "studio";
              return (
                <div
                  key={scan.id}
                  onClick={() => handleSelectScan(scan.id)}
                  className={`group rounded-xl p-2.5 border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-white border-[#52B4FD] shadow-xs ring-1 ring-[#52B4FD]/30"
                      : "bg-white/70 border-[#e2e8f0] hover:bg-white hover:border-[#cbd5e1]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[#07090e] truncate">
                      {scan.target_name}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#f0f9ff] text-[#0284c7] border border-[#bae6fd]">
                        W{scan.current_wave}/5
                      </span>
                      {snapshot.scans.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteScan(scan.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 text-[#64748b] hover:text-rose-600 transition-opacity"
                          title="Delete scan"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#64748b] mt-1">
                    <span>{scan.target_phone}</span>
                    <span
                      className={
                        scan.transport_mode === "LIVE_WHATSAPP"
                          ? "text-[#047857] font-semibold"
                          : "text-[#0284c7] font-semibold"
                      }
                    >
                      {scan.transport_mode === "LIVE_WHATSAPP" ? "LIVE" : "SIM"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Navigation: Studio vs Settings */}
          <div className="p-3 border-t border-[#e2e8f0] bg-white space-y-1.5">
            <button
              type="button"
              onClick={() => setActiveView("studio")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeView === "studio"
                  ? "bg-[#f0f9ff] text-[#0284c7] border border-[#bae6fd]"
                  : "text-[#334155] hover:text-[#07090e] hover:bg-[#f8fafc] border border-transparent"
              }`}
            >
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span>Blueprint Studio (W0–W5)</span>
              </span>
              <Wifi className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveView("settings")}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeView === "settings"
                  ? "bg-[#f0f9ff] text-[#0284c7] border border-[#bae6fd]"
                  : "text-[#334155] hover:text-[#07090e] hover:bg-[#f8fafc] border border-transparent"
              }`}
            >
              <span className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                <span>Settings & WAHA QR Pairing</span>
              </span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        {activeView === "settings" ? (
          <AnalyzerSettingsView
            settings={snapshot.settings}
            waha={snapshot.waha}
            onSettingsUpdated={handleSettingsUpdated}
            onWahaUpdated={handleWahaUpdated}
          />
        ) : (
          <AnalyzerWorkspace
            scan={snapshot.active_scan}
            topology={snapshot.topology}
            diagnostics={snapshot.diagnostics}
            turns={snapshot.turns}
            scrubWave={scrubWave}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
            onScrubWaveChange={handleScrubWaveChange}
            onRunAllWaves={handleRunAllWaves}
            onRunNextWave={handleRunNextWave}
            onStopScan={handleStopScan}
            onResetScan={handleResetScan}
            onOpenExport={handleOpenExport}
          />
        )}
      </div>

      {/* Post-W5 Export Modal (Native <dialog closedby="any">) */}
      <ExportModal
        scanId={snapshot.active_scan.id}
        targetName={snapshot.active_scan.target_name}
        isOpen={exportModalOpen}
        initialFormat={exportFormat}
        maxWave={scrubWave}
        onClose={() => setExportModalOpen(false)}
      />
    </div>
  );
};

export default App;
