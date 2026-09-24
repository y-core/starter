import { escapeHtml } from "@y-core/forge/http";
import type { Logger } from "@y-core/forge/logging";

import { type EmailConfig, type EmailResult, sendEmail } from "../../email/mod";
import type { ContactSubmission } from "../model/types";

/** Mails one enquiry to the configured recipient, with the visitor as the address a reply reaches. */
export function sendEnquiry(submission: ContactSubmission, email: EmailConfig, logger: Logger): Promise<EmailResult> {
  const html =
    `<p><strong>Name:</strong> ${escapeHtml(submission.name)}</p>\n` +
    `<p><strong>Email:</strong> ${escapeHtml(submission.email)}</p>\n` +
    (submission.phone ? `<p><strong>Phone:</strong> ${escapeHtml(submission.phone)}</p>\n` : "") +
    `<p><strong>Message:</strong></p>\n<p>${escapeHtml(submission.message).replace(/\n/g, "<br>")}</p>`;

  return sendEmail(
    { subject: `Enquiry from ${submission.name}`, html, replyTo: { email: submission.email, name: submission.name } },
    email,
    logger,
  );
}
