---
title: Data Storage Patterns
description: "The KV access patterns this app uses, binding validation at startup, and the shape a future D1 or R2 binding would take."
---

# Data Storage Patterns

> Consuming forge storage namespaces: KV log storage today, D1/R2 for future features.
> Complements [CONFIGURATION_AND_SECRETS.md](./CONFIGURATION_AND_SECRETS.md) §4 (bindings),
> [STRUCTURED_LOGGING.md](./STRUCTURED_LOGGING.md) (kvLogChannel usage).

---

## 0. Quick Reference

- §1 LOGS_KV: current KV usage via kvLogChannel, readLogs, graceful degradation
- §1a kvLogChannel
- §1b readLogs — Admin Log Viewer
- §1c LOGS_KV Binding Declaration
- §2 createKVStore: typed KV access pattern, jsonCodec, operations, TTL rules
- §2a Typed Store with jsonCodec
- §2b Available Codecs
- §2c KVStore Operations
- §2d resolveKVStore — By Binding Name
- §3 Future D1 pattern: createD1Client, sql tag, resolveD1Client, startup validation
- §3a createD1Client
- §3b sql Tagged Template — Parameterized Queries
- §3c Add DB Binding to wrangler.jsonc
- §3d resolveD1Client — By Binding Name
- §4 Future R2 pattern: createObjectStore, serveObject, signed URLs
- §4a createObjectStore
- §4b serveObject — Direct Response from R2
- §4c Signed URLs for Restricted Object Access
- §4d Add R2 Binding to wrangler.jsonc
- §5 Binding validation: validateBindings at startup, graceful vs fail-fast strategies
- §5a Graceful Degradation vs Fail-Fast
- §5b validateBindings at Startup
- §5c validateXBinding vs resolveXClient

---

## 1. LOGS_KV — Current KV Usage

### 1a. kvLogChannel

The only active KV usage in the starter is structured request log persistence via
`kvLogChannel`. It is wired in `src/app/middleware.ts` inside `requestLogger`:

    channels: (c) => c.env.LOGS_KV
      ? [consoleChannel(), kvLogChannel(c.env.LOGS_KV)]
      : [consoleChannel()]

`kvLogChannel` serializes each request log record as JSON and writes it to the
`LOGS_KV` namespace. The key format is managed by the forge logging subsystem —
app code does not construct log record keys directly.

When `LOGS_KV` is absent (bun test, local dev without binding), `requestLogger`
falls back to `consoleChannel()` only. The absence does not cause an error because
log persistence is non-critical — see §5a for the full degradation policy.

### 1b. readLogs — Admin Log Viewer

The `/admin/logs` route is handled by `adminLogsController` in `src/controllers/admin-logs.tsx`.
App code does not call `KVNamespace` methods directly for log retrieval —
`readLogViewer` from `@y-core/forge/logging/http` handles pagination, key prefix filtering,
and JSON deserialization. `LogViewerContent` renders the UI. For the full logging architecture
see [STRUCTURED_LOGGING.md](./STRUCTURED_LOGGING.md).

### 1c. LOGS_KV Binding Declaration

The binding is declared in `wrangler.jsonc`:

    "kv_namespaces": [
      { "binding": "LOGS_KV", "id": "logs_kv_local", "preview_id": "logs_kv_local" }
    ]

`id` and `preview_id` are both set to `logs_kv_local` for local dev. In production,
replace `id` with the actual KV namespace ID from the Cloudflare dashboard:

    wrangler kv namespace create LOGS_KV

---

## 2. createKVStore — Typed KV Access

Use `createKVStore` from `@y-core/forge/storage/kv` when adding new KV-backed
features. It wraps a raw `KVNamespace` with a typed, codec-aware interface.

### 2a. Typed Store with jsonCodec

    import { createKVStore, jsonCodec } from "@y-core/forge/storage/kv"

    const store = createKVStore(c.env.SOME_KV, { codec: jsonCodec<MyData>() })
    await store.put("key", myData, { expirationTtl: 86400 })
    const data = await store.get("key")   // MyData | null

The `codec` option is required. `jsonCodec<T>()` serializes `T` to JSON on write
and deserializes back to `T` on read. The generic parameter flows through `get`
and `list` return types.

### 2b. Available Codecs

| Codec | Use case |
|---|---|
| `jsonCodec<T>()` | Structured records, typed objects, arrays — most common |
| `textCodec()` | Plain string values: tokens, slugs, feature flags |
| `bytesCodec()` | Binary blobs that must remain unmodified (`Uint8Array`) |

Select the codec that matches the value format already stored in the namespace.
Mixing codecs on the same namespace key causes silent decode failures.

### 2c. KVStore Operations

All operations are async and return Promise-wrapped values:

    await store.get(key)                       // T | null
    await store.put(key, value, options?)      // void — options: { expirationTtl?: number }
    await store.delete(key)                    // void
    await store.list(options?)                 // KVListResult<T>

`expirationTtl` is in seconds. Cloudflare KV enforces a minimum TTL of 60 seconds —
values with shorter TTLs are rejected by the platform with an error.

### 2d. resolveKVStore — By Binding Name

`resolveKVStore` looks up a binding by string name at request time rather than
requiring a direct reference. Use it in middleware where only `c.env` is available:

    import { resolveKVStore, jsonCodec } from "@y-core/forge/storage/kv"

    const store = resolveKVStore(c.env, "SOME_KV", { codec: jsonCodec<MyData>() })

Throws a descriptive error when the named binding is absent, so misconfiguration
surfaces immediately at request time rather than as a null-dereference.

---

## 3. Future D1 Pattern — SQL Database

Add a D1 database when the app needs relational storage (user records, form
submissions, structured content). The starter does not include a D1 binding today
but the forge namespace is ready to use.

### 3a. createD1Client

    import { createD1Client } from "@y-core/forge/storage/db"

    const db = createD1Client(c.env.DB, { logQueries: config.site.debug })
    // db: D1Client — typed wrapper around Cloudflare D1Database

Pass `logQueries: true` in debug mode to log every prepared query. In production
(`config.site.debug === false`), query logging is suppressed.

### 3b. sql Tagged Template — Parameterized Queries

    import { sql } from "@y-core/forge/storage/db"

    const rows = await db
      .prepare(sql`SELECT * FROM contacts WHERE email = ${email}`)
      .all()

The `sql` tag returns a `SqlFragment` — a parameterized query with bound values.
Never build D1 queries via string concatenation. The `isSqlFragment` type guard
confirms a value is a `SqlFragment` when writing generic query helpers.

### 3c. Add DB Binding to wrangler.jsonc

    "d1_databases": [
      {
        "binding": "DB",
        "database_name": "mydb",
        "database_id": "<id-from-dashboard>"
      }
    ]

Create the database and retrieve the ID:

    wrangler d1 create mydb

Then add `validateD1Binding` to startup validation — see §5b.

### 3d. resolveD1Client — By Binding Name

    import { resolveD1Client } from "@y-core/forge/storage/db"

    const db = resolveD1Client(c.env, "DB")

Mirrors `resolveKVStore` (§2d). Throws a descriptive error when `DB` is absent.
Prefer direct `createD1Client(c.env.DB)` in handlers where the binding is typed;
use `resolveD1Client` in generic middleware that receives `c.env` untyped.

---

## 4. Future R2 Pattern — Object Storage

Add an R2 bucket for user-uploaded files, generated assets, or static media that
belongs outside the `public/` build artifact.

### 4a. createObjectStore

    import { createObjectStore } from "@y-core/forge/storage/r2"

    const store = createObjectStore(c.env.MEDIA_BUCKET)
    // store: ObjectStore — typed wrapper around R2Bucket

### 4b. serveObject — Direct Response from R2

`serveObject` retrieves an R2 object and returns a fully-formed `Response` with
correct `Content-Type` and caching headers. Always check for `null` — a missing
object must produce a 404:

    import { serveObject } from "@y-core/forge/storage/r2"

    const response = await serveObject(c.env.MEDIA_BUCKET, objectKey)
    if (!response) return c.notFound()
    return response

Never return an unhandled `null` — it will produce a 500 instead of a proper 404.

### 4c. Signed URLs for Restricted Object Access

Use signed URLs when objects must not be publicly listable. Generate them with
`createSignedObjectUrl` using a secret from a Workers binding:

    import { createSignedObjectUrl, importSigningKey } from "@y-core/forge/storage/r2"

    const signingKey = await importSigningKey(config.security.objectSigningSecret)
    const url = await createSignedObjectUrl(objectKey, signingKey, { expiresIn: 3600 })

`expiresIn` is in seconds. The signed URL route must verify the signature before
serving the object — do not skip verification on the receiving handler.

### 4d. Add R2 Binding to wrangler.jsonc

    "r2_buckets": [
      { "binding": "MEDIA_BUCKET", "bucket_name": "my-media" }
    ]

Then add `validateR2Binding` to startup validation — see §5b.

---

## 5. Binding Validation

### 5a. Graceful Degradation vs Fail-Fast

Two strategies exist for absent bindings. The choice is determined by whether the
feature is security-critical or correctness-critical.

**Graceful degradation** (non-critical features — check presence before use):

| Binding | Absent strategy |
|---|---|
| `LOGS_KV` | Fall back to `consoleChannel()` only |
| `RATE_LIMITER` | No-op middleware via `required: false` |

**Fail-fast** (critical features — throw before serving any request):

| Binding | Absent strategy |
|---|---|
| `DB` (user data) | `validateD1Binding` at startup — throw |
| Auth session KV | `validateKVBinding` at startup — throw |
| CSRF secret | `configStore.get` throws at parse time |

Never introduce a conditional that silently skips security enforcement because a
binding is absent.

### 5b. validateBindings at Startup

Compose all critical binding checks using `validateBindings` from `@y-core/forge/app`.
The callback receives `env` and returns an array of `string | null` — one entry per
check. Any non-null entry causes the worker to throw before it serves any request.

    import { validateBindings } from "@y-core/forge/app"
    import { validateD1Binding } from "@y-core/forge/storage/db"
    import { validateKVBinding } from "@y-core/forge/storage/kv"
    import { validateR2Binding } from "@y-core/forge/storage/r2"

    // Called after createWorker, before routes are registered:
    validateBindings(app, (env) => [
      validateD1Binding(env, "DB"),
      validateKVBinding(env, "REQUIRED_KV"),
      validateR2Binding(env, "MEDIA_BUCKET"),
    ])

Do not include `LOGS_KV` or `RATE_LIMITER` in `validateBindings` — they degrade
gracefully and must remain optional for `bun test` and local dev without a full
`wrangler.jsonc` binding configuration.

### 5c. validateXBinding vs resolveXClient

Both functions are synchronous but serve distinct lifecycle roles:

| Function | When to use |
|---|---|
| `validateXBinding(env, name)` | Startup: returns `string \| null` — never throws |
| `resolveXClient(env, name)` | Request time: returns typed client or throws on absence |

`validate*` functions collect results without throwing; `validateBindings` aggregates
and throws once. `resolve*` functions throw immediately at the call site so
misconfiguration is visible in the first request log rather than silently producing
null values downstream.

See [CONFIGURATION_AND_SECRETS.md](./CONFIGURATION_AND_SECRETS.md) §4 for the
wrangler.jsonc binding declarations that back each of these bindings.
