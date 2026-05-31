/** @jsxImportSource @y-core/forge */
import { definePage } from "@y-core/forge/app";
import { html } from "@y-core/forge/http";
import type { AppConfig } from "../app/config";
import { appRequestBag, RequestProvider } from "../app/context";
import type { AppEnv, AppEnvironment } from "../app/env";
import { content } from "../model/home.content";
import { HomePage } from "../views/home";
import { Layout } from "../views/layout";
import { NotFound } from "../views/not-found";

export const homeRoute = definePage<AppEnvironment>({
  cache: "no-store",
  view: async (c, config) => {
    const bag = await appRequestBag(c, config, { csrfPath: "/api/contact" });
    return c.html(
      html`<!DOCTYPE html>${(
        <RequestProvider value={bag}>
          <Layout content={content}>
            <HomePage content={content} />
          </Layout>
        </RequestProvider>
      )}`,
    );
  },
});

export async function notFoundView(c: AppEnv, config: AppConfig): Promise<Response> {
  const bag = await appRequestBag(c, config);
  return c.html(
    html`<!DOCTYPE html>${(
      <RequestProvider value={bag}>
        <Layout content={content}>
          <NotFound />
        </Layout>
      </RequestProvider>
    )}`,
    404,
  );
}
