/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { definePage, renderShell } from "@y-core/forge/app";

import type { AppConfig, AppEnv } from "../../app/types";
import { loadTurnstileOptions } from "../model/turnstile";
import type { ShowcaseData } from "../model/types";
import { SHOWCASE_PAGES, ShowcaseContent } from "../views/components";
import type { ShowcasePage } from "../views/types";

/** Creates the controller for one catalog page, rendered inside this app's shell. */
export function createCatalogController(page: ShowcasePage) {
  return definePage<AppEnv, AppConfig, ShowcaseData>({
    loader: (c) => ({ turnstile: loadTurnstileOptions(c.url.searchParams) }),
    view: (c, _config, state) =>
      renderShell(c, <ShowcaseContent data={state.data} page={page} />, {
        mount: "showcase",
        page,
        meta: { title: SHOWCASE_PAGES[page].label, robots: "noindex" },
      }),
  });
}
