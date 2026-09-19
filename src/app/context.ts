import { authNav } from "@y-core/forge/auth/web";
import type { AppContext as ForgeAppContext } from "@y-core/forge/context";
import { getAppContext } from "@y-core/forge/context";
import { importCsrfKey, mintCsrf } from "@y-core/forge/form";
import { getNonce } from "@y-core/forge/security";

import { authWebPaths } from "./auth";
import { configStore } from "./config";
import type { AppConfig, AppEnv, RenderContext } from "./types";

// The navbar's sign-out form renders on every page, but `authCsrfGuard` — the only minter binding a
// token to the session `/auth/signout` checks — is mounted on the auth prefixes alone.
const resolveNav = authNav({
  signoutPath: authWebPaths.auth.signout(),
  secret: (context) => importCsrfKey(configStore.get(getAppContext<AppEnv, Record<string, string>, AppConfig>(context).env).security.csrf.secret),
});

/** Materializes per-request values into a typed `ctx`, taking config explicitly rather than off the context. */
export async function renderContext(c: ForgeAppContext<AppEnv>, config: AppConfig, csrfPath?: string): Promise<RenderContext> {
  return {
    // This makes every page response identity-dependent while nothing sets `Vary`, which is safe
    // only while nothing caches the Worker's HTML — add `Vary: Cookie` with any layer that does.
    nav: await resolveNav(c),
    baseUrl: config.site.url.origin,
    // `mintCsrf` refuses an empty path, and a page with no form (the 404) declares none.
    csrfToken: csrfPath ? await mintCsrf(c, csrfPath) : "",
    nonce: getNonce(c),
    turnstileSiteKey: config.services.turnstile.siteKey,
  };
}
