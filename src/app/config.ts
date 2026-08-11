import { createConfig, env } from "@y-core/forge/config";
import { CsrfConfigSchema } from "@y-core/forge/form";
import type { SecurityHeadersOptions } from "@y-core/forge/security";
import { BaseUrlConfigSchema, NONCE, TURNSTILE_CSP } from "@y-core/forge/security";
import { v } from "@y-core/forge/validation";

export type AppConfig = v.InferOutput<typeof AppConfigSchema>;
export type EmailConfig = AppConfig["services"]["email"];

const CONFIG = { BASE_URL: "https://yourdomain.com", EMAIL_FROM: "hello@yourdomain.com", EMAIL_TO: "hello@yourdomain.com" };

export const securityHeaders: SecurityHeadersOptions = {
  scriptSrc: ["'self'", NONCE, TURNSTILE_CSP],
  connectSrc: ["'self'", TURNSTILE_CSP],
  frameSrc: ["'self'", TURNSTILE_CSP],
  permissionsPolicy: { microphone: ["self"] },
};

export const AppConfigSchema = v.object({
  site: v.object({
    url: v.optional(BaseUrlConfigSchema, CONFIG.BASE_URL),
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
    turnstile: v.object({ secretKey: v.string(), siteKey: v.string() }),
  }),
});

export const appConfig = {
  site: { url: env("BASE_URL"), debug: env("LOG_LEVEL") },
  security: { csrf: { secret: env("CSRF_SECRET") } },
  services: {
    email: { apiKey: env("EMAIL_API_KEY"), apiUrl: "https://api.mailchannels.net/tx/v1/send", senderName: "Forge Studio" },
    turnstile: { secretKey: env("TURNSTILE_SECRET_KEY"), siteKey: env("TURNSTILE_SITE_KEY") },
  },
};

// `AppConfigSchema` stays on `v.object` rather than `strictObject`: it parses `env`, not untrusted
// request input, and an extra binding is not an attack surface the way an extra form field is.
export const configStore = createConfig(appConfig, AppConfigSchema);
