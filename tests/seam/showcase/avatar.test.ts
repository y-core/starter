import { describe, expect, it } from "bun:test";

import { fakeD1, fakeKV } from "@y-core/forge/testing";

import { app } from "../../../src/worker";
import { CONFIG_ENV } from "../../env";

const MINIMUM_ENV = {
  ASSETS: { fetch: async () => new Response("", { status: 200 }) },
  SITE_ORIGIN: "https://example.com",
  ...CONFIG_ENV,
  AUTH_KV: fakeKV(),
  DB: fakeD1(),
} as unknown as Env;

describe("avatar endpoint", () => {
  it("serves the portrait as SVG from this app, so the catalog never fetches a remote image", async () => {
    const res = await app.request("/showcase/ui/api/avatar", {}, MINIMUM_ENV);
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(body.startsWith("<svg ")).toBe(true);
    expect(/^<svg\b[^>]*>/.exec(body)?.[0]?.includes('aria-label="Portrait"')).toBe(true);
  });

  it("sets no cache header, neither from the controller nor from this app's middleware", async () => {
    const res = await app.request("/showcase/ui/api/avatar", {}, MINIMUM_ENV);

    expect(res.headers.get("cache-control")).toBe(null);
  });
});
