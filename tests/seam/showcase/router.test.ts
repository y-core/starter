/** The showcase slice as mounted on this app: its reachability, this app's headers on it, and its nav entry. */
import { describe, expect, it } from "bun:test";

import { routePaths } from "@y-core/forge/router";
import { attrOf, elementOf, fakeD1, fakeKV, innerOf } from "@y-core/forge/testing";

import { showcaseRouteMap } from "../../../src/showcase/routes";
import { app } from "../../../src/worker";
import { devApp } from "../../../src/worker.dev";
import { CONFIG_ENV } from "../../env";

const MINIMUM_ENV = {
  ASSETS: { fetch: async () => new Response("", { status: 200 }) },
  SITE_ORIGIN: "https://example.com",
  ...CONFIG_ENV,
  AUTH_KV: fakeKV(),
  DB: fakeD1(),
} as unknown as Env;

describe("the showcase mount", () => {
  it("routes every GET path the slice declares, so one declared and never mounted fails here", async () => {
    for (const path of routePaths(showcaseRouteMap, { method: "GET" })) {
      const { status } = await app.request(path, {}, MINIMUM_ENV);
      expect([path, status === 404]).toEqual([path, false]);
    }
  });

  it("routes every POST path the slice declares", async () => {
    for (const path of routePaths(showcaseRouteMap, { method: "POST" })) {
      const { status } = await app.request(path, { method: "POST" }, MINIMUM_ENV);
      expect([path, status === 404]).toEqual([path, false]);
    }
  });

  it("answers the catalog page itself, so the sweeps above are not passing on refusals alone", async () => {
    expect((await app.request("/showcase/ui", {}, MINIMUM_ENV)).status).toBe(200);
  });

  it("carries this app's security headers onto a mounted page, which the slice inherits and does not set", async () => {
    const res = await app.request("/showcase/ui", {}, MINIMUM_ENV);

    expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("carries this app's security headers onto a refusal, not only onto a page that answered", async () => {
    const res = await app.request(
      "https://example.com/showcase/ui/api/turnstile-verify",
      { method: "POST", body: "email=ada@example.com", headers: { "Content-Type": "text/plain", "Sec-Fetch-Site": "same-origin" } },
      MINIMUM_ENV,
    );

    expect(res.status).toBe(415);
    expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});

function barLabels(html: string): string[] {
  const nav = elementOf(html, "nav", 'aria-label="Primary"');
  return [...nav.matchAll(/data-slot="(?:menu-trigger|navbar-link)"[^>]*>\s*(?:<span>)?([^<]*)/g)].map(([, label = ""]) => label);
}

describe("the showcase nav entry", () => {
  it("leads the bar with the Forge Showcase menu, directly ahead of Logs", async () => {
    const labels = barLabels(await (await app.request("/", {}, MINIMUM_ENV)).text());

    expect(labels.slice(0, labels.indexOf("Logs") + 1)).toEqual(["Forge Showcase", "Logs"]);
  });

  it("nests one UI submenu inside the Forge Showcase menu", async () => {
    const text = await (await app.request("/", {}, MINIMUM_ENV)).text();
    const showcase = attrOf(text, "commandfor", 'data-slot="menu-trigger"');
    const popup = elementOf(text, "div", `id="${showcase}"`);
    const submenu = elementOf(popup, "button", 'data-slot="menu-submenu-trigger"');

    expect(innerOf(elementOf(submenu, "span"))).toBe("UI");
    expect(popup.split('data-slot="menu-submenu-trigger"').length).toBe(2);
  });

  it("offers Components and Theme customiser under UI, resolving to the catalog and the customiser", async () => {
    const text = await (await app.request("/", {}, MINIMUM_ENV)).text();
    const ui = elementOf(text, "div", `id="${attrOf(text, "commandfor", 'data-slot="menu-submenu-trigger"')}"`);
    const items = [...ui.matchAll(/<a [^>]*data-slot="menu-link-item"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map(([, href, label]) => ({
      href,
      label,
    }));

    expect(items).toEqual([
      { href: "/showcase/ui", label: "Components" },
      { href: "/showcase/ui/theme", label: "Theme customiser" },
    ]);
    expect(text.split('href="/showcase/ui"').length).toBe(2);
    expect(text.split('href="/showcase/ui/theme"').length).toBe(2);
  });
});

describe("the showcase's retired paths", () => {
  it("no longer serves the viewer at its retired /showcase/logs path, even on the dev entry", async () => {
    const env = { ...MINIMUM_ENV, LOGS_KV: fakeKV(), ASSETS: { fetch: async () => new Response("Not Found", { status: 404 }) } } as unknown as Env;
    const res = await devApp.request("/showcase/logs", {}, env);
    expect(res.status).toBe(404);
    expect(elementOf(await res.text(), "title")).toBe("<title>Page not found — Forge Studio</title>");
  });
});
