---
title: Configuration and Secrets
description: "The AppConfigSchema fields, the environment variables and Workers bindings behind them, and how secrets reach the Worker."
---

# Configuration and Secrets

> AppConfigSchema, env var bindings, Workers bindings, dev vars setup, CSP policy.
> Complements [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §3,
> [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) (securityHeaders usage).

---

## 0. Quick Reference

- §1 AppConfigSchema: valibot schema for all env-sourced config
- §1a Schema Structure
- §1b AppConfig Inferred Type
- §2 appConfig + configStore: env mapping and lazy-validated Config instance
- §2a appConfig — Env Binding Map
- §2b configStore — Lazy Validation
- §2c Config Access Pattern
- §3 Environment Variables: SITE_ORIGIN, CSRF_SECRET, EMAIL_*, TURNSTILE_* — required vs optional
- §3a Required Env Vars
- §3b Optional Env Vars
- §3c Env Var Naming Convention
- §3d SITE_ORIGIN — four declarations, and wrangler.jsonc is none of them
- §3e TURNSTILE_DEV_HOSTNAME — the three local postures
- §4 Workers bindings: ASSETS, LOGS_KV, RATE_LIMITER — wrangler.jsonc declarations
- §4a ASSETS Binding — Static Files
- §4b LOGS_KV Binding — Structured Log Persistence
- §4c RATE_LIMITER Binding — DoS Mitigation
- §5 securityHeaders: production CSP for Turnstile, nonce, self
- §5a Production CSP Declaration
- §5b NONCE Sentinel
- §5c Turnstile CSP Requirements
- §5d Dev Entry — Live-Reload Hash
- §6 .dev.vars: local dev secrets file, test keys, never commit
- §6a .dev.vars Setup
- §6b Turnstile Test Keys
- §6c CSRF_SECRET Generation
- §6d Production Secrets — wrangler secret

---

## 1. AppConfigSchema

### 1a. Schema Structure

`AppConfigSchema` in `src/app/config.ts` is the single source of truth for all
configuration the app reads from the environment. It is a valibot `v.object` that
groups config into three domains: `site`, `security`, and `services`.

    export const AppConfigSchema = v.object({
      site: v.object({
        url: BaseUrlConfigSchema,
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
      site: { url: env("SITE_ORIGIN"), debug: env("LOG_LEVEL") },
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
| `SITE_ORIGIN` | the `SITE_ORIGIN` literal in `src/app/config.ts` | Canonical site origin — CSP `connect-src`, CORS `allowedOrigins`, absolute URLs in HTML. See §3d |
| `LOG_LEVEL` | `false` (not debug) | Set to `"DEBUG"` to enable debug logging |
| `EMAIL_FROM` | `hello@yourdomain.com` | Sender address on outbound email |
| `EMAIL_TO` | `hello@yourdomain.com` | Default recipient for contact form submissions |
| `TURNSTILE_DEV_HOSTNAME` | none — the site origin's hostname is used | The hostname a Turnstile siteverify answer is held against, honoured only by the dev entry. See §3e |

`LOG_LEVEL` is coerced to a boolean via `v.transform`: any value other than the
string `"DEBUG"` yields `false`. This prevents accidental debug exposure in
production from typos or partial values.

### 3c. Env Var Naming Convention

All env vars are `SCREAMING_SNAKE_CASE`. Group prefixes reflect the schema domain:

- `SITE_ORIGIN`, `LOG_LEVEL` — site domain
- `CSRF_SECRET` — security domain
- `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_TO` — email service
- `TURNSTILE_SECRET_KEY`, `TURNSTILE_SITE_KEY`, `TURNSTILE_DEV_HOSTNAME` — turnstile service

This mirrors the nested structure of `AppConfigSchema` (§1a).

### 3d. SITE_ORIGIN — four declarations, and `wrangler.jsonc` is none of them

    // src/app/config.ts
    export const SITE_ORIGIN = "https://forge-starter.workers.dev"

    url: v.pipe(v.optional(v.string(), SITE_ORIGIN), BaseUrlConfigSchema)
    site: { url: env("SITE_ORIGIN"), … }

The origin lives in **exactly four places**, one per mutually exclusive case: the literal above,
which is production's value and the fallback when the environment carries none; `.dev.vars`, which
sets the dev origin; the `--var SITE_ORIGIN` on `dev:browser` in `package.json`, which points the
browser suite at `https://localhost:8787`; and the env file `tests/workerd/dev-server.ts` generates
per run, which names the loopback port that run reserved. A fifth spelling in `wrangler.jsonc`'s
`vars` would be one nothing checks, so there is none.

The workerd suite writes a file rather than passing `--var` because wrangler merges `.dev.vars` in
underneath either way, and CI has no such file at all — so the suite would read one environment on a
developer's machine and another in CI. `--env-file` replaces that discovery outright. Its value is `https://127.0.0.1:<port>` even though
the listener is http, because the dev server stamps its local protocol onto every origin-bearing
header before the Worker sees it (`WORKERS_PLATFORM.md` §4e) — an http origin there 403s every
request the suite makes.

Each case has a single browser origin, so `SITE_ORIGIN` always names the origin the browser is
actually pointed at — the posture `WORKERS_PLATFORM.md` §4e rules on, and the single source the
allowed-origin set derives from. The `extraOrigins` escape hatch exists to allow a *second* origin in
one running worker, and no case here needs one.

**The literal is a value, not an `env()` read.** `env()` returns a mapping marker `createConfig`
resolves per request, and a Worker has no module-scope environment to read anyway. Exporting it also
lets a build-time module import the origin at load — the shape a site-config module takes in
sibling apps.

**The default is this app's own origin, never a placeholder.** A `yourdomain.com` fallback would
derive an `allowedOrigins` naming somebody else's host, and every mutation would 403 with the
misconfiguration invisible. `forge-starter.workers.dev` is the origin this Worker actually gets
when deployed with no custom domain, so the fallback allowlists only itself.

**Nothing is lost by having a default.** The dev server still cannot boot without `.dev.vars`,
because `CSRF_SECRET` has none — so a missing `.dev.vars` is still loud.

### 3e. TURNSTILE_DEV_HOSTNAME — the three local postures

`verifyTurnstile` refuses when siteverify's answer names a hostname other than the one the app
expects. Cloudflare's "always passes" testing keys answer `hostname: "example.com"` whatever origin
the widget actually ran on, so an app that expects its own hostname refuses every local submission —
and refuses it as a 422 naming the schema's first field, because a tripped guard is deliberately
indistinguishable from a validation failure on the response alone. That is `bug-260908-17`, and it
had failed every dev submission since the testing keys were adopted.

`TURNSTILE_DEV_HOSTNAME` names the hostname to expect instead. The three postures it serves:

| Posture | Keys | `TURNSTILE_DEV_HOSTNAME` |
|---|---|---|
| Local dev with no Cloudflare account | the `1x…` testing keys (§6b) | `example.com` |
| Local dev proving production parity | real keys from `dash.cloudflare.com/turnstile`, dev hostname allowed on the site | omitted — siteverify returns the browser's own hostname |
| `tests/workerd/` | the testing keys | `example.com`, from the generated env file |

**The value rides on config; the permission to consult it does not.** A Worker has no module-scope
environment, so the hostname has to reach the request through `AppConfigSchema` like every other
value. What decides whether it is read at all is `src/worker.dev.ts`, which registers the
`turnstileHostname` middleware that publishes it to `turnstileHostnameCtx`. `src/worker.ts` registers
nothing of the kind, so on the production entry the accessor is unset for every request and the
comparison is `config.site.url.hostname` — whatever the environment says.

Setting the variable in production is therefore **inert, not dangerous**, which is the whole reason
for the shape: an extra allowance supplied from a development entry point the production bundle never
imports, rather than a production code path made conditional on the environment
(`WORKERS_PLATFORM.md` §4e). It is the same construction that keeps the Wrangler live-reload CSP hash
out of production (§5d). `tests/routes.test.ts` pins it: `TURNSTILE_DEV_HOSTNAME` is set in
`MINIMUM_ENV` for every case, and the production worker still refuses a token verified against it.

---

## 4. Workers Bindings

Workers bindings are declared in `wrangler.jsonc` and surfaced in handlers as
`c.env.*`. The generated `.types/worker-configuration.d.ts` produces the `Env`
type, which is aliased as `Bindings` in `src/app/context.ts`. (`cloudflare.d.ts`
is generated `--no-include-env` and declares only an empty `Env` for the runtime
types to merge into.)

### 4a. ASSETS Binding — Static Files

    "assets": {
      "binding": "ASSETS",
      "directory": "./public",
      "run_worker_first": [
        "/*",
        "!/favicon.ico", "!/favicon.svg", "!/apple-touch-icon.png",
        "!/icon-192.png", "!/icon-512.png", "!/site.webmanifest"
      ],
      "not_found_handling": "none"
    }

The Worker runs first for every path, except the six files `icons.outputs` writes to the asset
root — those are served straight off the asset layer, with no `fetch` event. `not_found_handling:
"none"` delegates 404 handling to the Worker's `applyAssets` call (which renders the custom
not-found view).

**The list is not decoration: the gate holds it in sync.** `validate-asset-root` diffs what
`config/assets.ts` writes into the asset root against the `!`-prefixed rules here, so adding a new
root-level output without its exclusion fails `bun run verify`. That is why `config/steps.ts`
passes `workerConfig` as well as `assetConfig` — the preset emits the row only when it has both.

This replaced a plain `run_worker_first: false` at the 0.1.2 upgrade. The boolean served every
matching static file ahead of the Worker; the array narrows that to the six root files, so
`/assets/*` now reaches the Worker and is answered through the `ASSETS` binding.

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
The `/showcase/logs` route is handled by `showLogsController` which calls `loadLogViewer`
from `@y-core/forge/logging/show` internally. See [DATA_STORAGE.md](./DATA_STORAGE.md) §1
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
in `src/worker.ts`. It is the base policy for production. `createSecurityHeaders`
from `@y-core/forge/security` consumes it and adds the remaining default directives
(`default-src`, `style-src`, `img-src`, `font-src`, etc.).

**Three keys are deliberately absent, and adding one would be a regression, not hardening.**

- `styleSrc` / `fontSrc` / COOP / CORP / `hstsMaxAge` — `CSP_DEFAULTS` already gives
  `style-src 'self'` and `font-src 'self'`, and `precomputeSecurityHeaders` already emits
  `cross-origin-opener-policy: same-origin`, `cross-origin-resource-policy: same-origin` and a
  two-year HSTS. Writing them here copies forge's defaults into app code (FORGE_CONSUMPTION §1) and
  stops the app's posture tracking forge on the next upgrade.
- `permissionsPolicy` — `buildPermissionsPolicy` emits `()`, fully disabled, for every feature the
  caller omits. A key naming a feature therefore *enables* it. The `microphone: ["self"]` this app
  carried until forge 0.1.2 disabled nothing that was not already disabled, and enabled the
  microphone for an origin whose only surface is a contact form.
- COEP — `require-corp` needs the `challenges.cloudflare.com` frame to opt in, and `credentialless`
  strips its credentials. Turnstile breaks either way, and the only test that would catch it runs
  in the browser suite, outside `bun run verify`.

### 5b. NONCE Sentinel

`NONCE` is a sentinel string exported by `@y-core/forge/security`. It is replaced
per-request by `createSecurityHeaders` with the actual cryptographic nonce value.
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

    const app = createWorker(
      mergeSecurityHeaders(securityHeaders, { scriptSrc: [WRANGLER_LIVE_RELOAD_HASH] })
    )
    app.use(routes.contact.href(), turnstileHostname)

The live-reload hash is dev-only by construction — it lives in `worker.dev.ts` and
never touches `securityHeaders` in `config.ts`. See
[ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) §4 for the full rationale.

The `use` call is the same construction in its middleware form, and is the file's second dev-only
allowance (§3e). Registering middleware after `createWorker` has already mapped the routes is
correct: `Forge.use` collects into a list the router reads when it is built, on the first request.

---

## 6. .dev.vars — Local Dev Secrets

### 6a. .dev.vars Setup

Create a `.dev.vars` file in the project root (already listed in `.gitignore`).
Wrangler reads this file automatically during `wrangler dev` and `wrangler pages dev`
and injects the values as env vars. It is never deployed.

    SITE_ORIGIN=https://starter.devbox.test:8443
    CSRF_SECRET=de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e
    EMAIL_API_KEY=test-key
    TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
    TURNSTILE_SITE_KEY=1x00000000000000000000AA
    TURNSTILE_DEV_HOSTNAME=example.com

### 6b. Turnstile Test Keys

The `1x...` keys are Cloudflare's official Turnstile test keys:

- `1x00000000000000000000AA` — site key: always renders the widget
- `1x0000000000000000000000000000000AA` — secret key: always passes server-side verification

Use these in `.dev.vars` and in test environments. Do not use them in production.

They still make a real siteverify call, so `challenges.cloudflare.com` must be reachable — the
secret key accepts *any* response token, but the answer it returns names `example.com` as the
hostname. That is what `TURNSTILE_DEV_HOSTNAME` is for; omit it only with real keys (§3e).

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
dashboard and are not visible in `wrangler.jsonc` or source control. `SITE_ORIGIN`
and `TURNSTILE_SITE_KEY` are not sensitive (they are public values) but should
still be set via environment variables rather than hardcoded in source.
