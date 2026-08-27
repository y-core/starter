import type { Forge } from "@y-core/forge/app";
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

import { type AppConfig, configStore } from "./config";
import { type AppEnv, turnstileHostnameCtx } from "./context";

/*******************************************************************************
 * Application middleware
 ******************************************************************************/

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
      ]),
    ),
  );
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
}

/*******************************************************************************
 * Controllers middleware
 ******************************************************************************/

/** Refuses a mutation that did not come from htmx: the fragment responses are unusable to any other
 *  client, so accepting one would answer a full-page caller with a bare `<div>`. */
export const htmxOnlyGuard: Middleware = (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  return isHxRequest(c) ? next() : new Response("Forbidden", { status: 403 });
};

/** Fetch-Metadata plus the configured origin allowlist — strictly stronger than `verifyOrigin`
 *  alone, which accepts a request carrying neither `Origin` nor `Referer`. */
export const originGuard: Middleware = originProtection<AppEnv>({ allowedOrigins: (c) => configStore.get(c.env).site.url.allowedOrigins });

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
  // The starter has no sessions, so there is no subject to bind a token to. `false` is the
  // deliberate, greppable opt-out — omitting it is a compile error, not a silent path-only default.
  subject: false,
});
