import type { Forge } from "@y-core/forge/app";
import { createController } from "@y-core/forge/router";

import type { AppEnv } from "../app/types";
import type { PrimaryNav } from "../views/nav";
import { avatarController } from "./controllers/avatar";
import { createCatalogController } from "./controllers/catalog";
import {
  dependentController,
  paginateController,
  previewController,
  searchController,
  toastController,
  validateController,
} from "./controllers/fragments";
import { themeController } from "./controllers/theme";
import { createTurnstileVerifyController } from "./controllers/turnstile-verify";
import { showcaseRouteMap } from "./routes";

/** Mounts the showcase slice on the app and contributes its entries to the primary navbar. */
export function registerShowcase(app: Forge<AppEnv>, primaryNav: PrimaryNav): void {
  app.map(
    showcaseRouteMap,
    createController(showcaseRouteMap, {
      actions: {
        index: createCatalogController("index"),
        interactive: createCatalogController("interactive"),
        runtime: createCatalogController("runtime"),
        htmx: createCatalogController("htmx"),
        turnstile: createCatalogController("turnstile"),
        chrome: createCatalogController("chrome"),
        theme: themeController,
      },
    }),
  );
  app.map(
    showcaseRouteMap.api,
    createController(showcaseRouteMap.api, {
      actions: {
        preview: previewController,
        validate: validateController,
        search: searchController,
        paginate: paginateController,
        dependent: dependentController,
        toast: toastController,
        avatar: avatarController,
        turnstileVerify: createTurnstileVerifyController(),
      },
    }),
  );
  primaryNav.contribute({
    items: [
      {
        label: "Forge Showcase",
        items: [
          {
            label: "UI",
            items: [
              { label: "Components", href: "showcase" },
              { label: "Theme customiser", href: "showcaseTheme" },
            ],
          },
        ],
      },
    ],
    hrefs: { showcase: showcaseRouteMap.index.href(), showcaseTheme: showcaseRouteMap.theme.href() },
    before: "logs",
  });
}
