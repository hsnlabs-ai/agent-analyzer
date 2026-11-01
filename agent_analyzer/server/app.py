"""FastAPI Application, REST Endpoints, WebSocket (:8095) & Model A SPA Static Handler."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from agent_analyzer.bridge.whatsapp_client import WAHATransportError
from agent_analyzer.inspector.models import (
    AnalyzerSettingsUpdate,
    CreateScanRequest,
    ExportFormat,
    RunScanRequest,
)
from agent_analyzer.server.runtime import AnalyzerRuntimeManager


def create_app(
    manager: AnalyzerRuntimeManager | None = None,
    frontend_dist_dir: str | Path | None = None,
) -> FastAPI:
    """Create the standalone Agent Analyzer FastAPI application."""
    runtime = manager or AnalyzerRuntimeManager()
    default_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    dist_dir = Path(frontend_dist_dir) if frontend_dist_dir is not None else default_dist

    app = FastAPI(
        title="Agent Analyzer API",
        version="0.1.0",
        description="Single-probe black-box conversational agent topology mapper (W0-W5) — by hsnlabs",
    )
    app.state.manager = runtime

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/state")
    async def get_state(
        scan_id: str | None = Query(default=None),
        max_wave: int | None = Query(default=None, ge=0, le=5),
    ) -> Any:
        return runtime.build_snapshot(scan_id=scan_id, max_wave=max_wave)

    @app.get("/api/scans")
    async def list_scans() -> Any:
        return {"scans": runtime.store.list_scans()}

    @app.post("/api/scans")
    async def create_scan(req: CreateScanRequest) -> Any:
        try:
            scan = runtime.store.create_scan(
                target_name=req.target_name,
                target_phone=req.target_phone,
                target_description=req.target_description,
                transport_mode=req.transport_mode,
                waha_session=req.waha_session,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        return runtime.build_snapshot(scan_id=scan.id)

    @app.delete("/api/scans/{scan_id}")
    async def delete_scan(scan_id: str) -> Any:
        runtime.runner.stop_scan(scan_id)
        runtime.store.delete_scan(scan_id)
        return runtime.build_snapshot()

    @app.post("/api/scans/{scan_id}/run")
    async def run_scan(scan_id: str, req: RunScanRequest | None = None) -> Any:
        payload = req or RunScanRequest()
        scan = runtime.store.get_scan(scan_id)
        if scan is None:
            raise HTTPException(status_code=404, detail=f"Scan '{scan_id}' not found.")
        try:
            result = await runtime.start_or_run_scan(
                scan_id=scan_id,
                target_wave=payload.target_wave,
                reset_first=payload.reset_first,
                wait=payload.wait,
                fast_sim_override=payload.fast_sim_override,
            )
        except WAHATransportError as exc:
            raise HTTPException(
                status_code=503,
                detail={"error_code": exc.error_code, "message": exc.message},
            ) from exc
        return result

    @app.post("/api/scans/{scan_id}/stop")
    async def stop_scan(scan_id: str) -> Any:
        scan = runtime.store.get_scan(scan_id)
        if scan is None:
            raise HTTPException(status_code=404, detail=f"Scan '{scan_id}' not found.")
        runtime.runner.stop_scan(scan_id)
        updated = runtime.store.update_scan_state(
            scan_id, status="PAUSED", active_phase="IDLE"
        )
        return {"status": "PAUSED", "scan": updated}

    @app.post("/api/scans/{scan_id}/reset")
    async def reset_scan(scan_id: str) -> Any:
        scan = runtime.store.get_scan(scan_id)
        if scan is None:
            raise HTTPException(status_code=404, detail=f"Scan '{scan_id}' not found.")
        runtime.runner.stop_scan(scan_id)
        runtime.store.reset_scan_to_w0(scan_id)
        runtime.sim_transport.reset_thread(scan_id)
        return runtime.build_snapshot(scan_id=scan_id, max_wave=0)

    @app.get("/api/scans/{scan_id}/topology")
    async def get_scan_topology(
        scan_id: str,
        max_wave: int | None = Query(default=None, ge=0, le=5),
    ) -> Any:
        scan = runtime.store.get_scan(scan_id)
        if scan is None:
            raise HTTPException(status_code=404, detail=f"Scan '{scan_id}' not found.")
        return {
            "scan": scan,
            "topology": runtime.analyzer.build_topology_report(scan_id, max_wave=max_wave),
            "diagnostics": runtime.analyzer.build_diagnostic_report(scan_id, max_wave=max_wave),
            "turns": runtime.store.list_probe_turns(scan_id, max_wave=max_wave),
        }

    @app.get("/api/scans/{scan_id}/export/{fmt}")
    async def export_scan_artifact(
        scan_id: str,
        fmt: ExportFormat,
        max_wave: int | None = Query(default=None, ge=0, le=5),
    ) -> Any:
        try:
            return runtime.build_export_payload(scan_id=scan_id, fmt=fmt, max_wave=max_wave)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.get("/api/settings")
    async def get_settings() -> Any:
        return runtime.store.get_settings()

    @app.put("/api/settings")
    async def update_settings(req: AnalyzerSettingsUpdate) -> Any:
        updated = runtime.store.update_settings(req)
        runtime.sync_waha_client_from_settings()
        return updated

    @app.get("/api/waha/session")
    async def get_waha_session() -> Any:
        status = await runtime.waha_client.get_session_status()
        runtime._cached_waha_status = status
        return status

    @app.post("/api/waha/session/start")
    async def start_waha_session() -> Any:
        try:
            status = await runtime.waha_client.start_or_attach_session()
            runtime._cached_waha_status = status
            return status
        except WAHATransportError as exc:
            raise HTTPException(
                status_code=503,
                detail={"error_code": exc.error_code, "message": exc.message},
            ) from exc

    @app.get("/api/waha/qr")
    async def get_waha_qr() -> Any:
        try:
            return await runtime.waha_client.get_qr_base64()
        except WAHATransportError as exc:
            raise HTTPException(
                status_code=503,
                detail={"error_code": exc.error_code, "message": exc.message},
            ) from exc

    @app.post("/api/waha/session/logout")
    async def logout_waha_session() -> Any:
        status = await runtime.waha_client.logout_session()
        runtime._cached_waha_status = status
        return status

    @app.websocket("/ws/analyzer")
    async def analyzer_websocket(ws: WebSocket) -> None:
        await runtime.register_ws(ws)
        try:
            initial = runtime.build_snapshot()
            await ws.send_json(
                {
                    "type": "snapshot",
                    "scan_id": initial.active_scan.id,
                    "payload": initial.model_dump(),
                }
            )
            while True:
                msg = await ws.receive_text()
                if msg == "ping":
                    await ws.send_json({"type": "pong", "scan_id": initial.active_scan.id, "payload": {}})
        except WebSocketDisconnect:
            pass
        except Exception:
            pass
        finally:
            runtime.unregister_ws(ws)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> Any:
        """Model A path-traversal-guarded SPA static & deep-link responder."""
        if full_path == "api" or full_path.startswith("api/") or full_path.startswith("ws/"):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})

        raw_segments = [seg for seg in full_path.replace("\\", "/").split("/") if seg]
        if any(seg in ("..", ".") for seg in raw_segments):
            return JSONResponse(status_code=400, content={"detail": "Invalid path"})

        if dist_dir.is_dir():
            resolved_root = dist_dir.resolve()
            if raw_segments:
                candidate = (resolved_root / "/".join(raw_segments)).resolve()
                try:
                    candidate.relative_to(resolved_root)
                except ValueError:
                    return JSONResponse(status_code=400, content={"detail": "Invalid path"})
                if candidate.is_file():
                    return FileResponse(candidate)
                if raw_segments[0] == "assets" or "." in raw_segments[-1]:
                    return JSONResponse(status_code=404, content={"detail": "Asset not found"})

            index_file = resolved_root / "index.html"
            if index_file.is_file():
                return FileResponse(index_file)

        return JSONResponse(
            status_code=200,
            content={
                "app": "agent-analyzer",
                "route": f"/{full_path}",
                "message": "Frontend bundle not built yet. Run 'npm --prefix frontend run build'.",
            },
        )

    return app
