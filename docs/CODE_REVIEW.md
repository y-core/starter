---
title: Code Review Standards
description: "This app's layer-compliance and forge-consumption checklists, its security review points, and the patterns a reviewer must not flag."
---

# Code Review Standards

> Review checklists, layer compliance, forge consumption discipline, severity calibration.
> Resolves the CODE_REVIEW.md reference in c-review and c-unreview commands.
>
> Complements [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md),
> [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md).

---

## 0. Quick Reference

- §1 Review workflow: pre-review, during, output format
- §2 Layer compliance: controllers/services/views/routes rules
- §2a Handler Layer Rules
- §2b Service Layer Rules
- §2c View Layer Rules
- §2d Routes Layer Rules
- §3 Forge consumption: do not re-implement what forge provides
- §3a Do Not Re-implement Forge Utilities
- §3b Correct Import Paths
- §4 Security: guards, CSRF, origin, no secrets in source
- §4a No Hardcoded Secrets
- §4b Contact Route Guards and Ordering
- §4c CSP and Nonce Discipline
- §4d Input Validation at Boundaries
- §5 Testing: app.request, security pass+fail, entity encoding
- §5a Coverage Requirements
- §5b Assertion Correctness
- §5c Security Pass + Fail Pattern
- §6 Severity calibration
- §7 Verification protocol
- §8 Valid patterns

---

## 1. Review Workflow

See `CODE_REVIEW.md` §1 for the review workflow, the green-baseline
requirement, and the finding format. The highest-yield step for this app is reading the route map
and the controller binding before judging any guard.

---

## 2. Layer Compliance Checklist

The codebase has four layers: routes, handlers, services, views. Each has a strict
scope. Cross-layer coupling is a Major finding. See [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §2.

### 2a. Handler Layer Rules

- [ ] Handler reads form data via `readFields`, validates with `v.safeParse`
- [ ] Handler passes typed domain data (not raw `FormData`) to the service
- [ ] Handler returns `renderSuccess`, `renderError`, or `renderValidationErrors`
- [ ] Handler does NOT directly call email APIs, KV, queues, or other external services
- [ ] Handler does NOT contain business logic (conditional behavior belongs in service)
- [ ] Handler does NOT render full-page HTML — only fragments

Example correct handler shape (fragment/action handler):

    export async function contactHandler(context: RequestContext): Promise<Response> {
      const c = context as AppContext
      const formData = await parseFormData(c)
      const fields = readFields(formData, ["name", "email", "message"] as const)
      const result = v.safeParse(ContactSchema, fields)
      if (!result.success) return fragmentResponse(renderValidationErrors(result.errors), 422)

      await contactService.send(result.output)
      return fragmentResponse(renderSuccess("Message sent!"))
    }

### 2b. Service Layer Rules

- [ ] Service function signature accepts typed domain data — never raw `FormData`
- [ ] Service does NOT call `v.safeParse` (validation is the handler's job)
- [ ] Service does NOT render HTML or return `Response` objects
- [ ] Service encapsulates one external integration per file

### 2c. View Layer Rules

- [ ] Views render JSX only — no service calls, no DB access, no validation
- [ ] Views use forge UI components (`Form`, `Field`, `Input`, `Alert`, `Button`, etc.)
- [ ] Views receive all dynamic data via props (`RenderContext` + domain data structs)
- [ ] Views do NOT import from `src/controllers/` or `src/services/` (importing `views/layout` is allowed)

### 2d. Routes Layer Rules

- [ ] Route entries in `src/routes.ts`; handler bindings in `src/router.tsx` — never inline in `worker.ts`
- [ ] POST routes include `csrfVerifyGuard` in their middleware array in `router.tsx`
- [ ] HTMX-only POST routes include the transport guards (`requireFormContentType()`, `htmxOnlyGuard`, `originGuard`)
- [ ] Auth-protected routes include auth middleware or a `// TODO(auth)` comment
- [ ] Guard ordering: origin/HTMX check → rate limit → CSRF verify (see §4b)

---

## 3. Forge Consumption Checklist

Re-implementing functionality that forge already provides is a Major finding. Always
check what `@y-core/forge` exports before writing new utility code.

### 3a. Do Not Re-implement Forge Utilities

| Functionality | Forge export |
|---|---|
| CSRF token generation and verification | `csrfProtection` from `@y-core/forge/form` |
| Security headers (CSP, HSTS, etc.) | `createSecurityHeaders` from `@y-core/forge/security` |
| HTML entity escaping | `escapeHtml` from `@y-core/forge/http` |
| Fragment success/error responses | `renderError`, `renderSuccess` from `@y-core/forge/http` |
| Validation schema and parse | `v` from `@y-core/forge/validation` |
| Form field reading | `readFields` from `@y-core/forge/form` |
| Structured logging | `kvLogChannel`, `createLogger` from `@y-core/forge/logging`; log viewer from `@y-core/forge/logging/show` |
| Theme toggle script | `FOUC_SCRIPT`, `mountTheme`, `DARK_CLASS` from `@y-core/forge/ui/client` |

If a handler manually builds a `Content-Type: text/html` response instead of using
`renderSuccess`, that is a Major finding.

### 3b. Correct Import Paths

Forge exports are namespaced. Flag any import that bypasses the forge namespace:

- [ ] Forge imports use `@y-core/forge/{namespace}` — not direct package paths
- [ ] No direct `valibot` imports — use `v` from `@y-core/forge/validation`
- [ ] No direct `@remix-run/*` imports in app code — consume only via `@y-core/forge` re-exports

Example of a flaggable import:

    // Wrong — bypasses forge, imports valibot directly
    import * as v from "valibot"

    // Correct
    import { v } from "@y-core/forge/validation"

---

## 4. Security Checklist

Security findings are Critical or Major by default. See §6 for calibration.

### 4a. No Hardcoded Secrets

- [ ] No API keys, tokens, passwords, or signing secrets in source files
- [ ] Secrets accessed only via `configStore.get(c.env)` — never `c.env.SECRET` directly
- [ ] `.dev.vars` is gitignored (check `.gitignore` if a new secrets file is introduced)

### 4b. Contact Route Guards and Ordering

The contact form route requires five guards in strict order:

    middleware: [requireFormContentType(), htmxOnlyGuard, originGuard, rateLimitGuard, csrfVerifyGuard]

- `requireFormContentType()` — 415 unless the media type is a form encoding
- `htmxOnlyGuard` — checks `HX-Request: true` via `isHxRequest`
- `originGuard` — `originProtection`: Fetch-Metadata plus the `Origin`/`Referer` allowlist
- `rateLimitGuard` — enforces 5 req/60s per IP (skipped if binding absent)
- `csrfVerifyGuard` — validates the `__csrf` token from the form body

Guard order matters: origin/HTMX checks must run before rate limit checks to avoid
burning rate limit budget on invalid requests. CSRF verification runs last because it
requires reading the request body.

Flagging: if a new POST route omits any of these guards without documented justification,
that is Critical (missing CSRF) or Major (missing origin/rate limit check).

### 4c. CSP and Nonce Discipline

- [ ] Every inline `<script>` carries `nonce={ctx.nonce}`
- [ ] Every external `<script src="...">` carries `nonce={ctx.nonce}`
- [ ] `FOUC_SCRIPT` is injected with `rawHtml()` + nonce (valid — see §8)
- [ ] The Wrangler live-reload hash appears only in `worker.dev.ts`, not `worker.ts`
- [ ] `mergeSecurityHeaders` is used in `worker.dev.ts` to layer the dev hash onto prod CSP

### 4d. Input Validation at Boundaries

- [ ] All form submissions validated with `v.safeParse` before processing
- [ ] File paths (if any) sanitized to prevent `../` traversal
- [ ] No `as unknown as T` casts that bypass schema validation

---

## 5. Testing Checklist

Tests live in `tests/` (one file per feature area) and use `app.request` to drive the Forge app
directly without a network stack. See [HANDLER_TESTING.md](./HANDLER_TESTING.md).

### 5a. Coverage Requirements

- [ ] Every new route has at least one test in `tests/`
- [ ] POST routes have: success case + CSRF failure (403) + origin/HTMX failure (403)
- [ ] Routes with validation have: validation error case with field-specific message
- [ ] HTML routes assert security headers (`Content-Security-Policy`, etc.)

### 5b. Assertion Correctness

- [ ] Use `app.request` pattern — not `fetch` against a running server
- [ ] HTML entity encoding: assert `&amp;`, `&#39;`, `&lt;` etc. in expected strings
- [ ] Static content: use `toBe` (exact match)
- [ ] Dynamic content containing nonce: use `toContain` (substring match)
- [ ] Status codes asserted explicitly (`expect(res.status).toBe(200)`)

Example of correct HTML entity assertion:

    // Wrong — will fail if the name contains an apostrophe
    expect(body).toContain("O'Brien")

    // Correct — HTML-encodes the apostrophe
    expect(body).toContain("O&#39;Brien")

### 5c. Security Pass + Fail Pattern

Every guarded POST route needs both a passing and a failing security test:

    // Pass: valid HTMX request with correct CSRF
    const passRes = await app.request("/api/contact", {
      method: "POST",
      headers: { "HX-Request": "true", Origin: "https://example.com" },
      body: formData,
    })
    expect(passRes.status).toBe(200)

    // Fail: missing HX-Request header
    const failRes = await app.request("/api/contact", {
      method: "POST",
      body: formData,
    })
    expect(failRes.status).toBe(403)

---

## 6. Severity Calibration

See `CODE_REVIEW.md` §4 for severity calibration and the deliberate
asymmetry that makes excess prose Major and its absence Minor.

---

## 7. Verification Protocol

See `CODE_REVIEW.md` §5 for the verification protocol every finding
must survive before it is reported.

---

## 8. Valid Patterns (Do Not Flag)

The following patterns appear unusual but are intentional. Do not report them.

| Pattern | Why valid |
|---|---|
| `required: false` in `rateLimitGuard` | Ratified fail-open under `BOUNDARIES.md` §5b and `BOUNDARIES.md` §5d — rate limiting is availability, not authorisation; `RATE_LIMITER` is declared in `wrangler.jsonc`, so the fallback fires only in `bun test`. Recorded in MIDDLEWARE_AND_CONTEXT.md §3, WEB_DESIGN.md §3b and DATA_STORAGE.md §5 |
| `renderPage(node, init?)` called directly in `view` without a context arg | `renderPage` from `@y-core/forge/jsx` is a standalone function — no middleware install required |
| `/showcase/logs` carrying no auth middleware | Gated by `loadLogViewer`'s `access` predicate on `site.debug`; production answers 403 |
| `MINIMUM_ENV` without `LOGS_KV` in tests | KV logging gracefully degrades when binding is absent |
| `mergeSecurityHeaders` in `worker.dev.ts` | Intentional dev/prod CSP split — live-reload hash must not leak to prod |
| `rawHtml()` for `FOUC_SCRIPT` | Intentional synchronous inline script required for FOUC prevention |
| `"types": []` in tsconfig | Global scope uses no `@types/*`; Workers types come from generated `.types/` |
