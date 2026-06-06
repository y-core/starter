import { healthCheck } from "@y-core/forge/app";
import { createController } from "@y-core/forge/router";
import type { AppContext } from "./app/context";
import { contactController } from "./controllers/actions/contact";
import { adminLogsController } from "./controllers/admin-logs";
import { homeController } from "./controllers/home";
import { routes } from "./routes";

export const controller = createController(routes, {
  actions: {
    health: healthCheck<AppContext["env"]>({ csrf: () => true }),
    contact: contactController,
    home: homeController,
    adminLogs: adminLogsController,
  },
});
