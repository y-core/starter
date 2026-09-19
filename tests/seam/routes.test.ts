import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { CSRF_FIELD_DEFAULT, TURNSTILE_FIELD_DEFAULT } from "@y-core/forge/form";
import { attrsOf, createTestContext, elementOf, fakeD1, fakeKV, mintTestCsrfToken } from "@y-core/forge/testing";

import type { AppConfig, AppEnv } from "../../src/app/types";
import { ContactSchema, contactAction } from "../../src/controllers/actions/contact";
import { app } from "../../src/worker";
import { devApp } from "../../src/worker.dev";
import { ADMIN_BOOTSTRAP_SECRET, AUTH_KEY_RING, CONFIG_ENV, CSRF_SECRET, SESSION_SECRET } from "../env";

const SITE_ORIGIN = "https://example.com";

/** A hostname the site origin does not name, so a siteverify answer bearing it passes only through the dev entry's allowance. */
const DEV_HOSTNAME = "elsewhere.example";

/** One of Cloudflare's three published testing secrets — the other half of the allowance's lock. */
const TESTING_SECRET = "1x0000000000000000000000000000000AA";

const BASE_TEST_CONFIG: AppConfig = {
  site: {
    url: { origin: SITE_ORIGIN, hostname: "example.com", protocol: "https:", allowedOrigins: [SITE_ORIGIN, "https://www.example.com"] },
    debug: false,
  },
  security: { csrf: { secret: CSRF_SECRET } },
  auth: { keyRing: [AUTH_KEY_RING], sessionSecret: SESSION_SECRET, bootstrapSecret: ADMIN_BOOTSTRAP_SECRET, rpName: "Forge Studio" },
  services: {
    email: {
      apiKey: "test-api-key",
      apiUrl: "https://api.mailchannels.net/tx/v1/send",
      from: "from@example.com",
      senderName: "Atlas Studio",
      to: "to@example.com",
    },
    turnstile: { secretKey: "test-ts-key", siteKey: "test-site-key" },
  },
};

const VALID_FORM = new URLSearchParams({
  name: "Jane Example",
  email: "jane@example.com",
  phone: "+1 555 012 3456",
  message: "I would like help building a digital product.",
});

// Used for tests that need to pass Turnstile verification
const VALID_FORM_WITH_TOKEN = new URLSearchParams(VALID_FORM);
VALID_FORM_WITH_TOKEN.set("cf-turnstile-response", "test-token");

const HTMX_HEADERS = { "content-type": "application/x-www-form-urlencoded", "HX-Request": "true" };

const EMAIL_API_URL = "https://api.mailchannels.net/tx/v1/send";
const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const EXPECTED_SUCCESS_HTML =
  '<div class="rounded-2xl border border-status-success-border bg-status-success-subtle px-4 py-3 text-sm text-status-success-subtle-foreground" data-success><p>Thanks. We&#39;ll review your note and get back to you soon.</p></div>';
const EXPECTED_EMAIL_ERROR_HTML =
  '<div class="rounded-2xl border border-status-danger-border bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-subtle-foreground"><p>Something went wrong. Please try again or contact us directly.</p></div>';

/** The whole refusal body forge's pipeline renders for a declined submission: one `<li>` naming the failing field and nothing else. */
function refusal(field: string): string {
  return `<div class="rounded-2xl border border-status-danger-border bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-subtle-foreground"><p>Please correct the following fields.</p><ul class="mt-2 list-disc ps-5"><li>${field}</li></ul></div>`;
}

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) };

const MINIMUM_ENV = {
  ASSETS: MOCK_ASSETS,
  SITE_ORIGIN,
  ...CONFIG_ENV,
  AUTH_KV: fakeKV(),
  AUTH_DB: fakeD1(),
  // Present because an absent `RATE_LIMITER` is a 503 on the production entry rather than a skipped
  // guard; the cases that judge the limiter replace it.
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} as unknown as Env;

/** The address every POST arrives from, unless a case is measuring the key or its absence. */
const CALLER_IP = "203.0.113.1";

let _savedFetch: typeof globalThis.fetch;
let _csrfToken = "";

beforeAll(async () => {
  _savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, ...args) => {
    if (url.toString() === EMAIL_API_URL) {
      return new Response(null, { status: 202 });
    }
    if (url.toString() === TURNSTILE_URL) {
      return new Response(JSON.stringify({ success: true, hostname: "example.com" }));
    }
    return _savedFetch(url, ...args);
  };
  _csrfToken = await mintTestCsrfToken(CSRF_SECRET, "/api/contact");
});

afterAll(() => {
  globalThis.fetch = _savedFetch;
});

// `CF-Connecting-IP` rides on every POST because behind Cloudflare it always does, and the default
// keying fails closed without it — the one case that asserts the 503 builds its headers by hand.
function postHeaders(): Record<string, string> {
  return { ...HTMX_HEADERS, "X-CSRF-Token": _csrfToken, Origin: SITE_ORIGIN, "CF-Connecting-IP": CALLER_IP };
}

describe("GET /api/health", () => {
  it("returns healthy", async () => {
    const response = await app.request("/api/health", {}, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, checks: { csrf: true, schema: true } });
  });

  it("includes required security headers", async () => {
    const response = await app.request("/api/health", {}, MINIMUM_ENV);

    expect(response.headers.get("content-security-policy")).not.toBeNull();
    expect(response.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("includes a nonce in the CSP header", async () => {
    const response = await app.request("/api/health", {}, MINIMUM_ENV);
    const csp = response.headers.get("content-security-policy") || "";

    expect(csp).toContain("'nonce-");
  });

  it("omits the Wrangler live-reload hash from script-src outside dev", async () => {
    const response = await app.request("/api/health", {}, MINIMUM_ENV);
    const csp = response.headers.get("content-security-policy") || "";

    expect(csp).not.toContain("sha256-g5a3SrOYIecCloZ8S7M4xdT1pbYi6e7mjHrmwphRxfE=");
  });

  it("includes the Wrangler live-reload hash in script-src in dev", async () => {
    const response = await devApp.request("/api/health", {}, MINIMUM_ENV);
    const csp = response.headers.get("content-security-policy") || "";

    expect(csp).toContain("sha256-g5a3SrOYIecCloZ8S7M4xdT1pbYi6e7mjHrmwphRxfE=");
  });

  it("returns Cache-Control: no-store", async () => {
    const response = await app.request("/api/health", {}, MINIMUM_ENV);

    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("POST /api/contact", () => {
  it("returns the success fragment for a valid form", async () => {
    const response = await app.request(
      "/api/contact",
      { method: "POST", headers: postHeaders(), body: VALID_FORM_WITH_TOKEN.toString() },
      MINIMUM_ENV,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("returns the validation fragment naming only the first failing field", async () => {
    // Three fields are broken; the refusal names one. That is `abortEarly`, not an omission.
    const body = new URLSearchParams({ name: "", email: "not-an-email", phone: "", message: "Too short", "cf-turnstile-response": "test-token" });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("name"));
  });

  it("includes required security headers", async () => {
    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: VALID_FORM.toString() }, MINIMUM_ENV);

    expect(response.headers.get("content-security-policy")).not.toBeNull();
    expect(response.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("POST /api/contact — CSRF protection", () => {
  it("returns 403 when HX-Request header is absent", async () => {
    const response = await app.request(
      "/api/contact",
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", Origin: SITE_ORIGIN }, body: VALID_FORM.toString() },
      MINIMUM_ENV,
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });

  it("returns 403 when HX-Request header is not 'true'", async () => {
    const response = await app.request(
      "/api/contact",
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "HX-Request": "false", Origin: SITE_ORIGIN },
        body: VALID_FORM.toString(),
      },
      MINIMUM_ENV,
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 when X-CSRF-Token header is absent", async () => {
    const headers = { ...HTMX_HEADERS, Origin: SITE_ORIGIN, "CF-Connecting-IP": CALLER_IP }; // no X-CSRF-Token
    const response = await app.request("/api/contact", { method: "POST", headers, body: VALID_FORM.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(403);
  });

  it("returns 403 when X-CSRF-Token is forged (invalid value)", async () => {
    const response = await app.request(
      "/api/contact",
      {
        method: "POST",
        headers: { ...HTMX_HEADERS, "X-CSRF-Token": "invalid-forged-token", Origin: SITE_ORIGIN, "CF-Connecting-IP": CALLER_IP },
        body: VALID_FORM.toString(),
      },
      MINIMUM_ENV,
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 when Origin is not in the allow-list", async () => {
    const response = await app.request(
      "/api/contact",
      { method: "POST", headers: { ...HTMX_HEADERS, "X-CSRF-Token": _csrfToken, Origin: "https://evil.com" }, body: VALID_FORM.toString() },
      MINIMUM_ENV,
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });

  it("returns 403 when the request carries neither Origin nor Sec-Fetch-Site", async () => {
    const headers = { ...HTMX_HEADERS, "X-CSRF-Token": _csrfToken, "CF-Connecting-IP": CALLER_IP };
    const response = await app.request("/api/contact", { method: "POST", headers, body: VALID_FORM.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
  });
});

describe("POST /api/contact — malformed requests", () => {
  it("returns 415 for application/json body", async () => {
    const response = await app.request(
      "/api/contact",
      {
        method: "POST",
        headers: { "content-type": "application/json", "HX-Request": "true", Origin: SITE_ORIGIN },
        body: JSON.stringify({ name: "Jane", email: "jane@example.com", message: "Hello there." }),
      },
      MINIMUM_ENV,
    );

    expect(response.status).toBe(415);
    expect(await response.text()).toBe("Unsupported Media Type");
  });

  it("returns 415 for a request with no body", async () => {
    const response = await app.request("/api/contact", { method: "POST", headers: { "HX-Request": "true", Origin: SITE_ORIGIN } }, MINIMUM_ENV);

    expect(response.status).toBe(415);
  });
});

describe("POST /api/contact — boundary values", () => {
  it("accepts a message of exactly 15 characters (minimum)", async () => {
    const body = new URLSearchParams({
      name: "Jane Example",
      email: "jane@example.com",
      phone: "",
      message: "123456789012345",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("rejects a message of 14 characters (below minimum)", async () => {
    const body = new URLSearchParams({
      name: "Jane Example",
      email: "jane@example.com",
      phone: "",
      message: "12345678901234",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("message"));
  });

  it("accepts a name of exactly 100 characters (maximum)", async () => {
    const body = new URLSearchParams({
      name: "J".repeat(100),
      email: "jane@example.com",
      phone: "",
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("rejects a name of 101 characters (above maximum)", async () => {
    const body = new URLSearchParams({
      name: "J".repeat(101),
      email: "jane@example.com",
      phone: "",
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("name"));
  });

  it("succeeds without an optional phone number", async () => {
    const body = new URLSearchParams({
      name: "Jane Example",
      email: "jane@example.com",
      phone: "",
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("accepts a message of exactly 2000 characters (maximum)", async () => {
    const body = new URLSearchParams({
      name: "Jane Example",
      email: "jane@example.com",
      phone: "",
      message: "A".repeat(2000),
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("rejects a message of 2001 characters (above maximum)", async () => {
    const body = new URLSearchParams({
      name: "Jane Example",
      email: "jane@example.com",
      phone: "",
      message: "A".repeat(2001),
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("message"));
  });

  it("accepts a phone of exactly 20 characters (maximum)", async () => {
    const body = new URLSearchParams({
      name: "Jane Example",
      email: "jane@example.com",
      phone: "1".repeat(20),
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("rejects a phone of 21 characters (above maximum)", async () => {
    const body = new URLSearchParams({
      name: "Jane Example",
      email: "jane@example.com",
      phone: "1".repeat(21),
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("phone"));
  });

  it("accepts an email of exactly 254 characters (maximum)", async () => {
    // 242 local chars + "@example.com" (12 chars) = 254 chars
    const body = new URLSearchParams({
      name: "Jane Example",
      email: `${"a".repeat(242)}@example.com`,
      phone: "",
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("rejects an email of 255 characters (above maximum)", async () => {
    // 243 local chars + "@example.com" (12 chars) = 255 chars
    const body = new URLSearchParams({
      name: "Jane Example",
      email: `${"a".repeat(243)}@example.com`,
      phone: "",
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("email"));
  });

  // No single check spells the address rule: the HTML living standard admits an apostrophe the old
  // regex refused, and the domain check refuses a single-label domain the standard would accept.
  it("accepts an apostrophe in the local part, which the HTML living standard admits", async () => {
    const body = new URLSearchParams({
      name: "Jane Example",
      email: "o'brien@example.com",
      phone: "",
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("rejects a single-label domain, which no reply could be delivered to", async () => {
    const body = new URLSearchParams({
      name: "Jane Example",
      email: "ada@localhost",
      phone: "",
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("email"));
  });

  it("rejects a whitespace-only name after trimming", async () => {
    const body = new URLSearchParams({
      name: "   ",
      email: "jane@example.com",
      phone: "",
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("name"));
  });
});

describe("POST /api/contact — XSS payloads", () => {
  it("accepts a submission with XSS chars in the name and returns the success fragment", async () => {
    // The outgoing email body's escaping is `tests/unit/email.test.ts`; here it is the response,
    // which is the static success fragment and so definitionally reflects nothing.
    const body = new URLSearchParams({
      name: "<script>alert(1)</script>",
      email: "jane@example.com",
      phone: "",
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("returns the exact validation error fragment when email is invalid (no XSS reflection)", async () => {
    const body = new URLSearchParams({
      name: "",
      email: '"><script>alert(1)</script>',
      phone: "",
      message: "short",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("name"));
  });
});

describe("POST /api/contact — Turnstile verification", () => {
  const makeRequest = (body: URLSearchParams) =>
    new Request("https://example.com/api/contact", { method: "POST", headers: HTMX_HEADERS, body: body.toString() });

  // A tripped bot guard answers in the shape of a validation refusal so a bot cannot read which
  // guard it hit, which is why the status is asserted and never a guard-specific message.
  it("refuses with 422 when the cf-turnstile-response token is missing", async () => {
    const c = createTestContext<AppEnv, AppConfig>(makeRequest(VALID_FORM), { env: {} as AppEnv, config: BASE_TEST_CONFIG });
    const response = await contactAction(c);

    expect(response.status).toBe(422);
  });

  it("refuses with 422 when Turnstile verification fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false }));

    const body = new URLSearchParams(VALID_FORM);
    body.set("cf-turnstile-response", "bad-token");

    try {
      const c = createTestContext<AppEnv, AppConfig>(makeRequest(body), { env: {} as AppEnv, config: BASE_TEST_CONFIG });
      const response = await contactAction(c);

      expect(response.status).toBe(422);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("renders a guard refusal byte-identical to a validation refusal", async () => {
    const c = createTestContext<AppEnv, AppConfig>(makeRequest(VALID_FORM), { env: {} as AppEnv, config: BASE_TEST_CONFIG });
    const response = await contactAction(c);

    // `name` is the schema's first declared field — the guard names it whatever actually failed.
    expect(await response.text()).toBe(refusal("name"));
  });

  it("proceeds to success when Turnstile verification passes", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.toString().includes("challenges.cloudflare.com")) {
        return new Response(JSON.stringify({ success: true, hostname: "example.com" }));
      }
      return new Response(null, { status: 202 });
    };

    const body = new URLSearchParams(VALID_FORM);
    body.set("cf-turnstile-response", "valid-token");

    try {
      const c = createTestContext<AppEnv, AppConfig>(makeRequest(body), { env: {} as AppEnv, config: BASE_TEST_CONFIG });
      const response = await contactAction(c);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// Every case below shares one siteverify answer, so what separates them is exactly the lock: the
// dev-only allowance and a published testing secret, neither of which opens alone.
describe("POST /api/contact — the Turnstile testing-secret allowance", () => {
  const TESTING_ENV = { ...MINIMUM_ENV, TURNSTILE_SECRET_KEY: TESTING_SECRET } as unknown as Env;

  const siteverifyElsewhere = async (url: URL | RequestInfo) => {
    if (url.toString() === TURNSTILE_URL) return new Response(JSON.stringify({ success: true, hostname: DEV_HOSTNAME }));
    return new Response(null, { status: 202 });
  };

  async function submit(entry: typeof app, env: Env): Promise<Response> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = siteverifyElsewhere as typeof globalThis.fetch;

    try {
      return await entry.request("/api/contact", { method: "POST", headers: postHeaders(), body: VALID_FORM_WITH_TOKEN.toString() }, env);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  it("refuses a token verified against another hostname on the production entry", async () => {
    const response = await submit(app, TESTING_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("name"));
  });

  it("accepts the same token on the dev entry, which mints the allowance", async () => {
    const response = await submit(devApp, TESTING_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("refuses it on the dev entry too when the secret is not a published testing one", async () => {
    const response = await submit(devApp, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("name"));
  });
});

describe("POST /api/contact — rate limiting", () => {
  it("returns 429 when rate limit is exceeded", async () => {
    const response = await app.request(
      "/api/contact",
      { method: "POST", headers: { ...postHeaders(), "CF-Connecting-IP": "1.2.3.4" }, body: VALID_FORM_WITH_TOKEN.toString() },
      { ...MINIMUM_ENV, RATE_LIMITER: { limit: async () => ({ success: false }) } },
    );

    expect(response.status).toBe(429);
    expect(await response.text()).toBe("Too many requests. Please try again later.");
  });

  it("proceeds to success when rate limit passes", async () => {
    const response = await app.request(
      "/api/contact",
      { method: "POST", headers: { ...postHeaders(), "CF-Connecting-IP": "1.2.3.4" }, body: VALID_FORM_WITH_TOKEN.toString() },
      { ...MINIMUM_ENV, RATE_LIMITER: { limit: async () => ({ success: true }) } },
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("keys the rate limit by CF-Connecting-IP", async () => {
    let capturedKey: string | undefined;
    await app.request(
      "/api/contact",
      { method: "POST", headers: { ...postHeaders(), "CF-Connecting-IP": "5.6.7.8" }, body: VALID_FORM_WITH_TOKEN.toString() },
      {
        ...MINIMUM_ENV,
        RATE_LIMITER: {
          limit: async ({ key }: { key: string }) => {
            capturedKey = key;
            return { success: true };
          },
        },
      },
    );

    expect(capturedKey).toBe("5.6.7.8");
  });

  it("returns 503 when CF-Connecting-IP header is absent (fail-closed)", async () => {
    const { "CF-Connecting-IP": _ip, ...headers } = postHeaders();

    const response = await app.request("/api/contact", { method: "POST", headers, body: VALID_FORM_WITH_TOKEN.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(503);
  });

  // An absent binding is a limiter that silently stopped limiting, so production fails closed and
  // only the dev entry's allowance degrades it — these cases share every input but the entry point.
  it("returns 503 when the RATE_LIMITER binding is absent on the production entry", async () => {
    const { RATE_LIMITER: _limiter, ...env } = MINIMUM_ENV as unknown as Record<string, unknown>;

    const response = await app.request(
      "/api/contact",
      { method: "POST", headers: postHeaders(), body: VALID_FORM_WITH_TOKEN.toString() },
      env as unknown as Env,
    );

    expect(response.status).toBe(503);
  });

  it("skips rate limiting on the dev entry, which licenses the absent binding", async () => {
    const { RATE_LIMITER: _limiter, ...env } = MINIMUM_ENV as unknown as Record<string, unknown>;

    const response = await devApp.request(
      "/api/contact",
      { method: "POST", headers: postHeaders(), body: VALID_FORM_WITH_TOKEN.toString() },
      env as unknown as Env,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });
});

describe("POST /api/contact — body-read semantics", () => {
  // `formToObject` leaves an absent field absent rather than substituting `""`, so a non-optional
  // `phone` would 422 every submission that omits the optional input.
  it("succeeds when the optional phone field is absent entirely", async () => {
    const body = new URLSearchParams({
      name: "Jane Example",
      email: "jane@example.com",
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  // A repeated key reaches the schema as an array, which a scalar field refuses. `Object.fromEntries`
  // would be last-wins and turn this into a *successful* request carrying the attacker's reply-to.
  it("refuses a duplicated email key rather than silently taking one of them", async () => {
    const body = new URLSearchParams({ name: "Jane Example", message: "Valid message content for a digital product project." });
    body.append("email", "victim@example.com");
    body.append("email", "attacker@example.com");
    body.set("cf-turnstile-response", "test-token");

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("email"));
  });

  it("refuses an inherited name rather than letting it reach the parsed object", async () => {
    const body = new URLSearchParams(VALID_FORM_WITH_TOKEN);
    body.set("__proto__", "polluted");

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(({} as Record<string, unknown>)["polluted"]).toBeUndefined();
  });

  // Everything the form posts beyond the schema is dropped only because a guard consumed it — `_csrf`
  // via `csrfFieldCtx`, the Turnstile token because the action named it.
  it("refuses an undeclared field", async () => {
    const body = new URLSearchParams(VALID_FORM_WITH_TOKEN);
    body.set("role", "admin");

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("role"));
  });
});

describe("contact form — view ↔ schema contract", () => {
  // A crafted body structurally cannot see view↔handler drift — it posts whatever the author typed —
  // so this reads what the page renders and holds it against what the schema declares.
  it("renders exactly the fields the schema declares, plus the guard-consumed ones", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    const html = await res.text();

    const rendered = [...html.matchAll(/<(?:input|textarea)\b[^>]*\bname="([^"]*)"/g)].map((m) => m[1]);
    const declared = Object.keys(ContactSchema.entries);
    const injected = [CSRF_FIELD_DEFAULT, TURNSTILE_FIELD_DEFAULT];

    expect(rendered.filter((name) => !injected.includes(name as string))).toEqual(declared);
  });
});

describe("POST /api/contact — edge cases", () => {
  it("accepts a name containing unicode characters", async () => {
    const body = new URLSearchParams({
      name: "André van der Berg",
      email: "andre@example.com",
      phone: "",
      message: "I need help designing a new product interface.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("rejects an invalid phone number format", async () => {
    const body = new URLSearchParams({
      name: "Jane Example",
      email: "jane@example.com",
      phone: "not-a-phone!!!",
      message: "Valid message content for a digital product project.",
      "cf-turnstile-response": "test-token",
    });

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("phone"));
  });
});

// A fresh `fakeKV` per request: it is a working namespace, so the request logger's own entry would
// otherwise accumulate across cases and the empty-state assertions would depend on test order.
const logsEnv = () => ({ ...MINIMUM_ENV, LOGS_KV: fakeKV() }) as unknown as Env;

const EXPECTED_EMPTY_TBODY =
  '<tbody id="log-tbody"><tr><td colspan="5" class="px-4 py-4 text-center"><div class="flex flex-col items-center gap-2"><span class="text-sm text-muted-foreground">No log entries have been recorded yet.</span></div></td></tr></tbody>';

describe("GET /showcase/logs — access control", () => {
  it("returns 403 on the production entry, which mints no allowance", async () => {
    const res = await app.request("/showcase/logs", {}, logsEnv());
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
  });

  it("returns 403 for the HTMX partial too", async () => {
    const res = await app.request("/showcase/logs", { headers: { "HX-Request": "true" } }, logsEnv());
    expect(res.status).toBe(403);
  });
});

describe("GET /showcase/logs — full page", () => {
  it("returns 200 status on the dev entry, which mints the allowance", async () => {
    const res = await devApp.request("/showcase/logs", {}, logsEnv());
    expect(res.status).toBe(200);
  });

  // A viewer owning its own shell would reach neither the dark class nor the pre-paint theme script,
  // and would render light whatever its components ask for.
  it("renders the viewer inside the app's Layout, not a shell of forge's own", async () => {
    const res = await devApp.request("/showcase/logs", {}, logsEnv());
    const text = await res.text();
    expect(text.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(elementOf(text, "title")).toBe("<title>Logs — Forge Studio</title>");
    expect(elementOf(text, "h1")).toBe('<h1 class="text-2xl font-semibold tracking-tight text-balance text-foreground">Request Log</h1>');
    expect(attrsOf(text, 'data-scope="theme"')).toEqual({ "data-scope": "theme", "data-island-state": "{&quot;pref&quot;:&quot;system&quot;}" });
    expect(attrsOf(text, 'hx-get="/showcase/logs"')).toEqual({
      "hx-get": "/showcase/logs",
      "hx-target": "#log-tbody",
      "hx-swap": "outerHTML",
      "hx-indicator": "#log-tbody",
      "hx-disabled-elt": "find button[type=&#39;submit&#39;]",
      "hx-push-url": "true",
    });
    expect([...elementOf(text, "thead").matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((match) => match[1])).toEqual([
      "Timestamp",
      "Level",
      "Prefix",
      "Message",
      "Request ID",
    ]);
    expect(elementOf(text, "tbody", 'id="log-tbody"')).toBe(EXPECTED_EMPTY_TBODY);
  });

  it("includes required security headers", async () => {
    const res = await devApp.request("/showcase/logs", {}, logsEnv());
    expect(res.headers.get("content-security-policy")).not.toBeNull();
    expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});

describe("GET /showcase/logs — HTMX partial", () => {
  it("returns only the tbody fragment when HX-Request is true", async () => {
    const res = await devApp.request("/showcase/logs", { headers: { "HX-Request": "true" } }, logsEnv());
    expect(res.status).toBe(200);
    const text = await res.text();
    // exact match proves TBODY_ID in the partial equals the id the full page registers as swap target
    expect(text).toBe(EXPECTED_EMPTY_TBODY);
  });

  it("does not include the full page shell in the partial response", async () => {
    const res = await devApp.request("/showcase/logs", { headers: { "HX-Request": "true" } }, logsEnv());
    const text = await res.text();
    expect(text).not.toContain("<!DOCTYPE html>");
    expect(text).not.toContain("<title>Request Log</title>");
  });
});

describe("POST /api/contact — email delivery failure", () => {
  const makeRequest = (body: URLSearchParams) =>
    new Request("https://example.com/api/contact", { method: "POST", headers: HTMX_HEADERS, body: body.toString() });

  it("returns 500 when email API returns an error", async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.toString() === EMAIL_API_URL) {
        return new Response("Service Unavailable", { status: 503 });
      }
      return savedFetch(url);
    };

    try {
      const c = createTestContext<AppEnv, AppConfig>(makeRequest(VALID_FORM_WITH_TOKEN), { env: {} as AppEnv, config: BASE_TEST_CONFIG });
      const response = await contactAction(c);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe(EXPECTED_EMAIL_ERROR_HTML);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  const REJECTION = `no such mailbox: ${VALID_FORM_WITH_TOKEN.get("email")}`;

  // The provider echoes the recipient address back in its rejection body, which `src/services/email.ts`
  // logs structurally — so this is the path a real address takes towards the store that outlives it.
  /** Both channels of one submission, with the provider's answer chosen by the case. */
  async function capturedDelivery(provider: () => Response, expectStatus: number): Promise<{ stored: string[]; console: string[] }> {
    const savedFetch = globalThis.fetch;
    const savedLog = console.log;
    const logged: string[] = [];
    globalThis.fetch = async (url, ...args) => {
      if (url.toString() === EMAIL_API_URL) return provider();
      if (url.toString() === TURNSTILE_URL) return new Response(JSON.stringify({ success: true, hostname: "example.com" }));
      return savedFetch(url, ...args);
    };
    console.log = (...args: unknown[]) => logged.push(args.map(String).join(" "));

    const kv = fakeKV();
    try {
      const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: VALID_FORM_WITH_TOKEN.toString() }, {
        ...MINIMUM_ENV,
        LOGS_KV: kv,
      } as unknown as Env);
      expect(response.status).toBe(expectStatus);
    } finally {
      globalThis.fetch = savedFetch;
      console.log = savedLog;
    }

    const stored = await Promise.all((await kv.list()).keys.map(async (entry) => (await kv.get(entry.name, { type: "text" })) ?? ""));
    return { stored, console: logged };
  }

  const rejectedDelivery = () => capturedDelivery(() => new Response(REJECTION, { status: 503 }), 500);
  const acceptedDelivery = () => capturedDelivery(() => new Response(null, { status: 202 }), 200);

  it("keeps the rejected provider body out of the KV log store (BOUNDARIES §4a)", async () => {
    const { stored } = await rejectedDelivery();

    expect(stored.length).toBeGreaterThan(0);
    expect(stored.join("\n")).not.toContain(REJECTION);
    expect(stored.some((record) => record.includes('"body":"[redacted]"'))).toBe(true);
  });

  // §4a bans the address on **any** channel, and Workers Logs ingests all of this one: the console
  // half is what a per-channel wrapper left unredacted, so it is asserted beside the KV half.
  it("keeps it out of the console channel too, which observability ingests in full (BOUNDARIES §4a)", async () => {
    const { console: logged } = await rejectedDelivery();

    expect(logged.length).toBeGreaterThan(0);
    expect(logged.join("\n")).not.toContain(REJECTION);
    expect(logged.some((line) => line.includes('"body":"[redacted]"'))).toBe(true);
  });

  // Forge's default set covers neither `name` nor `message`, and this app adds no stem for them
  // because it writes neither into a record — so absence is what holds the claim, not redaction.
  it("puts none of the submitted name, phone or message on either channel (BOUNDARIES §4a)", async () => {
    const refused = await rejectedDelivery();
    const accepted = await acceptedDelivery();

    const everything = [...refused.stored, ...refused.console, ...accepted.stored, ...accepted.console].join("\n");
    for (const field of ["name", "phone", "message"] as const) {
      expect(everything).not.toContain(VALID_FORM_WITH_TOKEN.get(field));
    }
  });
});
