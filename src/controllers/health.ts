import { healthCheck } from "@y-core/forge/app";
import type { RequestHandler } from "@y-core/forge/router";

import type { AppEnv } from "../app/types";

/** One named probe the health route runs, typed against this app's bindings. @public */
export type HealthCheck = Parameters<typeof healthCheck<AppEnv>>[0][string];

/** What one owner adds to the health route: its checks, keyed by the name the JSON reports. @public */
export type HealthContribution = Readonly<Record<string, HealthCheck>>;

/** The health route's contribution point, filled at registration and read on every request. @public */
export interface HealthSlots {
  contribute: (contribution: HealthContribution) => void;
  checks: () => HealthContribution;
}

/** Creates the health route's empty contribution point, one per app; a name contributed twice throws. @public */
export function createHealthSlots(): HealthSlots {
  const contributed: Record<string, HealthCheck> = {};
  return {
    contribute: (contribution) => {
      const taken = Object.keys(contribution).find((name) => Object.hasOwn(contributed, name));
      if (taken !== undefined) throw new Error(`health: the check "${taken}" is already contributed.`);
      Object.assign(contributed, contribution);
    },
    checks: () => ({ ...contributed }),
  };
}

/** The health route, running every contributed check on each request. */
export function createHealthController(slots: HealthSlots): RequestHandler {
  return (context) => healthCheck<AppEnv>(slots.checks())(context);
}
