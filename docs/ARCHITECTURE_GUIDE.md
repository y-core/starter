---
title: Architecture Guide
description: "The createWorker composition root, this app's layer directories, the dev and production entry split, and typed config access."
---

# Architecture Guide

> Authoritative source for forge-starter's layer structure, composition root,
> factory pattern, and feature development sequence.
>
> Complements `CODE_RULES.md` (coding rules),
> [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) (middleware ordering),
> [ROUTING.md](./ROUTING.md) (route definitions).

---

## 0. Quick Reference

- §1 createWorker factory: composition root, dev/prod entry split
- §1a createWorker(security) — Composition Root
- §1b Composition Order Inside createWorker
- §1c Production Default Export
- §2 Layer stack: worker → app/ → routes → handlers → services → views → model
- §2a Source Layer Structure
- §2b Layer Dependency Rules
- §2c No Layer Skipping — Handler → Service Boundary
- §3 DI via Config: configStore.get(c.env), AppEnv bindings
- §3a configStore.get(c.env) — The Injection Point
- §3b AppEnv and AppContext — Type Parameters
- §3c renderContext — Per-Request Presentation State
- §4 Dev/prod CSP split: live-reload hash in worker.dev.ts only
- §4a src/worker.dev.ts — Dev Entry Point
- §4b Why the Hash Is Dev-Only
- §5 Leverage forge first rule: consume forge namespaces before writing app code
- §6 Feature development sequence: 7-step order

---

## 1. createWorker Factory Pattern

### 1a. createWorker(security) — Composition Root

`src/worker.ts` exports a factory function that accepts `SecurityHeadersOptions`:

    export function createWorker(security: SecurityHeadersOptions) {
      const app = createApp<AppEnv>({
        config: configStore,
        shell: appShell,
        isDebug: (c) => configStore.get(c.env).site.debug,
        notFound: notFoundController,
      })
      registerMiddleware(app, security)
      app.map(routes, controller)
      applyAssets(app)
      return app
    }
    export default createWorker(securityHeaders)  // production default

The factory accepts `SecurityHeadersOptions` because the CSP policy differs between
environments: production passes the base `securityHeaders`; dev layers the Wrangler
live-reload hash on top via `mergeSecurityHeaders`.

### 1b. Composition Order Inside createWorker

The four steps inside the factory execute in a fixed order:

1. `createApp` — Forge app with Config integration, the shell, the debug flag, and the `notFound` hook
2. `registerMiddleware` — security headers, request ID, logger, CORS for `/api/*`
3. `app.map(routes, controller)` — mounts routes from `src/routes.ts` + handlers from `src/router.tsx`
4. `applyAssets` — static asset serving

Middleware must be applied before routes so that security headers and request context
are set before any handler runs. `applyAssets` is last because it catches all
unmatched paths.

`notFoundController` is registered on `createApp`, not on `applyAssets`: it is the router's no-match
answer **and** what the asset catch-all renders when the binding declines, so an unmatched URL gets
the same page whether or not `ASSETS` is bound.

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
      middleware.ts        ← registerMiddleware(), route guard sentinels (rateLimitGuard, csrfVerifyGuard)
    src/routes.ts          ← declarative route map (route({ home: get("/"), … }))
    src/router.tsx         ← createController binding (controller/middleware mapping)
    src/controllers/       ← plain controllers (definePage handlers + HTMX mutation handlers)
    src/services/          ← external integrations (email, turnstile)
    src/views/             ← forge JSX view components (@jsxImportSource @y-core/forge); layout.tsx is the shell's
    src/model/             ← domain types and valibot schemas
    src/client/main.ts     ← browser JS (esbuild entry point)
    src/assets/            ← tailwind.css, SVG assets

### 2b. Layer Dependency Rules

Each layer may only import from the layers listed:

| Layer               | May import from                                                        |
| ------------------- | ---------------------------------------------------------------------- |
| `controllers/`      | `services/`, `model/`, `app/`, `views/`, `routes`, `@y-core/forge/jsx` |
| `services/`         | `model/`, `app/config`                                                 |
| `views/`            | `model/`, `app/context`, `views/layout`                                |
| `app/middleware.ts` | `app/config`, forge (`security`, `form`, `logging`)                    |
| `routes.ts`         | (route data only — no handlers or views)                               |
| `router.tsx`        | `controllers/`, `app/middleware`                                       |
| `worker.ts`         | `routes.ts`, `router.tsx`, `controllers/`, `app/`                      |

Controllers must not import from other controllers. Services must not import from controllers or views.
Views must not own business rules or call services directly. Only `app/shell.tsx` imports `views/layout` —
a page view renders a `<main>` and reaches the chrome through the shell.

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

### 3a. configStore.get(c.env) — The Injection Point

**`configStore` is this app's whole DI mechanism** — there is no container and no provider
registry. A controller resolves the validated `AppConfig` once and passes it down; a service
receives it as a parameter (§2c) rather than importing `configStore`, which is what keeps
`services/` testable without a Worker environment and is why §2b allows it `app/config` at all.

The call pattern, and the rule against reading `c.env` directly, are
[CONFIGURATION_AND_SECRETS.md](./CONFIGURATION_AND_SECRETS.md) §2c. `src/app/config.ts` owns the
schema behind it.

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

- `nonce` — extracted from context (set by `createSecurityHeaders`)
- `csrfToken` — minted only when `csrfPath` is provided; empty string for pages without forms
- `baseUrl` — `config.site.url.origin`
- `turnstileSiteKey` — from `config.services.turnstile.siteKey`

`appShell` calls `renderContext` once per request, so most controllers never build one. The home
controller is the exception: its contact form needs a path-bound CSRF token and the Turnstile site
key, so its `loader` calls `renderContext(c, config, routes.contact.href())` and passes the result
as a view prop. A controller's `view` calls `renderShell(c, content, slot, init?)` from
`@y-core/forge/app`, which renders the content through the registered shell and returns an
`HtmlResponse`. Views remain pure rendering functions that return a `<main>`.

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

See `FORGE_CONSUMPTION.md` §1 for the leverage-the-library-first
rule, the capability classes forge owns, and the four categories that legitimately stay app code.

---

## 6. Feature Development Sequence

See `APP_ARCHITECTURE.md` §5 for the feature development sequence
and the parse-validate-act-respond handler shape. This app's concrete layer directories are §2.
