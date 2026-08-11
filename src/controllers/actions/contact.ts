import { defineAction } from "@y-core/forge/app";
import type { Middleware } from "@y-core/forge/context";
import { getAppContext } from "@y-core/forge/context";
import { fragmentResponse, renderError, renderSuccess } from "@y-core/forge/http";
import { requestLog } from "@y-core/forge/logging";
import { createMiddleware } from "@y-core/forge/router";
import { verifyOrigin } from "@y-core/forge/security";
import { formMultilineText, formText, strictObject, v } from "@y-core/forge/validation";
import type { AppConfig } from "../../app/config";
import { configStore } from "../../app/config";
import type { AppEnv } from "../../app/context";
import { csrfVerifyGuard, rateLimitGuard } from "../../app/middleware";
import { sendContactEmail } from "../../services/email";

const SUCCESS_MESSAGE = "Thanks. We'll review your note and get back to you soon.";

/**
 * The decoy field name, referenced exactly twice: by `<Honeypot field={CONTACT_DECOY} />` in the
 * view and by `honeypot:` below. Deliberately not forge's `HONEYPOT_FIELD_DEFAULT` — forge is open
 * source, so a published default name is a one-line bypass for every deployment at once.
 */
export const CONTACT_DECOY = "company";

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 20;
const MIN_MESSAGE_LENGTH = 15;
const MAX_MESSAGE_LENGTH = 2000;
const phonePattern = /^[\d\s\-+()]*$/;

/**
 * `strictObject` (not `v.strictObject`) additionally refuses inherited names — `__proto__`,
 * `constructor`, `toString` — and applies at construction, so the property survives `v.pipe`.
 *
 * `formText()` / `formMultilineText()` (not `v.string()`) because the pipeline's body read passes
 * values through exactly as submitted: a bare `v.pipe(v.string(), v.nonEmpty())` accepts `"   "`.
 */
export const ContactSchema = strictObject({
  name: v.pipe(
    formText(),
    v.transform((val) =>
      val
        .replace(/[\r\n]/g, " ")
        .replace(/ {2,}/g, " ")
        .trim(),
    ),
    v.nonEmpty("Name is required."),
    v.maxLength(MAX_NAME_LENGTH, `Name must be ${MAX_NAME_LENGTH} characters or fewer.`),
  ),
  email: v.pipe(
    formText(),
    v.nonEmpty("A valid email address is required."),
    v.maxLength(MAX_EMAIL_LENGTH, "A valid email address is required."),
    v.email("A valid email address is required."),
  ),
  // `v.optional` is load-bearing: `formToObject` leaves an absent field absent rather than
  // substituting `""`, and a valibot object refusal is a refusal of the *whole* object — so a
  // non-optional `phone` would 422 every submission that leaves the optional input blank.
  phone: v.optional(
    v.pipe(
      formText(),
      v.maxLength(MAX_PHONE_LENGTH, `Contact number must be ${MAX_PHONE_LENGTH} characters or fewer.`),
      v.regex(phonePattern, "Contact number may only contain digits, spaces, dashes, and plus signs."),
      v.transform((val): string | undefined => (val === "" ? undefined : val)),
    ),
  ),
  message: v.pipe(
    formMultilineText(),
    v.minLength(MIN_MESSAGE_LENGTH, `Message must be at least ${MIN_MESSAGE_LENGTH} characters.`),
    v.maxLength(MAX_MESSAGE_LENGTH, `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`),
  ),
});

export type ContactSubmission = v.InferOutput<typeof ContactSchema>;

/** Transport guards: origin, HTMX-only, content type. These read the request envelope and never the
 *  body, which is why they stay in middleware instead of moving into the action pipeline. */
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

/**
 * The pipeline owns the body read, the decoy check, Turnstile verification, the drop of every
 * consumed field (`_csrf` via `csrfFieldCtx`, the decoy and `cf-turnstile-response` because they are
 * named here) and the parse. `handle` is unreachable except through a passing `v.safeParse`.
 */
export const contactAction = defineAction<typeof ContactSchema, AppEnv, AppConfig>({
  schema: ContactSchema,
  honeypot: CONTACT_DECOY,
  turnstile: {
    secretKey: (_c, config) => config.services.turnstile.secretKey,
    verify: (c, config) => ({ expectedHostname: config.site.url.hostname, remoteIp: c.request.headers.get("CF-Connecting-IP") ?? undefined }),
  },
  handle: async (data, c, config) => {
    const log = requestLog.get(c);
    const sent = await sendContactEmail(data, config.services.email, log);
    if (!sent.ok) {
      log.error("Email delivery failed", { reason: sent.reason });
      return fragmentResponse(renderError("Something went wrong. Please try again or contact us directly."), 500);
    }
    log.info("Contact form submitted");
    return fragmentResponse(renderSuccess(SUCCESS_MESSAGE));
  },
});

export const contactController = { middleware: createMiddleware(contactGuard, rateLimitGuard, csrfVerifyGuard), handler: contactAction };
