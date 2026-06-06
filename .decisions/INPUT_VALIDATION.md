---
title: "Input Validation"
description: "ContactSchema, readFields, v.safeParse, abortEarly, honeypot, Turnstile, valibot facade, validate at boundary, form namespace, v namespace, mintCsrf, CSRF hidden input"
weight: 24
---

# Input Validation

> Validation schemas, form parsing, honeypot, and Turnstile in the starter app.
> Complements [ERROR_HANDLING.md](./ERROR_HANDLING.md) (renderValidationErrors),
> [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3c (csrfVerifyGuard).

---

## 0. Quick Reference

- §1 `ContactSchema`: valibot schema for contact form fields, typed output via `InferOutput`
- §2 `readFields` + `v.safeParse`: form parsing and validation flow
- §3 Bot protection: honeypot check before CSRF and Turnstile CAPTCHA
- §4 CSRF token: `mintCsrf` in `renderContext` → hidden input in form → `csrfVerifyGuard`
- §5 Validate-at-boundary rule: handler validates, service receives typed data only
- §6 `v` namespace facade: import exclusively from `@y-core/forge/validation`, never valibot directly
- §7 `abortEarly` semantics: first error per field, clean UX for form responses

---

## 1. ContactSchema

### 1a. Contact Form Schema Definition

Schemas live in `src/model/` alongside their inferred types. The `v` namespace is the
forge validation facade wrapping valibot — all schema construction goes through it:

    import { v } from "@y-core/forge/validation"

    export const ContactSchema = v.object({
      name: v.pipe(
        v.string(),
        v.minLength(2, "Name must be at least 2 characters"),
        v.maxLength(100, "Name must be at most 100 characters"),
      ),
      email: v.pipe(
        v.string(),
        v.email("Please enter a valid email address"),
        v.maxLength(254, "Email address is too long"),
      ),
      message: v.pipe(
        v.string(),
        v.minLength(10, "Message must be at least 10 characters"),
        v.maxLength(2000, "Message must be at most 2000 characters"),
      ),
    })

    export type ContactInput = v.InferOutput<typeof ContactSchema>

`ContactInput` is the typed payload the handler passes to `emailService.send()`. The
schema is the single source of truth for field constraints — do not duplicate them in
the view layer or service layer.

### 1b. Schema Placement Convention

One schema per domain object. Place schemas in `src/model/<name>.ts` alongside the
inferred type. Export both the schema and the type from the same file. Handlers import
both; services import only the type.

### 1c. Field Constraints Are User-Facing

Error message strings in the schema are the exact strings rendered to the user via
`renderValidationErrors`. Write them as complete, helpful sentences. Avoid technical
terms like "minLength" or "required" — prefer "at least N characters" or "cannot be
blank".

---

## 2. Form Parsing Flow

### 2a. Full Handler Parse Sequence

The complete sequence in a POST action handler:

    import { parseFormData, readFields, isHoneypotFilled } from "@y-core/forge/form"
    import { renderError, renderValidationErrors } from "@y-core/forge/http"
    import { v } from "@y-core/forge/validation"
    import { ContactSchema, type ContactInput } from "../model/contact"

    const formData = await parseFormData(c)

    // 1. Bot check — earliest possible rejection
    if (isHoneypotFilled(formData)) return renderError(c, "Invalid submission", { status: 400 })

    // 2. CSRF verification (via guard, see §4)
    const guardResult = await contactGuard(c, formData, config)
    if (!guardResult.ok) return guardResult.response

    // 3. Extract fields as string record
    const fields = readFields(formData, ["name", "email", "message"] as const)

    // 4. Parse and validate
    const parsed = v.safeParse(ContactSchema, fields, { abortEarly: true })
    if (!parsed.success) return renderValidationErrors(c, parsed.issues)

    // 5. Typed output — safe to pass to service
    const contact: ContactInput = parsed.output

Steps 1–2 reject bots and forged requests before any validation work occurs. Steps 3–5
are the validation pipeline proper.

### 2b. parseFormData vs. c.request.formData

Always use `parseFormData(c)` from the forge form utilities, not `c.request.formData()`
directly. `parseFormData` accepts the request context, normalises content-type handling,
and integrates cleanly with `readFields` and `isHoneypotFilled`.

### 2c. readFields Returns a String Record

`readFields` extracts the named fields from the `FormData` object and returns a
`Record<string, string>`. Missing fields become empty strings, not `undefined`. This
means valibot `minLength` checks naturally catch absent fields without a separate
"required" check.

---

## 3. Bot Protection

### 3a. Honeypot Field

The honeypot pattern adds a hidden form field that bots fill in but humans leave blank.
`isHoneypotFilled` checks the field named by `HONEYPOT_FIELD_DEFAULT` (default: `"__hp"`):

    if (isHoneypotFilled(formData)) return renderError(c, "Invalid submission", { status: 400 })

Add the honeypot input to every form that submits to an action handler. Style it hidden
via CSS (not `type="hidden"` which bots ignore, but `display:none` or position off-screen):

    <input type="text" name="__hp" tabIndex={-1} aria-hidden="true" class="sr-only" />

Check the honeypot before CSRF and Turnstile to avoid unnecessary cryptographic work on
bot submissions.

### 3b. Turnstile CAPTCHA Verification

Turnstile is Cloudflare's bot-detection CAPTCHA. The widget renders client-side and
posts a `cf-turnstile-response` token with the form. The handler verifies it server-side:

    import { verifyTurnstile } from "@y-core/forge/turnstile"

    const turnstileResult = await verifyTurnstile({
      token: formData.get("cf-turnstile-response") as string,
      secretKey: config.services.turnstile.secretKey,
    })
    if (!turnstileResult.ok) return renderError(c, "CAPTCHA verification failed", { status: 400 })

The secret key comes from the `config` object derived from Worker secrets — never
hardcoded. See CLAUDE.md security rules.

### 3c. Bot-Check Ordering

The prescribed order minimises work and avoids leaking timing information:

1. Honeypot (synchronous, zero cost)
2. CSRF token (fast HMAC verify)
3. Turnstile (async network call to Cloudflare)
4. Schema validation (CPU-only)
5. Service call

Reject at the earliest possible step.

---

## 4. CSRF Token

### 4a. csrfPath → renderContext → CSRF token

The CSRF token is minted by the controller via `renderContext(c, config, { csrfPath: routes.contact.href() })`.
The `csrfPath` is bound to the action path so tokens cannot be reused across endpoints:

    import { mintCsrf } from "@y-core/forge/form"

    // Inside renderContext (called by the controller's loader):
    csrfToken: csrfPath ? await mintCsrf(c, csrfPath) : ""

    // In a definePage loader:
    loader: async (c, config) => ({
      ctx: await renderContext(c, config, routes.contact.href()),
    })

`ctx.csrfToken` is materialized by the controller and injected into the form's
hidden `__csrf` field by the view component.

### 4b. CSRF Hidden Input in Form

Pass the token as a prop to the view component and render it as a hidden input inside
the `<form>` element. HTMX includes all form fields in the POST body automatically:

    <form hx-post="/api/contact" hx-target="#contact-result" hx-swap="outerHTML">
      <input type="hidden" name="__csrf" value={csrfToken} />
      {/* visible fields */}
    </form>

### 4c. csrfVerifyGuard in the Handler

`csrfVerifyGuard` (part of `contactGuard`) reads `__csrf` from the form data and
verifies it against the action path and the signing key. A missing, expired, or
path-mismatched token results in a 403 response. See
[MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3c for guard composition
details.

---

## 5. Validate-at-Boundary Rule

### 5a. Handlers Own Validation

All input validation happens in the handler. By the time a service function is called,
its arguments are already fully typed and validated `ContactInput` values. Services must
never receive raw `FormData`, unvalidated strings, or `unknown` types:

    // CORRECT — typed ContactInput reaches the service
    const contact: ContactInput = parsed.output
    await emailService.send(contact)

    // WRONG — raw data passed to service
    await emailService.send(fields)

### 5b. Services Receive Types, Not Schemas

Service functions declare typed parameters, not schema-based runtime validators. A service
that accepts `ContactInput` trusts the handler has already validated. Putting `v.parse`
calls inside services duplicates validation logic and creates ambiguity about which layer
owns the rules.

### 5c. Model Layer Owns Constraints

Field constraints (min/max lengths, format rules) live in the schema in `src/model/`.
They must not be duplicated as conditional checks in handlers (`if (name.length < 2)`)
or as HTML `minlength` / `maxlength` attributes (those are UX hints only, not security
controls). The schema is the authority.

---

## 6. v Namespace Facade

### 6a. Import from Forge, Never from Valibot Directly

All schema construction and parsing utilities come from `@y-core/forge/validation`:

    import { v } from "@y-core/forge/validation"

Do not import from `"valibot"` directly. The forge facade ensures version alignment and
allows forge to wrap or extend valibot behaviour without requiring changes across the
codebase.

### 6b. Available Utilities via v

The `v` namespace re-exports the full valibot surface used in this project:

- `v.object`, `v.string`, `v.pipe`, `v.optional`
- `v.minLength`, `v.maxLength`, `v.email`, `v.url`
- `v.safeParse`, `v.parse`
- `v.InferOutput`, `v.InferInput`

If a valibot utility is needed that is not currently re-exported, add it to the forge
facade rather than importing from valibot directly.

---

## 7. abortEarly Semantics

### 7a. Why abortEarly: true for Forms

`{ abortEarly: true }` stops validation at the first failing rule within each field.
This produces at most one error per field, which is the correct UX for web forms —
users should fix one issue at a time, not see a wall of error messages:

    const parsed = v.safeParse(ContactSchema, fields, { abortEarly: true })

### 7b. abortEarly: false for APIs

For JSON API endpoints that return structured error payloads, `abortEarly: false` gives
clients a full list of all violations in a single response. Use it selectively; the
default for all form handlers is `abortEarly: true`.
