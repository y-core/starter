---
title: "Handler Testing"
description: "app.request pattern, MINIMUM_ENV, bun test, tests/ directory, exact HTML assertions, toContain dynamic content, toBe static, CSRF minting POST tests, security header assertions, fail-closed expectations, globalThis.fetch stubbing"
weight: 25
---

# Handler Testing

> The app.request(path, init, env) test pattern, MINIMUM_ENV fixture, assertion rules.
> Complements [PRODUCTION_RULES.md](./PRODUCTION_RULES.md) §6 (HTML entity rule).

---

## 0. Quick Reference

- §1 app.request pattern: the httptest equivalent for Workers
- §2 MINIMUM_ENV: required bindings + config fixture
- §3 Assertion rules: toBe static, toContain dynamic, entity encoding
- §4 POST/action tests: CSRF minting, required headers
- §5 Security header assertions: CSP, HSTS, XCTO
- §6 Fail-closed expectations: 403 on missing guards

---

## 1. app.request Pattern

`app.request(path, init, env)` is the Hono-native equivalent of Go's `httptest.NewRecorder`. It
bypasses the network entirely and drives the Worker app directly — no `wrangler dev` required. The
third argument passes a mock environment satisfying `AppEnv` so bindings (KV, secrets, site key) are
always under test control.

### 1a. Basic GET Test

    import { describe, expect, it } from "bun:test"
    import app from "../src/worker"

    const MINIMUM_ENV = {
      ASSETS: { fetch: async () => new Response("", { status: 200 }) },
      BASE_URL: "https://example.com",
      CSRF_SECRET: "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e",
      EMAIL_API_KEY: "test-api-key",
      EMAIL_FROM: "from@example.com",
      EMAIL_TO: "to@example.com",
      TURNSTILE_SECRET_KEY: "test-ts-key",
      TURNSTILE_SITE_KEY: "test-site-key",
    }

    describe("GET /", () => {
      it("returns 200", async () => {
        const res = await app.request("/", {}, MINIMUM_ENV)
        expect(res.status).toBe(200)
      })
    })

### 1b. Tests Live in tests/

    tests/worker.test.ts   — main GET routes + security headers
    tests/routes.test.ts   — route configuration
    tests/email.test.ts    — email service
    tests/setup.ts         — shared fixtures

Unlike forge (co-located `*.test.ts` next to source), the starter keeps all tests in a dedicated
`tests/` directory. Import paths use `"../src/..."` accordingly.

### 1c. MINIMUM_ENV Requirements

Each field is required unless noted. Missing bindings cause the middleware chain to throw or return
500 rather than 200.

| Key | Requirement |
|---|---|
| `ASSETS` | `{ fetch: async () => Response }` — controls static-asset passthrough |
| `BASE_URL` | Any `https://` URL; used for origin validation in guards |
| `CSRF_SECRET` | 64 hex chars (32 bytes); must be a valid key for `importCsrfKey` |
| `EMAIL_API_KEY` | Any string; stubbed in email tests via `globalThis.fetch` |
| `EMAIL_FROM` / `EMAIL_TO` | Any strings |
| `TURNSTILE_SECRET_KEY` / `TURNSTILE_SITE_KEY` | Any strings |
| `LOGS_KV` | Optional — middleware degrades gracefully when absent |
| `RATE_LIMITER` | Optional — rate-limit middleware no-ops when absent |

---

## 2. MINIMUM_ENV Fixtures

### 2a. 404 Test Variant

Swap the `ASSETS` mock to return 404. The Worker proxies the 404 through when no route matches.

    const MOCK_ASSETS_404 = {
      fetch: async () => new Response("Not Found", { status: 404 }),
    }

    it("returns 404 for unknown paths", async () => {
      const res = await app.request(
        "/this-path-does-not-exist",
        {},
        { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 },
      )
      expect(res.status).toBe(404)
    })

### 2b. Extending MINIMUM_ENV

Spread `MINIMUM_ENV` and override only the keys relevant to the test. Never mutate the base object.

    const envWithKV = {
      ...MINIMUM_ENV,
      LOGS_KV: fakeKV,
    }

    const envStrict = {
      ...MINIMUM_ENV,
      BASE_URL: "https://strict-origin.example.com",
    }

### 2c. Shared Setup via tests/setup.ts

Export `MINIMUM_ENV` and any factory helpers from `tests/setup.ts`. Import them in each test file.
Do not duplicate the fixture inline — if `CSRF_SECRET` needs rotation it should change in one place.

    // tests/setup.ts
    export const MINIMUM_ENV = { ... }
    export const MOCK_ASSETS_404 = { ... }

---

## 3. Assertion Rules

### 3a. toBe for Static Headers

Security headers are deterministic strings. Use strict equality (`toBe`), never `toContain`.

    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("x-frame-options")).toBe("DENY")
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin")
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    )

### 3b. toContain for Dynamic HTML (Nonce)

Full-page HTML contains a per-request nonce injected into `<script>` tags by `makeSecurityHeaders`.
The nonce changes every request, making the full document non-deterministic. Use `toContain` for
stable structural fragments.

    const text = await res.text()
    expect(text).toContain("<title>Forge Studio</title>")
    expect(text).toContain('<section id="home"')
    expect(text).toContain('<form id="contact-form"')

Never assert `expect(text).toBe(fullPageSnapshot)` — nonce drift will break the test on every run.

### 3c. HTML Entity Encoding

Hono JSX escapes special characters. Test assertions must use the encoded forms. See
[PRODUCTION_RULES.md](./PRODUCTION_RULES.md) §6 for the full entity table.

    // CORRECT
    expect(text).toContain("&amp;")
    expect(text).toContain("&#39;")
    expect(text).toContain("&lt;script&gt;")

    // WRONG — will never match
    expect(text).toContain("&")
    expect(text).toContain("'")
    expect(text).toContain("<script>")

### 3d. Status Codes are toBe

HTTP status is always an integer constant. Use `toBe`, not `toBeGreaterThanOrEqual`.

    expect(res.status).toBe(200)
    expect(res.status).toBe(403)
    expect(res.status).toBe(404)

---

## 4. POST/Action Tests

POST routes require three ingredients: a valid CSRF token, correct headers (`HX-Request`, `Origin`,
`Content-Type`), and form-encoded body. Missing any one of these should yield 403 (see §6).

### 4a. Minting a CSRF Token

Import the forge helpers directly. Do not hard-code token strings — they are time-based HMAC values
and will expire.

    import { createCsrfToken, importCsrfKey } from "@y-core/forge/form"

    const key = await importCsrfKey(MINIMUM_ENV.CSRF_SECRET)
    const csrfToken = await createCsrfToken(key)

Call `importCsrfKey` once per `describe` block using `beforeAll` to avoid redundant key imports.

### 4b. Building the POST Request

    const formData = new URLSearchParams({
      __csrf: csrfToken,
      name: "Test User",
      email: "test@example.com",
      message: "Hello world message",
      __hp: "",    // honeypot field — must be empty or guard rejects
    })

    const res = await app.request("/api/contact", {
      method: "POST",
      headers: {
        "HX-Request": "true",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://example.com",
      },
      body: formData.toString(),
    }, MINIMUM_ENV)

### 4c. Stubbing globalThis.fetch for Email

The email service calls `globalThis.fetch` to reach MailChannels. Replace it for the duration of
the test and restore it in `afterAll` or `finally`.

    import { afterAll, beforeAll } from "bun:test"

    const originalFetch = globalThis.fetch

    beforeAll(() => {
      globalThis.fetch = async (url, init) => {
        if (String(url).includes("mailchannels")) {
          return new Response("", { status: 202 })
        }
        return originalFetch(url, init)
      }
    })

    afterAll(() => {
      globalThis.fetch = originalFetch
    })

Only the MailChannels URL branch needs to be stubbed. Fall through to the real fetch for everything
else so test isolation does not hide integration regressions.

### 4d. Turnstile Stub

Turnstile validation also uses `globalThis.fetch`. Include a branch in the same stub:

    if (String(url).includes("challenges.cloudflare.com/turnstile")) {
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }

---

## 5. Security Header Assertions

Every `GET` route test should include a security header block. Keep it in a shared `describe` or
run it inline after the status assertion.

### 5a. Required Header Checks

    const res = await app.request("/", {}, MINIMUM_ENV)

    expect(res.headers.get("content-security-policy")).not.toBeNull()
    expect(res.headers.get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    )
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("x-frame-options")).toBe("DENY")
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin")
    expect(res.headers.get("permissions-policy")).not.toBeNull()

### 5b. CSP Nonce Presence

The CSP value is dynamic (nonce changes per request). Assert structure, not exact value.

    const csp = res.headers.get("content-security-policy") ?? ""
    expect(csp).toContain("'nonce-")
    expect(csp).toContain("script-src")

---

## 6. Fail-Closed Expectations

All security guards must fail closed — missing or invalid inputs yield 403, never 200 or 500.
Write explicit tests for each rejection path so regressions are caught before deploy.

### 6a. Missing HX-Request → 403

    const res = await app.request("/api/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://example.com",
        // HX-Request header intentionally omitted
      },
      body: formData.toString(),
    }, MINIMUM_ENV)
    expect(res.status).toBe(403)

### 6b. Wrong Origin → 403

    const res = await app.request("/api/contact", {
      method: "POST",
      headers: {
        "HX-Request": "true",
        "Origin": "https://evil.com",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formData.toString(),
    }, MINIMUM_ENV)
    expect(res.status).toBe(403)

### 6c. Invalid CSRF Token → 403

    const badFormData = new URLSearchParams({
      __csrf: "invalid-token",
      name: "Test User",
      email: "test@example.com",
      message: "Hello world message",
      __hp: "",
    })

    const res = await app.request("/api/contact", {
      method: "POST",
      headers: {
        "HX-Request": "true",
        "Origin": "https://example.com",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: badFormData.toString(),
    }, MINIMUM_ENV)
    expect(res.status).toBe(403)

### 6d. Filled Honeypot → 403

    const honeypotFormData = new URLSearchParams({
      __csrf: csrfToken,
      name: "Bot",
      email: "bot@example.com",
      message: "Spam",
      __hp: "filled",    // honeypot non-empty → bot signal
    })

    const res = await app.request("/api/contact", {
      method: "POST",
      headers: {
        "HX-Request": "true",
        "Origin": "https://example.com",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: honeypotFormData.toString(),
    }, MINIMUM_ENV)
    expect(res.status).toBe(403)

### 6e. Rule: No 200 on Guard Failure

If a test expects a guard to fire but gets 200, the guard has a logic hole. Treat unexpected 200
responses from guarded routes as test failures requiring root-cause investigation — do not adjust
the assertion to match.
