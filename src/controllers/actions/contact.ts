import { defineAction } from "@y-core/forge/app";
import { fragmentResponse, renderError, renderSuccess } from "@y-core/forge/http";
import { requestLog } from "@y-core/forge/logging";
import { createMiddleware } from "@y-core/forge/router";
import { requireFormContentType } from "@y-core/forge/security";
import { formMultilineText, formText, v } from "@y-core/forge/validation";

import { devAllowanceCtx } from "../../app/dev";
import { csrfVerifyGuard, htmxOnlyGuard, originGuard, rateLimitGuard } from "../../app/middleware";
import type { AppConfig, AppEnv } from "../../app/types";
import { sendContactEmail } from "../../services/email";

const SUCCESS_MESSAGE = "Thanks. We'll review your note and get back to you soon.";

const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 20;
const MIN_MESSAGE_LENGTH = 15;
const MAX_MESSAGE_LENGTH = 2000;
const phonePattern = /^[\d\s\-+()]*$/;
// Forge's auth forms pair the same two checks, but their `emailField()` is private to forge and
// carries forge's own copy — `v.rfcEmail` alone admits `ada@localhost`, which nothing can reply to.
const deliverableDomain = /@[^@]+\.[^@]+$/;

/** The contact form's shape: `v.strictObject`, which refuses an undeclared field, over form-aware string types. */
export const ContactSchema = v.strictObject({
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
    v.rfcEmail("A valid email address is required."),
    v.regex(deliverableDomain, "A valid email address is required."),
  ),
  // `formToObject` leaves an absent field absent rather than substituting `""`, so without
  // `v.optional` every submission with the input left blank would 422 (`INPUT_VALIDATION.md` §1d).
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

/** The contact submission, whose `handle` the pipeline reaches only through a passing parse. */
export const contactAction = defineAction<typeof ContactSchema, AppEnv, AppConfig>({
  schema: ContactSchema,
  turnstile: {
    secretKey: (_c, config) => config.services.turnstile.secretKey,
    // The hostname comparison is the same on both entries; the allowance is only what lets a dev one
    // pass under Cloudflare's testing secrets (`INPUT_VALIDATION.md` §4a).
    verify: (c, config) => {
      const remoteIp = c.request.headers.get("CF-Connecting-IP");
      const dev = devAllowanceCtx.getOptional(c);
      return { expectedHostname: config.site.url.hostname, ...(remoteIp === null ? {} : { remoteIp }), ...(dev === undefined ? {} : { dev }) };
    },
  },
  handle: async (data, c, config) => {
    const log = requestLog.get(c);
    const sent = await sendContactEmail(data, config.services.email, log);
    // No second record here: `sendContactEmail` logs each failure with the status or the thrown
    // value, and `reason` is derived from those — a line carrying it would say strictly less.
    if (!sent.ok) return fragmentResponse(renderError("Something went wrong. Please try again or contact us directly."), 500);
    log.info("Contact form submitted");
    return fragmentResponse(renderSuccess(SUCCESS_MESSAGE));
  },
});

/** The contact route, behind the envelope-only transport guards `BOUNDARIES.md` §2c orders. */
export const contactController = {
  middleware: createMiddleware(requireFormContentType(), htmxOnlyGuard, originGuard, rateLimitGuard, csrfVerifyGuard),
  handler: contactAction,
};
