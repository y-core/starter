import { describe, expect, it } from "bun:test";

import { fakeD1 } from "@y-core/forge/testing";

import { app } from "../../../src/worker";
import { CONFIG_ENV, createTestBindings } from "../../env";

function healthEnv(db: ReturnType<typeof fakeD1>): Env {
  return { SITE_ORIGIN: "https://example.com", ...CONFIG_ENV, ...createTestBindings(), DB: db } as unknown as Env;
}

// A schema whose fingerprint has drifted from what the migrations recorded is a deploy that
// half-landed, and it must not read as up.
describe("GET /api/health — the schema check", () => {
  it("reports the schema healthy when no recorded fingerprint disagrees with it", async () => {
    const res = await app.request("/api/health", {}, healthEnv(fakeD1()));
    const body = (await res.json()) as { ok: boolean; checks: Record<string, boolean> };

    expect(res.status).toBe(200);
    expect(body.checks.schema).toBe(true);
  });

  it("answers 503 and names the schema check as failed when the recorded fingerprint has drifted", async () => {
    const drifted = fakeD1((sql) => (sql.includes("_forge_migrations") ? [{ fingerprint: "not-the-fingerprint-of-this-schema" }] : []));
    const res = await app.request("/api/health", {}, healthEnv(drifted));
    const body = (await res.json()) as { ok: boolean; checks: Record<string, boolean> };

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.checks.schema).toBe(false);
  });
});
