---
title: Middleware and Context
description: "applyMiddleware, middleware ordering, makeSecurityHeaders, requestId, requestLogger, CORS, AppEnv, Bindings, Variables, CsrfContext, RequestIdContext, LoggerContext, SecureHeadersContext, contactGuard, rateLimitGuard, csrfVerifyGuard, renderContext"
weight: 21
---

# Middleware and Context

> Authoritative source for applyMiddleware ordering, AppEnv bindings and variables,
> route-level guards, and the renderContext helper.
>
> Complements [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §3,
> [ROUTING.md](./ROUTING.md) (guard usage on routes).

---

## 0. Quick Reference

- §1 applyMiddleware: ordering (security → requestId → logging → CORS)
- §2 AppEnv / AppContext: Bindings (Env), render method, ForgeAppContext
- §3 Route guards: contactGuard, rateLimitGuard, csrfVerifyGuard
- §4 renderContext: per-request presentation values (nonce, csrfToken, baseUrl, turnstile)
- §5 Context accessors: getNonce, requestIdCtx.getOptional — never reach into raw context
- §6 CORS scope: /api/* only, allowedOrigins from config, not hardcoded
- §7 Guard ordering: cheap checks first (method/origin/header), expensive last (HMAC)
- §8 required: false on optional bindings — degrades gracefully, never skips security

---

## 1. applyMiddleware — Global Middleware Stack

### 1a. Middleware Ordering

    export function applyMiddleware(app: Forge<AppEnv>, security: SecurityHeadersOptions): void {
      app.use("*", makeSecurityHeaders(security))            // 1. CSP/HSTS/XFO + nonce
      app.use("*", requestId())                              // 2. X-Request-Id + context var
      app.use("*", requestLogger<AppEnv>({...}))             // 3. request/response logging
      app.use("/api/*", cors({ origins }))                   // 4. CORS for API routes only
    }

Order is security-critical. `makeSecurityHeaders` must run first because it injects the
per-request nonce into context — any middleware or handler that reads `getNonce(c)` depends
on this running before it. `requestId` must run before `requestLogger` because the logger
reads the request ID from context when building log entries.

### 1b. makeSecurityHeaders — CSP and Nonce

`makeSecurityHeaders(security)` from `@y-core/forge/security` does two things per request:

1. Generates a fresh cryptographic nonce and stores it in `SecureHeadersContext`.
2. Writes `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`,
   `X-Content-Type-Options`, and related headers to the response.

The `security` argument (`SecurityHeadersOptions`) is constructed in `worker.ts` (prod) and
`worker.dev.ts` (dev). Dev adds the Wrangler live-reload hash to `scriptSrc`. See
[PRODUCTION_RULES.md](./PRODUCTION_RULES.md) §4c for the only allowed prod/dev divergence.

### 1c. requestId — X-Request-Id Propagation

`requestId()` from `@y-core/forge/security`:

- Reads the incoming `X-Request-Id` header if present (upstream set it).
- Generates a new UUID v4 if absent.
- Stores the ID in `RequestIdContext` via `requestIdCtx`.
- Echoes the final ID back on the response as `X-Request-Id`.

Access in handlers:

    const reqId = requestIdCtx.getOptional(c)  // string | undefined

### 1d. requestLogger — Channel Selection

    requestLogger<AppEnv>({
      channels: (c) => c.env.LOGS_KV
        ? [consoleChannel(), kvLogChannel(c.env.LOGS_KV)]
        : [consoleChannel()],
      bindings: (c) => ({ requestId: requestIdCtx.getOptional(c) }),
    })

`LOGS_KV` absent (bun test, local dev without binding) → console only.
`LOGS_KV` present (deployed Workers) → dual output: console + KV persistence.

The `bindings` callback enriches every log entry with the request ID. Because `requestId()`
runs before `requestLogger`, the ID is always available when logging starts.

### 1e. CORS: /api/* Only

CORS response headers are applied only to `/api/*` routes. The `allowedOrigins` list is
derived from `configStore.get(c.env).site.url.allowedOrigins` — never hardcoded. Applying
CORS globally (`"*"`) would be incorrect; non-API routes serve HTML and have no
cross-origin caller.

---

## 2. AppEnv and AppContext

### 2a. AppEnv — Bindings Type

`AppEnv` is an alias for the generated `Env` type from `.types/cloudflare.d.ts`. Key bindings:

    type AppEnv = Env
    // ASSETS:               Fetcher       — static asset passthrough to public/
    // LOGS_KV:              KVNamespace   — optional, structured log persistence
    // RATE_LIMITER:         RateLimiter   — optional, 5 req / 60 s per IP
    // BASE_URL:             string        — canonical origin, e.g. https://example.com
    // LOG_LEVEL:            string        — "debug" | "info" | "warn" | "error"
    // CSRF_SECRET:          string        — required, hex-encoded HMAC key
    // EMAIL_API_KEY:        string        — required for email delivery
    // TURNSTILE_SECRET_KEY: string        — Cloudflare Turnstile server-side key

`LOGS_KV` and `RATE_LIMITER` are optional — their absence does not cause startup failures;
the relevant middleware degrades gracefully (`required: false`). All other bindings listed
above are required and will cause `configStore.get(c.env)` to throw at parse time if absent.

### 2b. Context Variables — Typed Accessors

Context variables set by global middleware are accessed via forge's typed helpers, never
via `c.get(...)` or `c.set(...)` directly:

    const nonce    = getNonce(c)                  // set by makeSecurityHeaders()
    const reqId    = requestIdCtx.getOptional(c)  // set by requestId()
    const logger   = requestLog.get(c)            // set by requestLogger()

Do not add ad-hoc context keys without a corresponding middleware that sets them on every
request.

### 2c. AppContext Type

    type AppContext = ForgeAppContext<AppEnv, Record<string, string>, AppConfig>

`AppContext` is the type for `c` in all handlers and middleware. Import `AppContext`
from `src/app/context.ts` — do not reconstruct inline.

Full-page controllers use `definePage({ loader, view })` from `@y-core/forge/app`. The
`loader` receives `(c, config)` and returns data; the `view` receives `(c, config, state)`
and calls `renderPage(<View …/>)` from `@y-core/forge/render`. The controller materializes
`ctx` via `renderContext` in the `loader` and passes it as a view prop.

### 2d. Accessing Context Variables

Always use the typed accessors exported by forge — never access raw context internals:

    const nonce = getNonce(c)                  // set by makeSecurityHeaders
    const reqId = requestIdCtx.getOptional(c)  // set by requestId(); undefined if unset
    const logger = requestLog.get(c)           // set by requestLogger()

Direct access to raw context internals bypasses the typed interface and will break if the
underlying accessor key changes.

### 2e. Config Access Pattern

Config is not a context variable. It is parsed on demand from `c.env`:

    const config = configStore.get(c.env)    // parses and validates env bindings
    const { origin } = config.site.url
    const { siteKey } = config.services.turnstile

`configStore.get` is memoized per env object — the parse cost is paid once per request
lifecycle, not once per call.

---

## 3. Route Guards

Guards are `Middleware` values composed into route middleware arrays. They are not
applied globally — each is scoped to specific routes via `createController` in
`src/router.tsx`. See [ROUTING.md](./ROUTING.md) for how they are attached to routes.

### 3a. contactGuard

    export const contactGuard: Middleware = async (context, next) => {
      const c = context as AppContext
      if (c.method !== "POST") return new Response("Forbidden", { status: 403 })
      const { allowedOrigins } = configStore.get(c.env).site.url
      if (!verifyOrigin(c.request, allowedOrigins).ok) return new Response("Forbidden", { status: 403 })
      if (c.request.headers.get("HX-Request") !== "true") return new Response("Forbidden", { status: 403 })
      const ct = c.request.headers.get("content-type") ?? ""
      if (!ct.includes("application/x-www-form-urlencoded")) return new Response("Unsupported Media Type", { status: 415 })
      return next()
    }

Four sequential checks, each fail-closed (returns error, never `next()` on failure):

1. **Method** — rejects non-POST immediately (cheapest check).
2. **Origin** — uses `verifyOrigin` from `@y-core/forge/security`; checks `Origin` and
   `Referer` headers against `allowedOrigins`.
3. **HX-Request** — enforces HTMX context; prevents direct browser-form submissions.
4. **Content-Type** — requires `application/x-www-form-urlencoded`; rejects JSON bodies.

### 3b. rateLimitGuard

    export const rateLimitGuard: Middleware = (context, next) =>
      rateLimit<AppEnv>({
        limiter: (c) => c.env.RATE_LIMITER,
        required: false,
      })(context, next)

`required: false` means the guard is a no-op when `RATE_LIMITER` is absent (bun test, local
dev). When present, the Cloudflare Rate Limiter binding enforces 5 requests per 60 seconds
per IP. Exhausted requests receive a 429 response from the binding itself.

This is not a security bypass — rate limiting is a DoS mitigation, not an auth check. The
security-critical guards (`contactGuard`, `csrfVerifyGuard`) are unaffected by
`RATE_LIMITER` absence.

### 3c. csrfVerifyGuard

    export const csrfVerifyGuard = csrfProtection({
      secret: async (c) => importCsrfKey(configStore.get(c.env).security.csrf.secret),
    })

`csrfProtection` from `@y-core/forge/form` reads the CSRF token from the request's
form data and verifies it against an HMAC signed with the config secret. Returns 403 if
the token is absent, malformed, expired, or has an invalid signature.

`importCsrfKey` converts the raw hex secret from `c.env.CSRF_SECRET` into a `CryptoKey`
for use with the Web Crypto API. Key import happens per-request — it is not cached at the
module level because the secret may differ between requests in test environments.

### 3d. Guard Ordering on /api/contact

    // src/router.tsx — createController actions
    contact: { middleware: contactGuards, handler: handleContact }
    // contactGuards = createMiddleware(contactGuard, rateLimitGuard, csrfVerifyGuard)

Guards execute left-to-right. Order reflects cost and specificity:

1. `contactGuard` — cheap header checks, eliminates invalid requests early.
2. `rateLimitGuard` — network call to Cloudflare binding; only reached if headers pass.
3. `csrfVerifyGuard` — Web Crypto HMAC verification; most expensive, last to run.

This ordering minimises compute on abusive or malformed requests. See
[PRODUCTION_RULES.md](./PRODUCTION_RULES.md) §8 for the fail-closed requirement.

---

## 4. renderContext — Per-Request Presentation Values

### 4a. renderContext Function

    export async function renderContext(
      c: ForgeAppContext<AppEnv>,
      config: AppConfig,
      csrfPath?: string
    ): Promise<RenderContext> {
      return {
        baseUrl: config.site.url.origin,
        csrfToken: csrfPath ? await mintCsrf(c, csrfPath) : "",
        nonce: getNonce(c),
        turnstileSiteKey: config.services.turnstile.siteKey,
      }
    }

Called in the `loader` of a `definePage` controller. The third argument is the CSRF action path
as a plain string — e.g. `renderContext(c, config, routes.contact.href())`. Controllers that
omit `csrfPath` (e.g. the 404 controller and adminLogs) receive an empty token. Because
`mintCsrf` is async (it signs a token with Web Crypto), the function is async.

### 4b. RenderContext Type

    interface RenderContext {
      baseUrl?: string             // canonical origin for absolute URLs in HTML
      csrfToken: string            // placed in a hidden form input
      nonce: string                // placed on inline <script> and <style> elements
      turnstileSiteKey?: string    // Cloudflare Turnstile widget site key
    }

`baseUrl` and `turnstileSiteKey` are optional because they may be absent in minimal
configurations (e.g., testing without Turnstile). `csrfToken` and `nonce` are always
present — they are required for every form and every inline script respectively.

### 4c. mintCsrf Scope

`mintCsrf(c, csrfPath)` mints a token scoped to the given action path. The path argument
is included in the HMAC payload, so a token minted for one endpoint cannot be replayed
against another. Each page render mints a fresh token. The controller passes the path directly to
`renderContext(c, config, routes.contact.href())`.

### 4d. nonce Propagation to Views

The `nonce` from `renderContext` must be passed to every JSX component that renders an
inline `<script>` or `<style>` tag:

    // In a view component:
    <script nonce={nonce}>...</script>

Omitting `nonce` on inline scripts will cause the browser to block execution under the
app's CSP. The `nonce` value is already present in the `Content-Security-Policy` header
because `makeSecurityHeaders` (§1b) set it before the handler ran.
