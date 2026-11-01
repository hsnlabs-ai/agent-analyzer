"""Command-line entrypoint for Agent Analyzer ('agent-analyzer serve' & 'agent-analyzer scan')."""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

import uvicorn

from agent_analyzer.config import AnalyzerConfig
from agent_analyzer.inspector.models import ExportFormat
from agent_analyzer.server.app import create_app
from agent_analyzer.server.runtime import AnalyzerRuntimeManager


async def _run_cli_scan(args: argparse.Namespace) -> int:
    cfg = AnalyzerConfig.from_env(db_path_override=args.db_path)
    runtime = AnalyzerRuntimeManager(db_path=cfg.db_path, config=cfg)
    transport_mode = "LIVE_WHATSAPP" if args.mode.lower() == "live" else "SIMULATION"
    scan = runtime.store.create_scan(
        target_name=args.name,
        target_phone=args.target_phone,
        target_description="CLI automated 6-wave topology scan",
        transport_mode=transport_mode,
    )
    await runtime.start_or_run_scan(
        scan_id=scan.id,
        target_wave="ALL",
        reset_first=True,
        wait=True,
        fast_sim_override=(transport_mode == "SIMULATION"),
    )
    if args.export_dir:
        out_dir = Path(args.export_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        formats: list[ExportFormat] = ["python", "mermaid", "json", "markdown"]
        for fmt in formats:
            exported = runtime.build_export_payload(scan_id=scan.id, fmt=fmt)
            (out_dir / exported.filename).write_text(exported.content, encoding="utf-8")
        print(f"Exported 4 artifacts for scan '{scan.id}' to {out_dir.resolve()}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="agent-analyzer",
        description="Single-probe black-box conversational agent topology mapper (W0-W5) — by hsnlabs",
    )
    sub = parser.add_subparsers(dest="command")

    serve_p = sub.add_parser("serve", help="Start the Agent Analyzer FastAPI & Studio server (:8095)")
    serve_p.add_argument("--host", default="127.0.0.1", help="Bind host (default: 127.0.0.1)")
    serve_p.add_argument("--port", type=int, default=8095, help="Bind port (default: 8095)")
    serve_p.add_argument("--db-path", default="data/analyzer.sqlite3", help="SQLite WAL path")

    scan_p = sub.add_parser("scan", help="Run a headless 6-wave (W0..W5) scan and export all 4 formats")
    scan_p.add_argument(
        "--mode",
        choices=["simulated", "live"],
        default="simulated",
        help="Transport mode: simulated or live WhatsApp via WAHA",
    )
    scan_p.add_argument("--target-phone", default="+5511999990000", help="E.164 target phone number")
    scan_p.add_argument("--name", default="CLI Target Bot Scan", help="Display name for the scan")
    scan_p.add_argument("--db-path", default="data/analyzer.sqlite3", help="SQLite WAL path")
    scan_p.add_argument("--export-dir", default="./out", help="Directory to write exported files")

    parsed = parser.parse_args(argv)
    if parsed.command == "scan":
        return asyncio.run(_run_cli_scan(parsed))

    host = getattr(parsed, "host", "127.0.0.1")
    port = getattr(parsed, "port", 8095)
    db_path = getattr(parsed, "db_path", "data/analyzer.sqlite3")
    cfg = AnalyzerConfig.from_env(db_path_override=db_path)
    runtime = AnalyzerRuntimeManager(db_path=cfg.db_path, config=cfg)
    app = create_app(manager=runtime)
    uvicorn.run(app, host=host, port=port)
    return 0


if __name__ == "__main__":
    sys.exit(main())
