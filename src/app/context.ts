import type { CsrfContext } from "@y-core/forge/form";
import { mintCsrf } from "@y-core/forge/form";
import type { LoggerContext } from "@y-core/forge/logging";
import type { Context } from "@y-core/forge/router";
import type { RequestIdContext, SecureHeadersContext } from "@y-core/forge/security";
import { getNonce } from "@y-core/forge/security";
import type { AppConfig } from "./config";

export type Bindings = Env;
export type AppEnv = { Bindings: Bindings; Config: AppConfig; Variables: CsrfContext & RequestIdContext & LoggerContext & SecureHeadersContext };
export type AppContext = Context<AppEnv>;

export interface RenderContext {
  baseUrl?: string;
  csrfToken: string;
  nonce: string;
  turnstileSiteKey?: string;
}

/** Materializes per-request values from the Hono context into a typed `ctx` object. */
export async function renderContext(c: AppContext, config: AppConfig, opts?: { csrfPath?: string }): Promise<RenderContext> {
  return {
    baseUrl: config.site.url.origin,
    csrfToken: await mintCsrf(c, opts?.csrfPath),
    nonce: getNonce(c),
    turnstileSiteKey: config.services.turnstile.siteKey,
  };
}
