import { describe, expect, it } from "bun:test";

import { createApp } from "@y-core/forge/app";
import { contextVar, getAppContext, type Middleware } from "@y-core/forge/context";
import { mapHandler } from "@y-core/forge/testing";

import { configStore, securityHeaders } from "../../src/app/config";
import { type MiddlewareContribution, registerMiddleware } from "../../src/app/middleware";
import type { AppEnv } from "../../src/app/types";
import { CONFIG_ENV } from "../env";

const ENV = { SITE_ORIGIN: "https://example.com", ...CONFIG_ENV } as unknown as AppEnv;

const TRAIL = contextVar<string[]>("middlewareTrail");

function mark(name: string): Middleware {
  return (context, next) => {
    const c = getAppContext(context);
    TRAIL.set(c, [...(TRAIL.getOptional(c) ?? []), name]);
    return next();
  };
}

/** An app carrying only the global chain these contributions build, and one route answering the trail the chain left. */
function appWith(contributions: readonly MiddlewareContribution[]) {
  const app = createApp<AppEnv>({ config: configStore });
  registerMiddleware(app, securityHeaders, contributions);
  mapHandler(app, "GET", "/probe", (context) => Response.json(TRAIL.getOptional(getAppContext(context)) ?? []));
  return app;
}

async function trailOf(contributions: readonly MiddlewareContribution[], env: AppEnv = ENV): Promise<unknown> {
  const res = await appWith(contributions).request("/probe", {}, env);
  expect(res.status).toBe(200);
  return res.json();
}

describe("registerMiddleware — the session", () => {
  it("runs the one contributed session ahead of every global", async () => {
    expect(await trailOf([{ globals: [mark("global")] }, { session: mark("session") }])).toEqual(["session", "global"]);
  });

  it("runs no session when no contribution supplies one", async () => {
    expect(await trailOf([{ globals: [mark("global")] }])).toEqual(["global"]);
  });

  it("refuses at startup when two contributions each supply a session", () => {
    expect(() => appWith([{ session: mark("first") }, { session: mark("second") }])).toThrow(
      "middleware: two contributions each supply a session, and the chain takes one.",
    );
  });
});

describe("registerMiddleware — contribution order", () => {
  it("runs the globals in the order their contributions arrive", async () => {
    expect(await trailOf([{ globals: [mark("a1"), mark("a2")] }, { globals: [mark("b")] }])).toEqual(["a1", "a2", "b"]);
  });

  it("follows the array rather than any order of its own when the contributions are swapped", async () => {
    expect(await trailOf([{ globals: [mark("b")] }, { globals: [mark("a1"), mark("a2")] }])).toEqual(["b", "a1", "a2"]);
  });

  it("runs every global before the path guards, and the guard groups in contribution order", async () => {
    const trail = await trailOf([
      { guards: [{ paths: ["/probe"], guards: [mark("guard-a")] }] },
      { globals: [mark("global")], guards: [{ paths: ["/probe"], guards: [mark("guard-b")] }] },
    ]);
    expect(trail).toEqual(["global", "guard-a", "guard-b"]);
  });

  it("leaves a guard group off a path it does not name", async () => {
    expect(await trailOf([{ guards: [{ paths: ["/elsewhere"], guards: [mark("guard")] }] }])).toEqual([]);
  });
});

describe("registerMiddleware — contributed bindings", () => {
  const REQUIRED: MiddlewareContribution = { bindings: [{ name: "PROBE_KV", methods: ["get"], label: "a probe binding" }] };

  it("serves a request carrying the binding a contribution requires", async () => {
    expect(await trailOf([REQUIRED], { ...ENV, PROBE_KV: { get: () => null } } as unknown as AppEnv)).toEqual([]);
  });

  it("refuses to serve when the binding a contribution requires is absent", async () => {
    const res = await appWith([REQUIRED]).request("/probe", {}, ENV);
    expect(res.status).toBe(500);
  });

  it("refuses to serve when the binding a contribution requires has the wrong shape", async () => {
    const res = await appWith([REQUIRED]).request("/probe", {}, { ...ENV, PROBE_KV: {} } as unknown as AppEnv);
    expect(res.status).toBe(500);
  });
});
