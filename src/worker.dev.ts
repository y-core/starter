import { mergeSecurityHeaders } from "@y-core/forge/security";

import { securityHeaders } from "./app/config";
import { turnstileHostname } from "./app/middleware";
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
const app = createWorker(mergeSecurityHeaders(securityHeaders, { scriptSrc: [WRANGLER_LIVE_RELOAD_HASH] }));

// After `createWorker` has mapped the routes, which is fine: `Forge.use` collects into a list the
// router reads when it is built, on the first request.
app.use(routes.contact.href(), turnstileHostname);

export default app;
