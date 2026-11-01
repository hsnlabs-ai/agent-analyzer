import React, { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Download, FileCode2, FileJson, FileText, GitBranch, X } from "lucide-react";
import type { ExportFormat, ExportPayloadResponse } from "../types/analyzer";

interface ExportModalProps {
  scanId: string;
  targetName: string;
  isOpen: boolean;
  initialFormat: ExportFormat;
  maxWave?: number | null;
  onClose: () => void;
}

const FORMAT_META: Record<
  ExportFormat,
  { label: string; filename: string; mime: string; icon: React.ReactNode }
> = {
  python: {
    label: "LangGraph Python (.py)",
    filename: "langgraph_skeleton.py",
    mime: "text/x-python",
    icon: <FileCode2 className="w-4 h-4 text-cyan-400" />,
  },
  mermaid: {
    label: "Mermaid Diagram (.mmd)",
    filename: "topology.mmd",
    mime: "text/plain",
    icon: <GitBranch className="w-4 h-4 text-purple-400" />,
  },
  json: {
    label: "Topology JSON (.json)",
    filename: "topology.json",
    mime: "application/json",
    icon: <FileJson className="w-4 h-4 text-amber-400" />,
  },
  markdown: {
    label: "Diagnostic Report (.md)",
    filename: "diagnostic_report.md",
    mime: "text/markdown",
    icon: <FileText className="w-4 h-4 text-emerald-400" />,
  },
};

export const ExportModal: React.FC<ExportModalProps> = ({
  scanId,
  targetName,
  isOpen,
  initialFormat,
  maxWave,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [activeFormat, setActiveFormat] = useState<ExportFormat>(initialFormat);
  const [content, setContent] = useState<string>("");
  const [filename, setFilename] = useState<string>(FORMAT_META[initialFormat].filename);
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    setActiveFormat(initialFormat);
  }, [initialFormat]);

  // Native <dialog> open/close synchronization + fallback light-dismiss per Modern Web Guidance
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleNativeClose = () => {
      onClose();
    };
    dialog.addEventListener("close", handleNativeClose);

    // Fallback for browsers that do not yet support closedby="any"
    const handleBackdropClick = (event: MouseEvent) => {
      if ("closedBy" in HTMLDialogElement.prototype) return;
      const rect = dialog.getBoundingClientRect();
      const isInDialog =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!isInDialog) {
        dialog.close();
      }
    };
    dialog.addEventListener("click", handleBackdropClick);

    return () => {
      dialog.removeEventListener("close", handleNativeClose);
      dialog.removeEventListener("click", handleBackdropClick);
    };
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !scanId) return;
    let cancelled = false;
    setLoading(true);
    const waveQuery = maxWave !== null && maxWave !== undefined ? `?max_wave=${maxWave}` : "";
    fetch(`/api/scans/${scanId}/export/${activeFormat}${waveQuery}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ExportPayloadResponse;
      })
      .then((payload) => {
        if (!cancelled) {
          setContent(payload.content);
          setFilename(payload.filename || FORMAT_META[activeFormat].filename);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setContent(`# Error loading export: ${String(err)}`);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, scanId, activeFormat, maxWave]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const meta = FORMAT_META[activeFormat];
    const blob = new Blob([content], { type: meta.mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename || `${scanId}_${meta.filename}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <dialog
      ref={dialogRef}
      closedby="any"
      aria-labelledby={titleId}
      className="backdrop:bg-slate-950/80 bg-slate-900 text-slate-100 border border-slate-700/80 rounded-xl shadow-2xl w-[min(92vw,960px)] max-h-[86vh] p-0 overflow-hidden m-auto"
    >
      <div className="flex flex-col h-[80vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/70">
          <div>
            <h2 id={titleId} className="text-sm font-semibold text-slate-100 tracking-wide">
              Export Reconstructed Architecture — {targetName}
            </h2>
            <p className="text-xs text-slate-400">
              Deliverables synthesized from W0–W5 sequential probe telemetry and Two-Pass Replay
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            aria-label="Close export modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-800 bg-slate-900/90 gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {(Object.keys(FORMAT_META) as ExportFormat[]).map((fmt) => {
              const meta = FORMAT_META[fmt];
              const isSelected = activeFormat === fmt;
              return (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setActiveFormat(fmt)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/40"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent"
                  }`}
                >
                  {meta.icon}
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download {filename}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-xs leading-relaxed text-slate-200">
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-400">
              Synthesizing export artifact...
            </div>
          ) : (
            <pre className="whitespace-pre-wrap break-words">{content}</pre>
          )}
        </div>
      </div>
    </dialog>
  );
};
