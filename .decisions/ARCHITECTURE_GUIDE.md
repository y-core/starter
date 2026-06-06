---
title: Architecture Guide
description: "createWorker factory, composition root, layer stack, DI via Config, dev prod entry split, live-reload CSP hash, leverage forge, app config context middleware, routes handlers services views, feature development sequence"
weight: 15
---

# Architecture Guide

> Authoritative source for forge-starter's layer structure, composition root,
> factory pattern, and feature development sequence.
>
> Complements [PRODUCTION_RULES.md](./PRODUCTION_RULES.md) (coding rules),
> [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) (middleware ordering),
> [ROUTING.md](./ROUTING.md) (route definitions).

---

## 0. Quick Reference

- §1 createWorker factory: composition root, dev/prod entry split
- §2 Layer stack: worker → app/ → routes → handlers → services → views → model
- §3 DI via Config: configStore.get(c.env), AppEnv bindings
- §4 Dev/prod CSP split: live-reload hash in worker.dev.ts only
- §5 Leverage forge first rule: consume forge namespaces before writing app code
- §6 Feature development sequence: 7-step order

---

## 1. createWorker Factory Pattern

### 1a. createWorker(security) — Composition Root

`src/worker.ts` exports a factory function that accepts `SecurityHeadersOptions`:

    export function createWorker(security: SecurityHeadersOptions) {
      const app = createApp<AppEnv>({ config: configStore, isDebug: (c) => configStore.get(c.env).site.debug })
      applyMiddleware(app, security)
      app.map(routes, controller)
      applyAssets(app, { notFoundView: notFoundController })
      return app
    }
    export default createWorker(securityHeaders)  // production default

The factory accepts `SecurityHeadersOptions` because the CSP policy differs between
environments: production passes the base `securityHeaders`; dev layers the Wrangler
live-reload hash on top via `mergeSecurityHeaders`.

### 1b. Composition Order Inside createWorker

The four steps inside the factory execute in a fixed order:

1. `createApp` — Forge app with Config integration and debug mode flag
2. `applyMiddleware` — security headers, request ID, logger, CORS for `/api/*`
3. `app.map(routes, controller)` — mounts routes from `src/routes.ts` + handlers from `src/router.tsx`
4. `applyAssets` — static asset serving and 404 handler

Middleware must be applied before routes so that security headers and request context
are set before any handler runs. `applyAssets` is last because it catches all
unmatched paths.

### 1c. Production Default Export

`wrangler.jsonc` `"main"` points to `src/worker.ts`. The module's default export is
`createWorker(securityHeaders)` — the production Worker with the base CSP only.
No live-reload hash is present in this export by construction.

The dev entry (`src/worker.dev.ts`) is passed as the positional argument to
`wrangler dev` and is never referenced in `wrangler.jsonc` as the production main.

---

## 2. Layer Stack

### 2a. Source Layer Structure

    src/worker.ts          ← composition root (production)
    src/worker.dev.ts      ← dev entry (live-reload CSP hash)
    src/app/
      config.ts            ← AppConfigSchema, configStore, securityHeaders
      context.ts           ← AppEnv, AppContext, RenderContext, renderContext()
      middleware.ts        ← applyMiddleware(), route guard sentinels (rateLimitGuard, csrfVerifyGuard)
    src/routes.ts          ← declarative route map (route({ home: get("/"), … }))
    src/router.tsx         ← createController binding (controller/middleware mapping)
    src/controllers/       ← plain controllers (definePage handlers + HTMX mutation handlers)
    src/services/          ← external integrations (email, turnstile)
    src/views/             ← forge JSX view components (@jsxImportSource @y-core/forge); page views own <Layout>
    src/model/             ← domain types and valibot schemas
    src/client/main.ts     ← browser JS (esbuild entry point)
    src/assets/            ← tailwind.css, SVG assets

### 2b. Layer Dependency Rules

Each layer may only import from the layers listed:

| Layer | May import from |
|---|---|
| `controllers/` | `services/`, `model/`, `app/`, `views/`, `routes`, `@y-core/forge/render` |
| `services/` | `model/`, `app/config` |
| `views/` | `model/`, `app/context`, `views/layout` |
| `app/middleware.ts` | `app/config`, forge (`security`, `form`, `logging`) |
| `routes.ts` | (route data only — no handlers or views) |
| `router.tsx` | `controllers/`, `app/middleware` |
| `worker.ts` | `routes.ts`, `router.tsx`, `controllers/`, `app/` |

Controllers must not import from other controllers. Services must not import from controllers or views.
Views must not own business rules or call services directly. Page views compose their own `<Layout>`.

### 2c. No Layer Skipping — Handler → Service Boundary

Handlers delegate to services; services own all external calls.

BAD — handler calling email API directly:

    // src/controllers/contact.ts
    const res = await fetch("https://api.mailchannels.net/...", { body: JSON.stringify(payload) })

GOOD — handler calls service; service owns external call:

    // src/controllers/contact.ts
    await emailService.send(c, config, formData)

    // src/services/email.ts
    export async function send(c: AppContext, config: AppConfig, data: ContactFormData) {
      const res = await fetch(config.services.email.apiUrl, { ... })
    }

This keeps handlers testable (mock the service) and services independently reusable.

---

## 3. DI via Config

### 3a. configStore.get(c.env) — Typed Config Access

`configStore` is a `Config` instance from `@y-core/forge/config`. It validates all
environment variables against `AppConfigSchema` on first access and caches the result.

    import { configStore } from "./app/config"

    // Inside any handler or middleware:
    const config = configStore.get(c.env)   // typed AppConfig, validated
    const baseUrl = config.site.url.origin
    const csrfSecret = config.security.csrf.secret
    const apiKey = config.services.email.apiKey

Never read `c.env.SOME_VAR` directly in handlers or services — always go through
`configStore.get(c.env)` so all access is typed and validated.

### 3b. AppEnv and AppContext — Type Parameters

    type AppEnv = Env  // alias for the generated Cloudflare bindings type

    type AppContext = ForgeAppContext<AppEnv, Record<string, string>, AppConfig>

`AppEnv` is the `Bindings` generic threaded through `Forge<AppEnv>`, `AppContext`, and
`Middleware`. Context variables set by global middleware (nonce, requestId, CSRF token,
logger) are stored via typed `contextVar` accessors — not a `Variables` union — and
accessed through forge's context helpers (`getNonce(c)`, `requestIdCtx.getOptional(c)`).

### 3c. renderContext — Per-Request Presentation State

    const ctx = await renderContext(c, config, "/api/contact")
    // ctx: { baseUrl, csrfToken, nonce, turnstileSiteKey }

`renderContext` materializes per-request values for injection into JSX views:
- `nonce` — extracted from context (set by `makeSecurityHeaders`)
- `csrfToken` — minted only when `csrfPath` is provided; empty string for pages without forms
- `baseUrl` — `config.site.url.origin`
- `turnstileSiteKey` — from `config.services.turnstile.siteKey`

`renderContext` is called inside the controller's `loader`. The controller passes the resulting
`ctx` as a view prop. `renderPage()` from `@y-core/forge/render` is called in the `view`
function to convert JSX to an `HtmlResponse`. Views receive a typed `RenderContext` prop,
compose their own `<Layout ctx={ctx}>`, and remain pure rendering functions.

---

## 4. Dev/Prod CSP Split

### 4a. src/worker.dev.ts — Dev Entry Point

    const WRANGLER_LIVE_RELOAD_HASH = "'sha256-g5a3SrOYIecCloZ8S7M4xdT1pbYi6e7mjHrmwphRxfE='"

    export default createWorker(
      mergeSecurityHeaders(securityHeaders, { scriptSrc: [WRANGLER_LIVE_RELOAD_HASH] })
    )

`mergeSecurityHeaders` deep-merges the extra `scriptSrc` entry onto the base
`securityHeaders` without mutating the original object. The result is a stricter
`SecurityHeadersOptions` that allows only the two explicitly listed script sources:
`'self'` + nonce (from base) and the live-reload hash (added by dev entry).

### 4b. Why the Hash Is Dev-Only

Wrangler injects a small inline script into dev-mode HTTP responses to trigger the
browser live-reload. That script's SHA-256 hash must appear in `script-src` or the
browser blocks it (CSP violation). The hash belongs only in `worker.dev.ts` because:

- The hash allows a specific external script fragment; production CSP must not permit it
- Keeping it in a separate entry file makes the guarantee structural, not relying on build flags
- If the hash leaks to production (e.g., by accident in `securityHeaders`), it widens the
  attack surface for script injection without providing any runtime value

When Wrangler is upgraded and the injected script changes, update only
`WRANGLER_LIVE_RELOAD_HASH` in `worker.dev.ts`. The production CSP is unaffected.

---

## 5. Leverage Forge First Rule

### 5a. Check Forge Namespaces Before Writing App Code

Before implementing any cross-cutting concern, check whether forge already provides it:

| Need | Forge namespace |
|---|---|
| CSRF protection and minting | `@y-core/forge/form` |
| Security headers (CSP, nonce) | `@y-core/forge/security` |
| HTML escaping, fragment responses | `@y-core/forge/http` |
| Structured request logging | `@y-core/forge/logging` |
| Input validation (valibot wrapper) | `@y-core/forge/validation` |
| Rate limiting | `@y-core/forge/security` (`rateLimit`) |
| Origin verification | `@y-core/forge/security` (`verifyOrigin`) |
| App factory and asset serving | `@y-core/forge/app` |
| Declarative routing | `@y-core/forge/router` |
| Config validation and access | `@y-core/forge/config` |

App-layer code (this repo) provides: `AppConfigSchema`, `AppEnv`, `securityHeaders`,
`routes`, domain-specific view components, handlers, and services. It does not
re-implement transport, security, or utility patterns already present in forge.

### 5b. When App Code Is Appropriate

Write app-layer code when the concern is:

- **Domain-specific** — business logic unique to this product (e.g., contact form handling)
- **Configuration** — binding forge utilities to this app's env vars and schemas
- **View rendering** — JSX components that produce HTML for this app's pages
- **Integration wiring** — connecting forge primitives to external services (email, turnstile)

---

## 6. Feature Development Sequence

### 6a. 7-Step Order

Follow this sequence when adding any new feature. Never skip or reorder steps.

1. **Model** — define types in `src/model/` (valibot schema + inferred TypeScript types)
2. **Service** — implement external integrations in `src/services/` using the model types
3. **Controller** — in `src/controllers/`: render handlers use `definePage({ loader, view })` from `@y-core/forge/app`; the loader marshals `renderContext` + data, the view calls `renderPage()` from `@y-core/forge/render`;
   mutation handlers parse form data → validate against schema → call service → return a `fragmentResponse` (forge fragment helpers)
4. **View** — write the JSX component in `src/views/` accepting typed props from the model (page views own `<Layout>`)
5. **Route** — add a route entry to `src/routes.ts`; bind handler + middleware in `src/router.tsx` via `createController`
6. **Middleware** — add or reuse guard sentinels in `src/app/middleware.ts` if the route
   needs CSRF, rate limiting, origin check, or method enforcement
7. **Tests** — write tests in `tests/` using the `app.request(...)` pattern against the
   full composition root

### 6b. Handler Structure Pattern

A well-formed action handler follows parse → validate → act → respond:

    export async function handleContact(context: RequestContext): Promise<Response> {
      const c = context as AppContext
      const config = c.config
      const formData = await parseFormData(c)
      const result = validateContact(formData)
      if (!result.ok) return fragmentResponse(renderValidationErrors(result.errors), 422)
      const sent = await emailService.send(result.data, config.services.email)
      if (!sent.ok) return fragmentResponse(renderError("Something went wrong."), 500)
      return fragmentResponse(renderSuccess("Message sent!"))
    }

Full-page controllers use `definePage` with a `loader` and a `view`; the view calls `renderPage`:

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

    // src/views/home.tsx — the view owns its Layout composition
    export function HomeView({ ctx, content }: HomeViewProps) {
      return <Layout ctx={ctx}>{/* …main… */}</Layout>
    }

Keep handlers thin. If validation or service logic grows complex, extract it to the
model or service layer respectively.

### 6c. Test Pattern — app.request Against Composition Root

Tests import the production app (or a test-configured variant) and call `app.request`:

    import app from "../src/worker"

    test("GET / returns 200", async () => {
      const res = await app.request("/")
      expect(res.status).toBe(200)
    })

For routes that require CSRF or auth middleware, construct valid tokens using the same
forge utilities the app uses. Test against exact HTML assertions, never substring
matching. Account for HTML-encoded entities in assertion strings.
