import type { Forge } from "@y-core/forge/app";
import { healthCheck } from "@y-core/forge/app";
import { createController } from "@y-core/forge/router";
import type { AppContext, AppEnv } from "./app/context";
import { contactController } from "./controllers/actions/contact";
import { homeController } from "./controllers/home";
import { showLogsController } from "./controllers/show.logs";
import { showUiController, showUiDependent, showUiPaginate, showUiPreview, showUiSearch, showUiToast, showUiValidate } from "./controllers/show.ui";
import { routes } from "./routes";

export function registerRoutes(app: Forge<AppEnv>): void {
  app.map(
    routes,
    createController(routes, {
      actions: { health: healthCheck<AppContext["env"]>({ csrf: () => true }), contact: contactController, home: homeController },
    }),
  );
  app.map(routes.showcase, createController(routes.showcase, { actions: { logs: showLogsController } }));
  app.map(routes.showcase.ui, createController(routes.showcase.ui, { actions: { index: showUiController } }));
  app.map(
    routes.showcase.ui.api,
    createController(routes.showcase.ui.api, {
      actions: {
        preview: showUiPreview,
        validate: showUiValidate,
        search: showUiSearch,
        paginate: showUiPaginate,
        dependent: showUiDependent,
        toast: showUiToast,
      },
    }),
  );
}
