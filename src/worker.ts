import "@y-core/forge/jsx/register";
import { applyAssets, createApp } from "@y-core/forge/app";
import type { DevAllowance } from "@y-core/forge/dev";
import type { SecurityHeadersOptions } from "@y-core/forge/security";

import { configStore, securityHeaders } from "./app/config";
import { type MiddlewareContribution, registerMiddleware } from "./app/middleware";
import { createAppShell } from "./app/shell";
import type { AppEnv } from "./app/types";
import { createAuthMiddleware, purgeAuthStores, registerAuth } from "./auth/mod"; /* feature:auth */
import { registerContact } from "./contact/mod"; /* feature:contact */
import { createHealthSlots } from "./controllers/health";
import { createHomeSlots } from "./controllers/home";
import { notFoundController } from "./controllers/not-found";
import { createDatabaseMiddleware, registerDatabase } from "./db/mod"; /* feature:db */
import { createRateLimitMiddleware } from "./rate-limit/mod"; /* feature:rate-limit */
import { registerRoutes } from "./router";
import { registerShowcase } from "./showcase/mod"; /* feature:showcase */
import { createPrimaryNav } from "./views/nav";

/** Builds the Forge app against the CSP and development allowance the calling entry point decides. */
export function createWorker(security: SecurityHeadersOptions, dev?: DevAllowance) {
  const primaryNav = createPrimaryNav();
  const home = createHomeSlots();
  const health = createHealthSlots();
  const app = createApp<AppEnv>({
    config: configStore,
    shell: createAppShell(primaryNav),
    notFound: notFoundController,
    // A token rather than an env check, so no production deployment can switch the error boundary's
    // detail on by setting a variable — the production bundle holds nothing that could mint one.
    ...(dev === undefined ? {} : { dev }),
  });
  const middleware: MiddlewareContribution[] = [];
  middleware.push(createDatabaseMiddleware()); /* feature:db */
  middleware.push(createRateLimitMiddleware()); /* feature:rate-limit */
  middleware.push(createAuthMiddleware(dev)); /* feature:auth */
  registerMiddleware(app, security, middleware, dev);
  registerRoutes(app, home, health);
  registerDatabase(health); /* feature:db */
  registerShowcase(app, primaryNav); /* feature:showcase */
  registerContact(app, primaryNav, home, dev); /* feature:contact */
  registerAuth(app, primaryNav); /* feature:auth */
  applyAssets(app);
  return app;
}

/** The production app, exported by name so tests can reach `app.request` without the module wrapper. */
export const app = createWorker(securityHeaders);

/** Wraps an app as the module a Wrangler entry point exports; both entries build theirs here. */
export function createWorkerModule(forge: ReturnType<typeof createWorker>) {
  return {
    // A module object rather than the app itself: `fetch` is a method on the Forge instance, so it is
    // bound here.
    fetch: (request: Request, env: AppEnv, ctx: ExecutionContext) => forge.fetch(request, env, ctx),
    // feature:auth:begin
    // The cron is a second entry point, not a route, so `scheduled` has nowhere else to live.
    scheduled: async (_event: ScheduledController, env: AppEnv, _ctx: ExecutionContext) => {
      await purgeAuthStores(env);
    },
    // feature:auth:end
  };
}

export default createWorkerModule(app);
