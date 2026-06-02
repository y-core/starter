---
title: "Code Review Standards"
description: "code review, layer compliance, forge consumption, security checklist, HTMX guard, CSRF verification, contact route guards, test coverage, severity calibration, verification protocol, valid patterns, no re-implementing forge"
weight: 42
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
- §2 Layer compliance: handlers/services/views/routes rules
- §3 Forge consumption: do not re-implement what forge provides
- §4 Security: guards, CSRF, origin, no secrets in source
- §5 Testing: app.request, security pass+fail, entity encoding
- §6 Severity calibration
- §7 Verification protocol
- §8 Valid patterns

---

## 1. Review Workflow

### 1a. Pre-Review Steps

Before examining diffs, establish a passing baseline:

1. Run `bun run check` — if it fails before your changes, note that separately
2. Read `src/routes.tsx` to identify new routes and their middleware arrays
3. Read changed handler files to understand the intended data flow
4. Identify which forge modules are imported vs. re-implemented

A pre-review that skips these steps risks false positives (e.g., claiming a guard is
missing when it is present in the route middleware array).

### 1b. During Review

Work through §2 (layer compliance), §3 (forge consumption), §4 (security), and
§5 (testing) in order. Apply §7 (verification protocol) before recording any finding.
Classify every finding by §6 (severity).

Only report findings that survive §7. Do not speculate about intent — read the
surrounding code first.

### 1c. Output Format

Each finding uses this structure:

    [FILE:LINE] ISSUE_TITLE
    Severity: Critical | Major | Minor | Informational
    Description of the problem and why it matters.
    Suggested fix (brief).

Group findings by file. List Critical and Major findings first within each file.
End with a summary table: file, finding count, highest severity.

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

Example correct handler shape:

    export async function contactHandler(c: Context): Promise<Response> {
      const fields = await readFields(c)
      const result = v.safeParse(ContactSchema, fields)
      if (!result.success) return renderValidationErrors(c, result.issues)

      await contactService.send(result.output)
      return renderSuccess(c, <ContactSuccessFragment />)
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
- [ ] Views do NOT import from `src/handlers/` or `src/services/`

### 2d. Routes Layer Rules

- [ ] All routes defined in `src/routes.tsx` — never inline in `worker.ts`
- [ ] POST routes include `csrfVerifyGuard` in their `middleware` array
- [ ] HTMX-only POST routes include an HTMX origin/header guard (e.g., `contactSecurityGuard`)
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
| Security headers (CSP, HSTS, etc.) | `makeSecurityHeaders` from `@y-core/forge/security` |
| HTML entity escaping | `escapeHtml` from `@y-core/forge/http` |
| Fragment success/error responses | `renderError`, `renderSuccess` from `@y-core/forge/http` |
| Validation schema and parse | `v` from `@y-core/forge/validation` |
| Form field reading | `readFields` from `@y-core/forge/form` |
| Structured logging | `kvLogChannel`, `createLogger` from `@y-core/forge/logging` |
| Theme toggle script | `FOUC_SCRIPT`, `mountTheme`, `DARK_CLASS` from `@y-core/forge/ui/client` |

If a handler manually builds a `Content-Type: text/html` response instead of using
`renderSuccess`, that is a Major finding.

### 3b. Correct Import Paths

Forge exports are namespaced. Flag any import that bypasses the forge namespace:

- [ ] Forge imports use `@y-core/forge/{namespace}` — not direct package paths
- [ ] No direct `hono` imports for utilities forge re-exports
- [ ] No direct `valibot` imports — use `v` from `@y-core/forge/validation`
- [ ] No `@remix-run/headers` or similar in app code

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

The contact form route requires three guards in strict order:

    middleware: [contactSecurityGuard, rateLimitGuard, csrfVerifyGuard]

- `contactSecurityGuard` — checks `HX-Request: true` and validates the `Origin` header
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
- [ ] `FOUC_SCRIPT` uses `dangerouslySetInnerHTML` + nonce (valid — see §8)
- [ ] The Wrangler live-reload hash appears only in `worker.dev.ts`, not `worker.ts`
- [ ] `mergeSecurityHeaders` is used in `worker.dev.ts` to layer the dev hash onto prod CSP

### 4d. Input Validation at Boundaries

- [ ] All form submissions validated with `v.safeParse` before processing
- [ ] File paths (if any) sanitized to prevent `../` traversal
- [ ] No `as unknown as T` casts that bypass schema validation

---

## 5. Testing Checklist

Tests live in `tests/` (one file per feature area) and use `app.request` to drive the Hono app
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

### 6a. Critical

Applied to findings that directly compromise security or correctness in production:

- Missing `csrfVerifyGuard` on any POST route
- Hardcoded secret (API key, signing secret, password) in source
- Inline `<script>` missing `nonce={ctx.nonce}` (CSP bypass)
- Service function accepting raw `FormData` (validation bypass vector)
- Module-level mutable state written per-request (data leakage between requests)

### 6b. Major

Applied to findings that violate architecture boundaries or weaken security:

- Handler calling an external API directly (should delegate to service)
- View containing business logic or service calls
- New route defined outside `routes.tsx`
- Re-implementing a utility that forge already exports
- Missing fail-case security test for a guarded route
- Wrong guard order on a POST route middleware array
- `c.env.SECRET` accessed directly instead of via `configStore`

### 6c. Minor

Applied to correctness issues that do not affect security or architecture:

- Exported function missing TSDoc comment
- `toContain` assertion used where `toBe` is possible (weaker test)
- Unused import left in file
- Variable name that conflicts with forge-exported names

### 6d. Informational

Suggestions that do not represent errors:

- Alternative HTMX attribute patterns worth considering
- Future auth integration suggestions for `// TODO(auth)` routes
- Additional test cases for edge inputs
- Performance notes about KV access patterns

---

## 7. Verification Protocol

### 7a. Before Recording a Finding

1. Read the **full function**, not just the flagged line — surrounding guards or
   validation may already address the concern
2. Check `routes.tsx` middleware array before claiming a guard is missing — the guard
   may be registered at the route level rather than inside the handler
3. Run `bun run check` to distinguish type errors from style issues
4. Search for the forge export with `rg "@y-core/forge"` before claiming something
   is re-implemented — it may be used elsewhere in the file

### 7b. Confirming Layer Violations

To confirm a handler-calls-service boundary violation:

1. Identify the import in the handler file
2. Check whether the imported module is in `src/services/` or an external SDK
3. Verify the call is not wrapped in a service facade

---

## 8. Valid Patterns (Do Not Flag)

The following patterns appear unusual but are intentional. Do not report them.

| Pattern | Why valid |
|---|---|
| `required: false` in `rateLimitGuard` | Intentional graceful degradation — binding absent in `bun test` |
| `logsView` cast to `RouteView` in routes.tsx | `LogViewerLoaderData` is more specific than the generic slot type |
| `// TODO(auth)` comment on `/admin/logs` | Known gap, documented, pending auth integration |
| `MINIMUM_ENV` without `LOGS_KV` in tests | KV logging gracefully degrades when binding is absent |
| `mergeSecurityHeaders` in `worker.dev.ts` | Intentional dev/prod CSP split — live-reload hash must not leak to prod |
| `dangerouslySetInnerHTML` for `FOUC_SCRIPT` | Intentional synchronous inline script required for FOUC prevention |
| `tsconfig.json` paths alias for `@y-core/forge/*` | Zed editor workaround — governs `tsgo` resolution, not runtime |
| `"types": []` in tsconfig | Global scope uses no `@types/*`; Workers types come from generated `.types/` |
