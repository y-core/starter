/** @jsxImportSource @y-core/forge */
import { definePage } from "@y-core/forge/app";
import { html } from "@y-core/forge/http";
import type { AppConfig } from "../app/config";
import type { AppContext, AppEnv } from "../app/context";
import { renderContext } from "../app/context";
import { content } from "../model/home.content";
import { HomePage } from "../views/home";
import { Layout } from "../views/layout";
import { NotFound } from "../views/not-found";

export const homeRoute = definePage<AppEnv>({
  cache: "no-store",
  view: async (c, config) => {
    const ctx = await renderContext(c, config, { csrfPath: "/api/contact" });
    return c.html(
      html`<!DOCTYPE html>${(
        <Layout ctx={ctx} content={content}>
          <HomePage ctx={ctx} content={content} />
        </Layout>
      )}`,
    );
  },
});

export async function notFoundView(c: AppContext, config: AppConfig): Promise<Response> {
  const ctx = await renderContext(c, config);
  return c.html(
    html`<!DOCTYPE html>${(
      <Layout ctx={ctx} content={content}>
        <NotFound />
      </Layout>
    )}`,
    404,
  );
}
