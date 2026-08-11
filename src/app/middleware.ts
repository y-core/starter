import type { Forge } from "@y-core/forge/app";
import { getAppContext, type Middleware } from "@y-core/forge/context";
import { csrfProtection, importCsrfKey } from "@y-core/forge/form";
import { consoleChannel, kvLogChannel, requestLogger } from "@y-core/forge/logging";
import { cors, createSecurityHeaders, rateLimit, requestId, requestIdCtx, type SecurityHeadersOptions } from "@y-core/forge/security";
import { type AppConfig, configStore } from "./config";
import type { AppEnv } from "./context";

/*******************************************************************************
 * Application middleware
 ******************************************************************************/

export function registerMiddleware(app: Forge<AppEnv>, security: SecurityHeadersOptions): void {
  app.use("*", createSecurityHeaders(security));
  // Cloudflare strips and re-writes `CF-*` headers at the edge, so on Workers they are trustworthy.
  // Forge defaults to distrust because the same code behind a bare proxy would let a caller forge them.
  app.use("*", requestId({ trustCfHeaders: true }));
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

export const rateLimitGuard: Middleware = (context, next) => {
  return rateLimit<AppEnv>({ limiter: (c) => c.env.RATE_LIMITER, required: false, trustCfHeaders: true })(context, next);
};

export const csrfVerifyGuard: Middleware = csrfProtection({
  secret: (context) => importCsrfKey(configStore.get(getAppContext<AppEnv, Record<string, string>, AppConfig>(context).env).security.csrf.secret),
  // The starter has no sessions, so there is no subject to bind a token to. `false` is the
  // deliberate, greppable opt-out — omitting it is a compile error, not a silent path-only default.
  subject: false,
});
