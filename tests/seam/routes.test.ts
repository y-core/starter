import { describe, expect, it } from "bun:test";

import { attrsOf, elementOf, fakeKV } from "@y-core/forge/testing";

import { app } from "../../src/worker";
import { devApp } from "../../src/worker.dev";
import { CONFIG_ENV, createTestBindings } from "../env";

const SITE_ORIGIN = "https://example.com";

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) };

const MINIMUM_ENV = { ASSETS: MOCK_ASSETS, SITE_ORIGIN, ...CONFIG_ENV, ...createTestBindings() } as unknown as Env;

describe("GET /api/health", () => {
  it("returns healthy", async () => {
    const response = await app.request("/api/health", {}, MINIMUM_ENV);

    const body = (await response.json()) as { ok: boolean; checks: Record<string, boolean> };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.checks.csrf).toBe(true);
  });

  it("includes required security headers", async () => {
    const response = await app.request("/api/health", {}, MINIMUM_ENV);

    expect(response.headers.get("content-security-policy")).not.toBeNull();
    expect(response.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("includes a nonce in the CSP header", async () => {
    const response = await app.request("/api/health", {}, MINIMUM_ENV);
    const csp = response.headers.get("content-security-policy") || "";

    expect(csp).toContain("'nonce-");
  });

  it("omits the Wrangler live-reload hash from script-src outside dev", async () => {
    const response = await app.request("/api/health", {}, MINIMUM_ENV);
    const csp = response.headers.get("content-security-policy") || "";

    expect(csp).not.toContain("sha256-g5a3SrOYIecCloZ8S7M4xdT1pbYi6e7mjHrmwphRxfE=");
  });

  it("includes the Wrangler live-reload hash in script-src in dev", async () => {
    const response = await devApp.request("/api/health", {}, MINIMUM_ENV);
    const csp = response.headers.get("content-security-policy") || "";

    expect(csp).toContain("sha256-g5a3SrOYIecCloZ8S7M4xdT1pbYi6e7mjHrmwphRxfE=");
  });

  it("returns Cache-Control: no-store", async () => {
    const response = await app.request("/api/health", {}, MINIMUM_ENV);

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("GET / — both entries", () => {
  for (const [entry, served] of [
    ["production", app],
    ["dev", devApp],
  ] as const) {
    it(`renders the home page on the ${entry} entry`, async () => {
      const res = await served.request("/", {}, MINIMUM_ENV);
      expect(res.status).toBe(200);
      expect(elementOf(await res.text(), "title")).toBe("<title>Forge Studio</title>");
    });
  }
});

// A fresh `fakeKV` per request: it is a working namespace, so the request logger's own entry would
// otherwise accumulate across cases and the empty-state assertions would depend on test order.
const logsEnv = () => ({ ...MINIMUM_ENV, LOGS_KV: fakeKV() }) as unknown as Env;

const EXPECTED_EMPTY_TBODY =
  '<tbody id="log-tbody"><tr><td colspan="5" class="px-4 py-4 text-center"><div class="flex flex-col items-center gap-2"><span class="text-sm text-muted-foreground">No log entries have been recorded yet.</span></div></td></tr></tbody>';

describe("GET /logs — access control", () => {
  it("returns 403 on the production entry, which mints no allowance", async () => {
    const res = await app.request("/logs", {}, logsEnv());
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
  });

  it("returns 403 for the HTMX partial too", async () => {
    const res = await app.request("/logs", { headers: { "HX-Request": "true" } }, logsEnv());
    expect(res.status).toBe(403);
  });
});

describe("GET /logs — full page", () => {
  it("returns 200 status on the dev entry, which mints the allowance", async () => {
    const res = await devApp.request("/logs", {}, logsEnv());
    expect(res.status).toBe(200);
  });

  // A viewer owning its own shell would reach neither the dark class nor the pre-paint theme script,
  // and would render light whatever its components ask for.
  it("renders the viewer inside the app's Layout, not a shell of forge's own", async () => {
    const res = await devApp.request("/logs", {}, logsEnv());
    const text = await res.text();
    expect(text.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(elementOf(text, "title")).toBe("<title>Logs — Forge Studio</title>");
    expect(elementOf(text, "h1")).toBe('<h1 class="text-2xl font-semibold tracking-tight text-balance text-foreground">Request Log</h1>');
    expect(attrsOf(text, 'data-scope="theme"')).toEqual({ "data-scope": "theme", "data-island-state": "{&quot;pref&quot;:&quot;system&quot;}" });
    expect(attrsOf(text, 'hx-get="/logs"')).toEqual({
      "hx-get": "/logs",
      "hx-target": "#log-tbody",
      "hx-swap": "outerHTML",
      "hx-indicator": "#log-tbody",
      "hx-disabled-elt": "find button[type=&#39;submit&#39;]",
      "hx-push-url": "true",
    });
    expect([...elementOf(text, "thead").matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((match) => match[1])).toEqual([
      "Timestamp",
      "Level",
      "Prefix",
      "Message",
      "Request ID",
    ]);
    expect(elementOf(text, "tbody", 'id="log-tbody"')).toBe(EXPECTED_EMPTY_TBODY);
  });

  it("includes required security headers", async () => {
    const res = await devApp.request("/logs", {}, logsEnv());
    expect(res.headers.get("content-security-policy")).not.toBeNull();
    expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});

describe("GET /logs — HTMX partial", () => {
  it("returns only the tbody fragment when HX-Request is true", async () => {
    const res = await devApp.request("/logs", { headers: { "HX-Request": "true" } }, logsEnv());
    expect(res.status).toBe(200);
    const text = await res.text();
    // exact match proves TBODY_ID in the partial equals the id the full page registers as swap target
    expect(text).toBe(EXPECTED_EMPTY_TBODY);
  });

  it("does not include the full page shell in the partial response", async () => {
    const res = await devApp.request("/logs", { headers: { "HX-Request": "true" } }, logsEnv());
    const text = await res.text();
    expect(text).not.toContain("<!DOCTYPE html>");
    expect(text).not.toContain("<title>Request Log</title>");
  });
});
