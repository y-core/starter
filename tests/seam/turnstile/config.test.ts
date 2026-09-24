import { describe, expect, it } from "bun:test";

import { app } from "../../../src/worker";
import { CONFIG_ENV, createTestBindings } from "../../env";

/** Cloudflare's published origin for the Turnstile script, its siteverify call and its challenge frame. */
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

const MINIMUM_ENV = {
  ASSETS: { fetch: async () => new Response("", { status: 200 }) },
  SITE_ORIGIN: "https://example.com",
  ...CONFIG_ENV,
  ...createTestBindings(),
} as unknown as Env;

/** Each directive's sources, with the per-request nonce normalised. */
async function directives(): Promise<Record<string, string[]>> {
  const csp = (await app.request("/", {}, MINIMUM_ENV)).headers.get("content-security-policy") ?? "";
  return Object.fromEntries(
    csp.split(";").map((directive) => {
      const [name = "", ...sources] = directive
        .trim()
        .replace(/'nonce-[^']+'/, "'nonce-N'")
        .split(/\s+/);
      return [name, sources];
    }),
  );
}

describe("the CSP on GET / while the Turnstile slice is kept", () => {
  it("admits the Turnstile origin to script-src, connect-src and frame-src", async () => {
    const csp = await directives();

    expect({ script: csp["script-src"], connect: csp["connect-src"], frame: csp["frame-src"] }).toEqual({
      script: ["'self'", "'nonce-N'", TURNSTILE_ORIGIN],
      connect: ["'self'", TURNSTILE_ORIGIN],
      frame: ["'self'", TURNSTILE_ORIGIN],
    });
  });
});
