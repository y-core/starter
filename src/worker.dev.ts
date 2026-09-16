import { devAllowance } from "@y-core/forge/dev";
import { mergeSecurityHeaders } from "@y-core/forge/security";

import { purgeAuthStores } from "./app/auth";
import { securityHeaders } from "./app/config";
import type { AppEnv } from "./app/types";
import { createWorker } from "./worker";

/* SHA-256 hash of the inline script Wrangler injects into dev (live-reload) responses.
 * The snippet is deterministic per Wrangler version, so this only drifts on a Wrangler major
 * upgrade: regenerate it from the browser console's CSP violation report
 * (the suggested `sha256-…`) after one. */
const WRANGLER_LIVE_RELOAD_HASH = "'sha256-g5a3SrOYIecCloZ8S7M4xdT1pbYi6e7mjHrmwphRxfE='";

/* Dev-only entry (selected via the `wrangler dev` positional arg), and the only module in this app
 * that imports `@y-core/forge/dev` at value — `validate-dev-boundary` is what holds it to that, so
 * the production bundle contains nothing that could mint the token below.
 *
 * It carries the Wrangler live-reload script hash on the CSP, and three relaxations:
 *   - `turnstileTestingSecrets` — Cloudflare's testing secrets make siteverify answer a fixed
 *     hostname whatever origin the widget ran on, so an app pinning its own refuses every local
 *     submission. The comparison is skipped only under a testing secret and this token together
 *     (`INPUT_VALIDATION.md` §4a).
 *   - `rateLimitOptional` — a `wrangler dev` with no `RATE_LIMITER` binding degrades rather than
 *     answering 503. Production declares the binding, so there it is never absent.
 *   - `errorDetail` — the error boundary prints the thrown message instead of a fixed sentence. */
export const devApp = createWorker(
  mergeSecurityHeaders(securityHeaders, { scriptSrc: [WRANGLER_LIVE_RELOAD_HASH] }),
  devAllowance({ turnstileTestingSecrets: true, rateLimitOptional: true, errorDetail: true }),
);

// The same two-entry module the production worker exports, so dev and production stay structurally
// identical and the cron is exercised by the entry development actually runs.
export default {
  fetch: (request: Request, env: AppEnv, ctx: ExecutionContext) => devApp.fetch(request, env, ctx),
  scheduled: async (_event: ScheduledController, env: AppEnv, _ctx: ExecutionContext) => {
    await purgeAuthStores(env);
  },
};
