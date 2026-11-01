"""Dual-mode WhatsApp transport bridge (Single-Session WAHA + Deterministic Simulation)."""

from agent_analyzer.bridge.whatsapp_client import (
    SimulatedTargetTransport,
    TurnDeliveryResult,
    WAHATransportError,
    WAHAWhatsAppClient,
    compute_turn_token_telemetry,
)

__all__ = [
    "SimulatedTargetTransport",
    "TurnDeliveryResult",
    "WAHATransportError",
    "WAHAWhatsAppClient",
    "compute_turn_token_telemetry",
]
