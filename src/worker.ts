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

/** Builds the Forge app with a fixed CSP. The caller decides the policy, and whether a development
 *  allowance rides along — `DevAllowance` is named at type only, so this module cannot mint one. */
export function createWorker(security: SecurityHeadersOptions, dev?: DevAllowance) {
  const app = createApp<AppEnv>({
    config: configStore,
    shell: appShell,
    notFound: notFoundController,
    // The error boundary prints the thrown message only under a development entry's `errorDetail`.
    // It was an env check (`LOG_LEVEL`) until forge 0.1.15, which is the shape a production
    // deployment could switch on by setting a variable; a token the production bundle cannot mint
    // is the one that cannot.
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
