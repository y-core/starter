import { schemaHealthMonitor } from "@y-core/forge/storage/db";

import type { MiddlewareContribution } from "../../app/middleware";
import type { AppEnv } from "../../app/types";

/** The database's part of the global chain: the `DB` binding it refuses to serve without, and the schema monitor. */
export function createDatabaseMiddleware(): MiddlewareContribution {
  return {
    // Not optional, unlike `LOGS_KV`: a guard degraded into a no-op is worse than a refusal
    // (`BOUNDARIES.md` §5).
    bindings: [{ name: "DB", methods: ["prepare"], label: "the D1 binding" }],
    // The monitor's D1 reads run on `waitUntil`, so no request waits on them and applied-schema
    // drift is reported in the log rather than by whichever query fails first.
    globals: [schemaHealthMonitor<AppEnv>({ binding: (c) => c.env.DB })],
  };
}
