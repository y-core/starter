import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { CSRF_FIELD_DEFAULT, createCsrfToken, importCsrfKey, TURNSTILE_FIELD_DEFAULT } from "@y-core/forge/form";
import type { AppConfig } from "../src/app/config";
import type { AppEnv } from "../src/app/context";
import { CONTACT_DECOY, ContactSchema, contactAction } from "../src/controllers/actions/contact";
import app from "../src/worker";
import devApp from "../src/worker.dev";
import { makeTestContext } from "./setup";

const BASE_URL = "https://example.com";

const BASE_TEST_CONFIG: AppConfig = {
  site: {
    url: { origin: BASE_URL, hostname: "example.com", protocol: "https:", allowedOrigins: [BASE_URL, "https://www.example.com"] },
    debug: false,
  },
  security: { csrf: { secret: "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e" } },
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

/**
 * The whole refusal body forge's submission pipeline renders for a body it declines: one `<li>`
 * naming the failing field and nothing else. `abortEarly` holds it to a single issue however many
 * fields a caller broke, and `describeValidationIssue` reproduces neither the submitted value nor
 * the schema's rule — so neither the issue count nor the response length is caller-steerable.
 */
function refusal(field: string): string {
  return `<div class="rounded-2xl border border-status-danger-border bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-subtle-foreground"><p>Please correct the following fields.</p><ul class="mt-2 list-disc pl-5"><li>${field}</li></ul></div>`;
}

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) };

const TEST_CSRF_SECRET = "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e";

const MINIMUM_ENV = {
  ASSETS: MOCK_ASSETS,
  BASE_URL,
  CSRF_SECRET: TEST_CSRF_SECRET,
  EMAIL_API_KEY: "test-api-key",
  EMAIL_FROM: "from@example.com",
  EMAIL_TO: "to@example.com",
  TURNSTILE_SECRET_KEY: "test-ts-key",
  TURNSTILE_SITE_KEY: "test-site-key",
} as unknown as Env;

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
  const csrfKey = await importCsrfKey(TEST_CSRF_SECRET);
  _csrfToken = await createCsrfToken(csrfKey, "/api/contact");
});

afterAll(() => {
  globalThis.fetch = _savedFetch;
});

function postHeaders(): Record<string, string> {
  return { ...HTMX_HEADERS, "X-CSRF-Token": _csrfToken, Origin: BASE_URL };
}

describe("GET /api/health", () => {
  it("returns healthy", async () => {
    const response = await app.request("/api/health", {}, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, checks: { csrf: true } });
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
      { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", Origin: BASE_URL }, body: VALID_FORM.toString() },
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
        headers: { "content-type": "application/x-www-form-urlencoded", "HX-Request": "false", Origin: BASE_URL },
        body: VALID_FORM.toString(),
      },
      MINIMUM_ENV,
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 when X-CSRF-Token header is absent", async () => {
    const headers = { ...HTMX_HEADERS, Origin: BASE_URL }; // no X-CSRF-Token
    const response = await app.request("/api/contact", { method: "POST", headers, body: VALID_FORM.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(403);
  });

  it("returns 403 when X-CSRF-Token is forged (invalid value)", async () => {
    const response = await app.request(
      "/api/contact",
      { method: "POST", headers: { ...HTMX_HEADERS, "X-CSRF-Token": "invalid-forged-token", Origin: BASE_URL }, body: VALID_FORM.toString() },
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
});

describe("POST /api/contact — malformed requests", () => {
  it("returns 415 for application/json body", async () => {
    const response = await app.request(
      "/api/contact",
      {
        method: "POST",
        headers: { "content-type": "application/json", "HX-Request": "true", Origin: BASE_URL },
        body: JSON.stringify({ name: "Jane", email: "jane@example.com", message: "Hello there." }),
      },
      MINIMUM_ENV,
    );

    expect(response.status).toBe(415);
    expect(await response.text()).toBe("Unsupported Media Type");
  });

  it("returns 415 for a request with no body", async () => {
    const response = await app.request("/api/contact", { method: "POST", headers: { "HX-Request": "true", Origin: BASE_URL } }, MINIMUM_ENV);

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
    // XSS coverage lives in tests/email.test.ts which captures and asserts the outgoing
    // email body is HTML-escaped. Here we verify the HTTP response for such submissions
    // is the static success fragment (which definitionally cannot reflect input back).
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

  // A tripped bot guard now answers in the *shape* of a validation refusal — same status, same
  // one-`<li>` body naming the schema's first declared field, never the guard — so a bot cannot
  // read which guard it hit off the response. Assert the status, not a guard-specific message.
  it("refuses with 422 when the cf-turnstile-response token is missing", async () => {
    const c = makeTestContext(makeRequest(VALID_FORM), {} as AppEnv, BASE_TEST_CONFIG);
    const response = await contactAction(c);

    expect(response.status).toBe(422);
  });

  it("refuses with 422 when Turnstile verification fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ success: false }));

    const body = new URLSearchParams(VALID_FORM);
    body.set("cf-turnstile-response", "bad-token");

    try {
      const c = makeTestContext(makeRequest(body), {} as AppEnv, BASE_TEST_CONFIG);
      const response = await contactAction(c);

      expect(response.status).toBe(422);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("renders a guard refusal byte-identical to a validation refusal", async () => {
    const c = makeTestContext(makeRequest(VALID_FORM), {} as AppEnv, BASE_TEST_CONFIG);
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
      const c = makeTestContext(makeRequest(body), {} as AppEnv, BASE_TEST_CONFIG);
      const response = await contactAction(c);

      expect(response.status).toBe(200);
      expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
    } finally {
      globalThis.fetch = originalFetch;
    }
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
    const response = await app.request(
      "/api/contact",
      { method: "POST", headers: postHeaders(), body: VALID_FORM_WITH_TOKEN.toString() },
      { ...MINIMUM_ENV, RATE_LIMITER: { limit: async () => ({ success: true }) } },
    );

    expect(response.status).toBe(503);
  });

  it("skips rate limiting when RATE_LIMITER binding is absent", async () => {
    const response = await app.request(
      "/api/contact",
      { method: "POST", headers: { ...postHeaders(), "CF-Connecting-IP": "1.2.3.4" }, body: VALID_FORM_WITH_TOKEN.toString() },
      MINIMUM_ENV,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });
});

describe("POST /api/contact — honeypot", () => {
  // The one test that makes the honeypot hazard non-silent: `<Form>` stopped auto-rendering a decoy
  // at forge 0.0.80 and `defineAction` stopped stripping one it was not told about at 0.0.81, so bot
  // detection disappears without a sound unless `<Honeypot>` is composed and `honeypot:` is named.
  // Status only — the body is byte-identical to a real validation refusal by design, and pinning it
  // would assert a distinguishability forge deliberately does not have.
  it("refuses when the decoy field is filled", async () => {
    const body = new URLSearchParams(VALID_FORM_WITH_TOKEN);
    body.set(CONTACT_DECOY, "Bot");

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
  });

  it("proceeds when the decoy field is empty", async () => {
    const body = new URLSearchParams(VALID_FORM_WITH_TOKEN);
    body.set(CONTACT_DECOY, "");

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });

  it("proceeds when the decoy field is absent", async () => {
    const response = await app.request(
      "/api/contact",
      { method: "POST", headers: postHeaders(), body: VALID_FORM_WITH_TOKEN.toString() },
      MINIMUM_ENV,
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(EXPECTED_SUCCESS_HTML);
  });
});

describe("POST /api/contact — body-read semantics", () => {
  // `formToObject` leaves an absent field absent rather than substituting `""` (the removed
  // `readFields` did the latter). A non-optional `phone` would therefore 422 every submission that
  // omits the optional input — this is the test that catches it.
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

  // The strict schema declares only the four real fields. Everything else the form posts is dropped
  // because a guard consumed it: `_csrf` via `csrfFieldCtx`, the decoy and the Turnstile token
  // because the action named them. An undeclared extra is a refusal, not a silent drop.
  it("refuses an undeclared field", async () => {
    const body = new URLSearchParams(VALID_FORM_WITH_TOKEN);
    body.set("role", "admin");

    const response = await app.request("/api/contact", { method: "POST", headers: postHeaders(), body: body.toString() }, MINIMUM_ENV);

    expect(response.status).toBe(422);
    expect(await response.text()).toBe(refusal("role"));
  });
});

describe("contact form — view ↔ schema contract", () => {
  // Replaces the old rendered-field-names test. Crafted-body tests structurally cannot see view↔
  // handler drift: they post whatever the test author typed. This one reads what the page actually
  // renders and holds it against what the schema actually declares.
  it("renders exactly the fields the schema declares, plus the three guard-consumed ones", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    const html = await res.text();

    const rendered = [...html.matchAll(/<(?:input|textarea)\b[^>]*\bname="([^"]*)"/g)].map((m) => m[1]);
    const declared = Object.keys(ContactSchema.entries);
    const injected = [CSRF_FIELD_DEFAULT, CONTACT_DECOY, TURNSTILE_FIELD_DEFAULT];

    expect(rendered.filter((name) => !injected.includes(name as string))).toEqual(declared);
  });

  it("renders the decoy under the app-owned name the action checks", async () => {
    const res = await app.request("/", {}, MINIMUM_ENV);
    const html = await res.text();

    expect(html).toContain(`name="${CONTACT_DECOY}"`);
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

const MOCK_LOGS_KV = {
  list: async () => ({ keys: [], list_complete: true }),
  get: async () => null,
  getWithMetadata: async () => ({ value: null, metadata: null }),
  put: async () => {},
  delete: async () => {},
};
// `LOG_LEVEL` unset → `site.debug` is false → the viewer's `access` predicate denies.
const LOGS_ENV = { ...MINIMUM_ENV, LOGS_KV: MOCK_LOGS_KV } as unknown as Env;
const LOGS_DEBUG_ENV = { ...MINIMUM_ENV, LOGS_KV: MOCK_LOGS_KV, LOG_LEVEL: "DEBUG" } as unknown as Env;

const EXPECTED_EMPTY_TBODY =
  '<tbody id="log-tbody"><tr><td colspan="5" class="px-4 py-4 text-center"><div class="flex flex-col items-center gap-2"><span class="text-sm text-muted-foreground">No log entries have been recorded yet.</span></div></td></tr></tbody>';

describe("GET /showcase/logs — access control", () => {
  it("returns 403 when site.debug is false (LOG_LEVEL unset)", async () => {
    const res = await app.request("/showcase/logs", {}, LOGS_ENV);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
  });

  it("returns 403 for the HTMX partial too", async () => {
    const res = await app.request("/showcase/logs", { headers: { "HX-Request": "true" } }, LOGS_ENV);
    expect(res.status).toBe(403);
  });
});

describe("GET /showcase/logs — full page", () => {
  it("returns 200 status when LOG_LEVEL is DEBUG", async () => {
    const res = await app.request("/showcase/logs", {}, LOGS_DEBUG_ENV);
    expect(res.status).toBe(200);
  });

  // The viewer no longer builds its own document: `show.logs.tsx` hands forge this app's `Layout`,
  // so the page arrives inside the shell that carries the dark class and the pre-paint theme script.
  // The viewer's own heading is what identifies the page; the `<title>` belongs to the app.
  it("renders the viewer inside the app's Layout, not a shell of forge's own", async () => {
    const res = await app.request("/showcase/logs", {}, LOGS_DEBUG_ENV);
    const text = await res.text();
    expect(text).toContain("<!DOCTYPE html>");
    expect(text).toContain("<title>Forge Studio</title>");
    expect(text).toContain('<h1 class="text-2xl font-semibold tracking-tight text-foreground">Request Log</h1>');
    expect(text).toContain('data-scope="theme"');
    expect(text).toContain('hx-get="/showcase/logs"');
    expect(text).toContain(">Timestamp</th>");
    expect(text).toContain(">Level</th>");
    expect(text).toContain(">Request ID</th>");
    expect(text).toContain(EXPECTED_EMPTY_TBODY);
  });

  it("includes required security headers", async () => {
    const res = await app.request("/showcase/logs", {}, LOGS_DEBUG_ENV);
    expect(res.headers.get("content-security-policy")).not.toBeNull();
    expect(res.headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains; preload");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});

describe("GET /showcase/logs — HTMX partial", () => {
  it("returns only the tbody fragment when HX-Request is true", async () => {
    const res = await app.request("/showcase/logs", { headers: { "HX-Request": "true" } }, LOGS_DEBUG_ENV);
    expect(res.status).toBe(200);
    const text = await res.text();
    // exact match proves TBODY_ID in the partial equals the id the full page registers as swap target
    expect(text).toBe(EXPECTED_EMPTY_TBODY);
  });

  it("does not include the full page shell in the partial response", async () => {
    const res = await app.request("/showcase/logs", { headers: { "HX-Request": "true" } }, LOGS_DEBUG_ENV);
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
      const c = makeTestContext(makeRequest(VALID_FORM_WITH_TOKEN), {} as AppEnv, BASE_TEST_CONFIG);
      const response = await contactAction(c);

      expect(response.status).toBe(500);
      expect(await response.text()).toBe(EXPECTED_EMAIL_ERROR_HTML);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
});
