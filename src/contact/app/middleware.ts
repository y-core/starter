import { getAppContext, type Middleware } from "@y-core/forge/context";
import { csrfMinter, csrfProtection } from "@y-core/forge/form";
import { isHxRequest } from "@y-core/forge/html/htmx";
import { originProtection } from "@y-core/forge/security";

import { originPolicy, resolveCsrfKey } from "../../app/config";
import type { AppConfig, AppEnv } from "../../app/types";

/** Refuses a mutation that did not come from htmx, whose fragment responses are unusable to any other client. */
export const htmxOnlyGuard: Middleware = (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  return isHxRequest(c) ? next() : new Response("Forbidden", { status: 403 });
};

/** Fetch-Metadata plus the configured origin allowlist, which unlike `verifyOrigin` also refuses a request carrying neither header. */
export const originGuard: Middleware = originProtection<AppEnv>(originPolicy);

export const csrfVerifyGuard: Middleware = csrfProtection({
  secret: resolveCsrfKey,
  // Nothing on these paths is posted by a session holder, so there is no subject to bind to. `false`
  // is the greppable opt-out: omitting it is a compile error, not a silent path-only default.
  subject: false,
});

/** Mints the token `csrfVerifyGuard` accepts, for a form rendered on a page that route does not serve. */
export const mintContactCsrf = csrfMinter({ secret: resolveCsrfKey, subject: false });
