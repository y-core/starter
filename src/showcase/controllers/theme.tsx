/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { definePage, renderShell } from "@y-core/forge/app";

import type { AppConfig, AppEnv } from "../../app/types";
import { readDials } from "../model/dials";
import type { CustomiseData } from "../model/types";
import { CustomiseContent } from "../views/customise";

/** The theme customiser page, rendered inside this app's shell from the dials its URL carries. */
export const themeController = definePage<AppEnv, AppConfig, CustomiseData>({
  loader: (c) => ({ dials: readDials(c.url.searchParams) }),
  view: (c, _config, state) =>
    renderShell(c, <CustomiseContent data={state.data} />, { mount: "showcase", page: "theme", meta: { title: "Theme", robots: "noindex" } }),
});
