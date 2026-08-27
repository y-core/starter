---
title: Web Design Patterns
description: "This app's Workers bindings and their limits, the asset build outputs, and the wrangler configuration behind them."
---

# Web Design Patterns

> Workers runtime model, rate limiting, deployment safety, production readiness.

---

## 0. Quick Reference

- §1 Cloudflare Workers Runtime Model: V8 isolate, single-request, no shared state
- §2 ctx.waitUntil: fire-and-forget after response
- §3 Rate limiting: Workers binding, 5/60s, required: false
- §3a Workers Rate Limiter Binding
- §3b required: false — Graceful Degradation
- §3c Rate Limit Key Selection
- §4 Deploy safety: secrets, .dev.vars, never commit
- §5 Static assets: public/ directory, run_worker_first
- §5a public/ Directory
- §5b run_worker_first — the asset-root exclusion list
- §5c Asset Fingerprinting
- §5d No Dynamic Asset Serving in Worker
- §6 Workers Bindings Reference
- §6a Binding Types Used
- §6b Accessing Bindings

---

## 1. Cloudflare Workers Runtime Model

See `WORKERS_PLATFORM.md` §1 for the isolate model, what module
scope may hold, and why a per-request cache is module state wearing a performance argument.

---

## 2. ctx.waitUntil

See `WORKERS_PLATFORM.md` §2 for post-response work, the rule that
an error inside it never reaches the response, and the requirement that the promise cover every
piece of work its function started.

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

See `BOUNDARIES.md` §5b for why graceful degradation is scoped to rate
limiting alone, and `CODE_REVIEW.md` §6 for its place in the
do-not-flag table.

### 3c. Rate Limit Key Selection

See `WORKERS_PLATFORM.md` §3c for key selection, and
`BOUNDARIES.md` §3c for why the connecting-IP header is trustworthy only
behind the platform edge.

## 4. Deploy Safety

See `WORKERS_PLATFORM.md` §4 for secret provisioning, the
gitignored local variables file, the pre-deploy gate, and environment parity. The variables this
app requires are in [`CONFIGURATION_AND_SECRETS.md`](./CONFIGURATION_AND_SECRETS.md).

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

### 5b. run_worker_first — the asset-root exclusion list

In `wrangler.jsonc`:

    "assets": {
      "directory": "./public",
      "run_worker_first": [
        "/*",
        "!/favicon.ico", "!/favicon.svg", "!/apple-touch-icon.png",
        "!/icon-192.png", "!/icon-512.png", "!/site.webmanifest"
      ]
    }

The six `!` rules name exactly the files `icons.outputs` writes to the asset root. Cloudflare
serves those directly, bypassing the Worker — faster, and no CPU spent on a `fetch` event for a
file that never needs dynamic logic.

Every other path, `/assets/*` included, runs the Worker first. The `validate-asset-root` gate row
diffs the two halves, so a new root-level output added to `config/assets.ts` without its `!` rule
here is caught in CI rather than in production. See CONFIGURATION_AND_SECRETS.md §4a.

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
