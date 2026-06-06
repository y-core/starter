---
title: Production Rules
description: "no global state, validate at boundary, leverage forge, bun run check gate, no dev-only shortcuts, dev mirrors production, HTML entity exact-match, no substring matching, no backward compat shims, config injection, fail closed"
weight: 20
---

# Production Rules

> Non-negotiable rules for all code in forge-starter. These rules ensure the app
> is secure, testable, and free of production-unsafe shortcuts.
>
> Complements [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) (layer rules),
> [HANDLER_TESTING.md](./HANDLER_TESTING.md) (testing rules).

---

## 0. Quick Reference

- §1 No global state: configStore.get(c.env) not module-level var
- §2 Validate at boundary: v.safeParse in handlers, never in services
- §3 Leverage forge: consume forge namespaces, do not re-implement
- §4 Dev mirrors production: no disabled auth, no mock services in dev
- §5 bun run check: typecheck + lint + test pipeline, must pass before done
- §6 HTML entity exact-match: no substring assertions, encode entities as rendered
- §7 No backward compat shims: pre-v1.0.0 has no deprecation wrappers
- §8 Fail closed: all guards return 403/415 on invalid input, no silent fallback
- §9 No hardcoded secrets: all credentials via c.env bindings only
- §10 No dev shortcuts in committed code: NODE_ENV checks gate no behavior

---

## 1. No Global State Rule

### 1a. Config via configStore.get(c.env)

Config is loaded per-request from Workers env bindings. Module-level variables that
depend on environment are forbidden because Workers may share a module instance across
multiple requests with different bindings.

    // BAD: module-level config — captures env at cold-start, not per-request
    const config = loadConfig(process.env)
    const apiKey = process.env.EMAIL_API_KEY

    // GOOD: per-request via AppContext
    const config = configStore.get(c.env)
    const apiKey = config.services.email.apiKey

### 1b. No Request-Scoped Module Variables

Variables that change per request must be stored via a typed `contextVar` accessor.
Examples of what must NOT be module-level:

- Request IDs, nonces, CSRF tokens
- Resolved config values
- Logger instances bound to a request

### 1c. Singleton Services Are Allowed

Stateless utility objects (e.g., a schema validator, a regex) may be module-level.
The test: if its value would differ between two simultaneous requests, it is not a singleton.

---

## 2. Validate at Boundary Rule

### 2a. Handler Validates, Service Receives Typed Data

Validation belongs at the HTTP boundary — the handler. Services receive already-validated
domain types and do not call `v.safeParse` internally.

    // In controller (src/controllers/contact.ts):
    const fields = readFields(formData, ["name", "email", "message"] as const)
    const parsed = v.safeParse(ContactSchema, fields, { abortEarly: true })
    if (!parsed.success) return renderValidationErrors(c, parsed.issues)
    await emailService.send(parsed.output)  // typed ContactInput, not raw strings

### 2b. Never Validate in Services

Services (`src/services/`) accept domain types. They throw on invariant violations but do
not perform schema validation or return validation error objects.

    // BAD: service re-validates
    export async function send(raw: unknown) {
      const parsed = v.safeParse(ContactSchema, raw)
      ...
    }

    // GOOD: service accepts typed input
    export async function send(input: ContactInput): Promise<void> { ... }

### 2c. abortEarly: true for Form Submissions

Use `{ abortEarly: true }` for form submissions so only the first error renders. Use
`{ abortEarly: false }` only when the caller needs the full issue list (e.g., bulk import).

---

## 3. Leverage Forge Rule

### 3a. Check Forge Before Writing App Code

Before implementing any utility, check whether `@y-core/forge` already exports it.
See [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §5a for the lookup table. Namespaces
that must never be reimplemented in app code:

| Concern | Forge export |
|---|---|
| CSRF mint/verify | `@y-core/forge/form` `mintCsrf`, `csrfProtection` |
| Security headers + nonce | `@y-core/forge/security` `makeSecurityHeaders`, `getNonce` |
| HTML escaping | forge JSX auto-escapes; never call custom escape functions |
| Fragment renderers | `@y-core/forge/http` `renderSuccess`, `renderError`, `renderValidationErrors` |
| Rate limiting | `@y-core/forge/security` `rateLimit` |
| Origin verification | `@y-core/forge/security` `verifyOrigin` |

### 3b. Zero Duplication Policy

Duplicating forge logic in the app creates a split-brain risk where a security fix in forge
does not propagate to the app copy. If forge does not export what you need, extend forge
rather than copy-paste.

---

## 4. Dev Mirrors Production Rule

### 4a. No Dev-Only Security Shortcuts

Every security check that runs in production must run in dev. Conditionals gated on
`NODE_ENV`, `IS_DEV`, or any other environment flag are forbidden for security concerns.

    // NEVER: skip CSRF in dev
    if (process.env.NODE_ENV !== "production") return next()

    // CORRECT: CSRF always enforced
    export const csrfVerifyGuard = csrfProtection({
      secret: async (c) => importCsrfKey(configStore.get(c.env).security.csrf.secret),
    })

### 4b. No Mock Services in Dev Entry

`src/worker.dev.ts` must not swap in mock email senders, stub databases, or fake external
APIs. Dev differs from production only in the live-reload CSP hash — see §4c.

### 4c. The Only Allowed Dev Difference

`src/worker.dev.ts` layers one additional CSP hash onto the production CSP:

    // worker.dev.ts
    createWorker(mergeSecurityHeaders(securityHeaders, {
      scriptSrc: [WRANGLER_LIVE_RELOAD_HASH],
    }))

This hash permits the Wrangler live-reload inline script. It is kept out of the production
CSP by construction so it cannot leak. See [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §4.

### 4d. Fail-Closed Defaults for Missing Bindings

Guards that wrap optional bindings (e.g., RATE_LIMITER) must degrade gracefully in dev
without disabling the surrounding security logic. Use `required: false` on the binding, not
a conditional that skips the entire guard.

---

## 5. bun run check Gate

### 5a. Full Pipeline

    bun run check  # typecheck (tsgo) → lint (biome) → test (bun test)

Must pass before declaring any task complete. The three stages run sequentially; a failure
in typecheck blocks lint, and a failure in lint blocks tests.

### 5b. Lint Auto-Fix First

Before submitting to `bun run check`, run `bun run lint:fix` to auto-apply safe fixes:

    bun run lint:fix  # biome check --write

This avoids lint failures that are trivially fixable from blocking the pipeline.

### 5c. No Suppression Comments

Do not use `// biome-ignore` or `// @ts-ignore` to silence errors. Fix the root cause.
Exception: `// @ts-expect-error` with a comment explaining the intentional type gap is
allowed in test files only.

---

## 6. HTML Entity Exact-Match Rule

### 6a. forge JSX Encodes Entities

The forge JSX runtime auto-escapes string values inserted into JSX. Test assertions must
match the encoded form, not the raw source string.

    // BAD: raw string — will never match rendered HTML
    expect(text).toContain("O'Brien")

    // GOOD: encoded as forge JSX renders it
    expect(text).toContain("O&#39;Brien")

Common encodings: `'` → `&#39;`, `"` → `&#34;`, `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;`.

### 6b. toBe for Static Values, toContain for Dynamic

    // Static header value — use toBe
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")

    // HTML body with dynamic nonce — full string match impossible, use toContain
    expect(text).toContain("<title>Forge Studio</title>")

### 6c. No Substring Matching for Validation Errors

Validation error messages rendered in HTML must be asserted with the full encoded string
to catch accidental truncation or double-encoding regressions.

    // BAD: substring match hides truncation bugs
    expect(text).toContain("required")

    // GOOD: full encoded message
    expect(text).toContain("Name is required")

---

## 7. No Backward Compat Shims Rule

### 7a. Pre-v1.0.0 Policy

Before version 1.0.0 there are no public API guarantees. Do not add:

- Deprecation wrapper functions that delegate to new implementations
- Feature flags to keep old behavior available
- `@deprecated` JSDoc tags with legacy call sites left in code
- Overloaded signatures that accept old and new argument shapes

### 7b. Rename and Update All Call Sites

When an interface changes, update every call site in the same commit. The codebase must
never contain two parallel implementations of the same concern.

---

## 8. Fail Closed Rule

### 8a. Guards Return Error Responses, Not Passes

When a guard cannot confirm a request is valid, it must return an error response. It must
not call `next()` as a fallback.

    // BAD: silent fallback passes unknown requests
    if (!isValid) { logWarning(); return next() }

    // GOOD: fail closed
    if (!isValid) return c.text("Forbidden", 403)

### 8b. Required vs. Optional Bindings

Bindings required for security (CSRF_SECRET, EMAIL_API_KEY) must throw at config parse
time if absent. Optional bindings (RATE_LIMITER, LOGS_KV) degrade gracefully using
`required: false` — they reduce functionality, not security.

---

## 9. No Hardcoded Secrets Rule

### 9a. All Credentials via c.env

    // BAD
    const apiKey = "sk-live-abc123"
    const csrfSecret = "my-secret"

    // GOOD
    const { apiKey } = configStore.get(c.env).services.email
    const { secret } = configStore.get(c.env).security.csrf

### 9b. No .env Files Committed

`.env` and `.dev.vars` are in `.gitignore`. Secrets for local dev go in `.dev.vars` (never
committed). Production secrets are set as Cloudflare Worker environment variables or secrets.
