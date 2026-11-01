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
  IDLE: { label: "Idle / Ready", color: "text-slate-400 bg-slate-800/80 border-slate-700" },
  STARTING_WAVE: {
    label: "Initializing Wave...",
    color: "text-cyan-300 bg-cyan-500/15 border-cyan-500/40",
  },
  READING_PREV_REPLY: {
    label: "Reading Target Reply (Human Jitter)",
    color: "text-sky-300 bg-sky-500/15 border-sky-500/40",
  },
  THINKING_PAUSE: {
    label: "Cognitive Pause (Log-Normal Jitter)",
    color: "text-purple-300 bg-purple-500/15 border-purple-500/40",
  },
  TYPING_COMPOSITION: {
    label: "Composing Probe Message...",
    color: "text-amber-300 bg-amber-500/15 border-amber-500/40",
  },
  WAITING_TARGET_REPLY: {
    label: "Awaiting Target Bot Response...",
    color: "text-emerald-300 bg-emerald-500/15 border-emerald-500/40",
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
    <div className="flex flex-col h-full bg-slate-950/90 border border-slate-800/90 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/75">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            Single-Probe WhatsApp Transcript (N = 1)
          </span>
        </div>
        <div
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono border ${phaseMeta.color}`}
        >
          <Radio className="w-3 h-3 animate-pulse" />
          <span>{phaseMeta.label}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
        {turns.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 py-8 px-4">
            <Timer className="w-7 h-7 text-slate-600 mb-2" />
            <p className="text-xs font-medium text-slate-300">
              No probe turns executed yet (Wave W0 Surface Baseline)
            </p>
            <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
              Click <span className="text-cyan-400 font-semibold">Run Full W1–W5 Scan</span> or trigger individual waves to watch the single-session probe map the target bot.
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
                    ? "bg-cyan-950/30 border-cyan-500/60"
                    : "bg-slate-900/60 border-slate-800/90 hover:border-slate-700"
                }`}
              >
                {/* Turn Header */}
                <div className="flex items-center justify-between text-[11px] font-mono mb-2 flex-wrap gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 font-bold">
                      W{turn.wave_index} · P{turn.pass_index} · #{turn.turn_index}
                    </span>
                    <span className="text-slate-300 font-semibold">{turn.probe_category}</span>
                    {turn.inferred_node_id && (
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">
                        → {turn.inferred_node_id}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span title="Human pacing delay before sending">
                      Jitter: {(totalJitterMs / 1000).toFixed(1)}s
                    </span>
                    <span>·</span>
                    <span className="text-amber-300" title="Net inference latency (RTT - 2*WS_Ping)">
                      <Clock className="w-3 h-3 inline mr-0.5" />
                      {Math.round(turn.net_inference_ms)}ms net
                    </span>
                    <span>·</span>
                    <span className="text-purple-300">{turn.tokens_per_sec.toFixed(1)} tok/s</span>
                  </div>
                </div>

                {/* Outbound Probe Bubble */}
                <div className="mb-2 pl-2 border-l-2 border-cyan-500/50">
                  <div className="text-[10px] uppercase tracking-wider text-cyan-400 font-semibold">
                    Outbound Probe Prompt
                  </div>
                  <p className="text-xs text-slate-200 mt-0.5">{turn.prompt_text}</p>
                </div>

                {/* Inbound Target Bot Reply */}
                <div className="pl-2 border-l-2 border-emerald-500/50 bg-slate-950/60 p-2 rounded-r-lg">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
                    <span>Target Bot Reply ({turn.delivery_status})</span>
                    <span className="font-mono text-slate-400">
                      RTT {Math.round(turn.raw_rtt_ms)}ms (ping {Math.round(turn.ws_ping_ms)}ms)
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-0.5 whitespace-pre-wrap">
                    {turn.response_text}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-2 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Rate-Limit Guard: Single Sequential Session · Log-Normal Human Pacing</span>
        </span>
        <span className="font-mono">{turns.length} turns recorded</span>
      </div>
    </div>
  );
};
