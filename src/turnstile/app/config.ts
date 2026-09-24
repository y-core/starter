import { env } from "@y-core/forge/config";
import { v } from "@y-core/forge/validation";

/** The Turnstile slice's entries in `AppConfigSchema`, spread into it by the core config. @public */
export const TurnstileConfigEntries = { turnstile: v.object({ secretKey: v.string(), siteKey: v.string() }) };

/** The Turnstile slice's entries in `appConfig`, read from the environment the schema above validates. @public */
export const turnstileConfig = { turnstile: { secretKey: env("TURNSTILE_SECRET_KEY"), siteKey: env("TURNSTILE_SITE_KEY") } };
