import { isHoneypotFilled, parseFormData, verifyTurnstile } from "@y-core/forge/form";
import { htmlResponse, renderError, renderSuccess, renderValidationErrors } from "@y-core/forge/http";
import { requestLog } from "@y-core/forge/logging";
import type { AppConfig } from "../app/config";
import type { AppContext } from "../app/context";
import { validateContact } from "../model/contact";
import { sendContactEmail } from "../services/email";

const SUCCESS_MESSAGE = "Thanks. We'll review your note and get back to you soon.";

export async function handleContactAction(c: AppContext, config: AppConfig): Promise<Response> {
  const log = requestLog.get(c);
  const request = c.req.raw;

  let formData: Awaited<ReturnType<typeof parseFormData>>;
  try {
    formData = await parseFormData(c);
  } catch {
    return htmlResponse(renderError("Unable to process the form data. Please try again."), 400);
  }

  if (isHoneypotFilled(formData)) {
    return htmlResponse(renderError("Unable to process the form data. Please try again."), 400);
  }

  const turnstileResult = await verifyTurnstile(
    formData,
    config.services.turnstile.secretKey,
    "cf-turnstile-response",
    request.headers.get("CF-Connecting-IP") ?? undefined,
  );
  if (!turnstileResult.ok) {
    const message =
      turnstileResult.reason === "missing-token" ? "Please complete the security challenge." : "Security verification failed. Please try again.";
    return htmlResponse(renderError(message), 403);
  }

  const result = validateContact(formData);

  if (!result.ok) {
    return htmlResponse(renderValidationErrors(result.errors), 422);
  }

  const sent = await sendContactEmail(result.data, config.services.email, log);
  if (!sent.ok) {
    log.error("Email delivery failed", { reason: sent.reason });
    return htmlResponse(renderError("Something went wrong. Please try again or contact us directly."), 500);
  }

  log.info("Contact form submitted");
  return htmlResponse(renderSuccess(SUCCESS_MESSAGE));
}
