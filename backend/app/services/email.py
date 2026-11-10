import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)
RESEND_API_URL = "https://api.resend.com/emails"


class EmailConfigurationError(RuntimeError):
    pass


class EmailDeliveryError(RuntimeError):
    pass


class EmailService:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        from_email: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        configured_key = settings.resend_api_key.get_secret_value() if settings.resend_api_key else None
        self.api_key = api_key if api_key is not None else configured_key
        self.from_email = from_email if from_email is not None else settings.resend_from_email
        self.transport = transport

    def ensure_configured(self) -> None:
        if not self.api_key or not self.from_email:
            raise EmailConfigurationError("Resend email delivery is not configured")

    async def send(
        self,
        recipient: str,
        subject: str,
        html: str,
        *,
        idempotency_key: str | None = None,
    ) -> str:
        self.ensure_configured()
        headers = {"Authorization": f"Bearer {self.api_key}"}
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        try:
            async with httpx.AsyncClient(
                transport=self.transport,
                timeout=httpx.Timeout(10.0, connect=5.0),
            ) as client:
                response = await client.post(
                    RESEND_API_URL,
                    headers=headers,
                    json={
                        "from": self.from_email,
                        "to": [recipient],
                        "subject": subject,
                        "html": html,
                    },
                )
        except httpx.TimeoutException as exc:
            logger.warning("Email delivery timed out")
            raise EmailDeliveryError("Email delivery timed out") from exc
        except httpx.RequestError as exc:
            logger.warning("Email provider request failed: %s", exc.__class__.__name__)
            raise EmailDeliveryError("Email provider request failed") from exc

        if response.status_code not in (200, 201):
            logger.error("Email provider rejected a message with status %s", response.status_code)
            raise EmailDeliveryError(f"Email provider returned status {response.status_code}")
        try:
            message_id = response.json().get("id")
        except ValueError as exc:
            raise EmailDeliveryError("Email provider returned an invalid response") from exc
        if not isinstance(message_id, str) or not message_id:
            raise EmailDeliveryError("Email provider response did not contain a message ID")
        return message_id
