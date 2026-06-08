import "@y-core/forge/jsx/register";
import { applyAssets, createApp } from "@y-core/forge/app";
import type { SecurityHeadersOptions } from "@y-core/forge/security";
import { configStore, securityHeaders } from "./app/config";
import type { AppEnv } from "./app/context";
import { registerMiddleware } from "./app/middleware";
import { notFoundController } from "./controllers/not-found";
import { registerRoutes } from "./router";

/** Builds the Forge app with a fixed CSP. The caller decides the policy. */
export function createWorker(security: SecurityHeadersOptions) {
  const app = createApp<AppEnv>({ config: configStore, isDebug: (c) => configStore.get(c.env).site.debug });
  registerMiddleware(app, security);
  registerRoutes(app);
  applyAssets(app, { notFoundView: notFoundController });
  return app;
}

export default createWorker(securityHeaders);
