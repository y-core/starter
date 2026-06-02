import { csrfProtection, importCsrfKey } from "@y-core/forge/form";
import { consoleChannel, kvLogChannel, requestLogger } from "@y-core/forge/logging";
import type { App, MiddlewareHandler } from "@y-core/forge/router";
import { cors, makeSecurityHeaders, rateLimit, requestId, requestIdCtx, type SecurityHeadersOptions, verifyOrigin } from "@y-core/forge/security";
import { configStore } from "./config";
import type { AppEnv } from "./context";

/*******************************************************************************
 * Application middleware
 ******************************************************************************/

export function applyMiddleware(app: App<AppEnv>, security: SecurityHeadersOptions): void {
  app.use("*", makeSecurityHeaders(security));
  app.use("*", requestId());
  app.use(
    "*",
    requestLogger<AppEnv>({
      channels: (c) => (c.env.LOGS_KV ? [consoleChannel(), kvLogChannel(c.env.LOGS_KV)] : [consoleChannel()]),
      bindings: (c) => ({ requestId: requestIdCtx.getOptional(c) }),
    }),
  );
  app.use("/api/*", async (c, next) => {
    const origins = configStore.get(c.env).site.url.allowedOrigins;
    return cors({ origins })(c, next);
  });
}

/*******************************************************************************
 * Routes middleware
 ******************************************************************************/

export const contactSecurityGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  // POST-only route — assert the method defensively before any other checks.
  if (c.req.method !== "POST") return c.text("Forbidden", 403);
  const { allowedOrigins } = configStore.get(c.env).site.url;
  if (!verifyOrigin(c.req.raw, allowedOrigins).ok) return c.text("Forbidden", 403);
  if (c.req.header("HX-Request") !== "true") return c.text("Forbidden", 403);
  const ct = c.req.header("content-type") ?? "";
  if (!ct.includes("application/x-www-form-urlencoded")) return c.text("Unsupported Media Type", 415);
  return next();
};

export const rateLimitGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  return rateLimit<AppEnv>({ limiter: (c) => c.env.RATE_LIMITER, required: false })(c, next);
};

export const csrfVerifyGuard: MiddlewareHandler<AppEnv> = csrfProtection({
  secret: async (c) => importCsrfKey(configStore.get(c.env).security.csrf.secret),
});
