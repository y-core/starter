import { mergeSecurityHeaders } from "@y-core/forge/security";

import { purgeAuthStores } from "./app/auth";
import { securityHeaders } from "./app/config";
import { turnstileHostname } from "./app/middleware";
import type { AppEnv } from "./app/types";
import { routes } from "./routes";
import { createWorker } from "./worker";

/* SHA-256 hash of the inline script Wrangler injects into dev (live-reload) responses.
 * The snippet is deterministic per Wrangler version, so this only drifts on a Wrangler major
 * upgrade: regenerate it from the browser console's CSP violation report
 * (the suggested `sha256-…`) after one. */
const WRANGLER_LIVE_RELOAD_HASH = "'sha256-g5a3SrOYIecCloZ8S7M4xdT1pbYi6e7mjHrmwphRxfE='";

/* Dev-only entry (selected via the `wrangler dev` positional arg). It carries every allowance
 * development needs and production must not have: the Wrangler live-reload script hash on the CSP,
 * and `TURNSTILE_DEV_HOSTNAME` published to the submission pipeline. The prod entry (worker.ts)
 * references neither, so neither can reach production. */
export const devApp = createWorker(mergeSecurityHeaders(securityHeaders, { scriptSrc: [WRANGLER_LIVE_RELOAD_HASH] }));

// After `createWorker` has mapped the routes, which is fine: `Forge.use` collects into a list the
// router reads when it is built, on the first request.
devApp.use(routes.contact.href(), turnstileHostname);

// The same two-entry module the production worker exports, so dev and production stay structurally
// identical and the cron is exercised by the entry development actually runs.
export default {
  fetch: (request: Request, env: AppEnv, ctx: ExecutionContext) => devApp.fetch(request, env, ctx),
  scheduled: async (_event: ScheduledController, env: AppEnv, _ctx: ExecutionContext) => {
    await purgeAuthStores(env);
  },
};
