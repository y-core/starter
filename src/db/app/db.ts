import { schemaHealthCheck } from "@y-core/forge/storage/db";

import type { AppEnv } from "../../app/types";
import type { HealthSlots } from "../../controllers/health";

/** Contributes the D1 schema-fingerprint probe to the health route. */
export function registerDatabase(health: HealthSlots): void {
  health.contribute({ schema: schemaHealthCheck<AppEnv>((c) => c.env.DB) });
}
