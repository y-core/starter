import { isHoneypotFilled, verifyTurnstile } from "@y-core/forge/form";
import { htmlResponse, renderError, renderSuccess, renderValidationErrors } from "@y-core/forge/http";
import { createLogger } from "@y-core/forge/logging";
import type { AppConfig } from "../config/app";
import type { AppContext } from "../context";
import { validateContact } from "../model/contact";
import { sendContactEmail } from "../services/email";

const logger = createLogger("contact");
const SUCCESS_MESSAGE = "Thanks. We'll review your note and get back to you soon.";

export async function handleContactAction(c: AppContext, config: AppConfig): Promise<Response> {
  const request = c.req.raw;

  let formData: FormData;
  try {
    formData = await request.formData();
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
      turnstileResult.reason === "missing-token"
        ? "Please complete the security challenge."
        : "Security verification failed. Please try again.";
    return htmlResponse(renderError(message), 403);
  }

  const result = validateContact(formData);

  if (!result.ok) {
    return htmlResponse(renderValidationErrors(result.errors));
  }

  const sent = await sendContactEmail(result.data, config.services.email);
  if (!sent.ok) {
    logger.error("Email delivery failed", { reason: sent.reason });
    return htmlResponse(renderError("Something went wrong. Please try again or contact us directly."), 500);
  }

  logger.info("Contact form submitted");
  return htmlResponse(renderSuccess(SUCCESS_MESSAGE));
}
