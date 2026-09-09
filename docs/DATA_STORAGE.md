---
title: Data Storage Patterns
description: "The KV access patterns this app uses, the live AUTH_DB D1 binding and its client, binding validation at startup, and the shape a future R2 binding would take."
---

# Data Storage Patterns

> Consuming forge storage namespaces: KV for logs and sessions, D1 for auth, R2 for a future feature.
> Complements [CONFIGURATION_AND_SECRETS.md](./CONFIGURATION_AND_SECRETS.md) §4 (bindings),
> [STRUCTURED_LOGGING.md](./STRUCTURED_LOGGING.md) (kvLogChannel usage).

---

## 0. Quick Reference

- §1 The KV namespaces: LOGS_KV via kvLogChannel with graceful degradation, AUTH_KV for sessions
- §1a kvLogChannel
- §1b Log Viewer Reads
- §1c LOGS_KV Binding Declaration
- §1d AUTH_KV — Session Storage
- §2 createKVStore: typed KV access pattern, jsonCodec, operations, TTL rules
- §2a Typed Store with jsonCodec
- §2b Available Codecs
- §2c KVStore Operations
- §2d resolveKVStore — By Binding Name
- §3 D1: the live AUTH_DB binding, createD1Client, sql tag, the declared schema and the migrations directory, resolveD1Client
- §3a createD1Client
- §3b sql Tagged Template — Parameterized Queries
- §3c The Declared Schema, the Migrations Directory, and Adding a Second Database
- §3d resolveD1Client — By Binding Name
- §4 Future R2 pattern: createObjectStore, serveObject, signed URLs
- §4a createObjectStore
- §4b serveObject — Direct Response from R2
- §4c Signed URLs for Restricted Object Access
- §4d Add R2 Binding to wrangler.jsonc
- §5 Binding validation: validateBindings middleware, optional shape checks, graceful vs fail-fast
- §5a Graceful Degradation vs Fail-Fast
- §5b validateBindings — one shape check per isolate
- §5c schemaHealthMonitor and schemaHealthCheck — the applied schema
- §5d validateXBinding vs resolveXClient

---

## 1. The KV Namespaces — LOGS_KV and AUTH_KV

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

### 1b. Log Viewer Reads

The `/showcase/logs` route is handled by `showLogsController` in `src/controllers/show.logs.tsx`.
App code does not call `KVNamespace` methods directly for log retrieval —
`loadLogViewer` from `@y-core/forge/logging/show` handles pagination, key prefix filtering,
JSON deserialization and rendering — it returns a `Response`, not data. For the full logging architecture
see [STRUCTURED_LOGGING.md](./STRUCTURED_LOGGING.md).

### 1c. LOGS_KV Binding Declaration

The binding is declared in `wrangler.jsonc`:

    "kv_namespaces": [
      { "binding": "LOGS_KV", "id": "logs_kv_local", "preview_id": "logs_kv_local" }
    ]

`id` and `preview_id` are both set to `logs_kv_local` for local dev. In production,
replace `id` with the actual KV namespace ID from the Cloudflare dashboard:

    wrangler kv namespace create LOGS_KV

### 1d. AUTH_KV — Session Storage

`AUTH_KV` is the second namespace, and it holds **sessions only**:

    { "binding": "AUTH_KV", "id": "auth_kv_local", "preview_id": "auth_kv_local" }

`authSessionGuard` in `src/app/auth.ts` builds a `createKVSessionStorage(c.env.AUTH_KV, { prefix: "sess" })`
per request. Challenges and nonces live in `AUTH_DB` (§3) rather than here: taking a challenge and winning a
nonce each have to be one statement, and KV's read-then-write hands two racing requests the same
challenge and reports both replays of a token as fresh.

Unlike `LOGS_KV`, `AUTH_KV` is **required** — `validateBindings` fails startup without it (§5b),
because a missing session store is a sign-in that silently never persists. See
[AUTH.md](./AUTH.md) §3 for the session model it stores.

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

| Codec            | Use case                                                |
| ---------------- | ------------------------------------------------------- |
| `jsonCodec<T>()` | Structured records, typed objects, arrays — most common |
| `textCodec()`    | Plain string values: tokens, slugs, feature flags       |
| `bytesCodec()`   | Binary blobs that must remain unmodified (`Uint8Array`) |

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

## 3. D1 Pattern — SQL Database

`AUTH_DB` is live: it backs every forge auth store — users, factors, credentials, identity links,
OTP state, challenges and nonces — over the tables `config/migrations/0001_schema.sql` composes from
forge's declared schema and `bun run db:migrate` applies (§3c). It is **required**; `validateBindings` fails startup without it (§5b). See
[AUTH.md](./AUTH.md) §2 for which store reads which table.

Add a _second_ D1 database when the app needs relational storage for something other than identity
(form submissions, structured content).

### 3a. createD1Client

    import { createD1Client } from "@y-core/forge/storage/db"

    const db = createD1Client(c.env.AUTH_DB, { logQueries: config.site.debug })
    // db: D1Client — typed wrapper around Cloudflare D1Database

`authStores` in `src/app/auth.ts` builds one this way per request, and `purgeAuthStores` builds one
for the scheduled handler.

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

### 3c. The Declared Schema, the Migrations Directory, and Adding a Second Database

`AUTH_DB` is declared as:

    "d1_databases": [
      {
        "binding": "AUTH_DB",
        "database_name": "forge-starter-auth",
        "database_id": "auth_db_local",
        "migrations_dir": "config/migrations"
      }
    ]

`database_id` is `auth_db_local` for local dev; in production it is the real ID from the Cloudflare
dashboard.

**`config/db.ts` names every file `forge db` reads, and nothing else is read.** Its `schemas` list is
the whole input to a compose, in load order:

    export default {
      schemas: ["node_modules/@y-core/forge/src/auth/schema.sql", "config/schema.sql"],
      seeds: ["config/seeds"],
    } satisfies DbHostConfig;

Nothing is discovered. An installed package contributes no DDL to this database because it happens
to ship a `schema.sql`; it contributes because that path is written above, where a reviewer sees it.
Order is load order into one empty database, which is why forge's file comes first: `preferences`
carries a FOREIGN KEY to `auth_users`, so the file declaring `auth_users` has to run before it.

**Three positions, each owning one thing.** `config/schema.sql` is this app's **own desired state** —
the tables this app declares, and nothing else. `config/migrations/` holds **every file that runs**,
one flat sequence this app numbers and owns; `migrations_dir` is that directory's one definable
position. `config/schema.snapshot.json` records what the last compose saw: a digest **per declared
file, keyed by the path `config/db.ts` wrote**, this app's migrations digest, and the introspected
model of everything those files build together.

**A library declares; this app composes.** Forge publishes its auth schema as a declaration and no
SQL that runs. `bun run db:compose` diffs every declared file against a replay of `config/migrations/` and
writes the difference as the next numbered file _here_. That is why
`config/migrations/0001_schema.sql` holds the seven `auth_*` tables: a reader sees the SQL that runs,
and sees that this app owns it. No library SQL is copied in — the DDL is composed from a declaration
each time.

**`preferences` in `config/schema.sql` carries a FOREIGN KEY to `auth_users`**, which a library
shipping its own migrations could not express: a change to `auth_users` that needs a rebuild takes every
referencing table with it, and under the app-composes model that whole closure lands in one migration
this app owns. **No code reads the table, and that is the whole of its job** — the `full`-tier
`db:schema` row replays both declared schemas for real, so the cross-schema reference is proved on
every release gate rather than by a feature built on top of it. Write a table into `config/schema.sql`, then run `bun run db:compose`: forge replays
the migrations and loads the desired files into throwaway databases, diffs the two models, and proves
the emitted SQL before writing the file. `forge db schema pull` bootstraps the desired file from
migrations that already exist, and `--out` says where; the file has to be added to `schemas` before
compose reads it. A hand-written migration is for what compose cannot express — a backfill or a data
move — and takes `bun run db:compose -- --custom <name>`.

Migrations are **forward-only**: a file is applied once, its checksum recorded in
`forge_migrations`, and an applied file is never edited. The named scripts cover the cycle:

    bun run db:backup         # write an artifact of the database
    bun run db:compose        # generate the next migration from the union of every schema.sql
    bun run db:lint           # the migration lint rules, --strict
    bun run db:migrate        # apply what is pending; a no-op when in step
    bun run db:migrate:remote # the same, against the deployed database
    bun run db:reset          # drop and re-apply, locally
    bun run db:restore        # load a backup artifact
    bun run db:schema:check   # every declared file, the snapshot and the migrations agree
    bun run db:status         # what is applied, what is pending, what drifted

**An upgrade of forge's schema is a reviewed event.** `bun run db:schema:check` fails naming
`node_modules/@y-core/forge/src/auth/schema.sql` when it hashes differently from what
`config/schema.snapshot.json` recorded. One rule covers that and an edit to `config/schema.sql` alike
— a declared file moved — and the remedy for both is `bun run db:compose`. What gets reviewed is the
migration compose then writes: the SQL about to run, not a hash.

**Two lines are the deploy gate**, and both must pass before shipping:

    forge db schema check                             # every declared file, the snapshot and the migrations agree
    forge db migrate status --check --target remote   # the deployed database agrees with the migrations

The first catches a declared file edited and never composed — this app's own or an upgraded
library's — or a migration added by hand after the last compose; it reads files only and takes no wrangler, which is why it is in the
gate twice — as `db:schema:digests` in `standard`, and as `db:schema` in `full`, where `--replay`
builds the databases for real. The second catches a deployed database out of step with the migrations
about to be deployed over it.

`forge db schema` prints the **desired state** — every declared file, in load order.
The apply-order concatenation of every migration is `forge db schema --migrations`, for a database
that will never be migrated. Forge governs the verbs themselves; `warden search --dependency
"forward-only migration"` is how that section is reached, since the installed library's documents
are not citable by name here.

A second database follows the same shape with its own binding name and its own `migrations_dir`,
plus two things in the same change: the binding on the `AppEnv` type
([CONFIGURATION_AND_SECRETS.md](./CONFIGURATION_AND_SECRETS.md) §4), and `validateD1Binding` in
startup validation (§5b).

    wrangler d1 create mydb

### 3d. resolveD1Client — By Binding Name

    import { resolveD1Client } from "@y-core/forge/storage/db"

    const db = resolveD1Client(c.env, "AUTH_DB")

Mirrors `resolveKVStore` (§2d). Throws a descriptive error when the named binding is absent.
Prefer direct `createD1Client(c.env.AUTH_DB)` in handlers where the binding is typed — which is what
`src/app/auth.ts` does; use `resolveD1Client` in generic middleware that receives `c.env` untyped.

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

| Binding        | Absent strategy                        |
| -------------- | -------------------------------------- |
| `LOGS_KV`      | Fall back to `consoleChannel()` only   |
| `RATE_LIMITER` | No-op middleware via `required: false` |

**Fail-fast** (critical features — throw before serving any request):

| Binding     | Absent strategy                                                      |
| ----------- | -------------------------------------------------------------------- |
| `AUTH_DB`   | Non-optional in `validateBindings` — throws before the first request |
| `AUTH_KV`   | Non-optional in `validateBindings` — throws before the first request |
| CSRF secret | `configStore.get` throws at parse time                               |

Never introduce a conditional that silently skips security enforcement because a
binding is absent.

### 5b. validateBindings — one shape check per isolate

`validateBindings` from `@y-core/forge/context` is a **middleware**, registered in
`registerMiddleware`. It takes a schema and caches the `env` reference it last validated, so the
shape check costs one pass per isolate rather than one per request.

    import { bindingSetSchema, validateBindings } from "@y-core/forge/context"

    app.use(
      "*",
      validateBindings(
        bindingSetSchema([
          { name: "LOGS_KV", methods: ["get", "put", "list"], label: "a KV namespace binding", optional: true },
          { name: "RATE_LIMITER", methods: ["limit"], label: "a rate-limiter binding", optional: true },
          { name: "AUTH_DB", methods: ["prepare"], label: "the auth D1 binding" },
          { name: "AUTH_KV", methods: ["get", "put"], label: "the auth KV binding" },
        ]),
      ),
    )

`bindingSetSchema` covers several bindings in one schema, so an env is validated in a single pass;
`bindingSchema(name, methods, label, options?)` is the single-binding form.

**`optional: true` is what makes a row a shape check rather than a presence check.** An absent
binding passes — `LOGS_KV` and `RATE_LIMITER` both degrade, to console-only logging and a no-op
limiter, and neither is present in `bun test` or in a `wrangler dev` without a full binding
configuration. A binding that _is_ present but carries the wrong methods still fails.

**`AUTH_DB` and `AUTH_KV` carry no `optional`, deliberately.** Auth is correctness-critical: an
absent store would degrade a guard into a no-op, so it fails before the first request instead. That
is why every test fixture must supply both — see
[HANDLER_TESTING.md](./HANDLER_TESTING.md) §1c.

That distinction is the point: before `optional` existed, the only way to keep a degrading binding
out of a hard failure was to leave it unchecked entirely, so a misconfigured `LOGS_KV` was
indistinguishable from an absent one until the first write.

The security rule in §5a is unchanged: never introduce a conditional that skips security
enforcement because a binding is absent. Rate limiting is the one ratified fail-open
(BOUNDARIES §5b), recorded in CODE_REVIEW.md §8.

### 5c. schemaHealthMonitor and schemaHealthCheck — the applied schema

The shape check above proves the binding is a D1 database. It says nothing about _which_ schema that
database holds, and a deploy that half-landed — migrations composed, never applied — answers every
shape check it is given.

`schemaHealthMonitor({ binding: (c) => c.env.AUTH_DB })` is registered in `registerMiddleware`, and
`schema: schemaHealthCheck((c) => c.env.AUTH_DB)` on the `healthCheck` at the `/api/health` route.
Both compare the fingerprint `forge db migrate` recorded in `forge_schema_meta` against the schema as
it stands; both read only, and neither repairs anything. The monitor logs one `d1.schema.health`
record per isolate — at `warn` on a mismatch — and its two D1 reads ride `waitUntil`, so no request
waits on them. The check makes `/api/health` answer **503** on a mismatch, which is the signal a
deploy pipeline reads. The default migrations table is the one this app's `wrangler.jsonc` uses, so
neither takes an option.

Only `mismatch` fails: a database with no `forge_schema_meta` at all reads as `unavailable`, and one
with the table but no recorded fingerprint as `unrecorded`. Neither is a drift, and neither is worth
refusing traffic over.

### 5d. validateXBinding vs resolveXClient

Both functions are synchronous but serve distinct lifecycle roles:

| Function                      | When to use                                             |
| ----------------------------- | ------------------------------------------------------- |
| `validateXBinding(env, name)` | Startup: returns `string \| null` — never throws        |
| `resolveXClient(env, name)`   | Request time: returns typed client or throws on absence |

`validate*` functions collect results without throwing; `validateBindings` aggregates
and throws once. `resolve*` functions throw immediately at the call site so
misconfiguration is visible in the first request log rather than silently producing
null values downstream.

See [CONFIGURATION_AND_SECRETS.md](./CONFIGURATION_AND_SECRETS.md) §4 for the
wrangler.jsonc binding declarations that back each of these bindings.
