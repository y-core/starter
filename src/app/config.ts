import { createConfig, env } from "@y-core/forge/config";
import type { DevAllowance } from "@y-core/forge/dev";
import { CsrfConfigSchema } from "@y-core/forge/form";
import type { OriginProtectionOptions, RateLimitOptions, SecurityHeadersOptions } from "@y-core/forge/security";
import { BaseUrlConfigSchema, NONCE, TURNSTILE_CSP } from "@y-core/forge/security";
import { v } from "@y-core/forge/validation";

import type { StepUpFactor } from "./types";

const CONFIG = { EMAIL_FROM: "hello@yourdomain.com", EMAIL_TO: "hello@yourdomain.com" };

/** The canonical production origin, and the fallback when the environment's `SITE_ORIGIN` is unset. */
export const SITE_ORIGIN = "https://forge-starter.workers.dev";

// Total rather than partial: a partial record admits `{ passkey: undefined }`, which TypeScript does
// not catch and which reaches forge's `demanded()` as a TypeError on every guarded page.
/** What this deployment demands of each second factor, `"off"` included. A developer edits this; nothing else does. */
export const AUTH_SECOND_FACTORS: Record<StepUpFactor, "mandatory" | "optional" | "off"> = { "totp-app": "mandatory", passkey: "optional" };

// Adding a key here is a regression rather than hardening: `styleSrc`, `fontSrc`, COOP, CORP and
// HSTS are forge's defaults already, and naming a `permissionsPolicy` feature *enables* it.
/** The production CSP, layered by `worker.dev.ts` alone and never widened here. */
export const securityHeaders: SecurityHeadersOptions = {
  scriptSrc: ["'self'", NONCE, TURNSTILE_CSP],
  connectSrc: ["'self'", TURNSTILE_CSP],
  frameSrc: ["'self'", TURNSTILE_CSP],
};

export const AppConfigSchema = v.object({
  site: v.object({
    // Never default this to a placeholder host: `allowedOrigins` derives from it, so the wrong one
    // 403s every mutation with the misconfiguration invisible.
    url: v.pipe(v.optional(v.string(), SITE_ORIGIN), BaseUrlConfigSchema),
    debug: v.pipe(
      v.unknown(),
      v.transform((level): boolean => level === "DEBUG"),
    ),
  }),
  security: v.object({ csrf: CsrfConfigSchema }),
  // `rpId` and `origin` are absent by design: both derive from `site.url`, so a second dev origin
  // needs no further declaration site. `.dev.vars.example` names the three `SITE_ORIGIN` has.
  auth: v.object({
    keyRing: v.pipe(
      v.string(),
      v.transform((raw): string[] =>
        raw
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean),
      ),
      v.check((keys) => keys.length > 0 && keys.every((key) => /^[0-9a-f]{64,}$/.test(key))),
    ),
    sessionSecret: v.pipe(v.string(), v.minLength(32)),
    // Required rather than optional: forge answers `/admin/elevate` 404 without one, and it is the
    // only path to the administrator role — so an absent value mounts `/admin/*` unreachable.
    bootstrapSecret: v.pipe(v.string(), v.minLength(32)),
    rpName: v.optional(v.string(), "Forge Studio"),
  }),
  services: v.object({
    email: v.object({
      apiKey: v.string(),
      apiUrl: v.string(),
      from: v.optional(v.string(), CONFIG.EMAIL_FROM),
      senderName: v.string(),
      to: v.optional(v.string(), CONFIG.EMAIL_TO),
    }),
    turnstile: v.object({ secretKey: v.string(), siteKey: v.string() }),
  }),
});

export const appConfig = {
  site: { url: env("SITE_ORIGIN"), debug: env("LOG_LEVEL") },
  security: { csrf: { secret: env("CSRF_SECRET") } },
  auth: {
    keyRing: env("AUTH_KEY_RING"),
    sessionSecret: env("SESSION_SECRET"),
    bootstrapSecret: env("ADMIN_BOOTSTRAP_SECRET"),
    rpName: "Forge Studio",
  },
  services: {
    email: { apiKey: env("EMAIL_API_KEY"), apiUrl: "https://api.mailchannels.net/tx/v1/send", senderName: "Forge Studio" },
    turnstile: { secretKey: env("TURNSTILE_SECRET_KEY"), siteKey: env("TURNSTILE_SITE_KEY") },
  },
};

// `AppConfigSchema` stays on `v.object` rather than `strictObject`: it parses `env`, not untrusted
// request input, and an extra binding is not an attack surface the way an extra form field is.
export const configStore = createConfig(appConfig, AppConfigSchema);

/** The one origin allowlist — the app-wide origin guard and every auth guard group check against it. */
export const originPolicy: OriginProtectionOptions<Env> = { allowedOrigins: (c) => configStore.get(c.env).site.url.allowedOrigins };

// One `RATE_LIMITER` backs every group with its window fixed in `wrangler.jsonc`, so the key is all
// a group can tighten — unkeyed here, so spreading attempts across the auth paths buys none.
/** The budget every unauthenticated auth POST shares, keyed by caller alone. */
export function authLimitPolicy(dev?: DevAllowance): RateLimitOptions<Env> {
  return { limiter: (c) => c.env.RATE_LIMITER, trustCfHeaders: true, ...(dev === undefined ? {} : { dev }) };
}

/** The signed-in console's budget, keyed per route so one page's limit is not another's. */
export function consoleLimitPolicy(dev?: DevAllowance): RateLimitOptions<Env> {
  return { ...authLimitPolicy(dev), key: (c) => `${c.request.headers.get("CF-Connecting-IP") ?? "unknown"}:${new URL(c.request.url).pathname}` };
}
