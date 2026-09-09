import { CoreIcon } from "@assets";
import type { Forge } from "@y-core/forge/app";
import { healthCheck } from "@y-core/forge/app";
import { registerAccount, registerAdmin, registerAuth } from "@y-core/forge/auth/web";
import { createController } from "@y-core/forge/router";
import { schemaHealthCheck } from "@y-core/forge/storage/db";
import { registerShowcase } from "@y-core/forge/ui/show";

import { authWebOptions } from "./app/auth";
import type { AppContext, AppEnv } from "./app/types";
import { accountController } from "./controllers/account";
import { contactController } from "./controllers/actions/contact";
import { emailChangeConfirmController } from "./controllers/actions/email-change-confirm";
import { homeController } from "./controllers/home";
import { showLogsController } from "./controllers/show.logs";
import { welcomeController } from "./controllers/welcome";
import { accountRouteMap, adminRouteMap, authRouteMap, routes } from "./routes";

export function registerRoutes(app: Forge<AppEnv>): void {
  app.map(
    routes,
    createController(routes, {
      actions: {
        health: healthCheck<AppContext["env"]>({ csrf: () => true, schema: schemaHealthCheck((c) => c.env.AUTH_DB) }),
        contact: contactController,
        home: homeController,
        authEmailConfirm: emailChangeConfirmController,
        account: accountController,
        welcome: welcomeController,
      },
    }),
  );
  app.map(routes.showcase, createController(routes.showcase, { actions: { logs: showLogsController } }));
  registerShowcase(app, routes.showcase.ui, { icon: CoreIcon });
  registerAuth(app, authRouteMap, authWebOptions);
  registerAccount(app, accountRouteMap, authWebOptions);
  registerAdmin(app, adminRouteMap, authWebOptions);
}
