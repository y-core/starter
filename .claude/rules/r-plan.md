# r-plan — Architecture & Planning Rules

> Ruleset for `cc-plan`. Read entirely before producing any plan.

---

## Pre-Planning Checklist

1. **Layer?** Which of: `src/app/` (config/middleware), `src/routes.ts` + `src/router.tsx`, `src/controllers/` (render + mutation handlers), `src/services/`, `src/views/`, `src/model/`
2. **Already exists?** Use `rg` and `Read` to search before proposing new code.
3. **Leverage forge?** Check if `@y-core/forge` has a namespace for this before implementing from scratch.

---

## Feature Development Sequence (7-step order)

1. **Model** — types in `src/model/` (valibot schema, TypeScript types)
2. **Service** — external integrations in `src/services/`
3. **Controller** — `src/controllers/`: render handlers marshal data → `c.render(view, init)`; mutation handlers parse → validate → service call → `renderSuccess`/`renderError`
4. **View** — JSX component in `src/views/` (page views own `<Layout>`)
5. **Route** — add to `src/routes.ts` via `get()`/`post()`; bind controller in `src/router.tsx` via `createController`
6. **Middleware** — add guards if needed (`src/app/middleware.ts`)
7. **Tests** — in `tests/` using `app.request` pattern

Never skip or reorder steps.

---

## Route Design Rules

- Single source of truth: `src/routes.ts` (route map) + `src/router.tsx` (controller binding)
- Every POST route MUST have `csrfVerifyGuard`
- HTMX-only POST routes MUST have an equivalent of `contactGuard` (origin + HX-Request check)
- `/admin/*` routes: add auth middleware before exposing in production
- Group routes by scope: public, protected, admin

---

## Error Classification

| Category | Type | Location |
|---|---|---|
| Validation errors | `renderValidationErrors` fragment | controller boundary |
| Domain errors | typed `ErrXxx` sentinel / discriminated union | service layer |
| Unexpected errors | `renderError` fragment / 500 | controller catch |
| Infrastructure | `throw new Error(...)` | startup invariants, missing bindings |

---

## HTMX Rendering Strategy

- HTMX-only endpoints: handler returns `renderSuccess`/`renderError`/`renderValidationErrors` fragment (wrapped in `fragmentResponse`)
- Full-page routes: a controller in `src/controllers/` marshals `renderContext` + data and returns `c.render(<View ctx={ctx} … />, init)`; the view owns `<Layout ctx={ctx}>…</Layout>` and `c.render` is a thin JSX→HtmlResponse bridge
- Fragment target convention: `hx-target="#result-div"`, `hx-swap="outerHTML"`
- CSRF: hidden input `<input type="hidden" name="__csrf" value={ctx.csrfToken} />`
- HTMX attributes (`hx-get`, `hx-target`, `hx-swap`) belong in **views**, not handlers

---

## Plan Output Format

Every plan MUST include:

```markdown
## Context
Why this change is needed; what problem it solves.

## Layer Placement
Which layer(s) are affected and why. Confirm no layer violations.

## Files to Modify / Create
| Action | File | What changes |

## Implementation Steps
Numbered, ordered steps. Each step references a specific file and function.

## New Types / Interfaces
Any new types, schemas, or interfaces with their signatures.

## Test Plan
What cc-test should verify (happy path + failure cases).
```
