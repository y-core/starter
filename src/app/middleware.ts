import { applyMiddlewareChain, type Forge } from "@y-core/forge/app";
import { requireAuth, requireEnrolment, resolveAuth } from "@y-core/forge/auth/web";
import { bindingSetSchema, getAppContext, type Middleware } from "@y-core/forge/context";
import type { DevAllowance } from "@y-core/forge/dev";
import { csrfProtection, importCsrfKey } from "@y-core/forge/form";
import { isHxRequest } from "@y-core/forge/html/htmx";
import { consoleChannel, kvLogChannel, type LogRecord, withRedaction } from "@y-core/forge/logging";
import { cors, originProtection, rateLimit, requestIdCtx, type SecurityHeadersOptions } from "@y-core/forge/security";
import { sessionCtx } from "@y-core/forge/session";
import { schemaHealthMonitor } from "@y-core/forge/storage/db";

import { routes } from "../routes";
import { authEnrolmentOptions, authGuardGroups, authIdentityOptions, authSessionGuard } from "./auth";
import { configStore, originPolicy } from "./config";
import { devAllowanceCtx } from "./context";
import type { AppConfig, AppEnv } from "./types";

/** Field names whose value never reaches the KV log store, whatever a call site passes. */
const PERSISTED_DENY = [
  "email",
  "name",
  "displayName",
  "userName",
  "phone",
  "message",
  // A provider error body routinely echoes the recipient address back.
  "body",
  "token",
  "password",
  "secret",
  "cookie",
  "authorization",
];

/** Strips PII fields and the stack from a record on its way to KV, which outlives a console line by
 *  months (`BOUNDARIES.md` §4a). The console channel is deliberately left unwrapped: a stack is what
 *  makes a local failure readable, and nothing retains it. */
function redactPersisted(record: LogRecord): LogRecord {
  if (!record.data) return record;
  const data: Record<string, unknown> = { ...record.data };
  for (const field of PERSISTED_DENY) if (field in data) data[field] = "[redacted]";
  const { error } = data;
  if (error !== null && typeof error === "object" && "stack" in error) {
    const { stack: _stack, ...rest } = error as Record<string, unknown>;
    data["error"] = rest;
  }
  return { ...record, data };
}

/** Refuses a mutation that did not come from htmx: the fragment responses are unusable to any other
 *  client, so accepting one would answer a full-page caller with a bare `<div>`. */
export const htmxOnlyGuard: Middleware = (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  return isHxRequest(c) ? next() : new Response("Forbidden", { status: 403 });
};

// Every page carries the shared navbar, which shows a signed-in visitor a different set of
// destinations — so the identity has to be established on the unguarded routes too, the 404 page
// included. The JSON API renders no navbar and is the one prefix that would pay a user-store read
// for an identity nothing on the response depends on. This admits everyone; what a visitor may
// reach is still decided by the guards below.
/** Establishes the identity for every request that can render the shared navbar. */
export const navIdentityGuard: Middleware = (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  if (c.url.pathname.startsWith("/api/")) return next();
  return resolveAuth<AppEnv>({ users: authIdentityOptions.users })(context, next);
};

// Both, and in this order, because forge's own account group carries both: an app page that
// established an identity but skipped `requireEnrolment` would let a visitor who still owes the
// deployment's mandatory factor sit on a signed-in page, which is the demand read as optional.
/** The identity and enrolment guards this app's own account page carries, as forge's group does. */
export const accountGuards: readonly Middleware[] = [requireAuth<AppEnv>(authIdentityOptions), requireEnrolment<AppEnv>(authEnrolmentOptions)];

/** Fetch-Metadata plus the configured origin allowlist — strictly stronger than `verifyOrigin`
 *  alone, which accepts a request carrying neither `Origin` nor `Referer`. */
export const originGuard: Middleware = originProtection<AppEnv>(originPolicy);

// An absent `RATE_LIMITER` answers 503 unless a development entry licenses the skip, so the
// allowance is read off the request rather than fixed when the guard is built.
export const rateLimitGuard: Middleware = (context, next) => {
  const dev = devAllowanceCtx.getOptional(getAppContext<AppEnv, Record<string, string>, AppConfig>(context));
  return rateLimit<AppEnv>({ limiter: (c) => c.env.RATE_LIMITER, trustCfHeaders: true, ...(dev === undefined ? {} : { dev }) })(context, next);
};

export const csrfVerifyGuard: Middleware = csrfProtection({
  secret: (context) => importCsrfKey(configStore.get(getAppContext<AppEnv, Record<string, string>, AppConfig>(context).env).security.csrf.secret),
  // This guard's paths are disjoint from the auth group's, and only the auth group's forms are
  // posted by a session holder — so there is no subject here to bind a token to. `false` is the
  // deliberate, greppable opt-out — omitting it is a compile error, not a silent path-only default.
  subject: false,
});

/** The auth prefixes' own CSRF protection, whose tokens are additionally bound to the session that
 *  minted them. Disjoint from `csrfVerifyGuard`'s paths, so the two never both run. */
export const authCsrfGuard: Middleware = csrfProtection({
  secret: (context) => importCsrfKey(configStore.get(getAppContext<AppEnv, Record<string, string>, AppConfig>(context).env).security.csrf.secret),
  subject: (context) => sessionCtx.getOptional(context)?.id,
});

/** Publishes the development allowance on every request, so a handler takes it from the context
 *  rather than from a second entry-point wiring. `DevAllowance` is named at type only here, so the
 *  production bundle holds no module that could mint one. */
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
    // Cloudflare strips and re-writes `CF-*` headers at the edge, so on Workers they are trustworthy.
    // Forge defaults to distrust because the same code behind a bare proxy would let a caller forge
    // them. One flag settles it for `requestId` and for every group's rate limiter alike.
    trustCfHeaders: true,
    logging: {
      channels: (c) => (c.env.LOGS_KV ? [consoleChannel(), withRedaction(kvLogChannel(c.env.LOGS_KV), redactPersisted)] : [consoleChannel()]),
      bindings: (c) => ({ requestId: requestIdCtx.getOptional(c) }),
    },
    securityHeaders: security,
    // Both KV bindings are optional: `wrangler dev` without a full configuration leaves them
    // undefined, and the code degrades — console-only logging, a no-op rate limiter. The schema
    // states that, and still fails a binding that is present with the wrong shape. That refusal
    // throws, which is why the builder runs it after the headers (`forge/ROUTING_AND_MIDDLEWARE.md` §3e).
    bindings: bindingSetSchema([
      { name: "LOGS_KV", methods: ["get", "put", "list"], label: "a KV namespace binding", optional: true },
      { name: "RATE_LIMITER", methods: ["limit"], label: "a rate-limiter binding", optional: true },
      // Neither is optional: auth is correctness-critical, so an absent binding fails before the
      // first request rather than degrading a guard into a no-op (`BOUNDARIES.md` §5).
      { name: "AUTH_DB", methods: ["prepare"], label: "the auth D1 binding" },
      { name: "AUTH_KV", methods: ["get", "put"], label: "the auth KV binding" },
    ]),
    session: authSessionGuard,
    // Two D1 reads per isolate for the schema monitor, both on `waitUntil`, so no request waits on
    // them: a database whose applied schema has drifted from what the migrations recorded says so in
    // the log rather than in whichever query fails first.
    globals: [schemaHealthMonitor<AppEnv>({ binding: (c) => c.env.AUTH_DB }), navIdentityGuard],
    guards: [
      { paths: ["/api/*"], guards: [corsGuard] },
      // `/welcome` embeds forge's sign-in view, whose form posts to `/auth/signin`. Its token has to
      // be minted under the same session binding that path is verified with, so the route joins the
      // auth prefixes here rather than taking `csrfVerifyGuard`'s subject-less one.
      { paths: ["/auth/*", "/account/*", "/admin/*", routes.welcome.href(), routes.account.href()], guards: [authCsrfGuard] },
      ...authGuardGroups(dev),
      // This app's own signed-in landing page, so it carries the guards forge's account group
      // carries rather than rendering an empty shell to a visitor with no session.
      { paths: [routes.account.href()], guards: [...accountGuards] },
    ],
  });
}
