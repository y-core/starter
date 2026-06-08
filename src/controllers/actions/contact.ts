import type { Middleware } from "@y-core/forge/context";
import { getAppContext, type RequestContext } from "@y-core/forge/context";
import { isHoneypotFilled, parseFormData, verifyTurnstile } from "@y-core/forge/form";
import { fragmentResponse, renderError, renderSuccess, renderValidationErrors } from "@y-core/forge/http";
import { requestLog } from "@y-core/forge/logging";
import { createMiddleware } from "@y-core/forge/router";
import { verifyOrigin } from "@y-core/forge/security";
import type { AppConfig } from "../../app/config";
import { configStore } from "../../app/config";
import type { AppEnv } from "../../app/context";
import { csrfVerifyGuard, rateLimitGuard } from "../../app/middleware";
import { validateContact } from "../../model/contact";
import { sendContactEmail } from "../../services/email";

const SUCCESS_MESSAGE = "Thanks. We'll review your note and get back to you soon.";

const contactGuard: Middleware = async (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  if (c.method !== "POST") return new Response("Forbidden", { status: 403 });
  const { allowedOrigins } = configStore.get(c.env).site.url;
  if (!verifyOrigin(c.request, allowedOrigins).ok) return new Response("Forbidden", { status: 403 });
  if (c.request.headers.get("HX-Request") !== "true") return new Response("Forbidden", { status: 403 });
  const ct = c.request.headers.get("content-type") ?? "";
  if (!ct.includes("application/x-www-form-urlencoded")) return new Response("Unsupported Media Type", { status: 415 });
  return next();
};

export async function handleContact(context: RequestContext): Promise<Response> {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  const config = c.config;
  const log = requestLog.get(c);

  let formData: Awaited<ReturnType<typeof parseFormData>>;
  try {
    formData = await parseFormData(c);
  } catch {
    return fragmentResponse(renderError("Unable to process the form data. Please try again."), 400);
  }

  if (isHoneypotFilled(formData)) {
    return fragmentResponse(renderError("Unable to process the form data. Please try again."), 400);
  }

  const turnstileResult = await verifyTurnstile(
    formData,
    config.services.turnstile.secretKey,
    { expectedHostname: config.site.url.hostname },
    "cf-turnstile-response",
    c.request.headers.get("CF-Connecting-IP") ?? undefined,
  );
  if (!turnstileResult.ok) {
    const message =
      turnstileResult.reason === "missing-token" ? "Please complete the security challenge." : "Security verification failed. Please try again.";
    return fragmentResponse(renderError(message), 403);
  }

  const result = validateContact(formData);

  if (!result.ok) {
    return fragmentResponse(renderValidationErrors(result.errors), 422);
  }

  const sent = await sendContactEmail(result.data, config.services.email, log);
  if (!sent.ok) {
    log.error("Email delivery failed", { reason: sent.reason });
    return fragmentResponse(renderError("Something went wrong. Please try again or contact us directly."), 500);
  }

  log.info("Contact form submitted");
  return fragmentResponse(renderSuccess(SUCCESS_MESSAGE));
}

export const contactController = { middleware: createMiddleware(contactGuard, rateLimitGuard, csrfVerifyGuard), handler: handleContact };
