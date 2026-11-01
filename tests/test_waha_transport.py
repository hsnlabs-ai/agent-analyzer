"""Unit tests for WAHA single-session WhatsApp transport, E.164 normalization,
non-destructive session attach, and anti-ban jitter floor enforcement."""

from __future__ import annotations

import httpx
import pytest

from agent_analyzer.bridge.whatsapp_client import WAHATransportError, WAHAWhatsAppClient
from agent_analyzer.config import normalize_e164_phone, phone_to_waha_chat_id
from agent_analyzer.runner.jitter import HumanJitterEngine


def test_e164_phone_and_waha_chat_id_conversion() -> None:
    assert normalize_e164_phone("+55 (11) 98765-4321") == "+5511987654321"
    assert phone_to_waha_chat_id("+55 (11) 98765-4321") == "5511987654321@c.us"
    with pytest.raises(ValueError):
        normalize_e164_phone("123")


def test_live_whatsapp_jitter_enforces_2000ms_anti_ban_floor() -> None:
    jitter = HumanJitterEngine()
    # Even if a caller passes live_scale=0.0 and min_turn_gap_s=0.1,
    # LIVE_WHATSAPP mode must enforce >= 2000ms total delay.
    delays = jitter.compute_turn_delays(
        prev_reply_text="Oi",
        next_prompt_text="Oi",
        transport_mode="LIVE_WHATSAPP",
        sim_scale=0.0,
        live_scale=0.0,
        min_turn_gap_s=0.1,
    )
    assert delays.total_ms >= 2000
    assert (
        delays.generating_ms + delays.reading_ms + delays.thinking_ms + delays.typing_ms
        == delays.total_ms
    )


async def test_waha_non_destructive_attach_when_working() -> None:
    calls: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.method, request.url.path))
        if request.method == "GET" and request.url.path == "/api/sessions/default":
            return httpx.Response(
                200,
                json={"name": "default", "status": "WORKING", "me": {"id": "5511999990000@c.us"}},
            )
        return httpx.Response(500, json={"error": "Unexpected destructive call"})

    mock_http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = WAHAWhatsAppClient(
        base_url="http://localhost:3001",
        session_name="default",
        http_client=mock_http,
    )
    status = await client.start_or_attach_session()
    assert status.status == "WORKING"
    assert status.reachable is True
    assert status.connected_phone == "5511999990000@c.us"
    # Must only perform GET /api/sessions/default — never logout/stop/delete
    assert calls == [("GET", "/api/sessions/default")]
    await mock_http.aclose()


async def test_waha_send_and_receive_fast_poll_and_offline_error() -> None:
    poll_count = 0

    def working_handler(request: httpx.Request) -> httpx.Response:
        nonlocal poll_count
        if request.method == "GET" and request.url.path == "/api/sessions/default":
            return httpx.Response(200, json={"name": "default", "status": "WORKING"})
        if request.method == "POST" and request.url.path == "/api/sendText":
            return httpx.Response(201, json={"id": "msg_out_1"})
        if request.method == "GET" and request.url.path.endswith("/messages"):
            poll_count += 1
            if poll_count == 1:
                # Pre-send snapshot
                return httpx.Response(200, json=[{"id": "old_1", "fromMe": False, "body": "Old"}])
            return httpx.Response(
                200,
                json=[
                    {"id": "old_1", "fromMe": False, "body": "Old"},
                    {
                        "id": "reply_2",
                        "fromMe": False,
                        "body": "Pedido #BR-9042 confirmado.",
                        "timestamp": 9999999999,
                    },
                ],
            )
        return httpx.Response(404)

    mock_http = httpx.AsyncClient(transport=httpx.MockTransport(working_handler))
    client = WAHAWhatsAppClient(http_client=mock_http)
    res = await client.send_and_receive(
        target_phone="+5511999990000",
        prompt_text="Status do pedido #BR-9042",
        timeout_s=2.0,
        poll_fast_s=0.01,
    )
    assert res.delivery_status == "DELIVERED"
    assert "BR-9042" in res.response_text
    assert res.net_inference_ms >= 1
    await mock_http.aclose()

    # Verify offline WAHA raises explicit WAHATransportError("WAHA_OFFLINE") and never falls back to simulation
    def offline_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Connection refused")

    offline_http = httpx.AsyncClient(transport=httpx.MockTransport(offline_handler))
    offline_client = WAHAWhatsAppClient(http_client=offline_http)
    with pytest.raises(WAHATransportError) as exc_info:
        await offline_client.send_and_receive("+5511999990000", "Oi")
    assert exc_info.value.error_code == "WAHA_OFFLINE"
    await offline_http.aclose()
