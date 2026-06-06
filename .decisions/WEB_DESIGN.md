---
title: "Web Design Patterns"
description: "Cloudflare Workers runtime, V8 isolate, single request per isolate, ctx.waitUntil, no goroutines, rate limiting, deploy safety, secrets management, no shared mutable state, Workers bindings, production readiness, wrangler deploy"
weight: 35
---

# Web Design Patterns

> Workers runtime model, rate limiting, deployment safety, production readiness.

---

## 0. Quick Reference

- §1 Workers runtime: V8 isolate, single-request, no shared state
- §2 ctx.waitUntil: fire-and-forget after response
- §3 Rate limiting: Workers binding, 5/60s, required: false
- §4 Deploy safety: secrets, .dev.vars, never commit
- §5 Static assets: public/ directory, run_worker_first

---

## 1. Cloudflare Workers Runtime Model

### 1a. V8 Isolate Per Request

Each incoming request is handled in a V8 isolate. There is no shared heap between
concurrent requests. There are no goroutine-style worker pools — all work inside a
single request handler executes sequentially (or via `await` chains).

Consequences:
- Module-level **constants** are safe — they are computed once at isolate cold start
  and never mutated.
- Module-level **mutable state** is unsafe — a second request may reuse the same
  isolate instance, picking up stale mutations from the previous request.
- Do not store per-request data in module scope. Use forge's typed `contextVar` accessors.

### 1b. Safe Module-Level Patterns

    // SAFE: computed once, never mutated
    export const securityHeaders = makeSecurityHeaders({ ... })
    export const configStore = new Config(appConfig, AppConfigSchema)
    export const routes = route({ health: { method: "GET", pattern: "/api/health" }, ... })

    // UNSAFE: per-request mutable state at module scope
    let currentUser: User | null = null  // do not do this

### 1c. No Background Threads

Workers has no `setTimeout`-based background processing, no worker threads, and no
Node.js `cluster` equivalents. All async work is either:

1. Awaited within the request handler (completes before response), or
2. Handed to `ctx.waitUntil` (completes after response — see §2).

### 1d. Cold Start vs. Warm Isolate

Workers reuses isolates across requests when traffic is steady ("warm"). Code at module
scope runs only on cold start. Keep module-level initialization cheap and
side-effect-free so warm reuse is safe.

---

## 2. ctx.waitUntil

### 2a. Post-Response Work Pattern

`c.executionCtx.waitUntil(promise)` keeps the isolate alive until `promise` resolves
after the HTTP response has been sent. Use this for work that must not block the
response but must complete before the isolate is recycled.

    c.executionCtx.waitUntil(kvLogChannel.flush())

The logger accumulates log entries during the request and flushes them to KV after
the response. This avoids adding KV write latency to the response time.

### 2b. Errors in waitUntil

Errors thrown inside a `waitUntil` promise do **not** propagate to the HTTP response.
Wrap with a catch if you need visibility:

    c.executionCtx.waitUntil(
      kvLogChannel.flush().catch((err) => console.error("flush failed", err))
    )

### 2c. Limits

`waitUntil` work counts against the CPU time limit of the isolate. Keep post-response
work minimal. For large background jobs, use a Cloudflare Queue or a Durable Object.

---

## 3. Rate Limiting

### 3a. Workers Rate Limiter Binding

Rate limiting is configured via the `ratelimits` binding in `wrangler.jsonc`:

    "ratelimits": [
      {
        "name": "RATE_LIMITER",
        "namespace_id": "1001",
        "simple": { "limit": 5, "period": 60 }
      }
    ]

This allows 5 requests per 60-second window per unique key (default: client IP).
Exceeding the limit returns a `429 Too Many Requests` response via `rateLimitGuard`.

### 3b. required: false — Graceful Degradation

`rateLimitGuard` is registered with `required: false`. When the `RATE_LIMITER` binding
is absent (e.g., in `bun test` or local dev without the binding), the guard is skipped
rather than throwing. This is intentional — do not flag it in code review.

    // In router.tsx — contactGuards middleware composition:
    createMiddleware(contactGuard, rateLimitGuard, csrfVerifyGuard)

See [CODE_REVIEW.md §8](./CODE_REVIEW.md) for the valid-patterns table.

### 3c. Rate Limit Key Selection

By default, `rateLimitGuard` keys on the client IP (`CF-Connecting-IP`). For routes
that require per-user limiting (post-auth), pass a custom key derived from the session.
Consult [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) for context utilities.

---

## 4. Deploy Safety

### 4a. Secrets via wrangler secret put

Never hardcode API keys, tokens, or credentials in source files. Provision secrets
through the Wrangler CLI:

    wrangler secret put CSRF_SECRET
    wrangler secret put EMAIL_API_KEY
    wrangler secret put TURNSTILE_SECRET_KEY

Secrets are encrypted at rest and injected into the Worker's environment at runtime.
They appear in `c.env` alongside normal bindings.

### 4b. Local Development — .dev.vars

For local `wrangler dev`, secrets are provided via `.dev.vars` (gitignored):

    CSRF_SECRET=dev-secret-not-for-production
    EMAIL_API_KEY=test-key
    TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA

`.dev.vars` must never be committed. Verify it is listed in `.gitignore`.

### 4c. Pre-Deploy Checklist

Run the full pipeline before every deployment:

    bun run check    # typecheck (tsgo) + lint (biome) + tests (bun test)
    bun run build    # CSS (tailwindcss) + JS (esbuild) → public/assets/
    wrangler deploy  # upload Worker + assets to Cloudflare

A failed `bun run check` must block deployment. Do not use `wrangler deploy --force`
to skip asset build validation.

### 4d. Environment Parity

`configStore` validates the environment at request time via `AppConfigSchema`. Missing
required env vars throw a structured error rather than silently defaulting. This
surfaces misconfiguration in staging before it reaches production.

---

## 5. Static Assets

### 5a. public/ Directory

CSS, JavaScript bundles, images, and fonts are placed in `public/`. Wrangler uploads
them as static assets and serves them directly from Cloudflare's edge network.

Build outputs:

| Source | Output |
|---|---|
| `src/assets/tailwind.css` | `public/assets/styles.css` |
| `src/client/main.ts` | `public/assets/js/main.js` |

### 5b. run_worker_first: false

In `wrangler.jsonc`:

    "assets": {
      "directory": "./public",
      "run_worker_first": false
    }

`run_worker_first: false` means Cloudflare serves static files directly, bypassing the
Worker for asset requests. This is faster and avoids wasting CPU time on `fetch` events
for files that never need dynamic logic.

### 5c. Asset Fingerprinting

Tailwind and esbuild do not fingerprint output filenames by default in this starter.
Cache busting relies on Cloudflare's asset versioning. If you add fingerprinting,
update the `<link>` and `<script>` references in `layout.tsx` to match.

### 5d. No Dynamic Asset Serving in Worker

Do not add routes in `routes.ts` that read and serve files from `public/`. Let
Wrangler's static asset pipeline handle them. Dynamic serving from the Worker wastes
CPU and bypasses edge caching.

---

## 6. Workers Bindings Reference

### 6a. Binding Types Used

| Binding | Type | Purpose |
|---|---|---|
| `LOGS_KV` | KV Namespace | Structured log storage |
| `RATE_LIMITER` | Rate Limit | Per-IP request throttling |
| `ASSETS` | Static Assets | public/ file serving |

### 6b. Accessing Bindings

All bindings are available on `c.env` inside route handlers:

    const kv = c.env.LOGS_KV
    await kv.put("key", "value")

`configStore.get(c.env)` validates and returns typed config (secrets + public vars)
in a single call. Do not access `c.env` directly for secret values — go through
`configStore` so schema validation is enforced consistently.

See [ARCHITECTURE_GUIDE.md](./ARCHITECTURE_GUIDE.md) for the full config pattern.
