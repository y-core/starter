import { devAllowance } from "@y-core/forge/dev";
import { mergeSecurityHeaders } from "@y-core/forge/security";

import { securityHeaders } from "./app/config";
import { createWorker, createWorkerModule } from "./worker";

// Deterministic per Wrangler version, so it drifts only on a major upgrade: regenerate it from the
// browser console's CSP violation report, which suggests the `sha256-…` to paste here.
const WRANGLER_LIVE_RELOAD_HASH = "'sha256-g5a3SrOYIecCloZ8S7M4xdT1pbYi6e7mjHrmwphRxfE='";

/** The dev entry, and the only module here importing `@y-core/forge/dev` at value. */
export const devApp = createWorker(
  mergeSecurityHeaders(securityHeaders, { scriptSrc: [WRANGLER_LIVE_RELOAD_HASH] }),
  devAllowance({ turnstileTestingSecrets: true, rateLimitOptional: true, errorDetail: true }),
);

// The production worker's own wrapper rather than a copy of it, so dev and production cannot drift
// apart and the cron is exercised by the entry development actually runs.
export default createWorkerModule(devApp);
