import "@y-core/forge/jsx/register";
import { applyAssets, createApp } from "@y-core/forge/app";
import type { DevAllowance } from "@y-core/forge/dev";
import type { SecurityHeadersOptions } from "@y-core/forge/security";

import { purgeAuthStores } from "./app/auth";
import { configStore, securityHeaders } from "./app/config";
import { registerMiddleware } from "./app/middleware";
import { appShell } from "./app/shell";
import type { AppEnv } from "./app/types";
import { notFoundController } from "./controllers/not-found";
import { registerRoutes } from "./router";

/** Builds the Forge app against the CSP and development allowance the calling entry point decides. */
export function createWorker(security: SecurityHeadersOptions, dev?: DevAllowance) {
  const app = createApp<AppEnv>({
    config: configStore,
    shell: appShell,
    notFound: notFoundController,
    // A token rather than an env check, so no production deployment can switch the error boundary's
    // detail on by setting a variable — the production bundle holds nothing that could mint one.
    ...(dev === undefined ? {} : { dev }),
  });
  registerMiddleware(app, security, dev);
  registerRoutes(app);
  applyAssets(app);
  return app;
}

/** The production app, exported by name so tests can reach `app.request` without the module wrapper. */
export const app = createWorker(securityHeaders);

// A module object rather than the app itself: `fetch` is a method on the Forge instance, so it is
// bound here, and `scheduled` has nowhere else to live — the cron is a second entry point, not a route.
export default {
  fetch: (request: Request, env: AppEnv, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  scheduled: async (_event: ScheduledController, env: AppEnv, _ctx: ExecutionContext) => {
    await purgeAuthStores(env);
  },
};
