import { describe, expect, it } from "bun:test";
import app from "../src/worker";

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) };
const MOCK_ASSETS_404 = { fetch: async () => new Response("Not Found", { status: 404 }) };

const MINIMUM_ENV = {
  ASSETS: MOCK_ASSETS,
  BASE_URL: "https://example.com",
  CSRF_SECRET: "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e",
  EMAIL_API_KEY: "test-api-key",
  EMAIL_FROM: "from@example.com",
  EMAIL_TO: "to@example.com",
  TURNSTILE_SECRET_KEY: "test-ts-key",
  TURNSTILE_SITE_KEY: "test-site-key",
};

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
    // toContain is appropriate here: the full page includes a dynamic nonce, preventing toBe
    expect(text).toContain("<title>Forge Studio</title>");
  });

  it("includes a JSON-LD script tag", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain('<script type="application/ld+json">');
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
    const text = await res.text();
    expect(text).toContain('<section id="home"');
    expect(text).toContain(">Digital Product Studio</p>");
  });

  it("includes the contact form with hx-post and result target", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain('hx-post="/api/contact"');
    expect(text).toContain('<div data-ref="contact-result" id="contact-result"');
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
    expect(text).toContain(">Page not found</h1>");
  });

  it("includes a 'Return home' link pointing to /", async () => {
    const res = await app.request("/unknown-page", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    const text = await res.text();
    expect(text).toContain('href="/"');
    expect(text).toContain(">Return home");
  });

  it("includes required security headers on the 404 response", async () => {
    const res = await app.request("/unknown-page", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    expect(res.headers.get("content-security-policy")).not.toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
