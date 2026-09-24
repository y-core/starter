import { describe, expect, it } from "bun:test";

import { mockExecutionContext } from "@y-core/forge/testing";

import worker, { app } from "../../../src/worker";
import { CONFIG_ENV, createTestBindings } from "../../env";
import { sqliteD1 } from "./sqlite-d1";

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) } as unknown as Fetcher;

const MINIMUM_ENV = { ASSETS: MOCK_ASSETS, SITE_ORIGIN: "https://example.com", ...CONFIG_ENV, ...createTestBindings() } as unknown as Env;

describe("the auth slice on the worker module", () => {
  it("adds the scheduled entry point beside fetch", () => {
    expect(typeof worker.scheduled).toBe("function");
  });

  it("serves a request carrying the AUTH_KV binding", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    expect(res.status).toBe(200);
  });

  // Auth degraded into a no-op guard is worse than auth refusing (`BOUNDARIES.md` §5).
  it("refuses to serve rather than degrading when the AUTH_KV binding is absent", async () => {
    const { AUTH_KV: _absent, ...env } = MINIMUM_ENV as unknown as Record<string, unknown>;

    const res = await app.request("/", {}, env as unknown as Env);

    expect(res.status).toBe(500);
  });

  // Real SQLite over this repository's own migration, so the database decides what survives rather
  // than a statement copied out of the library.
  it("reclaims the expired challenge and nonce rows on a scheduled run, and leaves the live ones", async () => {
    const db = sqliteD1();
    const past = Date.now() - 60_000;
    const future = Date.now() + 60_000;
    await db.exec(`INSERT INTO auth_challenges (key, value, expires_at) VALUES ('stale', 'x', ${past}), ('live', 'x', ${future})`);
    await db.exec(`INSERT INTO auth_nonces (key, expires_at) VALUES ('stale', ${past}), ('live', ${future})`);

    await worker.scheduled({} as ScheduledController, { ...MINIMUM_ENV, DB: db } as unknown as Env, mockExecutionContext());

    expect(db.rows<{ key: string }>("SELECT key FROM auth_challenges").map((row) => row.key)).toEqual(["live"]);
    expect(db.rows<{ key: string }>("SELECT key FROM auth_nonces").map((row) => row.key)).toEqual(["live"]);
    db.close();
  });

  it("leaves a database with nothing expired untouched, so the case above is a purge and not a wipe", async () => {
    const db = sqliteD1();
    const future = Date.now() + 60_000;
    await db.exec(`INSERT INTO auth_challenges (key, value, expires_at) VALUES ('live', 'x', ${future})`);
    await db.exec(`INSERT INTO auth_nonces (key, expires_at) VALUES ('live', ${future})`);

    await worker.scheduled({} as ScheduledController, { ...MINIMUM_ENV, DB: db } as unknown as Env, mockExecutionContext());

    expect(db.rows("SELECT key FROM auth_challenges").length).toBe(1);
    expect(db.rows("SELECT key FROM auth_nonces").length).toBe(1);
    db.close();
  });
});
