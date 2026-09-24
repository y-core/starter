import { describe, expect, it } from "bun:test";

import { attrOf, elementOf, mockExecutionContext, tagOf } from "@y-core/forge/testing";

import { routes } from "../../src/routes";
import worker, { app } from "../../src/worker";
import { CONFIG_ENV, createTestBindings } from "../env";

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) } as unknown as Fetcher;
const MOCK_ASSETS_404 = { fetch: async () => new Response("Not Found", { status: 404 }) } as unknown as Fetcher;

const MINIMUM_ENV = { ASSETS: MOCK_ASSETS, SITE_ORIGIN: "https://example.com", ...CONFIG_ENV, ...createTestBindings() } as unknown as Env;

const NOT_FOUND_HEADING =
  '<h1 data-slot="empty-state-title" class="font-semibold font-serif text-4xl text-balance text-foreground">Page not found</h1>';

describe("the worker module", () => {
  it("exports the fetch entry point", () => {
    expect(typeof worker.fetch).toBe("function");
  });

  it("serves a request through the named app", async () => {
    const res = await worker.fetch(new Request("https://example.com/"), MINIMUM_ENV, mockExecutionContext());
    expect(res.status).toBe(200);
  });
});

describe("GET /", () => {
  it("returns 200 status", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    expect(res.status).toBe(200);
  });

  it("returns text/html content-type", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("includes the page title", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(elementOf(text, "title")).toBe("<title>Forge Studio</title>");
  });

  it("includes a JSON-LD script tag", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    const text = await res.text();
    const script = tagOf(text, 'type="application/ld+json"');
    expect(attrOf(script, "nonce")).not.toBe("");
    expect(script.replace(/ nonce="[^"]*"/, "")).toBe('<script type="application/ld+json">');
  });

  it("includes required security headers", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    expect(res.headers.get("content-security-policy")).not.toBeNull();
    expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("includes the hero section", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    const hero = elementOf(await res.text(), "section", 'id="home"');
    expect(tagOf(hero)).toBe('<section id="home" class="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:px-10 lg:py-24">');
    expect(elementOf(hero, "p")).toBe('<p class="text-sm font-semibold tracking-eyebrow text-primary uppercase">Digital Product Studio</p>');
  });
});

describe("GET /* (404 catch-all)", () => {
  it("returns 404 status when ASSETS returns 404", async () => {
    const res = await app.request("/unknown-page", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    expect(res.status).toBe(404);
  });

  it("renders the 'Page not found' heading", async () => {
    const res = await app.request("/unknown-page", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    const text = await res.text();
    expect(elementOf(text, "h1")).toBe(NOT_FOUND_HEADING);
  });

  it("includes a 'Return home' link pointing to /", async () => {
    const res = await app.request("/unknown-page", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    const link = elementOf(await res.text(), "a", 'data-slot="button"');
    expect(attrOf(link, "href")).toBe("/");
    expect(link.endsWith(">Return home</a>")).toBe(true);
  });

  it("includes required security headers on the 404 response", async () => {
    const res = await app.request("/unknown-page", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    expect(res.headers.get("content-security-policy")).not.toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  // Each path into the one `notFound` hook is exercised separately, because `assets` picks the code
  // path and must never pick the answer.
  it("renders the same page when the ASSETS binding is absent", async () => {
    const res = await app.request("/unknown-page", {}, { ...MINIMUM_ENV, ASSETS: undefined } as unknown as Env);
    expect(res.status).toBe(404);
    expect(elementOf(await res.text(), "h1")).toBe(NOT_FOUND_HEADING);
  });

  it("renders the same page for a non-GET unmatched URL", async () => {
    const res = await app.request("/unknown-page", { method: "PUT" }, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    expect(res.status).toBe(404);
    expect(elementOf(await res.text(), "h1")).toBe(NOT_FOUND_HEADING);
  });

  it("never echoes the request path", async () => {
    const res = await app.request("/unknown-page-echo-probe", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    expect(await res.text()).not.toContain("unknown-page-echo-probe");
  });

  // This app declines `methodMismatch: "advertise"`, so the property under test is that the two
  // answers are indistinguishable — a prober learns no URL from the difference.
  it("answers a wrong method on a registered URL exactly as it answers an unregistered URL", async () => {
    const env = { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 };
    const mismatch = await app.request(routes.health.href(), { method: "DELETE" }, env);
    const unregistered = await app.request("/no-such-url", { method: "DELETE" }, env);

    // The per-request CSP nonce is the one byte-level difference a prober can already see on any
    // two responses, so it is normalized out rather than weakening the comparison to a substring.
    const withoutNonce = (html: string) => html.replaceAll(/nonce="[^"]*"/g, 'nonce=""');

    expect(mismatch.status).toBe(404);
    expect(mismatch.status).toBe(unregistered.status);
    expect(mismatch.headers.get("allow")).toBeNull();
    expect(withoutNonce(await mismatch.text())).toBe(withoutNonce(await unregistered.text()));
  });
});
