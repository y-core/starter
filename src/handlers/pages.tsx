/** @jsxImportSource @y-core/forge */
import { definePage } from "@y-core/forge/app";
import { html } from "@y-core/forge/http";
import { createLogger } from "@y-core/forge/logging";
import type { AppConfig } from "../config/app";
import type { AppContext, AppEnv } from "../context";
import { type AppRequest, RequestProvider } from "../lib/request-context";
import { content } from "../model/home.content";
import { HomePage } from "../views/home";
import { Layout } from "../views/layout";
import { NotFound } from "../views/not-found";

const logger = createLogger("pages");

export const homeRoute = definePage<AppEnv>({
  cache: "no-store",
  view: async (c, config) => {
    const nonce = c.get("secureHeadersNonce") ?? "";
    if (!nonce) logger.warn("secureHeadersNonce is empty — nonce'd FOUC script will break CSP");
    const mint = c.get("mintCsrfToken");
    const csrfToken = mint ? await mint("/api/contact") : "";
    const bag: AppRequest = { nonce, csrfToken, baseUrl: config.site.url.origin, turnstileSiteKey: config.services.turnstile.siteKey };
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

export function notFoundView(c: AppContext, _config: AppConfig): Response | Promise<Response> {
  const nonce = c.get("secureHeadersNonce") ?? "";
  if (!nonce) logger.warn("secureHeadersNonce is empty — nonce'd FOUC script will break CSP");
  const bag: AppRequest = { nonce, csrfToken: "" };
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
