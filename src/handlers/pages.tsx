/** @jsxImportSource @y-core/forge */
import { definePage } from "@y-core/forge/app";
import { html } from "@y-core/forge/http";

import type { AppConfig } from "../config/app";
import type { AppContext, AppEnv } from "../context";
import { makeCsrfToken } from "../lib/csrf";
import { content } from "../model/home.content";
import { HomePage } from "../views/home";
import { Layout } from "../views/layout";
import { NotFound } from "../views/not-found";

export const homeRoute = definePage<AppEnv>({
  cache: "no-store",
  view: async (c, config) => {
    const nonce = c.get("secureHeadersNonce") ?? "";
    const csrfToken = await makeCsrfToken(config.security.csrf.secret, "/api/contact");

    return c.html(
      html`<!DOCTYPE html>${<Layout nonce={nonce} content={content} baseUrl={config.site.url.origin}><HomePage content={content} csrfToken={csrfToken} turnstileSiteKey={config.services.turnstile.siteKey} /></Layout>}`,
    );
  },
});

export function notFoundView(c: AppContext, config: AppConfig): Response | Promise<Response> {
  const nonce = c.get("secureHeadersNonce") ?? "";
  return c.html(
    html`<!DOCTYPE html>${<Layout nonce={nonce} content={content} baseUrl={config.site.url.origin}><NotFound /></Layout>}`,
    404,
  );
}
