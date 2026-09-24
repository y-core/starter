import { describe, expect, it } from "bun:test";

import { app } from "../../../src/worker";
import { CONFIG_ENV, createTestBindings } from "../../env";

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) };

const MINIMUM_ENV = { ASSETS: MOCK_ASSETS, SITE_ORIGIN: "https://example.com", ...CONFIG_ENV, ...createTestBindings() };

describe("the database's part of the global chain", () => {
  it("serves a request when the DB binding is present", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV as unknown as Env);

    expect(res.status).toBe(200);
  });

  it("refuses to serve rather than degrading when the DB binding is absent", async () => {
    const { DB: _absent, ...env } = MINIMUM_ENV as Record<string, unknown>;

    const res = await app.request("/", {}, env as unknown as Env);

    expect(res.status).toBe(500);
  });
});
