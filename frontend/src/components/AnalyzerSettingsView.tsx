import React, { useState } from "react";
import {
  CheckCircle2,
  KeyRound,
  LogOut,
  QrCode,
  RefreshCw,
  Save,
  Smartphone,
  Sliders,
} from "lucide-react";
import type { AnalyzerSettingsResponse, WAHASessionStatus } from "../types/analyzer";

interface AnalyzerSettingsViewProps {
  settings: AnalyzerSettingsResponse;
  waha: WAHASessionStatus;
  onSettingsUpdated: (settings: AnalyzerSettingsResponse) => void;
  onWahaUpdated: (waha: WAHASessionStatus) => void;
}

export const AnalyzerSettingsView: React.FC<AnalyzerSettingsViewProps> = ({
  settings,
  waha,
  onSettingsUpdated,
  onWahaUpdated,
}) => {
  const [llmProvider, setLlmProvider] = useState(settings.llm_provider);
  const [llmModel, setLlmModel] = useState(settings.llm_model);
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [wahaBaseUrl, setWahaBaseUrl] = useState(settings.waha_base_url);
  const [wahaSessionName, setWahaSessionName] = useState(settings.waha_session_name);
  const [wahaApiKey, setWahaApiKey] = useState("");
  const [simScale, setSimScale] = useState(settings.sim_jitter_sleep_scale);
  const [liveScale, setLiveScale] = useState(settings.live_jitter_sleep_scale);
  const [minTurnGap, setMinTurnGap] = useState(settings.min_turn_gap_s);

  const [saving, setSaving] = useState(false);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [qrDataUri, setQrDataUri] = useState<string | null>(null);
  const [wahaBusy, setWahaBusy] = useState(false);
  const [wahaError, setWahaError] = useState<string | null>(null);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveBanner(null);
    try {
      const payload: Record<string, unknown> = {
        llm_provider: llmProvider,
        llm_model: llmModel,
        waha_base_url: wahaBaseUrl,
        waha_session_name: wahaSessionName,
        sim_jitter_sleep_scale: Number(simScale),
        live_jitter_sleep_scale: Number(liveScale),
        min_turn_gap_s: Number(minTurnGap),
      };
      if (geminiKey.trim()) payload.gemini_api_key = geminiKey.trim();
      if (openaiKey.trim()) payload.openai_api_key = openaiKey.trim();
      if (anthropicKey.trim()) payload.anthropic_api_key = anthropicKey.trim();
      if (wahaApiKey.trim()) payload.waha_api_key = wahaApiKey.trim();

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = (await res.json()) as AnalyzerSettingsResponse;
      onSettingsUpdated(updated);
      setGeminiKey("");
      setOpenaiKey("");
      setAnthropicKey("");
      setWahaApiKey("");
      setSaveBanner("Settings persisted to SQLite (data/analyzer.sqlite3).");
    } catch (err) {
      setSaveBanner(`Failed to save settings: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRefreshWaha = async () => {
    setWahaBusy(true);
    setWahaError(null);
    try {
      const res = await fetch("/api/waha/session");
      const status = (await res.json()) as WAHASessionStatus;
      onWahaUpdated(status);
    } catch (err) {
      setWahaError(String(err));
    } finally {
      setWahaBusy(false);
    }
  };

  const handleStartWahaSession = async () => {
    setWahaBusy(true);
    setWahaError(null);
    try {
      const res = await fetch("/api/waha/session/start", { method: "POST" });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.detail?.message || `HTTP ${res.status}`);
      }
      const status = (await res.json()) as WAHASessionStatus;
      onWahaUpdated(status);
    } catch (err) {
      setWahaError(String(err));
    } finally {
      setWahaBusy(false);
    }
  };

  const handleFetchQr = async () => {
    setWahaBusy(true);
    setWahaError(null);
    try {
      const res = await fetch("/api/waha/qr");
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.detail?.message || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { data_uri?: string };
      setQrDataUri(data.data_uri ?? null);
    } catch (err) {
      setWahaError(String(err));
    } finally {
      setWahaBusy(false);
    }
  };

  const handleLogoutWaha = async () => {
    setWahaBusy(true);
    setWahaError(null);
    try {
      const res = await fetch("/api/waha/session/logout", { method: "POST" });
      const status = (await res.json()) as WAHASessionStatus;
      onWahaUpdated(status);
      setQrDataUri(null);
    } catch (err) {
      setWahaError(String(err));
    } finally {
      setWahaBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#f5f5f5] text-[#07090e]">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-lg font-bold text-[#07090e]">
            Agent Analyzer Runtime & WAHA Bridge Settings
          </h1>
          <p className="text-xs text-[#64748b] mt-0.5">
            Configure LLM credentials, single-session WhatsApp Web QR pairing (:3001), and human pacing jitter parameters.
          </p>
        </div>

        {/* WAHA Multi-Device Bridge Card */}
        <section className="bg-white border border-[#e2e8f0] rounded-2xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <Smartphone className="w-5 h-5 text-[#0284c7]" />
              <div>
                <h2 className="text-sm font-bold text-[#07090e]">
                  Single-Session WAHA WhatsApp Bridge (:3001)
                </h2>
                <p className="text-xs text-[#64748b]">
                  Status: <span className="font-mono font-semibold text-[#047857]">{waha.status}</span> ·{" "}
                  {waha.message}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefreshWaha}
                disabled={wahaBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white hover:bg-[#f8fafc] text-[#334155] border border-[#cbd5e1]"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${wahaBusy ? "animate-spin" : ""}`} />
                <span>Check Status</span>
              </button>
              <button
                type="button"
                onClick={handleStartWahaSession}
                disabled={wahaBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#ecfdf5] hover:bg-[#d1fae5] text-[#047857] border border-[#a7f3d0]"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Start / Attach Session</span>
              </button>
              <button
                type="button"
                onClick={handleFetchQr}
                disabled={wahaBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#f0f9ff] hover:bg-[#e0f2fe] text-[#0284c7] border border-[#bae6fd]"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Fetch QR Code</span>
              </button>
              <button
                type="button"
                onClick={handleLogoutWaha}
                disabled={wahaBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#fef2f2] hover:bg-[#fee2e2] text-[#b91c1c] border border-[#fecaca]"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Logout</span>
              </button>
            </div>
          </div>

          {wahaError && (
            <div className="p-3 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-xs text-[#991b1b] font-mono">
              {wahaError}
            </div>
          )}

          {qrDataUri && (
            <div className="flex items-center gap-4 p-4 rounded-xl bg-[#f8fafc] border border-[#e2e8f0]">
              <img
                src={qrDataUri}
                alt="WAHA WhatsApp QR Code"
                className="w-40 h-40 rounded-lg bg-white p-2 border border-[#e2e8f0]"
              />
              <div className="space-y-1 text-xs text-[#334155]">
                <div className="font-bold text-[#07090e]">
                  Scan with your Probe WhatsApp Account
                </div>
                <p className="text-[#64748b]">
                  Open WhatsApp on your phone → Linked Devices → Link a Device, and scan this QR code. Once paired, switch any Target Scan to{" "}
                  <span className="font-mono font-semibold text-[#047857]">LIVE_WHATSAPP</span>.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Runtime Settings Form */}
        <form
          onSubmit={handleSaveSettings}
          className="bg-white border border-[#e2e8f0] rounded-2xl p-5 space-y-5 shadow-2xs"
        >
          <div className="flex items-center gap-2 text-sm font-bold text-[#07090e]">
            <KeyRound className="w-4 h-4 text-[#0284c7]" />
            <span>Probe Synthesis LLM & Credentials</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#334155]">LLM Provider</span>
              <select
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#cbd5e1] px-3 py-2 text-xs text-[#07090e]"
              >
                <option value="gemini">Google Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#334155]">Default Model</span>
              <input
                type="text"
                value={llmModel}
                onChange={(e) => setLlmModel(e.target.value)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#cbd5e1] px-3 py-2 text-xs text-[#07090e] font-mono"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#334155]">
                Gemini API Key{" "}
                {settings.has_gemini_key && (
                  <span className="text-[#047857] font-mono">({settings.gemini_key_hint})</span>
                )}
              </span>
              <input
                type="password"
                placeholder="Leave blank to keep existing key"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#cbd5e1] px-3 py-2 text-xs text-[#07090e] font-mono"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#334155]">
                OpenAI API Key{" "}
                {settings.has_openai_key && (
                  <span className="text-[#047857] font-mono">({settings.openai_key_hint})</span>
                )}
              </span>
              <input
                type="password"
                placeholder="Leave blank to keep existing key"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#cbd5e1] px-3 py-2 text-xs text-[#07090e] font-mono"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#334155]">
                Anthropic API Key{" "}
                {settings.has_anthropic_key && (
                  <span className="text-[#047857] font-mono">
                    ({settings.anthropic_key_hint})
                  </span>
                )}
              </span>
              <input
                type="password"
                placeholder="Leave blank to keep existing key"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#cbd5e1] px-3 py-2 text-xs text-[#07090e] font-mono"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#334155]">WAHA Base URL</span>
              <input
                type="text"
                value={wahaBaseUrl}
                onChange={(e) => setWahaBaseUrl(e.target.value)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#cbd5e1] px-3 py-2 text-xs text-[#07090e] font-mono"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#334155]">WAHA Session Name</span>
              <input
                type="text"
                value={wahaSessionName}
                onChange={(e) => setWahaSessionName(e.target.value)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#cbd5e1] px-3 py-2 text-xs text-[#07090e] font-mono"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-medium text-[#334155]">
                WAHA API Key{" "}
                {settings.has_waha_api_key && (
                  <span className="text-[#047857] font-mono">
                    ({settings.waha_api_key_hint})
                  </span>
                )}
              </span>
              <input
                type="password"
                placeholder="Optional X-Api-Key for WAHA"
                value={wahaApiKey}
                onChange={(e) => setWahaApiKey(e.target.value)}
                className="w-full rounded-lg bg-[#f8fafc] border border-[#cbd5e1] px-3 py-2 text-xs text-[#07090e] font-mono"
              />
            </label>
          </div>

          <div className="pt-2 border-t border-[#e2e8f0] space-y-3">
            <div className="flex items-center gap-2 text-sm font-bold text-[#07090e]">
              <Sliders className="w-4 h-4 text-[#d97706]" />
              <span>Human-Like Jitter & Anti-Ban Pacing</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#334155]">Simulation Jitter Scale (0–1)</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={simScale}
                  onChange={(e) => setSimScale(Number(e.target.value))}
                  className="w-full rounded-lg bg-[#f8fafc] border border-[#cbd5e1] px-3 py-2 text-xs text-[#07090e] font-mono"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#334155]">Live WhatsApp Jitter Scale (0.1–2)</span>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  max="2"
                  value={liveScale}
                  onChange={(e) => setLiveScale(Number(e.target.value))}
                  className="w-full rounded-lg bg-[#f8fafc] border border-[#cbd5e1] px-3 py-2 text-xs text-[#07090e] font-mono"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-[#334155]">Minimum Turn Gap (seconds)</span>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="30"
                  value={minTurnGap}
                  onChange={(e) => setMinTurnGap(Number(e.target.value))}
                  className="w-full rounded-lg bg-[#f8fafc] border border-[#cbd5e1] px-3 py-2 text-xs text-[#07090e] font-mono"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            {saveBanner ? (
              <span className="text-xs font-medium text-[#047857] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>{saveBanner}</span>
              </span>
            ) : (
              <span />
            )}

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-[#07090e] hover:bg-[#1e293b] text-white transition-colors"
            >
              <Save className="w-3.5 h-3.5 text-[#52B4FD]" />
              <span>{saving ? "Saving..." : "Save Runtime Settings"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
