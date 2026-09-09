---
title: Middleware and Context
description: "The registered middleware chain, the guard sentinels each route composes, and the typed context accessors this app reads."
---

# Middleware and Context

> Authoritative source for registerMiddleware ordering, AppEnv bindings and variables,
> route-level guards, and the renderContext helper.
>
> Complements [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §3,
> [ROUTING.md](./ROUTING.md) (guard usage on routes).

---

## 0. Quick Reference

- §1 registerMiddleware: ordering (requestId → security → bindings → logging → CORS)
- §1a Middleware Ordering
- §1b createSecurityHeaders — CSP and Nonce
- §1c requestId — X-Request-Id Propagation
- §1d requestLogger — Channel Selection
- §1e CORS: /api/* Only
- §2 AppEnv and AppContext: Bindings (Env), render method, ForgeAppContext
- §2a AppEnv — Bindings Type
- §2b Context Variables — Typed Accessors
- §2c AppContext Type
- §2d Accessing Context Variables
- §2e Config Access Pattern
- §3 Route guards: requireFormContentType, htmxOnlyGuard, originGuard, rateLimitGuard, csrfVerifyGuard
- §3a requireFormContentType, htmxOnlyGuard, originGuard
- §3b rateLimitGuard
- §3c csrfVerifyGuard
- §3d Guard Ordering on /api/contact
- §4 renderContext: per-request presentation values (nonce, csrfToken, baseUrl, turnstile)
- §4a renderContext Function
- §4b RenderContext Type
- §4c mintCsrf Scope
- §4d nonce Propagation to Views

---

## 1. registerMiddleware — Global Middleware Stack

### 1a. Middleware Ordering

    export function registerMiddleware(app: Forge<AppEnv>, security: SecurityHeadersOptions): void {
      app.use("*", requestId({ trustCfHeaders: true }))        // 1. X-Request-Id + context var
      app.use("*", createSecurityHeaders(security))            // 2. CSP/HSTS/XFO + nonce
      app.use("*", validateBindings(bindingSetSchema([...])))  // — binding shape, once per env
      app.use("*", requestLogger<AppEnv>({...}))               // 3. request/response logging
      app.use("/api/*", cors({ origins }))                     // 4. CORS for API routes only
    }

Order is security-critical. The four numbered entries are BOUNDARIES §2a in full — request identity
→ security headers → logging → cross-origin. `requestId` runs first so that anything downstream,
including a refusal raised by a later middleware, is correlatable; `createSecurityHeaders` runs
before the rest because it queues the response headers ahead of the downstream chain, so a later
throw still yields a hardened error page, and because it injects the per-request nonce that anything
reading `getNonce(c)` depends on; `requestLogger` runs after both, since it reads the request ID
when building log entries.

The binding check is this app's own addition, placed _within_ that order rather than being part of
it. It sits after the headers because a shape refusal throws: run first, its 500 escapes before the
headers exist. Measured on the real chain, a `LOGS_KV` of the wrong shape loses
`Strict-Transport-Security`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
`X-Frame-Options` and `X-Request-Id` when the throw precedes the headers, and keeps all five when it
follows them — an error page with no framing protection and no correlation id. (CSP,
`X-Content-Type-Options` and `Referrer-Policy` survive either way; the error boundary supplies a
minimal set.) It sits before `requestLogger` because that middleware builds
`kvLogChannel(c.env.LOGS_KV)`, so a malformed KV binding must be refused before the logger reads it.
`validateBindings` caches the validated `env` reference, so the shape check costs one pass per
isolate rather than one per request, and its position costs nothing. Both bindings are declared
`optional: true` — an absent one passes, because the code degrades (console-only logging, a no-op
limiter), while one present with the wrong shape still fails.

`trustCfHeaders: true` is deliberate: Cloudflare strips and re-writes `CF-*` headers at the edge, so
on Workers they are trustworthy. Forge defaults to distrust because the same code behind a bare
proxy would let a caller forge them.

The chain continues past the snippet with the session and the identity: `authSessionGuard`, then
`navIdentityGuard`, then the CSRF guards and the auth guard groups. `navIdentityGuard` wraps forge's
`resolveAuth` and **admits everyone** — it establishes an identity where the session carries one and
leaves an anonymous request untouched; what a visitor may reach is decided by the guards after it.
It runs on every path but `/api/*`, because the shared navbar renders on all of them, the 404 page
included, and the JSON API is the one prefix that would read the user store for an identity nothing
in its response depends on. A `requireAuth` further down reuses what it established rather than
resolving again, so a guarded route costs one store read, not two.

### 1b. createSecurityHeaders — CSP and Nonce

`createSecurityHeaders(security)` from `@y-core/forge/security` does two things per request:

1. Generates a fresh cryptographic nonce and stores it in `SecureHeadersContext`.
2. Writes `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`,
   `X-Content-Type-Options`, and related headers to the response.

The `security` argument (`SecurityHeadersOptions`) is constructed in `worker.ts` (prod) and
`worker.dev.ts` (dev). Dev adds the Wrangler live-reload hash to `scriptSrc`. See
`APP_ARCHITECTURE.md` §1c for why the divergence is a separate entry module rather than a runtime flag.

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

`AppEnv` is an alias for the generated `Env` type from `.types/worker-configuration.d.ts`. Key
bindings:

    type AppEnv = Env
    // ASSETS:               Fetcher       — static asset passthrough to public/
    // LOGS_KV:              KVNamespace   — optional, structured log persistence
    // RATE_LIMITER:         RateLimiter   — optional, 5 req / 60 s per IP
    // SITE_ORIGIN:          string        — optional; falls through to the `SITE_ORIGIN` literal in src/app/config.ts
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

    const nonce    = getNonce(c)                  // set by createSecurityHeaders()
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
and calls `renderShell(c, <View …/>, slot)` from `@y-core/forge/app`. The shell materializes
`ctx` via `renderContext`, so a controller builds one only when it needs a CSRF token or the
Turnstile site key — which today is the home controller alone.

### 2d. Accessing Context Variables

Always use the typed accessors exported by forge — never access raw context internals:

    const nonce = getNonce(c)                  // set by createSecurityHeaders
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

### 3a. requireFormContentType, htmxOnlyGuard, originGuard

The three transport guards. The first is forge's, imported and called; the other two are this
app's, and each holds exactly one check.

    // @y-core/forge/security — 415 unless the media type is a form encoding.
    requireFormContentType()

    // src/app/middleware.ts
    export const htmxOnlyGuard: Middleware = (context, next) => {
      const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context)
      return isHxRequest(c) ? next() : new Response("Forbidden", { status: 403 })
    }

    export const originGuard: Middleware = originProtection<AppEnv>({
      allowedOrigins: (c) => configStore.get(c.env).site.url.allowedOrigins,
    })

1. **Content-Type** — `requireFormContentType()` accepts `application/x-www-form-urlencoded` and
   `multipart/form-data`, normalising the media type case-insensitively and stripping parameters
   before comparing. A hand-written `ct.includes(...)` gets both wrong.
2. **HX-Request** — `isHxRequest` from `@y-core/forge/html/htmx`, not a raw header read. Enforces
   the HTMX context; the route answers only fragments, which are unusable to any other client.
3. **Origin** — `originProtection` layers Fetch-Metadata over the `allowedOrigins` allowlist. It is
   strictly stronger than a bare `verifyOrigin`, which accepts a request carrying neither `Origin`
   nor `Referer`.

There is no method check: `routes.contact` is `post(...)`, so the router answers 405 before any
middleware runs.

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
security-critical guards (`originGuard`, `csrfVerifyGuard`) are unaffected by
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
    contact: { middleware: contactGuards, handler: contactAction }
    // contactGuards = createMiddleware(requireFormContentType(), htmxOnlyGuard, originGuard, rateLimitGuard, csrfVerifyGuard)

Guards execute left-to-right, in BOUNDARIES §2c order — request shape, origin, rate limit, CSRF:

1. `requireFormContentType()`, `htmxOnlyGuard`, `originGuard` — header inspection with no crypto,
   eliminating malformed and cross-origin requests first.
2. `rateLimitGuard` — network call to the Cloudflare binding; only reached if the headers pass.
3. `csrfVerifyGuard` — Web Crypto HMAC verification; most expensive, last to run.

This ordering minimises compute on abusive or malformed requests. See
`BOUNDARIES.md` §2c for the ordering rule and `BOUNDARIES.md` §5 for the fail-closed
requirement.

---

## 4. renderContext — Per-Request Presentation Values

### 4a. renderContext Function

    export async function renderContext(
      c: ForgeAppContext<AppEnv>,
      config: AppConfig,
      csrfPath?: string
    ): Promise<RenderContext> {
      return {
        nav: await resolveNav(c),
        baseUrl: config.site.url.origin,
        csrfToken: csrfPath ? await mintCsrf(c, csrfPath) : "",
        nonce: getNonce(c),
        turnstileSiteKey: config.services.turnstile.siteKey,
      }
    }

Called in the `loader` of a `definePage` controller. The third argument is the CSRF action path
as a plain string — e.g. `renderContext(c, config, routes.contact.href())`. Controllers that
omit `csrfPath` (e.g. the 404 controller and the log viewer) receive an empty token. Because
`mintCsrf` is async (it signs a token with Web Crypto), the function is async.

### 4b. RenderContext Type

    interface RenderContext {
      baseUrl?: string             // canonical origin for absolute URLs in HTML
      csrfToken: string            // placed in a hidden form input
      nonce: string                // placed on inline <script> and <style> elements
      turnstileSiteKey?: string    // Cloudflare Turnstile widget site key
      nav: AuthNav                 // spread onto Navbar: activeFilters and slots
    }

`baseUrl` and `turnstileSiteKey` are optional because they may be absent in minimal
configurations (e.g., testing without Turnstile). `csrfToken` and `nonce` are always
present — they are required for every form and every inline script respectively.

`nav` is forge's `authNav` answering for this request: the filter tokens the viewer holds, and
the sign-out control when they have a session to end. `resolveNav` is wired once at module scope
in `context.ts`, not per request, so the signing key is imported once per isolate rather than
once per page. An anonymous request gets the tokens and an empty slot map, and mints nothing.
See `UI_GUIDE.md` §6d for what that means for caching.

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
because `createSecurityHeaders` (§1b) set it before the handler ran.
