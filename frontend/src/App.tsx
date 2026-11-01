import React, { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ExternalLink,
  Plus,
  Radar,
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
      <div className="flex items-center justify-center h-screen w-screen bg-slate-950 text-slate-300 font-mono text-sm">
        Bootstrapping Agent Analyzer Studio (:8095)...
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 select-none">
      {/* Left Sidebar: Target Scans + WAHA Status Pill + Bottom Settings */}
      <aside className="w-72 flex-shrink-0 flex flex-col border-r border-slate-800/90 bg-slate-950">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/90 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <Radar className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-slate-100 flex items-center gap-1.5">
                <span>agent-analyzer</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/15 text-cyan-300">
                  v0.1.0
                </span>
              </div>
              <a
                href="https://hsnlabs.ai/en/products/agent-analyzer/"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-slate-400 hover:text-cyan-300 flex items-center gap-1"
              >
                <span>by hsnlabs.ai</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          <div
            title={wsConnected ? "Live WebSocket Connected" : "Reconnecting WebSocket..."}
            className={`w-2.5 h-2.5 rounded-full ${
              wsConnected ? "bg-emerald-400" : "bg-amber-400 animate-ping"
            }`}
          />
        </div>

        {/* WAHA Bridge Status Pill */}
        <div className="px-3.5 py-2.5 border-b border-slate-800/80 bg-slate-900/50 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-300 font-medium">WAHA (:3001)</span>
          </div>
          <button
            type="button"
            onClick={() => setActiveView("settings")}
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${
              snapshot.waha.status === "WORKING"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/40"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200"
            }`}
          >
            {snapshot.waha.status}
          </button>
        </div>

        {/* Target Scans List Header */}
        <div className="px-4 pt-3 pb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Target Scans ({snapshot.scans.length})
          </span>
          <button
            type="button"
            onClick={() => setShowNewScanForm((v) => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Scan</span>
          </button>
        </div>

        {/* Inline New Target Scan Creator */}
        {showNewScanForm && (
          <form
            onSubmit={handleCreateScan}
            className="mx-3 mb-3 p-3 rounded-xl bg-slate-900 border border-slate-700/80 space-y-2.5"
          >
            <div className="text-xs font-semibold text-cyan-300">
              Create Target Bot Scan
            </div>
            <input
              type="text"
              required
              placeholder="Target Bot Name"
              value={newTargetName}
              onChange={(e) => setNewTargetName(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100"
            />
            <input
              type="text"
              required
              placeholder="+5511999999999"
              value={newTargetPhone}
              onChange={(e) => setNewTargetPhone(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 font-mono"
            />
            <input
              type="text"
              placeholder="Domain description"
              value={newTargetDesc}
              onChange={(e) => setNewTargetDesc(e.target.value)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100"
            />
            <select
              value={newTransportMode}
              onChange={(e) => setNewTransportMode(e.target.value as TransportMode)}
              className="w-full rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 font-mono"
            >
              <option value="SIMULATION">SIMULATION (Local Target)</option>
              <option value="LIVE_WHATSAPP">LIVE_WHATSAPP (WAHA :3001)</option>
            </select>
            <div className="flex items-center justify-end gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setShowNewScanForm(false)}
                className="px-2.5 py-1 rounded text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 rounded text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400"
              >
                Create
              </button>
            </div>
          </form>
        )}

        {/* Target Scans List */}
        <div className="flex-1 overflow-y-auto px-3 space-y-1.5">
          {snapshot.scans.map((scan) => {
            const isSelected =
              scan.id === snapshot.active_scan.id && activeView === "studio";
            return (
              <div
                key={scan.id}
                onClick={() => handleSelectScan(scan.id)}
                className={`group rounded-xl p-2.5 border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-cyan-950/35 border-cyan-500/50"
                    : "bg-slate-900/40 border-slate-800/80 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100 truncate">
                    {scan.target_name}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                      W{scan.current_wave}/5
                    </span>
                    {snapshot.scans.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteScan(scan.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition-opacity"
                        title="Delete scan"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-1">
                  <span>{scan.target_phone}</span>
                  <span
                    className={
                      scan.transport_mode === "LIVE_WHATSAPP"
                        ? "text-emerald-400"
                        : "text-purple-400"
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
        <div className="p-3 border-t border-slate-800/90 bg-slate-900/40 space-y-1.5">
          <button
            type="button"
            onClick={() => setActiveView("studio")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeView === "studio"
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
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
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              activeView === "settings"
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/40"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
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
