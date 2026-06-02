# r-test — Testing Excellence Rules

> Ruleset for `cc-test`. Read entirely before writing any test.

---

## Test Philosophy

- **Test at boundary, not implementation.** Assert what goes in and out. Never assert internal state callers cannot observe.
- **One test file per feature area.** Tests live in `tests/` — not co-located with source.
- **Table-driven tests** for any handler or function with 3+ input variations.
- **No test databases.** Tests use `app.request` with `MINIMUM_ENV` — no real external services.

---

## Test File Locations

Tests live in the `tests/` directory (not co-located with source):

| Code under test | Test file location |
|---|---|
| `src/handlers/<name>.ts` | `tests/<name>.test.ts` |
| `src/services/<name>.ts` | `tests/<name>.test.ts` |
| `src/views/<name>.tsx` | `tests/<name>.test.ts` |
| Route integration | `tests/routes.test.ts` |

---

## MINIMUM_ENV Fixture

Every test file that calls `app.request` MUST define a `MINIMUM_ENV` object:

```typescript
const MINIMUM_ENV = {
  ASSETS: { fetch: async () => new Response("", { status: 200 }) },
  BASE_URL: "https://example.com",
  CSRF_SECRET: "a".repeat(64), // 32-byte hex (64 hex chars)
  EMAIL_API_KEY: "test-api-key",
  TURNSTILE_SECRET_KEY: "test-turnstile-secret",
  TURNSTILE_SITE_KEY: "test-turnstile-site-key",
};
```

---

## Handler Tests

Test the full HTTP contract: status code and rendered HTML.

### What to Assert
1. **Status code** — `expect(res.status).toBe(200)`
2. **HTML content** — `expect(text).toContain("<title>")` for dynamic content; `toBe` for static fragments
3. **Security headers** — `not.toBeNull()` for CSP; `toBe` for HSTS, X-Content-Type-Options, Referrer-Policy

### GET Route Pattern
```typescript
const res = await app.request("/path", {}, MINIMUM_ENV);
const text = await res.text();
expect(res.status).toBe(200);
expect(text).toContain("<title>Page Title</title>");
```

---

## POST Route Tests

### Minting a CSRF Token
```typescript
import { importCsrfKey, createCsrfToken } from "@y-core/forge/csrf";

const key = await importCsrfKey(MINIMUM_ENV.CSRF_SECRET);
const token = await createCsrfToken(key);
```

### Required Headers for HTMX POST
```typescript
const res = await app.request("/path", {
  method: "POST",
  headers: {
    "HX-Request": "true",
    "Origin": "https://example.com",
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: new URLSearchParams({ __csrf: token, field: "value" }),
}, MINIMUM_ENV);
```

---

## Fail-Closed Tests (mandatory for every POST route)

Every POST route test file MUST include all four fail-closed cases:

| Scenario | Expected status |
|---|---|
| Missing `HX-Request` header | 403 |
| Wrong `Origin` header | 403 |
| Missing CSRF token | 403 |
| Invalid/expired CSRF token | 403 |
| Valid input (happy path) | 200 with success fragment |

---

## HTML Assertion Rules

HTML entities MUST be encoded in test assertion strings:

```typescript
// correct
expect(text).toContain("O&#39;Brien");          // apostrophe
expect(text).toContain("AT&amp;T");             // ampersand
expect(text).toBe(expectedFullFragment);        // exact match preferred
```

Never use substring matching when exact match is possible. Substring tests create false positives when surrounding HTML changes.

---

## Security Header Assertions

```typescript
const csp = res.headers.get("Content-Security-Policy");
expect(csp).not.toBeNull();

expect(res.headers.get("Strict-Transport-Security")).toBe(
  "max-age=63072000; includeSubDomains; preload"
);
expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
```

---

## globalThis.fetch Stubbing (email service tests)

```typescript
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});
```

---

## Security Test Requirements

Security-sensitive code requires **both** pass and fail test cases:

| Feature | Required Tests |
|---|---|
| CSRF validation | Valid token passes; missing/invalid token → 403 |
| Origin check | Same-origin passes; cross-origin → 403 |
| HX-Request guard | Header present passes; missing → 403 |
| Input validation | Valid input passes; invalid input → 422 with field errors |

---

## Coverage Requirements

- Every **exported handler** has at least one test
- Every **error path** in handlers has a dedicated test case
- Every **POST route** has all four fail-closed tests
- **No test skips** without a comment explaining when the skip will be removed

---

## Running Tests

```bash
# Run all tests
bun test tests/

# Full gate: typecheck + lint + test (always run before declaring complete)
bun run check
```

Always run the **full suite** before declaring the task complete — not just the changed file.
