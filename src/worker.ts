// Wrangler's esbuild skips tsconfig lookup for node_modules, so @y-core/forge UI
// components compile to React.createElement instead of Hono's jsx runtime.
// hono/jsx exports createElement with identical React.createElement signature.
import { createElement } from "hono/jsx";

(globalThis as unknown as { React: object }).React = { createElement };

import { createApp, serveAssets } from "@y-core/forge/app";
import { applyRoutes } from "@y-core/forge/router";
import { makeSecurityHeaders, type SecurityHeadersOptions } from "@y-core/forge/security";
import { configStore, securityHeaders } from "./config/app";
import type { AppEnv } from "./context";
import { notFoundView } from "./handlers/pages";
import { routes } from "./routes";

/* Builds the Hono app with a fixed CSP. The caller decides the policy:
 * Production passes the base `securityHeaders`;
 */
export function createWorker(security: SecurityHeadersOptions) {
  const app = createApp<AppEnv>({ config: configStore, isDebug: (c) => configStore.get(c.env).site.debug });
  app.use("*", makeSecurityHeaders(security));
  applyRoutes(app, routes);
  app.all("*", serveAssets(app, { notFoundView }));
  return app;
}

export default createWorker(securityHeaders);
