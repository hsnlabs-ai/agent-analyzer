import { useEffect, useState } from "react";
import type { AnalyzerSnapshotResponse, ProbeTurn } from "../types/analyzer";

export interface AnalyzerSocketEvent {
  type: "snapshot" | "turn_recorded" | "wave_updated" | "probe_phase" | "scan_error" | "pong";
  scan_id: string;
  payload: Record<string, unknown>;
}

interface UseAnalyzerSocketOptions {
  activeScanId: string;
  onSnapshot: (snapshot: AnalyzerSnapshotResponse) => void;
  onTurnRecorded: (scanId: string, turn: ProbeTurn, waveIndex: number) => void;
  onWaveUpdated: (scanId: string, currentWave: number, status: string) => void;
  onProbePhase: (scanId: string, activePhase: string, durationMs: number) => void;
  onScanError: (scanId: string, errorCode: string, errorMessage: string) => void;
}

export function useAnalyzerSocket({
  activeScanId,
  onSnapshot,
  onTurnRecorded,
  onWaveUpdated,
  onProbePhase,
  onScanError,
}: UseAnalyzerSocketOptions): { wsConnected: boolean } {
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/analyzer`;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        if (!disposed) setWsConnected(true);
      };

      socket.onmessage = (event) => {
        if (disposed) return;
        try {
          const msg = JSON.parse(event.data) as AnalyzerSocketEvent;
          if (msg.type === "snapshot" && msg.payload) {
            onSnapshot(msg.payload as unknown as AnalyzerSnapshotResponse);
          } else if (msg.type === "turn_recorded" && msg.payload?.turn) {
            onTurnRecorded(
              msg.scan_id,
              msg.payload.turn as ProbeTurn,
              Number(msg.payload.wave_index ?? 1)
            );
          } else if (msg.type === "wave_updated") {
            onWaveUpdated(
              msg.scan_id,
              Number(msg.payload?.current_wave ?? 0),
              String(msg.payload?.status ?? "RUNNING")
            );
          } else if (msg.type === "probe_phase") {
            onProbePhase(
              msg.scan_id,
              String(msg.payload?.active_phase ?? "IDLE"),
              Number(msg.payload?.duration_ms ?? 0)
            );
          } else if (msg.type === "scan_error") {
            onScanError(
              msg.scan_id,
              String(msg.payload?.error_code ?? "RUNNER_ERROR"),
              String(msg.payload?.error_message ?? "Unknown transport error")
            );
          }
        } catch {
          // Ignore malformed frame
        }
      };

      socket.onclose = () => {
        if (!disposed) {
          setWsConnected(false);
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [activeScanId, onSnapshot, onTurnRecorded, onWaveUpdated, onProbePhase, onScanError]);

  return { wsConnected };
}
