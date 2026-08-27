---
title: Route Definitions
description: "The route map, the controller binding, the guard checklist a new route must satisfy, and how to add one."
---

# Route Definitions

> The starter's four routes: paths, guards, handlers, and the adding-routes checklist.
> Complements [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3 (guards),
> [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §6 (feature sequence).

---

## 0. Quick Reference

- §1 routes.ts + router.tsx — Current Route Table: the map and the controller binding
- §1a Route Map (src/routes.ts)
- §1b Controller Binding (src/router.tsx)
- §1c Route Shape
- §2 healthCheck: /api/health, CSRF key validation
- §2a /api/health
- §2b What healthCheck Validates
- §3 Contact: /api/contact, five guards, HTMX-only POST
- §3a /api/contact — HTMX-Only POST Action
- §3b Guard Order
- §3c handleContact
- §4 Home: GET /, csrfVerifyGuard mints token, definePage + renderPage
- §4a GET / — Full Page with Contact Form
- §4b Why csrfVerifyGuard on GET
- §4c homeController Structure
- §5 Admin Logs Route: /showcase/logs, showLogsController (definePage + `loadLogViewer`), debug-gated by `access`
- §5a /showcase/logs — Log Viewer
- §5b Access Control
- §5c LOGS_KV Absence
- §6 Adding New Routes: checklist
- §6a Checklist
- §6b Route Registration Flow
- §6c HTMX Fragment Routes

---

## 1. routes.ts + router.tsx — Current Route Table

Routing is split across two files. `src/routes.ts` is pure data — the route map. `src/router.tsx`
is the controller binding — it maps route names to handlers and middleware. Routes are never
registered in `worker.ts`, middleware files, or handler files. `worker.ts` calls
`app.map(routes, controller)` to mount everything onto the Forge app.

### 1a. Route Map (src/routes.ts)

    // src/routes.ts
    import { get, post, route } from "@y-core/forge/router"

    export const routes = route({
      health:    get("/api/health"),
      contact:   post("/api/contact"),
      home:      get("/"),
      showcase: { logs: get("/showcase/logs"), ...showcaseRoutes("/showcase/ui") },
    })

The `get()`/`post()` path helpers (re-exported by forge from `@remix-run/fetch-router/routes`)
are the canonical name-keyed form. `routes.contact.href()` still resolves to `"/api/contact"`.

### 1b. Controller Binding (src/router.tsx)

    // src/router.tsx
    import { healthCheck } from "@y-core/forge/app"
    import { createController } from "@y-core/forge/router"
    import { contactController } from "./controllers/actions/contact"
    import { homeController } from "./controllers/home"
    import { showLogsController } from "./controllers/show.logs"
    import { routes } from "./routes"

    export const controller = createController(routes, {
      actions: {
        health:  healthCheck<AppContext["env"]>({ csrf: () => true }),
        contact: contactController,
        home:    homeController,
      },
    })

    // The showcase subtree is mapped separately, off `routes.showcase`.
    app.map(routes.showcase, createController(routes.showcase, { actions: { logs: showLogsController } }))

`contactController`, `homeController`, and `showLogsController` are `{ middleware, handler }`
objects (or bare `RequestHandler` values) exported from their controller modules; `health`
stays inline as a forge factory.

### 1c. Route Shape

Each entry in `createController`'s `actions` map is either:

| Shape | Purpose |
|---|---|
| `RequestHandler` (bare function) | a forge factory (`healthCheck(...)`) or a bare controller handler |
| `{ middleware, handler }` | a controller module — middleware array applied before the handler |

Middleware arrays contain `Middleware` values (guards). The handler is a `RequestHandler`.
See [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §6 for the handler patterns.

---

## 2. healthCheck Route

### 2a. /api/health

    // routes.ts
    health: { method: "GET", pattern: "/api/health" }

    // router.tsx
    health: healthCheck<AppContext["env"]>({ csrf: () => true })

`healthCheck` is imported from `@y-core/forge/app`. It returns a JSON response with a status
object verifying that the app started cleanly.

`csrf: () => true` disables the CSRF secret validation check for this endpoint. The health route
must remain unauthenticated so uptime monitors can reach it without session state.

### 2b. What healthCheck Validates

- Wrangler bindings are present (env shape is non-null)
- `csrf: (env) => boolean` — custom check; in production this can validate that `CSRF_SECRET` is
  the correct byte length

Do not add authentication guards to `/api/health`. It is intentionally public.

---

## 3. Contact Route

### 3a. /api/contact — HTMX-Only POST Action

    // routes.ts
    contact: { method: "POST", pattern: "/api/contact" }

    // router.tsx
    contact: { middleware: contactGuards, handler: contactAction }
    // contactGuards = createMiddleware(requireFormContentType(), htmxOnlyGuard, originGuard, rateLimitGuard, csrfVerifyGuard)

This is a fragment-only route (no full-page render). It accepts `POST` only. Every request must
arrive via HTMX from an allowed origin.

### 3b. Guard Order

Guards run left to right. Order is load-bearing:

    [requireFormContentType(), htmxOnlyGuard, originGuard, rateLimitGuard, csrfVerifyGuard]

| Position | Guard | Rejects on |
|---|---|---|
| 1 | `requireFormContentType()` | `Content-Type` is not a form encoding (415) |
| 2 | `htmxOnlyGuard` | Missing `HX-Request` (403) |
| 3 | `originGuard` | Cross-site `Sec-Fetch-Site`, or an `Origin`/`Referer` outside the allowlist (403) |
| 4 | `rateLimitGuard` | Too many requests from this IP (429) |
| 5 | `csrfVerifyGuard` | Missing or invalid `__csrf` token (403) |

`BOUNDARIES.md` §2c order: request shape, then origin, then rate limit, then CSRF. The first three are
header inspection with no crypto, so they are cheapest. Rate limiting runs before CSRF to avoid
burning writes on flood traffic; CSRF runs last because it requires a `SubtleCrypto` HMAC verify.

`originGuard` is forge's `originProtection`, not a bare `verifyOrigin`: it layers Fetch-Metadata
over the origin allowlist, so a request carrying neither `Origin` nor `Referer` is refused unless
the browser vouched for it with `Sec-Fetch-Site` — a forbidden header name web content cannot set.

There is no method check: `routes.contact` is `post(...)`, so the router answers 405 itself.

### 3c. handleContact

Defined in `src/controllers/actions/contact.ts`. After the guards pass, the handler reads the form body
via `parseFormData(c)`, checks the honeypot field (`isHoneypotFilled`), verifies the Turnstile
token, and validates the fields with `validateContact`. On success it returns an HTMX-compatible
HTML fragment wrapped in `fragmentResponse(renderSuccess(...))`. On validation failure it returns
`fragmentResponse(renderValidationErrors(...), 422)`. It never redirects — the form swap is
handled client-side by HTMX hx-swap.

---

## 4. Home Route

### 4a. GET / — Full Page with Contact Form

    // routes.ts
    home: get("/")

    // router.tsx
    home: homeController

`homeController` is defined in `src/controllers/home.tsx` as a plain `{ middleware, handler }`
object. Its `middleware: [csrfVerifyGuard]` pre-mints a CSRF token before the handler runs.

### 4b. Why csrfVerifyGuard on GET

`csrfVerifyGuard` in GET context pre-mints a CSRF token and stores it in the request
context. The `homeController` handler calls `renderContext(c, c.config, { csrfPath: routes.contact.href() })`
to pick it up and inject it (via the `HomeView` prop) into the form's hidden `__csrf` field.
Without this guard, the contact form renders without a token and every POST from it will return 403.

See [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3c for the guard details.

### 4c. homeController Structure

    // src/controllers/home.tsx
    export const homeController = {
      middleware: [csrfVerifyGuard],
      handler: definePage<AppEnv, AppConfig, HomeData>({
        cache: "no-store",
        loader: async (c, config) => ({
          ctx: await renderContext(c, config, routes.contact.href()),
          content,
        }),
        view: (_c, _cfg, state) =>
          renderPage(<HomeView ctx={state.data.ctx} content={state.data.content} />),
      }),
    }

The `loader` marshals a `RenderContext` (`ctx`) — providing the CSRF token, nonce, and
Turnstile site key — and the `view` calls `renderPage()` from `@y-core/forge/jsx` to
convert the JSX to an `HtmlResponse`. `cache: "no-store"` sets the Cache-Control header.
`routes.contact.href()` returns `"/api/contact"` from the typed route map, keeping the CSRF
path in sync with the route definition.

---

## 5. Admin Logs Route

### 5a. /showcase/logs — Log Viewer

    // routes.ts
    showcase: { logs: get("/showcase/logs"), ... }

    // router.tsx
    logs: showLogsController   // defined in src/controllers/show.logs.tsx

`showLogsController` is a `definePage` handler in `src/controllers/show.logs.tsx`. Its
`loader` calls `loadLogViewer(c, config, { channel, access, icon, context, layout, basePath })`
from `@y-core/forge/logging/show`, which returns a fully rendered `Response` for every path; its
`view` is a pass-through. There is no separate `logs.tsx` view component — the log viewer UI is
provided by forge.

### 5b. Access Control

The route carries no middleware guard. `loadLogViewer`'s `access` predicate is the gate: it reads
`site.debug`, true only under `LOG_LEVEL=DEBUG`, and production leaves `LOG_LEVEL` unset — so the
route answers 403 there. See [STRUCTURED_LOGGING.md](./STRUCTURED_LOGGING.md) §4b.

### 5c. LOGS_KV Absence

If `LOGS_KV` is not bound (e.g., in the test `MINIMUM_ENV`), the loader returns an empty log list
rather than throwing. The route remains reachable; it simply shows no entries. This is by design —
graceful degradation over hard failure.

---

## 6. Adding New Routes

### 6a. Checklist

When adding any new route, complete all items before marking done:

- [ ] Add the route entry to `src/routes.ts` via `get()`/`post()` — never define routes in `worker.ts` or handlers
- [ ] Add the controller binding to `src/router.tsx` in `createController`'s `actions` map
- [ ] POST/action routes: include `csrfVerifyGuard` in the middleware array
- [ ] HTMX-only POST routes: open with `requireFormContentType()`, `htmxOnlyGuard` and `originGuard`, in that order
- [ ] `/admin/*` routes: add auth middleware or document `// TODO(auth)` with a tracking note
- [ ] Full-page controllers: use `definePage({ loader, view })` in `src/controllers/`; `loader` marshals `renderContext` + data; `view` calls `renderPage(<View ctx={ctx} … />)` from `@y-core/forge/jsx`
- [ ] Fragment handlers: use `fragmentResponse(renderSuccess(...))` / `renderValidationErrors`
- [ ] New view component defined in `src/views/` (page views own `<Layout>`; not inline in the controller)
- [ ] New route covered by a test in `tests/` (status + security headers)
- [ ] Run `bun run verify` — generated types, typecheck, lint, and tests must all pass

### 6b. Route Registration Flow

    src/routes.ts         — declares route map via route({…})
    src/router.tsx        — binds handlers via createController(routes, { actions })
         ↓
    src/worker.ts         — calls app.map(routes, controller)
         ↓
    @y-core/forge/router  — mounts each route+handler pair onto the Forge app

No other file should mount routes directly on `app`. All routing is declarative through
the `routes` map + `controller` binding.

### 6c. HTMX Fragment Routes

HTMX partial-swap endpoints (routes that return HTML fragments, not full pages) follow the same
pattern as `/api/contact`:

- Route entry with `method: "POST"` in `routes.ts`; handler bound in `router.tsx`
- `htmxOnlyGuard` (after `requireFormContentType()`) to require `HX-Request`
- Handler returns `fragmentResponse(renderSuccess(...))` or `fragmentResponse(renderValidationErrors(...), 422)` — never `renderPage()`
- Tested with `toContain` assertions on the fragment's stable structure (see [HANDLER_TESTING.md](./HANDLER_TESTING.md) §3)
