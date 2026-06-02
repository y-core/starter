---
title: "Structured Logging"
description: "consoleChannel, kvLogChannel, LOGS_KV, requestLogger, requestId correlation, log levels, admin logs route, logViewer, TODO auth, no PII, KV log storage"
weight: 22
---

# Structured Logging

> Channels, KV persistence, request correlation, and the admin log viewer route.
> Complements [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §1b.

---

## 0. Quick Reference

- §1 Channels: `consoleChannel` + `kvLogChannel` (LOGS_KV binding)
- §2 Request correlation: `requestId` feeds into `requestLogger` bindings
- §3 Log levels: INFO / WARN / ERROR mapped by HTTP status range
- §4 Admin log viewer: `/admin/logs` route, `logViewer` from forge
- §5 No-PII rule: log only method, path, status, duration, requestId
- §6 KV schema: JSON records keyed by timestamp prefix for range queries
- §7 Local dev fallback: console-only when LOGS_KV binding absent

---

## 1. Channel Configuration

### 1a. Dual Channel Setup

Both channels are configured at the `requestLogger` call site in `src/routes.tsx` (or the
middleware composition layer). The channel factory receives the Hono context `c` so it can
read bindings:

    requestLogger({
      channels: (c) =>
        c.env.LOGS_KV
          ? [consoleChannel(), kvLogChannel(c.env.LOGS_KV)]
          : [consoleChannel()],
      bindings: (c) => ({ requestId: requestIdCtx.getOptional(c) }),
    })

When `LOGS_KV` is absent (e.g., during `bun test`) the logger degrades gracefully to
console-only output. No test-environment flag is needed; the binding's presence drives the
decision.

### 1b. LOGS_KV Wrangler Binding

Declare the namespace in `wrangler.jsonc`:

    "kv_namespaces": [
      { "binding": "LOGS_KV", "id": "<prod-namespace-id>" }
    ]

For local dev Wrangler auto-creates an in-memory KV namespace when the binding is declared.
The `logViewer` route reads from this same namespace, so `/admin/logs` works locally without
extra setup.

### 1c. AppEnv Typing

Add `LOGS_KV: KVNamespace` to the `AppEnv` interface so TypeScript enforces the binding
type throughout the codebase:

    export interface AppEnv extends Env {
      LOGS_KV: KVNamespace
      // ...other bindings
    }

---

## 2. Request Correlation

### 2a. Middleware Order: requestId Before requestLogger

`requestId()` must be registered before `requestLogger` in the middleware chain.
`requestId` sets `requestIdCtx` in the Hono context. `requestLogger` reads it via its
`bindings` factory so every log record carries the same ID as the originating request:

    app.use(requestId())
    app.use(requestLogger({ ... bindings: (c) => ({ requestId: requestIdCtx.getOptional(c) }) }))

### 2b. requestId Propagation to Downstream Services

Pass `requestId` from context when calling external services so log records in third-party
systems (email API, etc.) can be correlated back to the originating Worker request:

    const id = requestIdCtx.getOptional(c)
    await emailService.send(contact, { requestId: id })

### 2c. requestId in Error Responses

Include the `requestId` in JSON error payloads returned to clients so users can report it
for support correlation. Never include it in HTML fragment responses visible to end users.

---

## 3. Log Levels

### 3a. Status-to-Level Mapping

`requestLogger` derives the log level from the HTTP response status automatically:

| Status range | Level  | Meaning                  |
| ------------ | ------ | ------------------------ |
| < 400        | INFO   | Successful request       |
| 400 – 499    | WARN   | Client error             |
| >= 500       | ERROR  | Server / infra error     |

No manual level selection is needed for request logs. For structured application events
(non-request logs) use the channel directly:

    channel.log({ level: "WARN", message: "Turnstile secret key missing", requestId })

### 3b. Structured Fields Per Record

Every KV-stored log record is a JSON object. Minimum guaranteed fields:

    {
      "ts": "2026-06-02T14:30:00.000Z",
      "level": "INFO",
      "method": "POST",
      "path": "/api/contact",
      "status": 200,
      "duration": 42,
      "requestId": "req_01jxabc123"
    }

Additional fields from `bindings` are merged at the top level.

---

## 4. Admin Log Viewer

### 4a. /admin/logs Route Declaration

    import { logViewer } from "@y-core/forge/logging"
    import { logsView } from "./views/logs"

    route("/admin/logs", {
      ...logViewer<AppEnv>({ kv: (c) => c.env.LOGS_KV }),
      view: logsView as RouteView<AppEnv>,
    })

`logViewer` provides a `loader` that queries LOGS_KV with optional `?level=`, `?limit=`,
and `?cursor=` query parameters for filter and cursor-based pagination.

### 4b. logsView Component

`logsView` wraps `LogTable` (from forge) in the app layout. `LogTable` renders the
structured log records as an HTML table with sortable columns. Pass the layout context from
the route loader:

    export const logsView: RouteView<AppEnv> = (c, data) => (
      htmlResponse(c.req.raw,
        <Layout ctx={data.ctx}>
          <LogTable records={data.records} cursor={data.cursor} />
        </Layout>
      )
    )

### 4c. TODO(auth) — Authentication Required

**The `/admin/logs` route currently has no authentication guard.** It must not be exposed
in production without one. Add an auth middleware before the route handler:

    route("/admin/logs", {
      middleware: [requireAdminSession],
      ...logViewer<AppEnv>({ kv: (c) => c.env.LOGS_KV }),
      view: logsView as RouteView<AppEnv>,
    })

Track this in the project backlog. Until auth is added, consider blocking the route at
the Cloudflare Access layer or omitting it from the production bundle entirely.

---

## 5. No-PII Rule

### 5a. What May Never Appear in a Log Record

Log records stored in KV are accessible to anyone with KV read access, including future
`logViewer` users. The following data must never appear in any log field:

- Email addresses or usernames
- Names or any personally identifiable strings
- Form field values (message body, address, phone)
- Authentication tokens, session IDs, CSRF tokens
- API keys, secrets, or credentials
- IP addresses beyond what Cloudflare already strips

### 5b. What Is Safe to Log

- HTTP method and path (no query strings containing user data)
- Response status code
- Request duration in milliseconds
- The `requestId` opaque identifier
- Worker-internal event names (e.g., `"email_sent"`, `"turnstile_failed"`)

### 5c. Enforcement

Code review must verify that `bindings` factories and manual `channel.log()` calls contain
only the fields listed in §5b. No automated linting rule exists today — this is a manual
review gate.
