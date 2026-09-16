import { authNav } from "@y-core/forge/auth/web";
import type { AppContext as ForgeAppContext } from "@y-core/forge/context";
import { contextVar, getAppContext } from "@y-core/forge/context";
import type { DevAllowance } from "@y-core/forge/dev";
import { importCsrfKey, mintCsrf } from "@y-core/forge/form";
import { getNonce } from "@y-core/forge/security";

import { authWebPaths } from "./auth";
import { configStore } from "./config";
import type { AppConfig, AppEnv, RenderContext } from "./types";

// Wired here rather than reached through `mintCsrf`: the navbar carries the sign-out form on every
// page, and `authCsrfGuard` — the only minter that binds a token to the session `/auth/signout`
// verifies against — is mounted on the auth prefixes alone. The minter a page like `/` does have is
// `csrfVerifyGuard`'s, whose subject-less token that route would refuse. Same secret as that guard,
// so the two cannot disagree about what they sign with.
const resolveNav = authNav({
  signoutPath: authWebPaths.auth.signout(),
  secret: (context) => importCsrfKey(configStore.get(getAppContext<AppEnv, Record<string, string>, AppConfig>(context).env).security.csrf.secret),
});

/** The development entry's allowance, for the middleware and handlers that take one. Minting a
 *  `DevAllowance` means importing `@y-core/forge/dev` at value, which `validate-dev-boundary`
 *  permits only in a `*.dev.ts` entry — so on the production entry this is unset for every request. */
export const devAllowanceCtx = contextVar<DevAllowance>("devAllowance");

/** Materializes per-request values into a typed `ctx`. Config is passed explicitly (forge idiom);
 *  the context is used only to mint the CSRF token and read the nonce, so it is config-agnostic. */
export async function renderContext(c: ForgeAppContext<AppEnv>, config: AppConfig, csrfPath?: string): Promise<RenderContext> {
  return {
    // Read off the identity `resolveAuth` established against the store on this very request, so an
    // anonymous page and a signed-in one are told apart from the same source the guards judge from.
    //
    // This makes every page response identity-dependent, and nothing here sets `Cache-Control` or
    // `Vary`. Safe only because nothing caches the Worker's HTML today: add `Vary: Cookie` in the
    // same change that adds any HTML cache layer — `cf.cacheEverything`, a Cache API layer, a CDN
    // rule — or one visitor's navbar is served to the next.
    nav: await resolveNav(c),
    baseUrl: config.site.url.origin,
    // Only mint a token when the caller declares the form's action path; pages without a form
    // (e.g. the 404 page) get an empty token. `mintCsrf` requires a non-empty path.
    csrfToken: csrfPath ? await mintCsrf(c, csrfPath) : "",
    nonce: getNonce(c),
    turnstileSiteKey: config.services.turnstile.siteKey,
  };
}
