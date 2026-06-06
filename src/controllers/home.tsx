/** @jsxImportSource @y-core/forge */
import { definePage } from "@y-core/forge/app";
import { renderPage } from "@y-core/forge/render";
import type { AppConfig } from "../app/config";
import type { AppEnv, RenderContext } from "../app/context";
import { renderContext } from "../app/context";
import { csrfVerifyGuard } from "../app/middleware";
import { content, type HomeContent } from "../model/home.content";
import { routes } from "../routes";
import { HomeView } from "../views/home";

interface HomeData {
  ctx: RenderContext;
  content: HomeContent;
}

export const homeController = {
  middleware: [csrfVerifyGuard],
  handler: definePage<AppEnv, AppConfig, HomeData>({
    cache: "no-store",
    loader: async (c, config) => ({ ctx: await renderContext(c, config, routes.contact.href()), content }),
    view: (_c, _cfg, state) => renderPage(<HomeView ctx={state.data.ctx} content={state.data.content} />),
  }),
};
