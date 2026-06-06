---
title: "Error Handling"
description: "renderError, renderSuccess, renderValidationErrors, htmlResponse, HTMX fragment, fail-closed, 503 service unavailable, contactGuard 403, error taxonomy, expected unexpected infrastructure"
weight: 23
---

# Error Handling

> Fragment-based error responses, fail-closed posture, and the error taxonomy.
> Complements [INPUT_VALIDATION.md](./INPUT_VALIDATION.md) (renderValidationErrors),
> [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3c (guard pattern).

---

## 0. Quick Reference

- §1 Fragment renderers: `renderError`, `renderSuccess`, `renderValidationErrors`
- §2 `htmlResponse`: full-page HTML wrapping for JSX views
- §3 Fail-closed posture: guards reject immediately, no silent fallback
- §4 Error taxonomy: expected, unexpected, infrastructure — distinct handling paths
- §5 HTMX target pattern: result `<div>` receives fragment swaps via `outerHTML`
- §6 Status codes: 4xx for client errors, 5xx for service failures
- §7 forge error boundary: catches unhandled throws, returns 500 (fail-closed by construction)

---

## 1. Fragment Renderers

All three renderers from `@y-core/forge/http` return HTMX-compatible HTML fragments.
They set `Content-Type: text/html` and an appropriate HTTP status code so HTMX can decide
whether to swap the fragment or trigger an error event.

### 1a. renderError for Action Failures

Use `renderError` when a handler cannot complete its action for any reason other than
form validation:

    import { renderError } from "@y-core/forge/http"

    return renderError(c, "Message could not be sent", { status: 503 })

The `status` option defaults to `400` when omitted. Always pass the semantically correct
status so HTMX and monitoring systems classify the failure accurately:

| Scenario                         | Status |
| -------------------------------- | ------ |
| Bot / honeypot detected          | 400    |
| CAPTCHA verification failed      | 400    |
| CSRF token invalid               | 403    |
| Security guard rejected request  | 403    |
| External service unavailable     | 503    |
| Unexpected server error          | 500    |

### 1b. renderSuccess for Completed Actions

Use `renderSuccess` when the action completes and the user should see a confirmation:

    return renderSuccess(c, "Message sent! We'll be in touch soon.")

`renderSuccess` always returns HTTP 200. The fragment replaces the HTMX target element.

### 1c. renderValidationErrors for Form Field Errors

Use `renderValidationErrors` when `v.safeParse` returns `success: false`. Pass the
valibot `ValidationIssue[]` array directly; forge renders per-field error messages:

    import { renderValidationErrors } from "@y-core/forge/http"

    const parsed = v.safeParse(ContactSchema, fields, { abortEarly: true })
    if (!parsed.success) return renderValidationErrors(c, parsed.issues)

This renderer returns HTTP 422 so HTMX distinguishes validation errors from other failures.
See [INPUT_VALIDATION.md](./INPUT_VALIDATION.md) §1b for the full parse flow.

---

## 2. Full-Page Rendering via renderPage

### 2a. renderPage for Full-Page Handler Views

`renderPage` from `@y-core/forge/render` converts a JSX tree to an `HtmlResponse`. It is
called inside the `view` function of a `definePage` controller:

    // In a full-page controller (src/controllers/home.tsx):
    import { renderPage } from "@y-core/forge/render"

    handler: definePage<AppEnv, AppConfig, HomeData>({
      cache: "no-store",
      loader: async (c, config) => ({
        ctx: await renderContext(c, config, routes.contact.href()),
        content,
      }),
      view: (_c, _cfg, state) =>
        renderPage(<HomeView ctx={state.data.ctx} content={state.data.content} />),
    })

The `<Layout>` is composed by the view (`HomeView` returns `<Layout ctx={ctx}>…</Layout>`).
`renderPage(node, init?)` accepts an optional `init` for status code overrides (e.g. 404).

### 2b. Never Mix renderPage with HTMX Fragment Routes

Action handlers (POST routes that HTMX calls) must return fragment renderers via
`fragmentResponse`, not `renderPage`. Returning a full HTML page to an HTMX swap target
produces broken UI.

---

## 3. Fail-Closed Posture

### 3a. Guards Reject Immediately

Every security guard (`contactGuard`, `csrfVerifyGuard`, honeypot check) returns
an error response on any check failure. There is no fallback, retry, or silent skip path.
If the guard cannot confirm validity, it rejects:

    const guardResult = await contactGuard(c, formData, config)
    if (!guardResult.ok) return guardResult.response

The pattern is intentional: partial guard execution that silently continues would be a
security regression. See [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3 for
the full guard composition.

### 3b. No Silent Error Swallowing

Do not catch errors in guards or validation to return a success response. Code like the
following is prohibited:

    // WRONG — swallows errors, silently succeeds
    try {
      await verifyTurnstile(...)
    } catch {
      // continue anyway
    }

If verification throws unexpectedly, let it propagate to forge's error boundary
(§7) which returns 500. A failed CAPTCHA check is better exposed as a 500 than silently
bypassed.

### 3c. 403 for Policy Violations

Security guard rejections use HTTP 403 (Forbidden), not 400 (Bad Request). The distinction
matters for WAF logging and rate-limiting rules:

    return renderError(c, "Request blocked", { status: 403 })

---

## 4. Error Taxonomy

### 4a. Expected Errors — Validation and Business Logic

Definition: errors that occur during normal operation due to invalid or incomplete user
input, or business rule violations.

Examples: missing required fields, email format invalid, message too short, duplicate
submission.

Handling: `renderValidationErrors` (field errors) or `renderError` with 4xx status
(business rule failures). These are not logged at ERROR level — they are WARN or omitted
from application logs since they are user-generated.

### 4b. Unexpected Errors — Programming Defects

Definition: errors caused by bugs, type mismatches, or unreachable code paths that should
never occur in correct operation.

Examples: `TypeError`, `ReferenceError`, `null` dereference, assertion failure.

Handling: let them propagate unhandled. forge's error boundary catches them and
returns HTTP 500 (fail-closed, never exposes internals). These are logged at ERROR level
with a stack trace. Fix them; do not handle them defensively in application code.

### 4c. Infrastructure Errors — External Service Failures

Definition: errors caused by transient or permanent unavailability of external systems
(email API, KV, Turnstile endpoint).

Examples: email API returns 5xx, KV write times out, Turnstile endpoint unreachable.

Handling: catch at the service call site, log at ERROR level with the `requestId`, and
return `renderError` with status 503:

    try {
      await emailService.send(contact)
      return renderSuccess(c, "Message sent! We'll be in touch soon.")
    } catch (err) {
      // Log err with requestId via channel before returning
      return renderError(c, "Service temporarily unavailable. Please try again later.", { status: 503 })
    }

Never expose raw error messages or stack traces to the client in the 503 response body.

---

## 5. HTMX Target Pattern

### 5a. Result Div as Fragment Swap Target

Every form that submits to an action handler must declare an HTMX target and swap
strategy. The convention is a sibling `<div>` with a stable `id` and `data-ref`:

    <form hx-post="/api/contact" hx-target="#contact-result" hx-swap="outerHTML">
      {/* form fields */}
    </form>
    <div id="contact-result" data-ref="contact-result"></div>

The action handler returns a fragment that replaces the entire `#contact-result` div via
`outerHTML`. This means the returned fragment must include the wrapper element itself so
the div is always present for potential re-submission.

### 5b. Error Fragment Structure

`renderError` and `renderSuccess` return self-contained fragments that include:

- The result div wrapper with the same `id` and `data-ref`
- An appropriate ARIA role (`alert` for errors, `status` for success)
- No form elements — the user must reload or re-navigate to resubmit after success

### 5c. Test Assertions for Fragment Output

When testing action handlers, assert the exact HTML structure of the returned fragment.
Use HTML-decoded string comparisons — valibot error messages and content strings are
HTML-entity-encoded in the response body. See CLAUDE.md for the exact-match assertion
rule.

---

## 6. forge Error Boundary

### 6a. Catch-All for Unhandled Throws

`createApp` registers a fail-closed error boundary. Any exception that escapes a route
handler flows here and returns HTTP 500 with a generic HTML body — no stack trace,
no internal detail. Pass `isDebug: (c) => config.site.debug` to `createApp` to enable
verbose error details in development:

    const app = createApp<AppEnv>({
      config: configStore,
      isDebug: (c) => configStore.get(c.env).site.debug,
    })

When `isDebug` returns `true` the error boundary includes the error message in the
response for debugging. In production, `isDebug` must return `false` (or be omitted).

### 6b. Never Return Stack Traces to Clients

The 500 response must never include a stack trace, error message, or any internal detail
in production. The forge error boundary enforces this by default. Log full error details
via `requestLog` to the log channel only.
