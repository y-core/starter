import { createConfig, env } from "@y-core/forge/config";
import { getAppContext } from "@y-core/forge/context";
import { CsrfConfigSchema, type CsrfSecretResolver, importCsrfKey } from "@y-core/forge/form";
import type { OriginProtectionOptions, SecurityHeadersOptions } from "@y-core/forge/security";
import { BaseUrlConfigSchema, NONCE } from "@y-core/forge/security";
import { TURNSTILE_CSP } from "@y-core/forge/security"; /* feature:turnstile */
import { v } from "@y-core/forge/validation";

import { AuthConfigEntries, authConfig } from "../auth/app/config"; /* feature:auth */
import { EmailConfigEntries, emailConfig } from "../email/app/config"; /* feature:email */
import { TurnstileConfigEntries, turnstileConfig } from "../turnstile/app/config"; /* feature:turnstile */
import type { AppConfig, AppEnv } from "./types";

/** The canonical production origin, and the fallback when the environment's `SITE_ORIGIN` is unset. */
export const SITE_ORIGIN = "https://forge-starter.workers.dev";

const WIDGET_ORIGINS: string[] = [];
WIDGET_ORIGINS.push(TURNSTILE_CSP); /* feature:turnstile */

// Adding a key here is a regression rather than hardening: `styleSrc`, `fontSrc`, COOP, CORP and
// HSTS are forge's defaults already, and naming a `permissionsPolicy` feature *enables* it.
/** The production CSP, layered by `worker.dev.ts` alone and never widened here. */
export const securityHeaders: SecurityHeadersOptions = {
  scriptSrc: ["'self'", NONCE, ...WIDGET_ORIGINS],
  connectSrc: ["'self'", ...WIDGET_ORIGINS],
  frameSrc: ["'self'", ...WIDGET_ORIGINS],
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
  ...AuthConfigEntries, // feature:auth
  ...EmailConfigEntries, // feature:email
  ...TurnstileConfigEntries, // feature:turnstile
});

export const appConfig = { site: { url: env("SITE_ORIGIN"), debug: env("LOG_LEVEL") }, security: { csrf: { secret: env("CSRF_SECRET") } } };
Object.assign(appConfig, authConfig); /* feature:auth */
Object.assign(appConfig, emailConfig); /* feature:email */
Object.assign(appConfig, turnstileConfig); /* feature:turnstile */

// `AppConfigSchema` stays on `v.object` rather than `strictObject`: it parses `env`, not untrusted
// request input, and an extra binding is not an attack surface the way an extra form field is.
export const configStore = createConfig(appConfig, AppConfigSchema);

/** The one origin allowlist — every origin guard and auth guard group check against it. */
export const originPolicy: OriginProtectionOptions<Env> = { allowedOrigins: (c) => configStore.get(c.env).site.url.allowedOrigins };

/** The CSRF signing key every guard and minter here verifies and signs with. */
export const resolveCsrfKey: CsrfSecretResolver = (context) =>
  importCsrfKey(configStore.get(getAppContext<AppEnv, Record<string, string>, AppConfig>(context).env).security.csrf.secret);
