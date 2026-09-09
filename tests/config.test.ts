import { describe, expect, it } from "bun:test";

import { configStore, SITE_ORIGIN } from "../src/app/config";

const COMPLETE_ENV = {
  SITE_ORIGIN: "https://example.com",
  CSRF_SECRET: "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e",
  EMAIL_API_KEY: "test-api-key",
  TURNSTILE_SECRET_KEY: "test-ts-key",
  TURNSTILE_SITE_KEY: "test-site-key",
  AUTH_KEY_RING: "9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e6f2b4a7c0d3e5f7a9b1c3d5e",
  SESSION_SECRET: "6f2b4a7c0d3e5f7a9b1c3d5e9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e",
};

function envWithout(key: keyof typeof COMPLETE_ENV): Record<string, unknown> {
  const { [key]: _dropped, ...rest } = COMPLETE_ENV;
  return rest;
}

describe("configStore — SITE_ORIGIN falls through to the literal", () => {
  it("resolves to the production origin when the environment carries none", () => {
    const config = configStore.get(envWithout("SITE_ORIGIN"));
    expect(config.site.url.origin).toBe(SITE_ORIGIN);
  });

  it("derives allowedOrigins from the literal, naming this app's own host and no other", () => {
    const config = configStore.get(envWithout("SITE_ORIGIN"));
    expect(config.site.url.allowedOrigins).toEqual([SITE_ORIGIN]);
  });

  it("never falls back to a placeholder host", () => {
    const config = configStore.get(envWithout("SITE_ORIGIN"));
    expect(config.site.url.hostname).not.toContain("yourdomain.com");
    expect(config.site.url.hostname).not.toContain("example.com");
  });

  it("still refuses a secret the environment does not carry", () => {
    // The origin gained a default; nothing else did. `CSRF_SECRET` remains fail-closed, which is
    // what keeps a dev server from booting without `.dev.vars`.
    expect(() => configStore.get(envWithout("CSRF_SECRET"))).toThrow();
  });
});

describe("configStore — SITE_ORIGIN from the environment", () => {
  it("outranks the literal when present", () => {
    const config = configStore.get({ ...COMPLETE_ENV });
    expect(config.site.url.origin).toBe("https://example.com");
  });

  it("derives allowedOrigins from the environment value", () => {
    const config = configStore.get({ ...COMPLETE_ENV });
    expect(config.site.url.allowedOrigins).toEqual(["https://example.com"]);
  });

  it("rejects a plain http non-loopback origin", () => {
    expect(() => configStore.get({ ...COMPLETE_ENV, SITE_ORIGIN: "http://example.com" })).toThrow();
  });

  it("accepts the canonical devbox origin", () => {
    const config = configStore.get({ ...COMPLETE_ENV, SITE_ORIGIN: "https://starter.devbox.test:8443" });
    expect(config.site.url.origin).toBe("https://starter.devbox.test:8443");
  });

  it("accepts the proxy-less loopback origin", () => {
    const config = configStore.get({ ...COMPLETE_ENV, SITE_ORIGIN: "https://localhost:8787" });
    expect(config.site.url.origin).toBe("https://localhost:8787");
  });
});
