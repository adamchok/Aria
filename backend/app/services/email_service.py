"""Email notification service using stdlib smtplib."""

from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class EmailService:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    async def send(self, to: str, subject: str, html_body: str) -> bool:
        if not self._settings.notification_email_enabled or not self._settings.smtp_host:
            return False
        s = self._settings
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, self._send_sync, to, subject, html_body, s)

    @staticmethod
    def _send_sync(to: str, subject: str, html_body: str, s: Settings) -> bool:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = s.smtp_from
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html"))
        try:
            with smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=10) as conn:
                if s.smtp_use_tls:
                    conn.starttls()
                if s.smtp_user:
                    conn.login(s.smtp_user, s.smtp_password)
                conn.sendmail(s.smtp_from, [to], msg.as_string())
            return True
        except Exception as exc:
            logger.warning("email.send_failed", error=str(exc), to=to)
            return False

    async def notify_job_complete(self, to: str, job_id: str, summary: dict) -> None:
        matched = summary.get("matched_count", 0)
        total = summary.get("total_records", 0)
        uncertain = summary.get("uncertain_count", 0)
        body = (
            f"<p>Reconciliation job <code>{job_id}</code> completed.</p>"
            f"<ul><li>Matched: {matched}/{total}</li>"
            f"<li>Needs review: {uncertain}</li></ul>"
        )
        await self.send(to, f"ARIA: Job {job_id[:8]}… complete", body)

    async def notify_job_failed(self, to: str, job_id: str, error: str) -> None:
        body = f"<p>Reconciliation job <code>{job_id}</code> failed.</p><p>Error: {error}</p>"
        await self.send(to, f"ARIA: Job {job_id[:8]}… failed", body)
