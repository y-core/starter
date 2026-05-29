import { mergeSecurityHeaders } from "@y-core/forge/security";
import { securityHeaders } from "./config/app";
import { createWorker } from "./worker";

// SHA-256 hash of the inline script Wrangler injects into dev (live-reload) responses.
// The snippet is deterministic per Wrangler version, so this only drifts on a Wrangler major
// upgrade: regenerate it from the browser console's CSP violation report
// (the suggested `sha256-…`) after one.
const WRANGLER_LIVE_RELOAD_HASH = "'sha256-g5a3SrOYIecCloZ8S7M4xdT1pbYi6e7mjHrmwphRxfE='";

// Dev-only entry (selected via the `wrangler dev` positional arg). Layers the
// Wrangler live-reload script hash onto the prod CSP so the injected reload
// snippet isn't blocked. The prod entry (worker.ts) never references this hash,
// so the allowance cannot reach production.
export default createWorker(
  mergeSecurityHeaders(securityHeaders, { scriptSrc: [WRANGLER_LIVE_RELOAD_HASH] }),
);
