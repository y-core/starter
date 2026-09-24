import type { DevAllowance } from "@y-core/forge/dev";
import type { RateLimitOptions } from "@y-core/forge/security";

import type { MiddlewareContribution } from "../../app/middleware";

// One `RATE_LIMITER` backs every group with its window fixed in `wrangler.jsonc`, so the key is all
// a group can tighten — unkeyed here, so spreading attempts across the guarded paths buys none.
/** The budget every unauthenticated POST shares, keyed by caller alone. */
export function rateLimitPolicy(dev?: DevAllowance): RateLimitOptions<Env> {
  return { limiter: (c) => c.env.RATE_LIMITER, trustCfHeaders: true, ...(dev === undefined ? {} : { dev }) };
}

/** The rate limiter's part of the global chain: the optional `RATE_LIMITER` binding. */
export function createRateLimitMiddleware(): MiddlewareContribution {
  return { bindings: [{ name: "RATE_LIMITER", methods: ["limit"], label: "a rate-limiter binding", optional: true }] };
}
