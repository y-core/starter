import type { Forge } from "@y-core/forge/app";
import { healthCheck } from "@y-core/forge/app";
import { createController } from "@y-core/forge/router";
import { registerShowcase } from "@y-core/forge/ui/show";
import { CoreIcon } from "@assets";
import { renderContext, type AppContext, type AppEnv } from "./app/context";
import { contactController } from "./controllers/actions/contact";
import { homeController } from "./controllers/home";
import { showLogsController } from "./controllers/show.logs";
import { routes } from "./routes";
import { Layout } from "./views/layout";

export function registerRoutes(app: Forge<AppEnv>): void {
  app.map(
    routes,
    createController(routes, {
      actions: { health: healthCheck<AppContext["env"]>({ csrf: () => true }), contact: contactController, home: homeController },
    }),
  );
  app.map(routes.showcase, createController(routes.showcase, { actions: { logs: showLogsController } }));
  registerShowcase(app, routes.showcase.ui, {
    icon: CoreIcon,
    context: renderContext,
    layout: Layout,
  });
}
