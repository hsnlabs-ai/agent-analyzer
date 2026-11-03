import React from "react";
import { Clock, MessageSquare, Radio, ShieldCheck, Timer } from "lucide-react";
import type { ProbeTurn } from "../types/analyzer";

interface LiveProbeTranscriptProps {
  turns: ProbeTurn[];
  currentPhase: string;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

const PHASE_BADGE: Record<string, { label: string; color: string }> = {
  IDLE: { label: "Idle / Ready", color: "text-[#475569] bg-white border-[#cbd5e1]" },
  STARTING_WAVE: {
    label: "Initializing Wave...",
    color: "text-[#0284c7] bg-[#f0f9ff] border-[#bae6fd]",
  },
  READING_PREV_REPLY: {
    label: "Reading Target Reply (Human Jitter)",
    color: "text-[#0284c7] bg-[#f0f9ff] border-[#bae6fd]",
  },
  THINKING_PAUSE: {
    label: "Cognitive Pause (Log-Normal Jitter)",
    color: "text-[#6d28d9] bg-[#f5f3ff] border-[#ddd6fe]",
  },
  TYPING_COMPOSITION: {
    label: "Composing Probe Message...",
    color: "text-[#b45309] bg-[#fffbeb] border-[#fde68a]",
  },
  WAITING_TARGET_REPLY: {
    label: "Awaiting Target Bot Response...",
    color: "text-[#047857] bg-[#ecfdf5] border-[#a7f3d0]",
  },
};

export const LiveProbeTranscript: React.FC<LiveProbeTranscriptProps> = ({
  turns,
  currentPhase,
  selectedNodeId,
  onSelectNode,
}) => {
  const phaseMeta = PHASE_BADGE[currentPhase] ?? PHASE_BADGE.IDLE;

  return (
    <div className="flex flex-col h-full bg-white border border-[#e2e8f0] rounded-2xl shadow-2xs overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc]">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#0284c7]" />
          <span className="text-xs font-bold uppercase tracking-wider text-[#07090e]">
            Single-Probe WhatsApp Transcript (N = 1)
          </span>
        </div>
        <div
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${phaseMeta.color}`}
        >
          <Radio className="w-3 h-3 animate-pulse" />
          <span>{phaseMeta.label}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 bg-[#fcfcfc]">
        {turns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-[#64748b] py-8 px-4">
            <Timer className="w-7 h-7 text-[#94a3b8] mb-2" />
            <p className="text-xs font-semibold text-[#334155]">
              No probe turns executed yet (Wave W0 Surface Baseline)
            </p>
            <p className="text-[11px] text-[#64748b] mt-1 max-w-sm">
              Click <span className="text-[#0284c7] font-semibold">Run Full W1–W5 Scan</span> or trigger individual waves to watch the single-session probe map the target bot.
            </p>
          </div>
        ) : (
          turns.map((turn) => {
            const isHighlighted =
              selectedNodeId !== null && turn.inferred_node_id === selectedNodeId;
            const totalJitterMs =
              (turn.jitter_phase_ms?.reading_ms ?? 0) +
              (turn.jitter_phase_ms?.thinking_ms ?? 0) +
              (turn.jitter_phase_ms?.typing_ms ?? 0);

            return (
              <div
                key={turn.id}
                onClick={() => turn.inferred_node_id && onSelectNode(turn.inferred_node_id)}
                className={`rounded-xl p-3 border transition-all cursor-pointer ${
                  isHighlighted
                    ? "bg-[#f0f9ff]/60 border-[#52B4FD] shadow-2xs"
                    : "bg-white border-[#e2e8f0] hover:border-[#cbd5e1]"
                }`}
              >
                {/* Turn Header */}
                <div className="flex items-center justify-between text-[11px] font-mono mb-2 flex-wrap gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-[#f0f9ff] text-[#0284c7] border border-[#bae6fd] font-bold">
                      W{turn.wave_index} · P{turn.pass_index} · #{turn.turn_index}
                    </span>
                    <span className="text-[#07090e] font-semibold">{turn.probe_category}</span>
                    {turn.inferred_node_id && (
                      <span className="px-1.5 py-0.5 rounded bg-[#ecfdf5] text-[#047857] border border-[#a7f3d0] font-semibold">
                        → {turn.inferred_node_id}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[#64748b]">
                    <span title="Human pacing delay before sending">
                      Jitter: {(totalJitterMs / 1000).toFixed(1)}s
                    </span>
                    <span>·</span>
                    <span className="text-[#b45309] font-semibold" title="Net inference latency (RTT - 2*WS_Ping)">
                      <Clock className="w-3 h-3 inline mr-0.5" />
                      {Math.round(turn.net_inference_ms)}ms net
                    </span>
                    <span>·</span>
                    <span className="text-[#6d28d9] font-semibold">{turn.tokens_per_sec.toFixed(1)} tok/s</span>
                  </div>
                </div>

                {/* Outbound Probe Bubble */}
                <div className="mb-2 pl-2.5 border-l-2 border-[#52B4FD]">
                  <div className="text-[10px] uppercase tracking-wider text-[#0284c7] font-bold">
                    Outbound Probe Prompt
                  </div>
                  <p className="text-xs text-[#07090e] mt-0.5">{turn.prompt_text}</p>
                </div>

                {/* Inbound Target Bot Reply */}
                <div className="pl-2.5 border-l-2 border-[#10b981] bg-[#f8fafc] p-2 rounded-r-lg border-y border-r border-y-[#e2e8f0] border-r-[#e2e8f0]">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[#047857] font-bold">
                    <span>Target Bot Reply ({turn.delivery_status})</span>
                    <span className="font-mono text-[#64748b]">
                      RTT {Math.round(turn.raw_rtt_ms)}ms (ping {Math.round(turn.ws_ping_ms)}ms)
                    </span>
                  </div>
                  <p className="text-xs text-[#334155] mt-0.5 whitespace-pre-wrap">
                    {turn.response_text}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-2 border-t border-[#e2e8f0] bg-[#f8fafc] flex items-center justify-between text-[11px] text-[#64748b]">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-[#059669]" />
          <span>Rate-Limit Guard: Single Sequential Session · Log-Normal Human Pacing</span>
        </span>
        <span className="font-mono font-medium">{turns.length} turns recorded</span>
      </div>
    </div>
  );
};
