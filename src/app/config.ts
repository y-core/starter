import { createConfig, env } from "@y-core/forge/config";
import { CsrfConfigSchema } from "@y-core/forge/form";
import type { OriginProtectionOptions, RateLimitOptions, SecurityHeadersOptions } from "@y-core/forge/security";
import { BaseUrlConfigSchema, NONCE, TURNSTILE_CSP } from "@y-core/forge/security";
import { v } from "@y-core/forge/validation";

import type { StepUpFactor } from "./types";

const CONFIG = { EMAIL_FROM: "hello@yourdomain.com", EMAIL_TO: "hello@yourdomain.com" };

/** The canonical production origin, and the fallback when the environment carries none.
 *
 *  A literal, not an `env()` read: `env()` returns a mapping marker `createConfig` resolves per
 *  request, and a Worker has no module-scope environment to read anyway. The *runtime* origin is
 *  `SITE_ORIGIN` in the environment, which falls through to this when unset — so production
 *  declares nothing and `.dev.vars` sets the dev origin. */
export const SITE_ORIGIN = "https://forge-starter.workers.dev";

// A literal and not an `env()` read: the guard chain is built once at bootstrap where no request env
// exists, and `freshStepUpMaxAgeMs` has to be decided in that same bootstrap.
//
// Total rather than partial, because a partial record admits `{ passkey: undefined }`, which
// TypeScript does not catch and which reaches forge's `demanded()` as a TypeError on every guarded
// page. `"off"` is the switch: a factor set to it is never constructed, so there is no enrolment page
// to reach, no ceremony button to render and no demand to owe — a visitor is never shown it exists.
// Forge's third requirement, `{mandatoryForRoles}`, is reachable when wanted and is not a starter's
// concern.
/** What this deployment demands of each second factor, `"off"` included. A developer edits this; nothing else does. */
export const AUTH_SECOND_FACTORS: Record<StepUpFactor, "mandatory" | "optional" | "off"> = { "totp-app": "mandatory", passkey: "optional" };

export const securityHeaders: SecurityHeadersOptions = {
  scriptSrc: ["'self'", NONCE, TURNSTILE_CSP],
  connectSrc: ["'self'", TURNSTILE_CSP],
  frameSrc: ["'self'", TURNSTILE_CSP],
};

export const AppConfigSchema = v.object({
  site: v.object({
    // The default is `SITE_ORIGIN`, this app's own origin — never a placeholder like
    // `yourdomain.com`, which would derive an `allowedOrigins` naming somebody else's host and
    // 403 every mutation with the misconfiguration invisible.
    url: v.pipe(v.optional(v.string(), SITE_ORIGIN), BaseUrlConfigSchema),
    debug: v.pipe(
      v.unknown(),
      v.transform((level): boolean => level === "DEBUG"),
    ),
  }),
  security: v.object({ csrf: CsrfConfigSchema }),
  // `rpId` and `origin` are absent by design: both derive from `site.url`, so a second dev origin
  // needs no fourth declaration site (`CONFIGURATION_AND_SECRETS.md` §3d).
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
    // `devHostname` has no default: absent means "compare against the site origin's hostname",
    // which is production's only behaviour. Consulting it at all is licensed by `src/worker.dev.ts`,
    // so setting it in production is inert (`WORKERS_PLATFORM.md` §4e).
    turnstile: v.object({ secretKey: v.string(), siteKey: v.string(), devHostname: v.optional(v.string()) }),
  }),
});

export const appConfig = {
  site: { url: env("SITE_ORIGIN"), debug: env("LOG_LEVEL") },
  security: { csrf: { secret: env("CSRF_SECRET") } },
  auth: { keyRing: env("AUTH_KEY_RING"), sessionSecret: env("SESSION_SECRET"), rpName: "Forge Studio" },
  services: {
    email: { apiKey: env("EMAIL_API_KEY"), apiUrl: "https://api.mailchannels.net/tx/v1/send", senderName: "Forge Studio" },
    turnstile: { secretKey: env("TURNSTILE_SECRET_KEY"), siteKey: env("TURNSTILE_SITE_KEY"), devHostname: env("TURNSTILE_DEV_HOSTNAME") },
  },
};

// `AppConfigSchema` stays on `v.object` rather than `strictObject`: it parses `env`, not untrusted
// request input, and an extra binding is not an attack surface the way an extra form field is.
export const configStore = createConfig(appConfig, AppConfigSchema);

/** The one origin allowlist — the app-wide origin guard and every auth guard group check against it. */
export const originPolicy: OriginProtectionOptions<Env> = { allowedOrigins: (c) => configStore.get(c.env).site.url.allowedOrigins };

// One `RATE_LIMITER` binding backs every group, so its window is fixed in `wrangler.jsonc` and the
// key is the only thing a group can tighten. The sign-in surface shares one budget per address:
// spreading attempts across `/auth/signin`, `/auth/signup` and `/auth/verify` must not buy more of
// them. The console keys per route, so an administrator reading one page cannot lock themselves out
// of the next. `required: false` matches `rateLimitGuard` — a `wrangler dev` with no binding degrades.
/** The budget every unauthenticated auth POST shares, keyed by caller alone. */
export const authLimitPolicy: RateLimitOptions<Env> = { limiter: (c) => c.env.RATE_LIMITER, required: false, trustCfHeaders: true };

/** The signed-in console's budget, keyed per route so one page's limit is not another's. */
export const consoleLimitPolicy: RateLimitOptions<Env> = {
  ...authLimitPolicy,
  key: (c) => `${c.request.headers.get("CF-Connecting-IP") ?? "unknown"}:${new URL(c.request.url).pathname}`,
};
