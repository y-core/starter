# r-plan — Architecture & Planning Rules

> Ruleset for `cc-plan`. Read entirely before producing any plan.

---

## Pre-Planning Checklist

1. **Layer?** Which of: `src/app/` (config/middleware), `src/routes.tsx`, `src/handlers/`, `src/services/`, `src/views/`, `src/model/`
2. **Already exists?** Use tsmcp LSP (`lsp_workspace_symbols`, `lsp_find_references`) and `rg` to search before proposing new code.
3. **Leverage forge?** Check if `@y-core/forge` has a namespace for this before implementing from scratch.

---

## Feature Development Sequence (7-step order)

1. **Model** — types in `src/model/` (valibot schema, TypeScript types)
2. **Service** — external integrations in `src/services/`
3. **Handler** — parse → validate → service call → `renderSuccess`/`renderError` (`src/handlers/`)
4. **View** — JSX component in `src/views/`
5. **Route** — add to `src/routes.tsx` with middleware array
6. **Middleware** — add guards if needed (`src/app/middleware.ts`)
7. **Tests** — in `tests/` using `app.request` pattern

Never skip or reorder steps.

---

## Route Design Rules

- Single source of truth: `src/routes.tsx`
- Every POST route MUST have `csrfVerifyGuard`
- HTMX-only POST routes MUST have an equivalent of `contactSecurityGuard` (origin + HX-Request check)
- `/admin/*` routes: add auth middleware before exposing in production
- Group routes by scope: public, protected, admin

---

## HTMX Rendering Strategy

- HTMX-only endpoints: handler returns `renderSuccess`/`renderError`/`renderValidationErrors` fragment
- Full-page routes: loader returns data, view renders full JSX page
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
