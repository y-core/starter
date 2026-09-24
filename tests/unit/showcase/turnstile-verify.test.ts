/** The Turnstile verify action given a secret, on a bare app with siteverify stubbed. */
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { Forge } from "@y-core/forge/app";

import type { AppEnv } from "../../../src/app/types";
import { createTurnstileVerifyController } from "../../../src/showcase/controllers/turnstile-verify";
import { showcaseRouteMap } from "../../../src/showcase/routes";

const VERIFY_URL = "https://example.com/showcase/ui/api/turnstile-verify";

let _savedFetch: typeof globalThis.fetch;
let siteverifyAnswer: object = { success: false };

beforeAll(() => {
  _savedFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(siteverifyAnswer);
});

afterAll(() => {
  globalThis.fetch = _savedFetch;
});

const createVerifyApp = () => {
  const app = new Forge<AppEnv>();
  app.map(
    showcaseRouteMap.api.turnstileVerify,
    createTurnstileVerifyController(() => "secret"),
  );
  return app;
};

const post = (fields: Record<string, string>) => {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return createVerifyApp().request(VERIFY_URL, { method: "POST", body, headers: { "Sec-Fetch-Site": "same-origin" } });
};

const alertParts = (html: string) => [
  html.match(/<div[^>]*data-slot="alert-title"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? null,
  html.match(/<div[^>]*data-slot="alert-description"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? null,
];

describe("the Turnstile verify action, configured", () => {
  it("refuses a post carrying no token with 422, naming the turnstile guard", async () => {
    const res = await post({ email: "ada@example.com" });

    expect(res.status).toBe(422);
    expect(alertParts(await res.text())).toEqual([
      "Refused by the turnstile guard",
      "No token reached the server — the widget never ran, or its hidden field was stripped.",
    ]);
  });

  it("refuses a token siteverify rejects with 422, and does not claim to be unconfigured", async () => {
    siteverifyAnswer = { success: false };
    const res = await post({ email: "ada@example.com", "cf-turnstile-response": "a-widget-token" });
    const html = await res.text();

    expect(res.status).toBe(422);
    expect(alertParts(html)).toEqual([
      "Refused by the turnstile guard",
      "Cloudflare refused the token. On the always-blocks key this is the expected answer.",
    ]);
    expect(html.includes("No secret key is configured")).toBe(false);
  });

  it("answers Verified when siteverify passes a token minted for the request's own host", async () => {
    siteverifyAnswer = { success: true, hostname: "example.com" };
    const res = await post({ email: "ada@example.com", "cf-turnstile-response": "a-widget-token" });

    expect(res.status).toBe(200);
    expect(alertParts(await res.text())[0]).toBe("Verified");
  });
});
