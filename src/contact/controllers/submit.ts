import { defineAction } from "@y-core/forge/app";
import type { DevAllowance } from "@y-core/forge/dev";
import { fragmentResponse, renderError, renderSuccess } from "@y-core/forge/http";
import { requestLog } from "@y-core/forge/logging";
import { createMiddleware } from "@y-core/forge/router";
import { rateLimit, requireFormContentType } from "@y-core/forge/security";

import { devAllowanceCtx } from "../../app/dev";
import type { AppConfig, AppEnv } from "../../app/types";
import { rateLimitPolicy } from "../../rate-limit/mod";
import { csrfVerifyGuard, htmxOnlyGuard, originGuard } from "../app/middleware";
import { ContactSchema } from "../model/schema";
import { sendEnquiry } from "../services/enquiry";

const SUCCESS_MESSAGE = "Thanks. We'll review your note and get back to you soon.";

/** The contact submission, whose `handle` the pipeline reaches only through a passing parse. */
export const contactAction = defineAction<typeof ContactSchema, AppEnv, AppConfig>({
  schema: ContactSchema,
  turnstile: {
    secretKey: (_c, config) => config.turnstile.secretKey,
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
    const sent = await sendEnquiry(data, config.email, log);
    // No second record here: `sendEmail` logs each failure with the status or the thrown
    // value, and `reason` is derived from those — a line carrying it would say strictly less.
    if (!sent.ok) return fragmentResponse(renderError("Something went wrong. Please try again or contact us directly."), 500);
    log.info("Contact form submitted");
    return fragmentResponse(renderSuccess(SUCCESS_MESSAGE));
  },
});

/** The contact route, behind the envelope-only transport guards `BOUNDARIES.md` §2c orders. */
export function createContactController(dev?: DevAllowance) {
  return {
    middleware: createMiddleware(requireFormContentType(), htmxOnlyGuard, originGuard, rateLimit<AppEnv>(rateLimitPolicy(dev)), csrfVerifyGuard),
    handler: contactAction,
  };
}
