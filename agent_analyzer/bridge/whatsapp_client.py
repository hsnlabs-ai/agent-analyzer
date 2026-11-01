"""Single-session WAHA WhatsApp Web client (:3001) and deterministic simulated target bot."""

from __future__ import annotations

import asyncio
import statistics
import time
from dataclasses import dataclass
from typing import Any

import httpx

from agent_analyzer.config import phone_to_waha_chat_id
from agent_analyzer.inspector.models import DeliveryStatus, WAHASessionStatus


def compute_turn_token_telemetry(
    prompt_text: str, response_text: str, net_inference_ms: int
) -> tuple[int, int, float]:
    """Compute (prompt_tokens_est, completion_tokens_est, tokens_per_sec) deterministically."""
    p_words = len((prompt_text or "").split())
    c_words = len((response_text or "").split())
    prompt_tokens = max(1, int(round(p_words * 1.3))) if p_words else 1
    completion_tokens = max(1, int(round(c_words * 1.3))) if c_words else 0
    gen_window_s = max(net_inference_ms - 350, 100) / 1000.0
    tokens_per_sec = round(completion_tokens / gen_window_s, 2) if completion_tokens > 0 else 0.0
    return prompt_tokens, completion_tokens, tokens_per_sec


class WAHATransportError(RuntimeError):
    """Explicit error raised when LIVE_WHATSAPP transport is offline or unauthenticated."""

    def __init__(self, error_code: str, message: str) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message


@dataclass(slots=True)
class TurnDeliveryResult:
    """Measured transport and inference telemetry for a single probe turn."""

    response_text: str
    status_code: int
    delivery_status: DeliveryStatus
    raw_rtt_ms: int
    ws_ping_ms: int
    net_inference_ms: int
    prompt_tokens_est: int
    completion_tokens_est: int
    tokens_per_sec: float


class WAHAWhatsAppClient:
    """Single-session WAHA WhatsApp Web transport client with 200ms fast-poll window."""

    def __init__(
        self,
        base_url: str = "http://localhost:3001",
        session_name: str = "default",
        api_key: str = "",
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.session_name = session_name or "default"
        self.api_key = api_key or ""
        self._external_client = http_client is not None
        self._client = http_client or httpx.AsyncClient(timeout=10.0)

    def _headers(self) -> dict[str, str]:
        headers = {"Accept": "application/json"}
        if self.api_key:
            headers["X-Api-Key"] = self.api_key
        return headers

    async def aclose(self) -> None:
        if not self._external_client:
            await self._client.aclose()

    async def measure_waha_ping_ms(self) -> int:
        """Measure median HTTP RTT (ms) across 3 lightweight pings to /api/sessions/{session}."""
        samples: list[int] = []
        url = f"{self.base_url}/api/sessions/{self.session_name}"
        for _ in range(3):
            t0 = time.perf_counter()
            try:
                resp = await self._client.get(url, headers=self._headers(), timeout=3.0)
                if resp.status_code < 500:
                    elapsed_ms = max(1, int(round((time.perf_counter() - t0) * 1000)))
                    samples.append(elapsed_ms)
            except Exception:
                break
        if not samples:
            return 0
        return int(round(statistics.median(samples)))

    async def get_session_status(self) -> WAHASessionStatus:
        """Non-destructively inspect the single WAHA session on :3001."""
        url = f"{self.base_url}/api/sessions/{self.session_name}"
        t0 = time.perf_counter()
        try:
            resp = await self._client.get(url, headers=self._headers(), timeout=4.0)
            ping_ms = max(1, int(round((time.perf_counter() - t0) * 1000)))
        except Exception as exc:
            return WAHASessionStatus(
                session_name=self.session_name,
                base_url=self.base_url,
                reachable=False,
                status="OFFLINE",
                ws_ping_ms=0,
                connected_phone=None,
                qr_available=False,
                message=f"WAHA bridge unreachable at {self.base_url}: {exc}",
            )

        if resp.status_code == 404:
            return WAHASessionStatus(
                session_name=self.session_name,
                base_url=self.base_url,
                reachable=True,
                status="STOPPED",
                ws_ping_ms=ping_ms,
                connected_phone=None,
                qr_available=False,
                message=f"Session '{self.session_name}' is not started yet.",
            )

        try:
            data = resp.json()
        except Exception:
            data = {}

        status_str = str(data.get("status") or "UNKNOWN").upper()
        me = data.get("me") or {}
        phone = me.get("id") if isinstance(me, dict) else None
        qr_avail = status_str in ("SCAN_QR_CODE", "STARTING")
        return WAHASessionStatus(
            session_name=self.session_name,
            base_url=self.base_url,
            reachable=True,
            status=status_str,
            ws_ping_ms=ping_ms,
            connected_phone=str(phone) if phone else None,
            qr_available=qr_avail,
            message=(
                f"Session '{self.session_name}' is {status_str} (ping {ping_ms}ms)."
                if status_str == "WORKING"
                else f"Session '{self.session_name}' state: {status_str}. Pair via QR code if required."
            ),
        )

    async def start_or_attach_session(self) -> WAHASessionStatus:
        """Attach non-destructively if WORKING; otherwise create/start the session."""
        current = await self.get_session_status()
        if not current.reachable:
            raise WAHATransportError(
                "WAHA_OFFLINE",
                f"Cannot reach WAHA container at {self.base_url}. Run 'docker compose -f docker-compose.waha.yml up -d'.",
            )
        if current.status == "WORKING":
            return current

        start_url = f"{self.base_url}/api/sessions/start"
        try:
            await self._client.post(
                start_url,
                json={"name": self.session_name},
                headers=self._headers(),
                timeout=8.0,
            )
        except Exception as exc:
            raise WAHATransportError(
                "WAHA_START_FAILED",
                f"Failed to start WAHA session '{self.session_name}': {exc}",
            ) from exc
        return await self.get_session_status()

    async def get_qr_base64(self) -> dict[str, Any]:
        """Fetch the WAHA QR pairing image or state for /api/waha/qr."""
        status = await self.get_session_status()
        if not status.reachable:
            raise WAHATransportError("WAHA_OFFLINE", status.message)
        if status.status == "WORKING":
            return {
                "session_name": self.session_name,
                "status": "WORKING",
                "qr_base64": None,
                "message": "Session is already paired and WORKING.",
            }
        qr_url = f"{self.base_url}/api/{self.session_name}/auth/qr?format=raw"
        try:
            resp = await self._client.get(qr_url, headers=self._headers(), timeout=5.0)
            if resp.status_code == 200:
                payload = resp.json() if "application/json" in resp.headers.get("content-type", "") else {"value": resp.text}
                return {
                    "session_name": self.session_name,
                    "status": status.status,
                    "qr_base64": payload.get("data") or payload.get("value"),
                    "message": "Scan QR code with WhatsApp Multi-Device.",
                }
        except Exception:
            pass
        return {
            "session_name": self.session_name,
            "status": status.status,
            "qr_base64": None,
            "message": f"QR code not ready in state {status.status}.",
        }

    async def logout_session(self) -> WAHASessionStatus:
        """Explicitly log out the single WAHA session when requested by the operator."""
        logout_url = f"{self.base_url}/api/sessions/logout"
        try:
            await self._client.post(
                logout_url,
                json={"name": self.session_name},
                headers=self._headers(),
                timeout=6.0,
            )
        except Exception:
            pass
        return await self.get_session_status()

    async def _fetch_chat_messages(self, chat_id: str) -> list[dict[str, Any]]:
        url = (
            f"{self.base_url}/api/{self.session_name}/chats/{chat_id}/messages"
            "?limit=10&downloadMedia=false"
        )
        resp = await self._client.get(url, headers=self._headers(), timeout=4.0)
        if resp.status_code != 200:
            return []
        data = resp.json()
        return data if isinstance(data, list) else []

    async def send_and_receive(
        self,
        target_phone: str,
        prompt_text: str,
        timeout_s: float = 26.0,
        poll_fast_s: float = 0.20,
        poll_slow_s: float = 0.40,
    ) -> TurnDeliveryResult:
        """Send a live WhatsApp probe turn and poll at 200ms/400ms for the first inbound reply."""
        status = await self.get_session_status()
        if not status.reachable:
            raise WAHATransportError(
                "WAHA_OFFLINE",
                f"WAHA bridge at {self.base_url} is offline. Live WhatsApp scans never fall back to simulation.",
            )
        if status.status != "WORKING":
            raise WAHATransportError(
                "WAHA_QR_REQUIRED",
                f"WAHA session '{self.session_name}' is in state '{status.status}' (must be WORKING).",
            )

        ws_ping_ms = await self.measure_waha_ping_ms() or status.ws_ping_ms or 35
        chat_id = phone_to_waha_chat_id(target_phone)

        # Snapshot existing message IDs before sending so fast 200ms polls never match prior turns
        seen_ids: set[str] = set()
        try:
            prior_msgs = await self._fetch_chat_messages(chat_id)
            for msg in prior_msgs:
                msg_id = str(msg.get("id") or "")
                if msg_id:
                    seen_ids.add(msg_id)
        except Exception:
            pass

        send_url = f"{self.base_url}/api/sendText"
        t0 = time.perf_counter()
        send_unix_ts = int(time.time()) - 1
        try:
            send_resp = await self._client.post(
                send_url,
                json={
                    "session": self.session_name,
                    "chatId": chat_id,
                    "text": prompt_text,
                },
                headers=self._headers(),
                timeout=8.0,
            )
        except Exception as exc:
            raise WAHATransportError(
                "WAHA_SEND_FAILED", f"Failed to send message via WAHA: {exc}"
            ) from exc

        if send_resp.status_code >= 400:
            raise WAHATransportError(
                "WAHA_SEND_FAILED",
                f"WAHA /api/sendText returned HTTP {send_resp.status_code}: {send_resp.text}",
            )

        try:
            sent_data = send_resp.json()
            sent_id = str(sent_data.get("id") or "")
            if sent_id:
                seen_ids.add(sent_id)
        except Exception:
            pass

        # Fast-poll window: 200ms for 0..3s, then 400ms up to timeout_s
        while True:
            elapsed_s = time.perf_counter() - t0
            if elapsed_s >= timeout_s:
                break
            sleep_s = poll_fast_s if elapsed_s < 3.0 else poll_slow_s
            await asyncio.sleep(sleep_s)
            try:
                msgs = await self._fetch_chat_messages(chat_id)
            except Exception:
                continue

            for msg in msgs:
                msg_id = str(msg.get("id") or "")
                from_me = bool(msg.get("fromMe", False))
                body = str(msg.get("body") or msg.get("text") or "").strip()
                msg_ts = int(msg.get("timestamp") or send_unix_ts)
                if not from_me and body and msg_id not in seen_ids and msg_ts >= send_unix_ts:
                    raw_rtt_ms = max(1, int(round((time.perf_counter() - t0) * 1000)))
                    net_ms = max(1, raw_rtt_ms - ws_ping_ms)
                    p_tok, c_tok, tps = compute_turn_token_telemetry(prompt_text, body, net_ms)
                    return TurnDeliveryResult(
                        response_text=body,
                        status_code=200,
                        delivery_status="DELIVERED",
                        raw_rtt_ms=raw_rtt_ms,
                        ws_ping_ms=ws_ping_ms,
                        net_inference_ms=net_ms,
                        prompt_tokens_est=p_tok,
                        completion_tokens_est=c_tok,
                        tokens_per_sec=tps,
                    )

        # Timeout expired without inbound reply: tag as TIMEOUT so it never pollutes node clustering
        timeout_rtt_ms = int(round(timeout_s * 1000))
        net_ms = max(1, timeout_rtt_ms - ws_ping_ms)
        p_tok, _, _ = compute_turn_token_telemetry(prompt_text, "", net_ms)
        return TurnDeliveryResult(
            response_text="[TARGET_REPLY_TIMEOUT_26S]",
            status_code=408,
            delivery_status="TIMEOUT",
            raw_rtt_ms=timeout_rtt_ms,
            ws_ping_ms=ws_ping_ms,
            net_inference_ms=net_ms,
            prompt_tokens_est=p_tok,
            completion_tokens_est=0,
            tokens_per_sec=0.0,
        )


class SimulatedTargetTransport:
    """Deterministic multi-node retail & Pix WhatsApp bot simulator for W0..W5."""

    def __init__(self, stateful_memory: bool = True) -> None:
        self.stateful_memory = stateful_memory
        self._thread_memory: dict[str, dict[str, str]] = {}

    def reset_thread(self, scan_id: str) -> None:
        self._thread_memory[scan_id] = {}

    async def send_and_receive(
        self,
        scan_id: str,
        probe_category: str,
        prompt_text: str,
        pass_index: int = 1,
    ) -> TurnDeliveryResult:
        """Return deterministic W1..W5 responses and latency profiles."""
        ws_ping_ms = 45
        mem = self._thread_memory.setdefault(scan_id, {})

        if probe_category == "SESSION_RESET":
            self.reset_thread(scan_id)
            raw_rtt_ms = 190
            resp_text = (
                "Sessão anterior encerrada com sucesso. Novo atendimento independente iniciado."
            )
        elif probe_category == "W1_INJECTION_GUARD":
            raw_rtt_ms = 340 if pass_index == 1 else 355
            resp_text = (
                "[GUARDRAIL_BLOCK] Solicitação bloqueada pela política de segurança: "
                "instruções internas e credenciais do sistema são restritas."
            )
        elif probe_category == "W1_OUT_OF_SCOPE_GUARD":
            raw_rtt_ms = 385 if pass_index == 1 else 395
            resp_text = (
                "[GUARDRAIL_BLOCK] Escopo inválido: este canal atende exclusivamente "
                "pedidos Aurora Commerce, entregas e pagamentos Pix."
            )
        elif probe_category == "W2_ORDER_SQL_BRANCH":
            raw_rtt_ms = 1190 if pass_index == 1 else 1225
            resp_text = (
                "Consulta SQL Pedido #BR-9042: status EM_ROTA_DE_ENTREGA via transportadora "
                "Jadlog, nota fiscal NF-8831 emitida e previsão hoje até 18h."
            )
        elif probe_category == "W2_PIX_POLICY_BRANCH":
            raw_rtt_ms = 1360 if pass_index == 1 else 1390
            resp_text = (
                "Política BACEN Pix & Estorno (RAG Doc #PIX-04): devoluções via Mecanismo "
                "Especial de Devolução (MED) são liquidadas em até 24h úteis na conta de origem."
            )
        elif probe_category == "W2_HITL_INTERRUPT":
            raw_rtt_ms = 910 if pass_index == 1 else 930
            resp_text = (
                "[INTERRUPT_BEFORE:human_escalation] Atendimento pausado para validação "
                "humana de estorno acima de R$ 5.000. Ticket #ESC-409 enfileirado."
            )
        elif probe_category == "W3_TEMP_PROBE_A":
            raw_rtt_ms = 1520 if pass_index == 1 else 1555
            if pass_index == 1:
                resp_text = (
                    "Para solicitar reembolso Pix de um pedido cancelado, confirme o código do "
                    "pedido no menu principal; o crédito retorna automaticamente ao banco emissor "
                    "em até 24 horas úteis com comprovante E2E."
                )
            else:
                # Controlled ~28% Jaccard lexical divergence -> T_hat ~= 0.32 (LOW_TEMP_0_2_0_4)
                resp_text = (
                    "Para pedir estorno Pix de uma compra cancelada, informe o código do "
                    "pedido no menu principal; o valor retorna diretamente ao banco de origem "
                    "em até 24 horas úteis com recibo E2E."
                )
        elif probe_category == "W3_TEMP_PROBE_B":
            raw_rtt_ms = 1485 if pass_index == 1 else 1510
            if pass_index == 1:
                resp_text = (
                    "O prazo de troca gratuita é de 30 dias corridos após o recebimento, "
                    "bastando apresentar a embalagem original e etiqueta fiscal."
                )
            else:
                resp_text = (
                    "O período de devolução gratuita é de 30 dias corridos após a entrega, "
                    "bastando manter a embalagem original e nota fiscal."
                )
        elif probe_category == "W4_ISOLATED_TOOL_A":
            # L_A net ~= 1900ms
            raw_rtt_ms = 1945 if pass_index == 1 else 1965
            resp_text = (
                "[Tool A: Carrier Logistics API] Rastreamento #BR-9042: centro de distribuição "
                "Barueri-SP -> rota urbana, ETA confirmado 17h40."
            )
        elif probe_category == "W4_ISOLATED_TOOL_B":
            # L_B net ~= 2100ms
            raw_rtt_ms = 2145 if pass_index == 1 else 2165
            resp_text = (
                "[Tool B: BACEN Pix Settlement Ledger] Liquidação Pix E2E #E90428812: "
                "status LIQUIDADO_CONFIRMED, valor R$ 492,80 conciliado."
            )
        elif probe_category == "W4_COMPOUND_AB":
            # Subadditive parallel Send() execution: L_AB net ~= 2250ms << L_A + L_B (4000ms)
            raw_rtt_ms = 2295 if pass_index == 1 else 2315
            resp_text = (
                "[Super-Step Parallel Join A+B] Rastreamento #BR-9042 em rota urbana (ETA 17h40) "
                "E liquidação Pix E2E #E90428812 confirmada (R$ 492,80 conciliado simultaneamente)."
            )
        elif probe_category == "W5_PLANT_CANARY":
            raw_rtt_ms = 1120 if pass_index == 1 else 1140
            if pass_index == 1:
                mem["canary_code"] = "#AZ-7741"
                mem["canary_value"] = "R$ 492,80"
                resp_text = (
                    "Protocolo de auditoria #AZ-7741 e valor de estorno R$ 492,80 "
                    "registrados na memória da sessão ativa."
                )
            else:
                mem["canary_code"] = "#AZ-8852"
                mem["canary_value"] = "R$ 618,40"
                resp_text = (
                    "Protocolo de auditoria #AZ-8852 e valor de estorno R$ 618,40 "
                    "registrados na memória da nova sessão."
                )
        elif probe_category == "W5_DISTRACTOR":
            raw_rtt_ms = 1050 if pass_index == 1 else 1070
            resp_text = (
                "Nosso horário de atendimento humano funciona de segunda a sábado, das 08h às 20h "
                "(horário de Brasília), enquanto o assistente virtual opera 24/7."
            )
        elif probe_category == "W5_RECALL_CANARY":
            raw_rtt_ms = 1180 if pass_index == 1 else 1195
            if self.stateful_memory and mem.get("canary_code"):
                code = mem["canary_code"]
                val = mem.get("canary_value", "R$ 492,80")
                resp_text = (
                    f"[MemorySaver Thread Recall] Confirmado na memória da conversa: "
                    f"seu protocolo de auditoria é {code} com valor de estorno {val}."
                )
            else:
                resp_text = (
                    "Não encontrei nenhum protocolo anterior registrado nesta conversa. "
                    "Por favor, informe novamente o código."
                )
        else:
            raw_rtt_ms = 1250
            resp_text = "Atendimento processado pelo assistente virtual."

        net_ms = max(1, raw_rtt_ms - ws_ping_ms)
        p_tok, c_tok, tps = compute_turn_token_telemetry(prompt_text, resp_text, net_ms)
        return TurnDeliveryResult(
            response_text=resp_text,
            status_code=200,
            delivery_status="DELIVERED",
            raw_rtt_ms=raw_rtt_ms,
            ws_ping_ms=ws_ping_ms,
            net_inference_ms=net_ms,
            prompt_tokens_est=p_tok,
            completion_tokens_est=c_tok,
            tokens_per_sec=tps,
        )
