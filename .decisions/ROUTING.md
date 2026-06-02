---
title: "Route Definitions"
description: "routes.tsx, declarative RouteConfig, route function, healthCheck, contact action, home route, admin logs, TODO auth, logViewer, HTMX fragment routes, route guards middleware array, applyRoutes, adding routes"
weight: 26
---

# Route Definitions

> The starter's four routes: paths, guards, handlers, and the adding-routes checklist.
> Complements [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3 (guards),
> [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §6 (feature sequence).

---

## 0. Quick Reference

- §1 Current routes: all four routes in routes.tsx
- §2 healthCheck: /api/health, CSRF key validation
- §3 Contact: /api/contact, three guards, HTMX-only POST
- §4 Home: GET /, csrfVerifyGuard mints token
- §5 Admin logs: /admin/logs, TODO(auth)
- §6 Adding routes: checklist

---

## 1. routes.tsx — Current Route Table

`src/routes.tsx` is the single source of truth for all routes. Routes are never registered in
`worker.ts`, middleware files, or handler files. `applyRoutes` in `worker.ts` consumes the exported
`routes` array and mounts everything onto the Hono app.

### 1a. All Routes

    export const routes: RouteConfig<AppEnv> = [
      route("/api/health", {
        loader: healthCheck<AppEnv>({ csrf: () => true }),
      }),
      route("/api/contact", {
        middleware: [contactSecurityGuard, rateLimitGuard, csrfVerifyGuard],
        action: handleContactAction,
      }),
      route("/", {
        ...homeRoute,
        middleware: csrfVerifyGuard,
      }),
      route("/admin/logs", {
        ...logViewer<AppEnv>({ kv: (c) => c.env.LOGS_KV }),
        view: logsView as RouteView<AppEnv>,
      }),
    ]

### 1b. Route Shape

Each call to `route(path, config)` accepts:

| Field | Type | Purpose |
|---|---|---|
| `loader` | `Loader<AppEnv>` | Handles GET — fetches data, returns context for the view |
| `action` | `Action<AppEnv>` | Handles POST/PUT/DELETE — mutates state, returns HTMX fragment |
| `view` | `RouteView<AppEnv>` | JSX component rendered by the loader result |
| `middleware` | `Middleware \| Middleware[]` | Guards run before loader/action |

A route may have a loader only (read-only page), an action only (API endpoint), or both (page with
form that posts to the same path). See [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §6 for the
full loader/action/view contract.

---

## 2. healthCheck Route

### 2a. /api/health

    route("/api/health", {
      loader: healthCheck<AppEnv>({ csrf: () => true }),
    })

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

    route("/api/contact", {
      middleware: [contactSecurityGuard, rateLimitGuard, csrfVerifyGuard],
      action: handleContactAction,
    })

This is an action-only route (no `loader`, no `view`). It accepts `POST` only. Every request must
arrive via HTMX from an allowed origin.

### 3b. Guard Order

Guards run left to right. Order is load-bearing:

    [contactSecurityGuard, rateLimitGuard, csrfVerifyGuard]

| Position | Guard | Rejects on |
|---|---|---|
| 1 | `contactSecurityGuard` | Non-POST, disallowed origin, missing `HX-Request`, wrong `Content-Type` |
| 2 | `rateLimitGuard` | Too many requests from this IP |
| 3 | `csrfVerifyGuard` | Missing or invalid `__csrf` token |

`contactSecurityGuard` runs first because it is cheapest (header inspection, no crypto). Rate
limiting runs before CSRF to avoid burning DB writes on flood traffic. CSRF runs last because it
requires a `SubtleCrypto` HMAC verify.

### 3c. handleContactAction

Defined in `src/handlers/contact.ts`. After the guards pass, the handler reads the form body
via `parseFormData`, checks the honeypot field (`isHoneypotFilled`), verifies the Turnstile
token, and validates the fields with `validateContact`. On success it returns an HTMX-compatible
HTML fragment (200). On validation failure it returns a 422 fragment. It never redirects — the
form swap is handled client-side by HTMX hx-swap.

---

## 4. Home Route

### 4a. GET / — Full Page with Contact Form

    route("/", {
      ...homeRoute,
      middleware: csrfVerifyGuard,
    })

`homeRoute` is defined in `src/handlers/pages.tsx` and spread into the route config. It contributes
`loader` and `view`. The inline `middleware: csrfVerifyGuard` is applied on top.

### 4b. Why csrfVerifyGuard on GET

`csrfVerifyGuard` in GET context does not verify a submitted token — it mints a fresh one and
stores it in the request context so the loader/view can inject it into the form's hidden `__csrf`
field. Without this guard, the contact form renders without a token and every POST from it will
return 403.

See [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3 for the guard's dual GET/POST
behavior.

### 4c. homeRoute Structure

    // src/handlers/pages.tsx
    export const homeRoute = {
      loader: homeLoader,
      view: HomeView,
    }

`HomeView` renders the full HTML shell (layout + sections + contact form). The loader supplies page
data (site key, CSRF token from context, any feature flags).

---

## 5. Admin Logs Route

### 5a. /admin/logs — Log Viewer

    route("/admin/logs", {
      ...logViewer<AppEnv>({ kv: (c) => c.env.LOGS_KV }),
      view: logsView as RouteView<AppEnv>,
    })

`logViewer` is imported from `@y-core/forge/app`. It provides a loader that reads paginated
entries from a KV namespace. `kv: (c) => c.env.LOGS_KV` is an accessor that resolves the KV
binding from the environment at request time.

`logsView` wraps the forge `LogTable` component in the app's layout shell so it inherits the
site's navigation and security headers.

### 5b. TODO(auth) Comment

    // TODO(auth): mount an auth middleware before exposing this route in production

This comment appears in `routes.tsx` above the `/admin/logs` entry. It is intentional — the log
viewer is useful during development and is gated by the deploy environment. Before any production
deploy, an auth middleware (session cookie check, Basic Auth over HTTPS, or Cloudflare Access)
must be prepended to the middleware array.

Do not remove the TODO comment until the auth middleware is wired in. It serves as a deploy
checklist item.

### 5c. LOGS_KV Absence

If `LOGS_KV` is not bound (e.g., in the test `MINIMUM_ENV`), the loader returns an empty log list
rather than throwing. The route remains reachable; it simply shows no entries. This is by design —
graceful degradation over hard failure.

---

## 6. Adding New Routes

### 6a. Checklist

When adding any new route, complete all items before marking done:

- [ ] Add only to `src/routes.tsx` — never define routes in `worker.ts`, middleware, or handlers
- [ ] POST/action routes: include `csrfVerifyGuard` in the middleware array
- [ ] HTMX-only POST routes: include a `contactSecurityGuard`-equivalent as the first middleware
- [ ] `/admin/*` routes: add auth middleware or document `// TODO(auth)` with a tracking note
- [ ] New view component defined in `src/views/` (not inline in the route config)
- [ ] Handler defined in `src/handlers/` (not inline in the route config)
- [ ] New route covered by a test in `tests/` (status + security headers)
- [ ] Run `bun run check` — types, lint, and tests must all pass

### 6b. Route Registration Flow

    src/routes.tsx        — declares RouteConfig<AppEnv>
         ↓
    src/worker.ts         — calls applyRoutes(app, routes, env)
         ↓
    @y-core/forge/router  — mounts each route onto the Hono app instance

No other file should call `app.get`, `app.post`, etc. directly. All routing is declarative through
`RouteConfig`.

### 6c. HTMX Fragment Routes

HTMX partial-swap endpoints (routes that return HTML fragments, not full pages) follow the same
pattern as `/api/contact`:

- Action only (no loader, no view)
- `contactSecurityGuard` (or equivalent) as first middleware to require `HX-Request`
- Response is an HTML fragment, not a full document
- Tested with `toContain` assertions on the fragment's stable structure (see [HANDLER_TESTING.md](./HANDLER_TESTING.md) §3b)
