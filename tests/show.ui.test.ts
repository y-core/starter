/**
 * Show UI route tests.
 *
 * All routes are GET and idempotent — no CSRF required.
 * The four fail-closed POST-route cases from r-test.md do not apply here.
 */
import { describe, expect, it } from "bun:test";

import { fakeD1, fakeKV } from "@y-core/forge/testing";
import { showcasePaths } from "@y-core/forge/ui/show";

import { routes } from "../src/routes";
import { app } from "../src/worker";

const MINIMUM_ENV = {
  ASSETS: { fetch: async () => new Response("", { status: 200 }) },
  SITE_ORIGIN: "https://example.com",
  CSRF_SECRET: "a".repeat(64),
  EMAIL_API_KEY: "test-api-key",
  TURNSTILE_SECRET_KEY: "test-turnstile-secret",
  TURNSTILE_SITE_KEY: "test-turnstile-site-key",
  AUTH_KEY_RING: "9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e6f2b4a7c0d3e5f7a9b1c3d5e",
  SESSION_SECRET: "6f2b4a7c0d3e5f7a9b1c3d5e9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e",
  AUTH_KV: fakeKV(),
  AUTH_DB: fakeD1(),
} as unknown as Env;

// ─── Drift guard ──────────────────────────────────────────────────────────────
// If this breaks, a literal path in routes.ts drifted from what showcasePaths() generates.

describe("drift guard — routes match showcasePaths(base, apiPath)", () => {
  const base = routes.showcase.ui.index.href();
  const derived = showcasePaths(base, `${base}/api`);

  it("showcase ui page path matches", () => {
    expect(routes.showcase.ui.index.href()).toBe(derived.page);
  });

  it("preview api path matches", () => {
    expect(routes.showcase.ui.api.preview.href()).toBe(derived.preview);
  });

  it("validate api path matches", () => {
    expect(routes.showcase.ui.api.validate.href()).toBe(derived.validate);
  });

  it("search api path matches", () => {
    expect(routes.showcase.ui.api.search.href()).toBe(derived.search);
  });

  it("paginate api path matches", () => {
    expect(routes.showcase.ui.api.paginate.href()).toBe(derived.paginate);
  });

  it("dependent api path matches", () => {
    expect(routes.showcase.ui.api.dependent.href()).toBe(derived.dependent);
  });

  it("toast api path matches", () => {
    expect(routes.showcase.ui.api.toast.href()).toBe(derived.toast);
  });

  it("every catalog page hangs off the same base", () => {
    expect([
      routes.showcase.ui.interactive.href(),
      routes.showcase.ui.runtime.href(),
      routes.showcase.ui.htmx.href(),
      routes.showcase.ui.chrome.href(),
      routes.showcase.ui.theme.href(),
    ]).toEqual([`${base}/interactive`, `${base}/runtime`, `${base}/htmx`, `${base}/chrome`, `${base}/theme`]);
  });
});

// ─── GET /showcase/ui ─────────────────────────────────────────────────────────

describe("GET /showcase/ui", () => {
  it("returns 200 status", async () => {
    const res = await app.request("/showcase/ui", {}, MINIMUM_ENV);
    expect(res.status).toBe(200);
  });

  it("renders a full HTML page with DOCTYPE", async () => {
    const res = await app.request("/showcase/ui", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain("<!DOCTYPE html>");
  });

  it("renders the showcase h1", async () => {
    const res = await app.request("/showcase/ui", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain("UI Component Showcase");
  });

  it("renders section headings", async () => {
    const res = await app.request("/showcase/ui", {}, MINIMUM_ENV);
    const text = await res.text();
    for (const heading of ["Button", "Card", "Field", "Input", "Select"]) {
      expect(text).toContain(heading);
    }
  });

  it("renders TOC anchor links for its own sections, and a route link per page", async () => {
    const res = await app.request("/showcase/ui", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain('href="#button"');
    expect(text).toContain('href="#input"');
    expect(text).toContain('href="/showcase/ui/htmx"');
    expect(text).toContain('href="/showcase/ui/runtime"');
  });

  it("serves the HTMX demos from the page whose prerequisite names them", async () => {
    const res = await app.request("/showcase/ui/htmx", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain("Live Preview");
    expect(text).toContain("Inline Validation");
    expect(text).toContain("Live Search");
    expect(text).toContain("Paginated Table");
    expect(text).toContain("Dependent Select");
    expect(text).toContain("Flash Toast");
  });

  it("serves the resumable island from the runtime page", async () => {
    const res = await app.request("/showcase/ui/runtime", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain('data-scope="show-filter"');
    expect(text).toContain("data-island-state=");
    expect(text).toContain('data-on-input="filter"');
    expect(text).toContain('data-ref="count"');
    expect(text).toContain("data-filter-item");
    expect(text).toContain("Spinner");
  });

  it("answers every catalog page with a full page carrying its own heading", async () => {
    for (const [path, heading] of [
      ["/showcase/ui", "UI Component Showcase — Catalog"],
      ["/showcase/ui/interactive", "UI Component Showcase — Interactive"],
      ["/showcase/ui/runtime", "UI Component Showcase — Runtime"],
      ["/showcase/ui/htmx", "UI Component Showcase — HTMX"],
      ["/showcase/ui/chrome", "UI Component Showcase — Chrome"],
    ] as const) {
      const res = await app.request(path, {}, MINIMUM_ENV);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain("<!DOCTYPE html>");
      expect(text).toContain(heading);
    }
  });

  it("includes required security headers", async () => {
    const res = await app.request("/showcase/ui", {}, MINIMUM_ENV);
    expect(res.headers.get("content-security-policy")).not.toBeNull();
    expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});

// ─── GET /showcase/ui/api/preview ────────────────────────────────────────────

describe("GET /showcase/ui/api/preview", () => {
  it("returns 200 status", async () => {
    const res = await app.request("/showcase/ui/api/preview", {}, MINIMUM_ENV);
    expect(res.status).toBe(200);
  });

  it("body does not contain DOCTYPE (fragment only)", async () => {
    const res = await app.request("/showcase/ui/api/preview", {}, MINIMUM_ENV);
    expect(await res.text()).not.toContain("<!DOCTYPE html>");
  });

  it("body contains the preview wrapper id", async () => {
    const res = await app.request("/showcase/ui/api/preview", {}, MINIMUM_ENV);
    expect(await res.text()).toContain('id="show-preview-button"');
  });

  it("reflects variant param", async () => {
    const res = await app.request("/showcase/ui/api/preview?variant=secondary&size=lg", {}, MINIMUM_ENV);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('id="show-preview-button"');
  });
});

// ─── GET /showcase/ui/api/validate ───────────────────────────────────────────

describe("GET /showcase/ui/api/validate", () => {
  it("returns 200 status", async () => {
    const res = await app.request("/showcase/ui/api/validate", {}, MINIMUM_ENV);
    expect(res.status).toBe(200);
  });

  it("body does not contain DOCTYPE", async () => {
    const res = await app.request("/showcase/ui/api/validate", {}, MINIMUM_ENV);
    expect(await res.text()).not.toContain("<!DOCTYPE html>");
  });

  it("body contains the validate field id", async () => {
    const res = await app.request("/showcase/ui/api/validate", {}, MINIMUM_ENV);
    expect(await res.text()).toContain('id="show-validate-field"');
  });

  it("shows error for invalid email", async () => {
    const res = await app.request("/showcase/ui/api/validate?email=notvalid", {}, MINIMUM_ENV);
    expect(await res.text()).toContain("Please enter a valid email address.");
  });

  it("shows success for valid email", async () => {
    const res = await app.request("/showcase/ui/api/validate?email=user%40example.com", {}, MINIMUM_ENV);
    expect(await res.text()).toContain("Looks good!");
  });
});

// ─── GET /showcase/ui/api/search ─────────────────────────────────────────────

describe("GET /showcase/ui/api/search", () => {
  it("returns 200 status", async () => {
    const res = await app.request("/showcase/ui/api/search", {}, MINIMUM_ENV);
    expect(res.status).toBe(200);
  });

  it("body does not contain DOCTYPE", async () => {
    const res = await app.request("/showcase/ui/api/search", {}, MINIMUM_ENV);
    expect(await res.text()).not.toContain("<!DOCTYPE html>");
  });

  it("body contains search results id", async () => {
    const res = await app.request("/showcase/ui/api/search", {}, MINIMUM_ENV);
    expect(await res.text()).toContain('id="show-search-results"');
  });

  it("filters by q param", async () => {
    const res = await app.request("/showcase/ui/api/search?q=button", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain("Button");
    expect(text).not.toContain(">Alert<");
  });

  it("returns no-match for unrecognised query", async () => {
    const res = await app.request("/showcase/ui/api/search?q=zzznomatch", {}, MINIMUM_ENV);
    expect(await res.text()).toContain("No components match.");
  });
});

// ─── GET /showcase/ui/api/paginate ───────────────────────────────────────────

describe("GET /showcase/ui/api/paginate", () => {
  it("returns 200 status", async () => {
    const res = await app.request("/showcase/ui/api/paginate", {}, MINIMUM_ENV);
    expect(res.status).toBe(200);
  });

  it("body does not contain DOCTYPE", async () => {
    const res = await app.request("/showcase/ui/api/paginate", {}, MINIMUM_ENV);
    expect(await res.text()).not.toContain("<!DOCTYPE html>");
  });

  it("body contains the paginate wrapper id", async () => {
    const res = await app.request("/showcase/ui/api/paginate", {}, MINIMUM_ENV);
    expect(await res.text()).toContain('id="show-paginate-table"');
  });

  it("Next button is present on page 1", async () => {
    const res = await app.request("/showcase/ui/api/paginate?page=1", {}, MINIMUM_ENV);
    expect(await res.text()).toContain("Next");
  });

  it("Previous button is absent on page 1", async () => {
    const res = await app.request("/showcase/ui/api/paginate?page=1", {}, MINIMUM_ENV);
    expect(await res.text()).not.toContain("Previous");
  });

  it("Previous button is present on page 2", async () => {
    const res = await app.request("/showcase/ui/api/paginate?page=2", {}, MINIMUM_ENV);
    expect(await res.text()).toContain("Previous");
  });
});

// ─── GET /showcase/ui/api/dependent ──────────────────────────────────────────

describe("GET /showcase/ui/api/dependent", () => {
  it("returns 200 status", async () => {
    const res = await app.request("/showcase/ui/api/dependent", {}, MINIMUM_ENV);
    expect(res.status).toBe(200);
  });

  it("body does not contain DOCTYPE", async () => {
    const res = await app.request("/showcase/ui/api/dependent", {}, MINIMUM_ENV);
    expect(await res.text()).not.toContain("<!DOCTYPE html>");
  });

  it("body contains the dependent wrapper id", async () => {
    const res = await app.request("/showcase/ui/api/dependent", {}, MINIMUM_ENV);
    expect(await res.text()).toContain('id="show-dependent-select"');
  });

  it("renders fruit options by default", async () => {
    const res = await app.request("/showcase/ui/api/dependent", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain("Apple");
    expect(text).toContain("Mango");
  });

  it("renders vegetable options when category=vegetable", async () => {
    const res = await app.request("/showcase/ui/api/dependent?category=vegetable", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain("Carrot");
    expect(text).not.toContain("Apple");
  });
});

// ─── GET /showcase/ui/api/toast ──────────────────────────────────────────────

describe("GET /showcase/ui/api/toast", () => {
  it("returns 200 status", async () => {
    const res = await app.request("/showcase/ui/api/toast", {}, MINIMUM_ENV);
    expect(res.status).toBe(200);
  });

  it("body does not contain DOCTYPE", async () => {
    const res = await app.request("/showcase/ui/api/toast", {}, MINIMUM_ENV);
    expect(await res.text()).not.toContain("<!DOCTYPE html>");
  });

  it("body contains hx-swap-oob targeting flash-container", async () => {
    const res = await app.request("/showcase/ui/api/toast", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain("hx-swap-oob");
    expect(text).toContain("flash-container");
  });

  it("renders error type toast when type=error", async () => {
    const res = await app.request("/showcase/ui/api/toast?type=error", {}, MINIMUM_ENV);
    expect(await res.text()).toContain("error toast notification");
  });

  it("renders warning toast when type=warning", async () => {
    const res = await app.request("/showcase/ui/api/toast?type=warning", {}, MINIMUM_ENV);
    expect(await res.text()).toContain("warning toast notification");
  });
});
