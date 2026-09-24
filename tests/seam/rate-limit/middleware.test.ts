import { describe, expect, it } from "bun:test";

import { devAllowance } from "@y-core/forge/dev";
import { createController, createMiddleware, get, route } from "@y-core/forge/router";
import { rateLimit } from "@y-core/forge/security";

import { securityHeaders } from "../../../src/app/config";
import type { AppEnv } from "../../../src/app/types";
import { rateLimitPolicy } from "../../../src/rate-limit/mod";
import { createWorker } from "../../../src/worker";
import { CONFIG_ENV, createTestBindings } from "../../env";

const probeRouteMap = route({ probe: get("/fixture/rate-limit") });

/** A fresh app carrying one fixture route behind the shared policy, so the limiter is judged apart from any slice that uses it. */
function createProbeApp(dev?: ReturnType<typeof devAllowance>) {
  const probed = createWorker(securityHeaders, dev);
  probed.map(
    probeRouteMap,
    createController(probeRouteMap, {
      actions: { probe: { middleware: createMiddleware(rateLimit<AppEnv>(rateLimitPolicy(dev))), handler: () => new Response("ok") } },
    }),
  );
  return probed;
}

const CALLER_IP = "203.0.113.1";

function limiterEnv(limiter?: unknown): Env {
  const env: Record<string, unknown> = { SITE_ORIGIN: "https://example.com", ...CONFIG_ENV, ...createTestBindings() };
  if (limiter !== undefined) env.RATE_LIMITER = limiter;
  return env as unknown as Env;
}

function admitting(keys: string[] = []) {
  return {
    limit: async ({ key }: { key: string }) => {
      keys.push(key);
      return { success: true };
    },
  };
}

function probe(app: ReturnType<typeof createProbeApp>, env: Env, headers: Record<string, string> = { "CF-Connecting-IP": CALLER_IP }) {
  return app.request(probeRouteMap.probe.href(), { headers }, env);
}

describe("the shared rate-limit policy on the production entry", () => {
  const app = createProbeApp();

  it("admits a request the limiter has budget for", async () => {
    const res = await probe(app, limiterEnv(admitting()));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("refuses a request the limiter has run out of budget for", async () => {
    const res = await probe(app, limiterEnv({ limit: async () => ({ success: false }) }));

    expect(res.status).toBe(429);
    expect(await res.text()).toBe("Too many requests. Please try again later.");
  });

  it("keys the limiter by CF-Connecting-IP alone", async () => {
    const keys: string[] = [];
    await probe(app, limiterEnv(admitting(keys)), { "CF-Connecting-IP": "5.6.7.8" });

    expect(keys).toEqual(["5.6.7.8"]);
  });

  it("answers 503 without asking the limiter when CF-Connecting-IP is absent", async () => {
    const keys: string[] = [];
    const res = await probe(app, limiterEnv(admitting(keys)), {});

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("Service unavailable");
    expect(keys).toEqual([]);
  });

  it("answers 503 when the RATE_LIMITER binding is absent", async () => {
    const res = await probe(app, limiterEnv());

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("Service unavailable");
  });

  it("refuses to serve when the RATE_LIMITER binding is present but malformed", async () => {
    const res = await probe(app, limiterEnv({ check: async () => ({ success: true }) }));

    expect(res.status).toBe(500);
  });
});

describe("the shared rate-limit policy on an entry whose allowance licenses the absent binding", () => {
  const app = createProbeApp(devAllowance({ rateLimitOptional: true }));

  it("admits the request with the RATE_LIMITER binding absent", async () => {
    const res = await probe(app, limiterEnv());

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });
});
