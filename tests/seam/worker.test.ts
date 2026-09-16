import { describe, expect, it } from "bun:test";

import { fakeD1, fakeKV, mockExecutionContext } from "@y-core/forge/testing";

import worker, { app } from "../../src/worker";
import { sqliteD1 } from "../sqlite-d1";

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) } as unknown as Fetcher;
const MOCK_ASSETS_404 = { fetch: async () => new Response("Not Found", { status: 404 }) } as unknown as Fetcher;

const MINIMUM_ENV = {
  ASSETS: MOCK_ASSETS,
  SITE_ORIGIN: "https://example.com",
  CSRF_SECRET: "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e",
  EMAIL_API_KEY: "test-api-key",
  EMAIL_FROM: "from@example.com",
  EMAIL_TO: "to@example.com",
  TURNSTILE_SECRET_KEY: "test-ts-key",
  TURNSTILE_SITE_KEY: "test-site-key",
  AUTH_KEY_RING: "9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e6f2b4a7c0d3e5f7a9b1c3d5e",
  SESSION_SECRET: "6f2b4a7c0d3e5f7a9b1c3d5e9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e",
  AUTH_KV: fakeKV(),
  AUTH_DB: fakeD1(),
} as unknown as Env;

describe("the worker module", () => {
  it("exports both entry points", () => {
    expect(typeof worker.fetch).toBe("function");
    expect(typeof worker.scheduled).toBe("function");
  });

  it("serves a request through the named app", async () => {
    const res = await worker.fetch(new Request("https://example.com/"), MINIMUM_ENV, mockExecutionContext());
    expect(res.status).toBe(200);
  });

  // Against this repository's own migration in real SQLite, so what survives the run is decided by
  // the database rather than by a statement the test copied out of the library. The handler's own
  // promise is awaited rather than a `waitUntil` queue drained, because that promise is what the
  // cron run's outcome is computed from — and what the purge's throw has to land inside.
  it("reclaims the expired challenge and nonce rows on a scheduled run, and leaves the live ones", async () => {
    const db = sqliteD1();
    const past = Date.now() - 60_000;
    const future = Date.now() + 60_000;
    await db.exec(`INSERT INTO auth_challenges (key, value, expires_at) VALUES ('stale', 'x', ${past}), ('live', 'x', ${future})`);
    await db.exec(`INSERT INTO auth_nonces (key, expires_at) VALUES ('stale', ${past}), ('live', ${future})`);

    await worker.scheduled({} as ScheduledController, { ...MINIMUM_ENV, AUTH_DB: db } as unknown as Env, mockExecutionContext());

    expect(db.rows<{ key: string }>("SELECT key FROM auth_challenges").map((row) => row.key)).toEqual(["live"]);
    expect(db.rows<{ key: string }>("SELECT key FROM auth_nonces").map((row) => row.key)).toEqual(["live"]);
    db.close();
  });

  it("leaves a database with nothing expired untouched, so the case above is a purge and not a wipe", async () => {
    const db = sqliteD1();
    const future = Date.now() + 60_000;
    await db.exec(`INSERT INTO auth_challenges (key, value, expires_at) VALUES ('live', 'x', ${future})`);
    await db.exec(`INSERT INTO auth_nonces (key, expires_at) VALUES ('live', ${future})`);

    await worker.scheduled({} as ScheduledController, { ...MINIMUM_ENV, AUTH_DB: db } as unknown as Env, mockExecutionContext());

    expect(db.rows("SELECT key FROM auth_challenges").length).toBe(1);
    expect(db.rows("SELECT key FROM auth_nonces").length).toBe(1);
    db.close();
  });
});

// The health route reports the database this app cannot work without: a schema whose fingerprint has
// drifted from what the migrations recorded is a deploy that half-landed, and it must not read as up.
describe("GET /api/health against a drifted schema", () => {
  function driftedEnv(): Env {
    const db = fakeD1((sql) => (sql.includes("_forge_migrations") ? [{ fingerprint: "not-the-fingerprint-of-this-schema" }] : []));
    return { ...MINIMUM_ENV, AUTH_DB: db } as unknown as Env;
  }

  it("answers 503 and names the schema check as the one that failed", async () => {
    const res = await app.request("/api/health", {}, driftedEnv());

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, checks: { csrf: true, schema: false } });
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
    // toContain is appropriate here: the full page includes a dynamic nonce, preventing toBe
    expect(text).toContain("<title>Forge Studio</title>");
  });

  it("includes a JSON-LD script tag", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain('type="application/ld+json"');
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

  // The three paths that reach the one `notFound` hook: an asset miss (above), an absent binding,
  // and a method the asset catch-all does not serve. `assets` picks the code path, never the answer.
  it("renders the same page when the ASSETS binding is absent", async () => {
    const res = await app.request("/unknown-page", {}, { ...MINIMUM_ENV, ASSETS: undefined } as unknown as Env);
    expect(res.status).toBe(404);
    expect(await res.text()).toContain(">Page not found</h1>");
  });

  it("renders the same page for a non-GET unmatched URL", async () => {
    const res = await app.request("/unknown-page", { method: "PUT" }, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain(">Page not found</h1>");
  });

  it("never echoes the request path", async () => {
    const res = await app.request("/unknown-page-echo-probe", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    expect(await res.text()).not.toContain("unknown-page-echo-probe");
  });
});
