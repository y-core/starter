import type { Logger } from "@y-core/forge/logging";

import type { EmailConfig } from "../app/types";
import type { EmailMessage } from "../model/types";
import type { EmailResult } from "./types";

/** Delivers one message to the configured recipient through the MailChannels API. */
export async function sendEmail(message: EmailMessage, config: EmailConfig, logger: Logger): Promise<EmailResult> {
  const { apiKey, apiUrl, from, senderName, to } = config;

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(10_000),
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        from: { email: from, name: senderName },
        reply_to: message.replyTo,
        subject: message.subject,
        personalizations: [{ to: [{ email: to }] }],
        content: [{ type: "text/html", value: message.html }],
      }),
    });
  } catch (err) {
    logger.error("Email delivery failed", { error: String(err) });
    return { ok: false, reason: "network-error" };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    // Structurally, never interpolated: a rejection routinely echoes `reply_to` back, and redaction
    // inspects `record.data` alone — an address inside the message string is unreachable (§4b).
    logger.error("Email API error", { status: res.status, body: text });
    return { ok: false, reason: `http-${res.status}` };
  }

  return { ok: true };
}
