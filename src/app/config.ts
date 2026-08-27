import { createConfig, env } from "@y-core/forge/config";
import { CsrfConfigSchema } from "@y-core/forge/form";
import type { SecurityHeadersOptions } from "@y-core/forge/security";
import { BaseUrlConfigSchema, NONCE, TURNSTILE_CSP } from "@y-core/forge/security";
import { v } from "@y-core/forge/validation";

export type AppConfig = v.InferOutput<typeof AppConfigSchema>;
export type EmailConfig = AppConfig["services"]["email"];

const CONFIG = { EMAIL_FROM: "hello@yourdomain.com", EMAIL_TO: "hello@yourdomain.com" };

/** The canonical production origin, and the fallback when the environment carries none.
 *
 *  A literal, not an `env()` read: `env()` returns a mapping marker `createConfig` resolves per
 *  request, and a Worker has no module-scope environment to read anyway. The *runtime* origin is
 *  `SITE_ORIGIN` in the environment, which falls through to this when unset — so production
 *  declares nothing and `.dev.vars` sets the dev origin. */
export const SITE_ORIGIN = "https://forge-starter.workers.dev";

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
  services: {
    email: { apiKey: env("EMAIL_API_KEY"), apiUrl: "https://api.mailchannels.net/tx/v1/send", senderName: "Forge Studio" },
    turnstile: { secretKey: env("TURNSTILE_SECRET_KEY"), siteKey: env("TURNSTILE_SITE_KEY"), devHostname: env("TURNSTILE_DEV_HOSTNAME") },
  },
};

// `AppConfigSchema` stays on `v.object` rather than `strictObject`: it parses `env`, not untrusted
// request input, and an extra binding is not an attack surface the way an extra form field is.
export const configStore = createConfig(appConfig, AppConfigSchema);
