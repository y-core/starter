import { escapeHtml } from "@y-core/forge/http";
import { createLogger } from "@y-core/forge/logging";
import type { EmailConfig } from "../config/app";
import type { ContactSubmission } from "../model/contact";

export type EmailResult = { ok: true } | { ok: false; reason: string };

const logger = createLogger("email");

export async function sendContactEmail(
  submission: ContactSubmission,
  email: EmailConfig,
): Promise<EmailResult> {
  const { apiKey, apiUrl, from, senderName, to } = email;

  const html =
    `<p><strong>Name:</strong> ${escapeHtml(submission.name)}</p>\n` +
    `<p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>\n` +
    (submission.phone ? `<p><strong>Phone:</strong> ${escapeHtml(submission.phone)}</p>\n` : "") +
    `<p><strong>Message:</strong></p>\n<p>${escapeHtml(submission.message).replace(/\n/g, "<br>")}</p>`;

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        from: { email: from, name: senderName },
        reply_to: { email: submission.email, name: submission.name },
        subject: `Enquiry from ${submission.name}`,
        personalizations: [{ to: [{ email: to }] }],
        content: [{ type: "text/html", value: html }],
      }),
    });
  } catch (err) {
    logger.error("Email delivery failed", { error: String(err) });
    return { ok: false, reason: "network-error" };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(unreadable)");
    logger.error(`Email API error ${res.status}: ${text}`);
    return { ok: false, reason: `http-${res.status}` };
  }

  return { ok: true };
}
