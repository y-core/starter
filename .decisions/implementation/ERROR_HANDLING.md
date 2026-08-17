---
title: Error Handling
description: "The fragment renderers this app calls, its HTMX target pattern, and the status each class of failure returns."
---

# Error Handling

> Fragment-based error responses, fail-closed posture, and the error taxonomy.
> Complements [INPUT_VALIDATION.md](./INPUT_VALIDATION.md) (renderValidationErrors),
> [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3c (guard pattern).

---

## 0. Quick Reference

- §1 Fragment renderers: `renderError`, `renderSuccess`, `renderValidationErrors`
- §1a renderError for Action Failures
- §1b renderSuccess for Completed Actions
- §1c renderValidationErrors for Form Field Errors
- §2 `htmlResponse`: full-page HTML wrapping for JSX views
- §2a renderPage for Full-Page Handler Views
- §2b Never Mix renderPage with HTMX Fragment Routes
- §3 Fail-closed posture: guards reject immediately, no silent fallback
- §4 Error taxonomy: expected, unexpected, infrastructure — distinct handling paths
- §5 HTMX target pattern: result `<div>` receives fragment swaps via `outerHTML`
- §5a Result Div as Fragment Swap Target
- §5b Error Fragment Structure
- §5c Test Assertions for Fragment Output
- §6 Status codes: 4xx for client errors, 5xx for service failures
- §6a Catch-All for Unhandled Throws
- §6b Never Return Stack Traces to Clients

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

See [`BOUNDARIES.md`](../governance/BOUNDARIES.md) §5 for the fail-closed posture, the ban on
swallowing a verification error, and [`BOUNDARIES.md`](../governance/BOUNDARIES.md) §2d for why a
policy violation is 403 rather than 400.

---

## 4. Error Taxonomy

See [`ERROR_HANDLING.md`](../governance/ERROR_HANDLING.md) §5 for the three-way taxonomy — expected,
unexpected, infrastructure — and what each returns and logs.

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
