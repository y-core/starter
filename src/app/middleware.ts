import { applyMiddlewareChain, type Forge } from "@y-core/forge/app";
import { requireAuth, requireEnrolment, resolveAuth } from "@y-core/forge/auth/web";
import { bindingSetSchema, getAppContext, type Middleware } from "@y-core/forge/context";
import type { DevAllowance } from "@y-core/forge/dev";
import { csrfProtection, importCsrfKey } from "@y-core/forge/form";
import { isHxRequest } from "@y-core/forge/html/htmx";
import { consoleChannel, kvLogChannel } from "@y-core/forge/logging";
import { cors, originProtection, rateLimit, requestIdCtx, type SecurityHeadersOptions } from "@y-core/forge/security";
import { sessionCtx } from "@y-core/forge/session";
import { schemaHealthMonitor } from "@y-core/forge/storage/db";

import { routes } from "../routes";
import { authEnrolmentOptions, authGuardGroups, authIdentityOptions, authSessionGuard } from "./auth";
import { authLimitPolicy, configStore, originPolicy } from "./config";
import { devAllowanceCtx } from "./dev";
import type { AppConfig, AppEnv } from "./types";

/** Refuses a mutation that did not come from htmx, whose fragment responses are unusable to any other client. */
export const htmxOnlyGuard: Middleware = (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  return isHxRequest(c) ? next() : new Response("Forbidden", { status: 403 });
};

// The navbar shows a signed-in visitor different destinations, so the identity is needed on the
// unguarded routes too. `/api/` renders none, and would pay a user-store read for nothing.
/** Establishes the identity for every request that can render the shared navbar. */
export const navIdentityGuard: Middleware = (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  if (c.url.pathname.startsWith("/api/")) return next();
  return resolveAuth<AppEnv>({ users: authIdentityOptions.users })(context, next);
};

// Dropping `requireEnrolment` would leave a visitor who still owes the mandatory factor sitting on
// a signed-in page, which is a mandatory demand read as an optional one.
/** The identity and enrolment guards this app's own account page carries, as forge's group does. */
export const accountGuards: readonly Middleware[] = [requireAuth<AppEnv>(authIdentityOptions), requireEnrolment<AppEnv>(authEnrolmentOptions)];

/** Fetch-Metadata plus the configured origin allowlist, which unlike `verifyOrigin` also refuses a request carrying neither header. */
export const originGuard: Middleware = originProtection<AppEnv>(originPolicy);

// An absent `RATE_LIMITER` answers 503 unless a development entry licenses the skip, so the
// allowance is read off the request rather than fixed when the guard is built.
export const rateLimitGuard: Middleware = (context, next) => {
  const dev = devAllowanceCtx.getOptional(getAppContext<AppEnv, Record<string, string>, AppConfig>(context));
  return rateLimit<AppEnv>({ limiter: (c) => c.env.RATE_LIMITER, trustCfHeaders: true, ...(dev === undefined ? {} : { dev }) })(context, next);
};

export const csrfVerifyGuard: Middleware = csrfProtection({
  secret: (context) => importCsrfKey(configStore.get(getAppContext<AppEnv, Record<string, string>, AppConfig>(context).env).security.csrf.secret),
  // Nothing on these paths is posted by a session holder, so there is no subject to bind to. `false`
  // is the greppable opt-out: omitting it is a compile error, not a silent path-only default.
  subject: false,
});

/** The auth prefixes' own CSRF protection, whose tokens are bound to the session that minted them. */
export const authCsrfGuard: Middleware = csrfProtection({
  secret: (context) => importCsrfKey(configStore.get(getAppContext<AppEnv, Record<string, string>, AppConfig>(context).env).security.csrf.secret),
  subject: (context) => sessionCtx.getOptional(context)?.id,
});

/** Publishes the development allowance on every request, so a handler takes it from the context rather than from a second entry-point wiring. */
function devAllowanceGuard(dev: DevAllowance): Middleware {
  return (context, next) => {
    devAllowanceCtx.set(getAppContext<AppEnv, Record<string, string>, AppConfig>(context), dev);
    return next();
  };
}

/** Answers a cross-origin API call against the allowlist this request's config carries. */
const corsGuard: Middleware = (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  return cors({ origins: configStore.get(c.env).site.url.allowedOrigins })(context, next);
};

export function registerMiddleware(app: Forge<AppEnv>, security: SecurityHeadersOptions, dev?: DevAllowance): void {
  applyMiddlewareChain<AppEnv>(app, {
    // Ahead of `requestId`, because a handler may read the allowance and nothing here renders with
    // the nonce (`forge/ROUTING_AND_MIDDLEWARE.md` §3e).
    ...(dev === undefined ? {} : { before: [devAllowanceGuard(dev)] }),
    // Cloudflare rewrites `CF-*` at the edge, so on Workers they are trustworthy; forge defaults to
    // distrust because the same code behind a bare proxy would let a caller forge them.
    trustCfHeaders: true,
    logging: {
      // No `redact`: the contact form's three uncovered fields never reach a record, because the
      // handler logs a status or a thrown value and never a submitted field.
      channels: (c) => (c.env.LOGS_KV ? [consoleChannel(), kvLogChannel(c.env.LOGS_KV)] : [consoleChannel()]),
      bindings: (c) => ({ requestId: requestIdCtx.getOptional(c) }),
    },
    securityHeaders: security,
    // The refusal this schema raises throws, which is why the builder runs it after the headers
    // (`forge/ROUTING_AND_MIDDLEWARE.md` §3e).
    bindings: bindingSetSchema([
      { name: "LOGS_KV", methods: ["get", "put", "list"], label: "a KV namespace binding", optional: true },
      { name: "RATE_LIMITER", methods: ["limit"], label: "a rate-limiter binding", optional: true },
      // Not optional, unlike the two above: a guard degraded into a no-op is worse than a refusal
      // (`BOUNDARIES.md` §5).
      { name: "AUTH_DB", methods: ["prepare"], label: "the auth D1 binding" },
      { name: "AUTH_KV", methods: ["get", "put"], label: "the auth KV binding" },
    ]),
    session: authSessionGuard,
    // The monitor's D1 reads run on `waitUntil`, so no request waits on them and applied-schema
    // drift is reported in the log rather than by whichever query fails first.
    globals: [schemaHealthMonitor<AppEnv>({ binding: (c) => c.env.AUTH_DB }), navIdentityGuard],
    guards: [
      { paths: ["/api/*"], guards: [corsGuard] },
      // `/welcome` embeds forge's sign-in view, whose form posts to `/auth/signin` — so its token
      // must be minted under the same session binding that path verifies against.
      { paths: ["/auth/*", "/account/*", "/admin/*", routes.welcome.href(), routes.account.href()], guards: [authCsrfGuard] },
      ...authGuardGroups(dev),
      // This app's own signed-in landing page, outside forge's account group but owing its guards.
      { paths: [routes.account.href()], guards: [...accountGuards] },
      // App-owned, so outside `authGuardGroups`, and on the same unkeyed budget as the /auth POSTs: a
      // token grind costs a D1 read and a nonce consume per hit. No `origin` — a GET is exempt from it.
      { paths: [routes.authEmailConfirm.href()], rateLimit: authLimitPolicy(dev) },
    ],
  });
}
