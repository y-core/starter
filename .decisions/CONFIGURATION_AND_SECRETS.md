---
title: Configuration and Secrets
description: "AppConfigSchema, appConfig, configStore, env vars, BASE_URL, CSRF_SECRET, EMAIL_API_KEY, TURNSTILE_SECRET_KEY, dev.vars, wrangler.jsonc bindings, ASSETS, LOGS_KV, RATE_LIMITER, securityHeaders, CSP Turnstile"
weight: 27
---

# Configuration and Secrets

> AppConfigSchema, env var bindings, Workers bindings, dev vars setup, CSP policy.
> Complements [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §3,
> [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) (securityHeaders usage).

---

## 0. Quick Reference

- §1 AppConfigSchema: valibot schema for all env-sourced config
- §2 appConfig + configStore: env mapping and lazy-validated Config instance
- §3 Env vars: BASE_URL, CSRF_SECRET, EMAIL_*, TURNSTILE_* — required vs optional
- §4 Workers bindings: ASSETS, LOGS_KV, RATE_LIMITER — wrangler.jsonc declarations
- §5 securityHeaders: production CSP for Turnstile, nonce, self
- §6 .dev.vars: local dev secrets file, test keys, never commit

---

## 1. AppConfigSchema

### 1a. Schema Structure

`AppConfigSchema` in `src/app/config.ts` is the single source of truth for all
configuration the app reads from the environment. It is a valibot `v.object` that
groups config into three domains: `site`, `security`, and `services`.

    export const AppConfigSchema = v.object({
      site: v.object({
        url: v.optional(BaseUrlConfigSchema, "https://yourdomain.com"),
        debug: v.pipe(v.unknown(), v.transform((level) => level === "DEBUG")),
      }),
      security: v.object({ csrf: CsrfConfigSchema }),
      services: v.object({
        email: v.object({
          apiKey: v.string(),
          apiUrl: v.string(),
          from: v.optional(v.string(), "hello@yourdomain.com"),
          senderName: v.string(),
          to: v.optional(v.string(), "hello@yourdomain.com"),
        }),
        turnstile: v.object({ secretKey: v.string(), siteKey: v.string() }),
      }),
    })

`BaseUrlConfigSchema` (from `@y-core/forge/security`) validates the URL and derives
`origin` and `allowedOrigins` from the raw string. `CsrfConfigSchema` (from
`@y-core/forge/form`) validates the hex-encoded HMAC secret.

### 1b. AppConfig Inferred Type

    export type AppConfig = v.InferOutput<typeof AppConfigSchema>
    export type EmailConfig = AppConfig["services"]["email"]

`AppConfig` is the typed shape returned by `configStore.get(c.env)`. Use
`AppConfig` for handler and service function parameters — never the raw `Env`
bindings type. `EmailConfig` is a convenience alias for use in `src/services/email.ts`.

---

## 2. appConfig + configStore

### 2a. appConfig — Env Binding Map

`appConfig` maps `env(...)` references to `AppConfigSchema` fields. The `env(key)`
helper from `@y-core/forge/config` creates a lazy accessor that reads `c.env[key]`
at validation time.

    export const appConfig = {
      site: { url: env("BASE_URL"), debug: env("LOG_LEVEL") },
      security: { csrf: { secret: env("CSRF_SECRET") } },
      services: {
        email: {
          apiKey: env("EMAIL_API_KEY"),
          apiUrl: "https://api.mailchannels.net/tx/v1/send",
          senderName: "Forge Studio",
        },
        turnstile: {
          secretKey: env("TURNSTILE_SECRET_KEY"),
          siteKey: env("TURNSTILE_SITE_KEY"),
        },
      },
    }

`apiUrl` and `senderName` are constants, not env vars — they are embedded directly
rather than wrapped in `env(...)`.

### 2b. configStore — Lazy Validation

    export const configStore = new Config(appConfig, AppConfigSchema)

`configStore` is a module-level singleton of `Config` from `@y-core/forge/config`.
It does not validate env vars at module load time. Validation runs on the first call
to `configStore.get(c.env)` within a given isolate and the result is cached.

If any required env var is absent or fails schema validation, `configStore.get`
throws a descriptive error immediately. The request fails with a 500 rather than
silently proceeding with missing data.

### 2c. Config Access Pattern

Never read `c.env.SOME_VAR` directly in handlers or services. Always go through
`configStore.get(c.env)` so all access is typed and validated:

    // Inside any handler or service function:
    const config = configStore.get(c.env)   // AppConfig — validated, cached
    const baseUrl = config.site.url.origin
    const csrfSecret = config.security.csrf.secret
    const apiKey = config.services.email.apiKey

See [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §3a for the full DI pattern.

---

## 3. Environment Variables

### 3a. Required Env Vars

All required vars must be present at request time. Their absence causes
`configStore.get(c.env)` to throw — the request is never served with missing config.

| Var | Purpose |
|---|---|
| `BASE_URL` | Canonical site origin — CSP `connect-src`, CORS `allowedOrigins`, absolute URLs in HTML |
| `CSRF_SECRET` | HMAC signing key for CSRF tokens — min 32 hex chars (16 bytes) |
| `EMAIL_API_KEY` | Transactional email API key (MailChannels or compatible provider) |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile server-side verification secret |
| `TURNSTILE_SITE_KEY` | Turnstile public site key — embedded in HTML for the widget |

`TURNSTILE_SITE_KEY` is public (it appears in rendered HTML) but is still read via
`configStore` so it participates in startup validation and is not hardcoded.

### 3b. Optional Env Vars

These vars have schema-level defaults. Omitting them does not cause validation failure.

| Var | Default | Notes |
|---|---|---|
| `LOG_LEVEL` | `false` (not debug) | Set to `"DEBUG"` to enable debug logging |
| `EMAIL_FROM` | `hello@yourdomain.com` | Sender address on outbound email |
| `EMAIL_TO` | `hello@yourdomain.com` | Default recipient for contact form submissions |

`LOG_LEVEL` is coerced to a boolean via `v.transform`: any value other than the
string `"DEBUG"` yields `false`. This prevents accidental debug exposure in
production from typos or partial values.

### 3c. Env Var Naming Convention

All env vars are `SCREAMING_SNAKE_CASE`. Group prefixes reflect the schema domain:

- `BASE_URL`, `LOG_LEVEL` — site domain
- `CSRF_SECRET` — security domain
- `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_TO` — email service
- `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY` — turnstile service

This mirrors the nested structure of `AppConfigSchema` (§1a).

---

## 4. Workers Bindings

Workers bindings are declared in `wrangler.jsonc` and surfaced in handlers as
`c.env.*`. The generated `.types/cloudflare.d.ts` produces the `Env` type, which
is aliased as `Bindings` in `src/app/context.ts`.

### 4a. ASSETS Binding — Static Files

    "assets": {
      "binding": "ASSETS",
      "directory": "./public",
      "run_worker_first": false,
      "not_found_handling": "none"
    }

`run_worker_first: false` means Cloudflare serves files from `./public` directly
without invoking the Worker. The Worker only runs for paths that have no matching
static file. `not_found_handling: "none"` delegates 404 handling to the Worker's
`applyAssets` call (which renders the custom not-found view).

`ASSETS` is a `Fetcher` type in `Env`. It is consumed by `applyAssets` from
`@y-core/forge/app` — app code does not call it directly.

### 4b. LOGS_KV Binding — Structured Log Persistence

    "kv_namespaces": [
      { "binding": "LOGS_KV", "id": "logs_kv_local", "preview_id": "logs_kv_local" }
    ]

`LOGS_KV` is a `KVNamespace` binding used by `kvLogChannel` to persist structured
request log records. It is optional — `requestLogger` in `src/app/middleware.ts`
checks `c.env.LOGS_KV` before constructing the channel:

    channels: (c) => c.env.LOGS_KV
      ? [consoleChannel(), kvLogChannel(c.env.LOGS_KV)]
      : [consoleChannel()]

When absent (bun test, local dev without KV), logging falls back to console only.
The `/admin/logs` route is handled by `adminLogsController` which calls `readLogViewer`
from `@y-core/forge/logging/http` internally. See [DATA_STORAGE.md](./DATA_STORAGE.md) §1
for the typed KV access pattern.

### 4c. RATE_LIMITER Binding — DoS Mitigation

    "ratelimits": [
      {
        "name": "RATE_LIMITER",
        "namespace_id": "1001",
        "simple": { "limit": 5, "period": 60 }
      }
    ]

`RATE_LIMITER` enforces 5 requests per 60 seconds per IP on routes that include
`rateLimitGuard`. The binding is `required: false` in `rateLimitGuard` — when
absent it is a no-op. This is acceptable because rate limiting is a DoS mitigation,
not a security-critical auth check. The CSRF and origin guards are unaffected by
`RATE_LIMITER` absence. See [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3b.

---

## 5. securityHeaders — Production CSP

### 5a. Production CSP Declaration

    export const securityHeaders: SecurityHeadersOptions = {
      scriptSrc: ["'self'", NONCE, "https://challenges.cloudflare.com"],
      connectSrc: ["'self'", "https://challenges.cloudflare.com"],
      frameSrc:   ["'self'", "https://challenges.cloudflare.com"],
    }

`securityHeaders` is declared in `src/app/config.ts` and passed to `createWorker`
in `src/worker.ts`. It is the base policy for production. `makeSecurityHeaders`
from `@y-core/forge/security` consumes it and adds the remaining default directives
(`default-src`, `style-src`, `img-src`, `font-src`, etc.).

### 5b. NONCE Sentinel

`NONCE` is a sentinel string exported by `@y-core/forge/security`. It is replaced
per-request by `makeSecurityHeaders` with the actual cryptographic nonce value.
The nonce is also stored in `SecureHeadersContext` so views can read it via
`getNonce(c)` and attach it to inline `<script>` and `<style>` tags.

Never hardcode a literal nonce in `securityHeaders` — use the `NONCE` sentinel.

### 5c. Turnstile CSP Requirements

Cloudflare Turnstile requires `https://challenges.cloudflare.com` in three
directives:

| Directive | Reason |
|---|---|
| `scriptSrc` | Turnstile widget script loaded from this origin |
| `connectSrc` | Widget makes XHR/fetch calls back to this origin for verification |
| `frameSrc` | Widget renders an iframe from this origin |

Removing any of the three causes the Turnstile widget to fail silently or produce
CSP violation errors in the browser console.

### 5d. Dev Entry — Live-Reload Hash

`src/worker.dev.ts` layers one additional `scriptSrc` entry onto the base policy:

    const WRANGLER_LIVE_RELOAD_HASH = "'sha256-g5a3SrOYIecCloZ8S7M4xdT1pbYi6e7mjHrmwphRxfE='"

    export default createWorker(
      mergeSecurityHeaders(securityHeaders, { scriptSrc: [WRANGLER_LIVE_RELOAD_HASH] })
    )

The live-reload hash is dev-only by construction — it lives in `worker.dev.ts` and
never touches `securityHeaders` in `config.ts`. See
[ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §4 for the full rationale.

---

## 6. .dev.vars — Local Dev Secrets

### 6a. .dev.vars Setup

Create a `.dev.vars` file in the project root (already listed in `.gitignore`).
Wrangler reads this file automatically during `wrangler dev` and `wrangler pages dev`
and injects the values as env vars. It is never deployed.

    BASE_URL=http://localhost:8787
    CSRF_SECRET=de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e
    EMAIL_API_KEY=test-key
    TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
    TURNSTILE_SITE_KEY=1x00000000000000000000AA

### 6b. Turnstile Test Keys

The `1x...` keys are Cloudflare's official Turnstile test keys:

- `1x00000000000000000000AA` — site key: always renders the widget
- `1x0000000000000000000000000000000AA` — secret key: always passes server-side verification

Use these in `.dev.vars` and in test environments. Do not use them in production.

### 6c. CSRF_SECRET Generation

Generate a production-grade CSRF secret with:

    openssl rand -hex 32

The output is a 64-character hex string representing 32 bytes of entropy (256-bit key).
`CsrfConfigSchema` enforces a minimum length at startup via valibot validation.

### 6d. Production Secrets — wrangler secret

Never commit production secrets. Use the Wrangler CLI to set them:

    wrangler secret put CSRF_SECRET
    wrangler secret put EMAIL_API_KEY
    wrangler secret put TURNSTILE_SECRET_KEY

Secrets set via `wrangler secret put` are encrypted at rest in the Cloudflare
dashboard and are not visible in `wrangler.jsonc` or source control. `BASE_URL`
and `TURNSTILE_SITE_KEY` are not sensitive (they are public values) but should
still be set via environment variables rather than hardcoded in source.
