import { hydrateRequestBase, type RequestBase } from "@y-core/forge/context";
import type { AppConfig } from "./config";
import type { AppEnv } from "./env";

export interface AppContext extends RequestBase {
  baseUrl?: string;
  turnstileSiteKey?: string;
}

/** Materializes per-request values from the Hono context into a typed `ctx` object. */
export async function appContext(c: AppEnv, config: AppConfig, opts?: { csrfPath?: string }): Promise<AppContext> {
  const base = await hydrateRequestBase(c, opts);
  return { ...base, baseUrl: config.site.url.origin, turnstileSiteKey: config.services.turnstile.siteKey };
}
