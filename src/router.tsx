/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import type { Forge } from "@y-core/forge/app";
import { createController } from "@y-core/forge/router";

import type { AppEnv } from "./app/types";
import { createHealthController, type HealthSlots } from "./controllers/health";
import { createHomeController, type HomeSlots } from "./controllers/home";
import { logsController } from "./controllers/logs";
import { routes } from "./routes";

export function registerRoutes(app: Forge<AppEnv>, home: HomeSlots, health: HealthSlots): void {
  health.contribute({ csrf: () => true });
  app.map(
    routes,
    createController(routes, { actions: { health: createHealthController(health), home: createHomeController(home), logs: logsController } }),
  );
}
