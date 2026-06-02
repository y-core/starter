import { applyAssets, createApp } from "@y-core/forge/app";
import { applyRoutes } from "@y-core/forge/router";
import type { SecurityHeadersOptions } from "@y-core/forge/security";
import { configStore, securityHeaders } from "./app/config";
import type { AppEnv } from "./app/context";
import { applyMiddleware } from "./app/middleware";
import { notFoundView } from "./handlers/pages";
import { routes } from "./routes";

/* Builds the Hono app with a fixed CSP. The caller decides the policy:
 * Production passes the base `securityHeaders`;
 */
export function createWorker(security: SecurityHeadersOptions) {
  const app = createApp<AppEnv>({ config: configStore, isDebug: (c) => configStore.get(c.env).site.debug });
  applyMiddleware(app, security);
  applyRoutes(app, routes);
  applyAssets(app, { notFoundView });
  return app;
}

export default createWorker(securityHeaders);
