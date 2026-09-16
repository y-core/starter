/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { definePage, renderShell } from "@y-core/forge/app";

import { renderContext } from "../app/context";
import { csrfVerifyGuard } from "../app/middleware";
import type { AppConfig, AppEnv, RenderContext } from "../app/types";
import { content } from "../model/home.content";
import { site } from "../model/site.content";
import type { HomeContent } from "../model/types";
import { routes } from "../routes";
import { HomeView } from "../views/home";

interface HomeData {
  ctx: RenderContext;
  content: HomeContent;
}

// The one page that still builds its own `RenderContext`: the contact form needs a path-bound CSRF
// token and the Turnstile site key, neither of which the shell mints.
export const homeController = {
  middleware: [csrfVerifyGuard],
  handler: definePage<AppEnv, AppConfig, HomeData>({
    cache: "no-store",
    loader: async (c, config) => ({ ctx: await renderContext(c, config, routes.contact.href()), content }),
    // `site.title` rather than a page title: `documentTitle` leaves the site's own name uncomposed,
    // so the home page speaks with the site descriptor as it did before the shell.
    view: (c, _cfg, state) =>
      renderShell(c, <HomeView ctx={state.data.ctx} content={state.data.content} />, { mount: "app", page: "home", meta: { title: site.title } }),
  }),
};
