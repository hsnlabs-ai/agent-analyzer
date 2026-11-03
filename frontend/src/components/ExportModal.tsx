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
    icon: <FileCode2 className="w-4 h-4 text-[#0284c7]" />,
  },
  mermaid: {
    label: "Mermaid Diagram (.mmd)",
    filename: "topology.mmd",
    mime: "text/plain",
    icon: <GitBranch className="w-4 h-4 text-[#7c3aed]" />,
  },
  json: {
    label: "Topology JSON (.json)",
    filename: "topology.json",
    mime: "application/json",
    icon: <FileJson className="w-4 h-4 text-[#d97706]" />,
  },
  markdown: {
    label: "Diagnostic Report (.md)",
    filename: "diagnostic_report.md",
    mime: "text/markdown",
    icon: <FileText className="w-4 h-4 text-[#059669]" />,
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
      className="backdrop:bg-black/35 bg-white text-[#07090e] border border-[#cbd5e1] rounded-2xl shadow-2xl w-[min(92vw,960px)] max-h-[86vh] p-0 overflow-hidden m-auto"
    >
      <div className="flex flex-col h-[80vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
          <div>
            <h2 id={titleId} className="text-sm font-bold text-[#07090e] tracking-wide">
              Export Reconstructed Architecture — {targetName}
            </h2>
            <p className="text-xs text-[#64748b]">
              Deliverables synthesized from W0–W5 sequential probe telemetry and Two-Pass Replay
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="p-1.5 rounded-lg text-[#64748b] hover:text-[#07090e] hover:bg-[#e2e8f0]/60 transition-colors"
            aria-label="Close export modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between px-5 py-2.5 border-b border-[#e2e8f0] bg-white gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {(Object.keys(FORMAT_META) as ExportFormat[]).map((fmt) => {
              const meta = FORMAT_META[fmt];
              const isSelected = activeFormat === fmt;
              return (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setActiveFormat(fmt)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isSelected
                      ? "bg-[#f0f9ff] text-[#0284c7] border border-[#bae6fd]"
                      : "text-[#475569] hover:text-[#07090e] hover:bg-[#f8fafc] border border-transparent"
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-[#f8fafc] text-[#334155] border border-[#cbd5e1] transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-[#059669]" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#07090e] hover:bg-[#1e293b] text-white transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#52B4FD]" />
              <span>Download {filename}</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 bg-[#f8fafc] font-mono text-xs leading-relaxed text-[#07090e]">
          {loading ? (
            <div className="flex items-center justify-center h-full text-[#64748b]">
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
