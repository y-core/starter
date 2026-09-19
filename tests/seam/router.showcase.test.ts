/** The showcase mount as far as this repository owns it: its paths, and its reachability through this app's guards. */
import { describe, expect, it } from "bun:test";

import { fakeD1, fakeKV } from "@y-core/forge/testing";
import { showcasePaths } from "@y-core/forge/ui/show";

import { routes } from "../../src/routes";
import { app } from "../../src/worker";

const MINIMUM_ENV = {
  ASSETS: { fetch: async () => new Response("", { status: 200 }) },
  SITE_ORIGIN: "https://example.com",
  CSRF_SECRET: "a".repeat(64),
  EMAIL_API_KEY: "test-api-key",
  TURNSTILE_SECRET_KEY: "test-turnstile-secret",
  TURNSTILE_SITE_KEY: "test-turnstile-site-key",
  AUTH_KEY_RING: "9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e6f2b4a7c0d3e5f7a9b1c3d5e",
  SESSION_SECRET: "6f2b4a7c0d3e5f7a9b1c3d5e9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e",
  ADMIN_BOOTSTRAP_SECRET: "3d5e9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e6f2b4a7c0d3e5f7a9b1c",
  AUTH_KV: fakeKV(),
  AUTH_DB: fakeD1(),
} as unknown as Env;

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

describe("the showcase mount", () => {
  it("routes every derived path, so one this app declares and never mounts fails here", async () => {
    const base = routes.showcase.ui.index.href();
    const derived = showcasePaths(base, `${base}/api`);

    for (const path of Object.values(derived)) {
      const { status } = await app.request(path, {}, MINIMUM_ENV);
      // A mounted path may still refuse a bare GET — `turnstile-verify` wants a POST body — and
      // what this case is for is the path reaching a handler at all rather than the not-found one.
      expect([path, status === 404]).toEqual([path, false]);
    }
  });

  it("answers the catalog page itself, so the sweep above is not passing on refusals alone", async () => {
    expect((await app.request(routes.showcase.ui.index.href(), {}, MINIMUM_ENV)).status).toBe(200);
  });

  it("carries this app's security headers onto a mounted page, which the mount inherits and does not set", async () => {
    const res = await app.request(routes.showcase.ui.index.href(), {}, MINIMUM_ENV);

    expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});
