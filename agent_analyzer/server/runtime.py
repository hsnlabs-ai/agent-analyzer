"""Application lifecycle and WebSocket broadcast manager for Agent Analyzer."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Literal

from fastapi import WebSocket

from agent_analyzer import __org_url__, __product_url__, __repo_url__, __version__
from agent_analyzer.bridge.whatsapp_client import (
    SimulatedTargetTransport,
    WAHAWhatsAppClient,
)
from agent_analyzer.config import AnalyzerConfig
from agent_analyzer.inspector.analyzer import TopologyAnalyzer
from agent_analyzer.inspector.exporters import (
    export_langgraph_python,
    export_markdown_report,
    export_mermaid,
    export_topology_json,
)
from agent_analyzer.inspector.models import (
    AnalyzerSnapshotResponse,
    ExportFormat,
    ExportPayloadResponse,
    WAHASessionStatus,
)
from agent_analyzer.runner.jitter import HumanJitterEngine
from agent_analyzer.runner.wave_runner import WaveProtocolRunner
from agent_analyzer.store.sqlite_store import DEFAULT_SCAN_ID, AnalyzerSQLiteStore


class AnalyzerRuntimeManager:
    """Coordinates SQLite persistence, WAHA transport, 6-wave runner, and WebSocket fan-out."""

    def __init__(
        self,
        db_path: str | Path | None = None,
        config: AnalyzerConfig | None = None,
        waha_client: WAHAWhatsAppClient | None = None,
        sim_transport: SimulatedTargetTransport | None = None,
    ) -> None:
        self.config = config or AnalyzerConfig.from_env(db_path_override=db_path)
        self.store = AnalyzerSQLiteStore(db_path=self.config.db_path, config=self.config)
        self.analyzer = TopologyAnalyzer(self.store)
        raw_settings = self.store.get_raw_settings_dict()
        self.waha_client = waha_client or WAHAWhatsAppClient(
            base_url=raw_settings.get("waha_base_url", self.config.waha_base_url),
            session_name=raw_settings.get("waha_session_name", self.config.waha_session_name),
            api_key=raw_settings.get("waha_api_key", self.config.waha_api_key),
        )
        self.sim_transport = sim_transport or SimulatedTargetTransport()
        self.jitter_engine = HumanJitterEngine()
        self.runner = WaveProtocolRunner(
            store=self.store,
            analyzer=self.analyzer,
            waha_client=self.waha_client,
            sim_transport=self.sim_transport,
            jitter_engine=self.jitter_engine,
            broadcaster=self.broadcast_event,
        )
        self._ws_clients: set[WebSocket] = set()
        self._active_tasks: dict[str, asyncio.Task[Any]] = {}
        self._cached_waha_status = WAHASessionStatus(
            session_name=self.waha_client.session_name,
            base_url=self.waha_client.base_url,
            reachable=False,
            status="OFFLINE",
            ws_ping_ms=0,
            message="WAHA status not probed yet.",
        )

    def sync_waha_client_from_settings(self) -> None:
        raw = self.store.get_raw_settings_dict()
        self.waha_client.base_url = raw.get("waha_base_url", self.config.waha_base_url).rstrip("/")
        self.waha_client.session_name = raw.get("waha_session_name", "default") or "default"
        self.waha_client.api_key = raw.get("waha_api_key", "")

    async def register_ws(self, ws: WebSocket) -> None:
        await ws.accept()
        self._ws_clients.add(ws)

    def unregister_ws(self, ws: WebSocket) -> None:
        self._ws_clients.discard(ws)

    async def broadcast_event(
        self, event_type: str, scan_id: str, payload: dict[str, Any]
    ) -> None:
        if not self._ws_clients:
            return
        envelope = {
            "type": event_type,
            "scan_id": scan_id,
            "payload": payload,
        }
        stale: list[WebSocket] = []
        for ws in list(self._ws_clients):
            try:
                await ws.send_json(envelope)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self._ws_clients.discard(ws)

    def build_snapshot(
        self,
        scan_id: str | None = None,
        max_wave: int | None = None,
    ) -> AnalyzerSnapshotResponse:
        scans = self.store.list_scans()
        if not scans:
            default_scan = self.store.ensure_default_scan()
            scans = [default_scan]

        target_id = scan_id or scans[0].id
        active_scan = self.store.get_scan(target_id) or scans[0]
        topology = self.analyzer.build_topology_report(active_scan.id, max_wave=max_wave)
        diagnostics = self.analyzer.build_diagnostic_report(active_scan.id, max_wave=max_wave)
        turns = self.store.list_probe_turns(active_scan.id, max_wave=max_wave)
        settings = self.store.get_settings()

        return AnalyzerSnapshotResponse(
            scans=scans,
            active_scan=active_scan,
            topology=topology,
            diagnostics=diagnostics,
            turns=turns,
            waha=self._cached_waha_status,
            settings=settings,
            meta={
                "version": __version__,
                "product_url": __product_url__,
                "organization_url": __org_url__,
                "repository_url": __repo_url__,
            },
        )

    def build_export_payload(
        self,
        scan_id: str,
        fmt: ExportFormat,
        max_wave: int | None = None,
    ) -> ExportPayloadResponse:
        scan = self.store.get_scan(scan_id)
        if scan is None:
            raise KeyError(f"Scan '{scan_id}' not found.")
        report = self.analyzer.build_topology_report(scan_id, max_wave=max_wave)
        diagnostics = self.analyzer.build_diagnostic_report(scan_id, max_wave=max_wave)
        turns = self.store.list_probe_turns(scan_id, max_wave=max_wave)

        if fmt == "python":
            content = export_langgraph_python(report, diagnostics)
            filename = "langgraph_skeleton.py"
            mime = "text/x-python"
        elif fmt == "mermaid":
            content = export_mermaid(report)
            filename = "topology.mmd"
            mime = "text/plain"
        elif fmt == "json":
            content = export_topology_json(report, diagnostics, turns)
            filename = "topology.json"
            mime = "application/json"
        elif fmt == "markdown":
            content = export_markdown_report(report, diagnostics)
            filename = "diagnostic_report.md"
            mime = "text/markdown"
        else:
            raise ValueError(f"Unsupported export format '{fmt}'.")

        return ExportPayloadResponse(
            scan_id=scan_id,
            format=fmt,
            filename=filename,
            mime_type=mime,
            content=content,
        )

    async def start_or_run_scan(
        self,
        scan_id: str,
        target_wave: int | Literal["ALL"] = "ALL",
        reset_first: bool = False,
        wait: bool = False,
        fast_sim_override: bool = False,
    ) -> dict[str, Any]:
        scan = self.store.get_scan(scan_id)
        if scan is None:
            raise KeyError(f"Scan '{scan_id}' not found.")

        existing_task = self._active_tasks.get(scan_id)
        if existing_task and not existing_task.done():
            if wait:
                await existing_task
            return {"status": "RUNNING", "scan_id": scan_id}

        if wait:
            await self.runner.run_scan(
                scan_id=scan_id,
                target_wave=target_wave,
                reset_first=reset_first,
                fast_sim_override=fast_sim_override,
            )
            updated = self.store.get_scan(scan_id)
            return {
                "status": updated.status if updated else "COMPLETED",
                "scan_id": scan_id,
                "current_wave": updated.current_wave if updated else 5,
            }

        async def _bg() -> None:
            try:
                await self.runner.run_scan(
                    scan_id=scan_id,
                    target_wave=target_wave,
                    reset_first=reset_first,
                    fast_sim_override=fast_sim_override,
                )
            except Exception:
                pass
            finally:
                snap = self.build_snapshot(scan_id=scan_id)
                await self.broadcast_event("snapshot", scan_id, snap.model_dump())

        task = asyncio.create_task(_bg())
        self._active_tasks[scan_id] = task
        return {"status": "RUNNING", "scan_id": scan_id, "target_wave": target_wave}
