import type { Forge } from "@y-core/forge/app";
import { requireAuth, requireEnrolment, resolveAuth } from "@y-core/forge/auth/web";
import { bindingSetSchema, getAppContext, type Middleware, validateBindings } from "@y-core/forge/context";
import { csrfProtection, importCsrfKey } from "@y-core/forge/form";
import { isHxRequest } from "@y-core/forge/html/htmx";
import { consoleChannel, kvLogChannel, requestLogger } from "@y-core/forge/logging";
import {
  cors,
  createSecurityHeaders,
  originProtection,
  rateLimit,
  requestId,
  requestIdCtx,
  type SecurityHeadersOptions,
} from "@y-core/forge/security";
import { sessionCtx } from "@y-core/forge/session";
import { schemaHealthMonitor } from "@y-core/forge/storage/db";

import { routes } from "../routes";
import { authEnrolmentOptions, authGuardGroups, authIdentityOptions, authSessionGuard } from "./auth";
import { configStore, originPolicy } from "./config";
import { turnstileHostnameCtx } from "./context";
import type { AppConfig, AppEnv } from "./types";

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

export const rateLimitGuard: Middleware = (context, next) => {
  return rateLimit<AppEnv>({ limiter: (c) => c.env.RATE_LIMITER, required: false, trustCfHeaders: true })(context, next);
};

/** Publishes `TURNSTILE_DEV_HOSTNAME` to the submission pipeline. Registered only by
 *  `worker.dev.ts`, so the variable is inert in production however it is set: the testing keys make
 *  siteverify answer `hostname=example.com` whatever origin the widget ran on, and an allowance the
 *  production bundle does not import is the only shape that may state so (`WORKERS_PLATFORM.md` §4e). */
export const turnstileHostname: Middleware = (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  const hostname = configStore.get(c.env).services.turnstile.devHostname;
  if (hostname !== undefined) turnstileHostnameCtx.set(c, hostname);
  return next();
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

export function registerMiddleware(app: Forge<AppEnv>, security: SecurityHeadersOptions): void {
  // Cloudflare strips and re-writes `CF-*` headers at the edge, so on Workers they are trustworthy.
  // Forge defaults to distrust because the same code behind a bare proxy would let a caller forge them.
  app.use("*", requestId({ trustCfHeaders: true }));
  app.use("*", createSecurityHeaders(security));
  // Both bindings are optional: `wrangler dev` without a full configuration leaves them undefined,
  // and the code degrades — console-only logging, a no-op rate limiter. The schema states that, and
  // still fails a binding that is present with the wrong shape. That refusal throws, so it runs
  // after the headers are queued and before `requestLogger` reads `LOGS_KV`.
  app.use(
    "*",
    validateBindings(
      bindingSetSchema([
        { name: "LOGS_KV", methods: ["get", "put", "list"], label: "a KV namespace binding", optional: true },
        { name: "RATE_LIMITER", methods: ["limit"], label: "a rate-limiter binding", optional: true },
        // Neither is optional: auth is correctness-critical, so an absent binding fails before the
        // first request rather than degrading a guard into a no-op (`DATA_STORAGE.md` §5a).
        { name: "AUTH_DB", methods: ["prepare"], label: "the auth D1 binding" },
        { name: "AUTH_KV", methods: ["get", "put"], label: "the auth KV binding" },
      ]),
    ),
  );
  // Two D1 reads per isolate, both on `waitUntil`, so no request waits on them: a database whose
  // applied schema has drifted from what the migrations recorded says so in the log rather than in
  // whichever query fails first. The default migrations table is the one this app's wrangler config
  // uses, so the binding is all it needs.
  app.use("*", schemaHealthMonitor<AppEnv>({ binding: (c) => c.env.AUTH_DB }));
  app.use(
    "*",
    requestLogger<AppEnv>({
      channels: (c) => (c.env.LOGS_KV ? [consoleChannel(), kvLogChannel(c.env.LOGS_KV)] : [consoleChannel()]),
      bindings: (c) => ({ requestId: requestIdCtx.getOptional(c) }),
    }),
  );
  app.use("/api/*", (context, next) => {
    const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
    const origins = configStore.get(c.env).site.url.allowedOrigins;
    return cors({ origins })(context, next);
  });
  app.use("*", authSessionGuard);
  app.use("*", navIdentityGuard);
  // `/welcome` embeds forge's sign-in view, whose form posts to `/auth/signin`. Its token has to be
  // minted under the same session binding that path is verified with, so the route joins the auth
  // prefixes here rather than taking `csrfVerifyGuard`'s subject-less one.
  app.use(["/auth/*", "/account/*", "/admin/*", routes.welcome.href(), routes.account.href()], authCsrfGuard);
  for (const group of authGuardGroups()) app.use([...group.paths], ...(group.middleware ?? []));
  // This app's own signed-in landing page, so it carries the guards forge's account group carries
  // rather than rendering an empty shell to a visitor with no session.
  app.use(routes.account.href(), ...accountGuards);
}
