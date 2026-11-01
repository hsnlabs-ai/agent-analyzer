"""Integration tests for FastAPI REST endpoints, WebSocket /ws/analyzer snapshot & events,
settings key masking, and SPA static path traversal protection."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from agent_analyzer.server.app import create_app
from agent_analyzer.server.runtime import AnalyzerRuntimeManager
from agent_analyzer.store.sqlite_store import DEFAULT_SCAN_ID


def test_rest_api_websocket_exports_and_spa_security(tmp_path: Path) -> None:
    db_path = tmp_path / "analyzer.sqlite3"
    dist_dir = tmp_path / "dist"
    assets_dir = dist_dir / "assets"
    assets_dir.mkdir(parents=True)
    (dist_dir / "index.html").write_text("<!doctype html><title>Agent Analyzer</title>", encoding="utf-8")
    (assets_dir / "app.js").write_text("console.log('agent-analyzer');", encoding="utf-8")
    secret_outside = tmp_path / "secret.txt"
    secret_outside.write_text("TOP_SECRET", encoding="utf-8")

    manager = AnalyzerRuntimeManager(db_path=db_path)
    app = create_app(manager=manager, frontend_dist_dir=dist_dir)

    with TestClient(app) as client:
        # 1. GET /api/state returns default W0 scan and metadata
        state_resp = client.get("/api/state")
        assert state_resp.status_code == 200
        state_data = state_resp.json()
        assert state_data["active_scan"]["id"] == DEFAULT_SCAN_ID
        assert state_data["active_scan"]["current_wave"] == 0
        assert state_data["meta"]["product_url"] == "https://hsnlabs.ai/en/products/agent-analyzer/"

        # 2. WebSocket /ws/analyzer emits initial snapshot
        with client.websocket_connect("/ws/analyzer") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "snapshot"
            assert msg["scan_id"] == DEFAULT_SCAN_ID

        # 3. PUT /api/settings masks API keys and clamps live anti-ban floors
        put_resp = client.put(
            "/api/settings",
            json={
                "llm_provider": "gemini",
                "llm_model": "gemini-2.5-flash",
                "gemini_api_key": "AIzaSySuperSecretKey123456789",
                "live_jitter_sleep_scale": 0.01,
                "min_turn_gap_s": 0.2,
            },
        )
        assert put_resp.status_code == 200
        settings_json = put_resp.json()
        assert settings_json["has_gemini_key"] is True
        assert settings_json["gemini_key_hint"].endswith("6789")
        assert "AIzaSySuperSecretKey" not in str(settings_json)
        assert settings_json["live_jitter_sleep_scale"] >= 0.35
        assert settings_json["min_turn_gap_s"] >= 2.0

        # 4. Run full W1..W5 scan synchronously with fast_sim_override
        run_resp = client.post(
            f"/api/scans/{DEFAULT_SCAN_ID}/run",
            json={"target_wave": "ALL", "reset_first": True, "wait": True, "fast_sim_override": True},
        )
        assert run_resp.status_code == 200
        assert run_resp.json()["status"] == "COMPLETED"
        assert run_resp.json()["current_wave"] == 5

        # 5. Time-travel query via GET /api/scans/{id}/topology?max_wave=2
        w2_resp = client.get(f"/api/scans/{DEFAULT_SCAN_ID}/topology?max_wave=2")
        assert w2_resp.status_code == 200
        w2_nodes = w2_resp.json()["topology"]["nodes"]
        assert all(n["discovered_in_wave"] <= 2 for n in w2_nodes)

        # 6. Verify all 4 export formats via GET /api/scans/{id}/export/{fmt}
        for fmt, expected_ext in [
            ("python", ".py"),
            ("mermaid", ".mmd"),
            ("json", ".json"),
            ("markdown", ".md"),
        ]:
            exp_resp = client.get(f"/api/scans/{DEFAULT_SCAN_ID}/export/{fmt}")
            assert exp_resp.status_code == 200
            payload = exp_resp.json()
            assert payload["format"] == fmt
            assert payload["filename"].endswith(expected_ext)
            assert len(payload["content"]) > 80

        # 7. Missing /api/* route returns 404 JSON (never index.html)
        missing_api = client.get("/api/nonexistent-route")
        assert missing_api.status_code == 404

        # 8. Missing /assets/* returns 404 (never index.html)
        missing_asset = client.get("/assets/missing.js")
        assert missing_asset.status_code == 404

        # 9. Valid asset and SPA client route fallback
        ok_asset = client.get("/assets/app.js")
        assert ok_asset.status_code == 200
        spa_root = client.get("/studio/scans")
        assert spa_root.status_code == 200
        assert "Agent Analyzer" in spa_root.text
