/** The Turnstile verify action as this app mounts it: unconfigured, behind its own request-shape and cross-origin guards. */
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

const VERIFY_URL = "https://example.com/showcase/ui/api/turnstile-verify";

const post = (body: BodyInit, headers: Record<string, string> = {}) =>
  app.request(VERIFY_URL, { method: "POST", body, headers: { "Sec-Fetch-Site": "same-origin", ...headers } }, MINIMUM_ENV);

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

const alertParts = (html: string) => [
  html.match(/<div[^>]*data-slot="alert"[^>]*>/)?.[0].match(/\sdata-tone="([^"]*)"/)?.[1] ?? null,
  html.match(/<div[^>]*data-slot="alert-title"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? null,
  html.match(/<div[^>]*data-slot="alert-description"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? null,
];

const UNCONFIGURED = [
  "warning",
  "No secret key is configured",
  "The form reached the action, but no Turnstile secret is configured, so nothing was sent to siteverify.",
];

describe("the Turnstile verify action, unconfigured", () => {
  it("answers a same-origin multipart post with the unconfigured verdict", async () => {
    const res = await post(form({ email: "ada@example.com" }));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(alertParts(await res.text())).toEqual(UNCONFIGURED);
  });

  it("accepts the widget's token field rather than refusing it as undeclared", async () => {
    const res = await post(form({ email: "ada@example.com", "cf-turnstile-response": "a-widget-token" }));

    expect(res.status).toBe(200);
    expect(alertParts(await res.text())).toEqual(UNCONFIGURED);
  });

  it("answers a same-origin urlencoded post", async () => {
    const res = await post("email=ada%40example.com", { "Content-Type": "application/x-www-form-urlencoded" });

    expect(res.status).toBe(200);
    expect(alertParts(await res.text())).toEqual(UNCONFIGURED);
  });
});

describe("the Turnstile verify action's guards", () => {
  it("refuses a body that is not a form encoding with 415", async () => {
    const res = await post(JSON.stringify({ email: "ada@example.com" }), { "Content-Type": "application/json" });
    expect({ status: res.status, body: await res.text() }).toEqual({ status: 415, body: "Unsupported Media Type" });
  });

  it("refuses a cross-site post with 403", async () => {
    const res = await post(form({ email: "ada@example.com" }), { "Sec-Fetch-Site": "cross-site" });
    expect({ status: res.status, body: await res.text() }).toEqual({ status: 403, body: "Forbidden" });
  });

  it("refuses a same-site post with 403, since a sibling subdomain is not this origin", async () => {
    const res = await post(form({ email: "ada@example.com" }), { "Sec-Fetch-Site": "same-site" });
    expect({ status: res.status, body: await res.text() }).toEqual({ status: 403, body: "Forbidden" });
  });

  it("refuses a post carrying no Fetch Metadata with 403, failing closed", async () => {
    const res = await app.request(VERIFY_URL, { method: "POST", body: form({ email: "ada@example.com" }) }, MINIMUM_ENV);
    expect({ status: res.status, body: await res.text() }).toEqual({ status: 403, body: "Forbidden" });
  });
});
