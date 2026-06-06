import type { AppContext as ForgeAppContext } from "@y-core/forge/context";
import { mintCsrf } from "@y-core/forge/form";
import { getNonce } from "@y-core/forge/security";
import type { AppConfig } from "./config";

export interface RenderContext {
  baseUrl?: string;
  csrfToken: string;
  nonce: string;
  turnstileSiteKey?: string;
}

export type AppEnv = Env;
export type AppContext = ForgeAppContext<AppEnv, Record<string, string>, AppConfig>;

/** Materializes per-request values into a typed `ctx`. Config is passed explicitly (forge idiom);
 *  the context is used only to mint the CSRF token and read the nonce, so it is config-agnostic. */
export async function renderContext(c: ForgeAppContext<AppEnv>, config: AppConfig, csrfPath?: string): Promise<RenderContext> {
  return {
    baseUrl: config.site.url.origin,
    // Only mint a token when the caller declares the form's action path; pages without a form
    // (e.g. the 404 page) get an empty token. `mintCsrf` requires a non-empty path.
    csrfToken: csrfPath ? await mintCsrf(c, csrfPath) : "",
    nonce: getNonce(c),
    turnstileSiteKey: config.services.turnstile.siteKey,
  };
}
