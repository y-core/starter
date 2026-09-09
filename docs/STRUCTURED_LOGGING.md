---
title: Structured Logging
description: "The channels this app installs, KV log persistence, request-id correlation, and the auth-gated log viewer."
---

# Structured Logging

> Channels, KV persistence, request correlation, and the admin log viewer route.
> Complements [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §1b.

---

## 0. Quick Reference

- §1 Channel Configuration: `consoleChannel` + `kvLogChannel` (LOGS_KV binding)
- §1a Dual Channel Setup
- §1b LOGS_KV Wrangler Binding
- §1c AppEnv Typing
- §2 Request correlation: `requestId` feeds into `requestLogger` bindings
- §2a Middleware Order: requestId Before requestLogger
- §2b requestId Propagation to Downstream Services
- §2c requestId in Error Responses
- §3 Log levels: INFO / WARN / ERROR mapped by HTTP status range
- §3a Status-to-Level Mapping
- §3b Structured Fields Per Record
- §4 Admin Log Viewer: `/showcase/logs` route, `showLogsController` with `loadLogViewer` from forge
- §4a /showcase/logs Route Wiring
- §4b Access Control — debug-gated, fail-closed
- §5 What this app is allowed to log: the closed field set at §3b, and why the viewer is still gated

---

## 1. Channel Configuration

### 1a. Dual Channel Setup

Both channels are configured at the `requestLogger` call site in `src/app/middleware.ts`
(the middleware composition layer). The channel factory receives the request context `c`
so it can read bindings:

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
The `showLogsController` reads from this same namespace via `loadLogViewer`, so `/showcase/logs` works locally without
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
`requestId` sets `requestIdCtx` in the request context. `requestLogger` reads it via its
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

| Status range | Level | Meaning              |
| ------------ | ----- | -------------------- |
| < 400        | INFO  | Successful request   |
| 400 – 499    | WARN  | Client error         |
| >= 500       | ERROR | Server / infra error |

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

### 4a. /showcase/logs Route Wiring

    // src/routes.ts
    import { get, route } from "@y-core/forge/router"
    showcase: { logs: get("/showcase/logs"), ... }

    // src/controllers/show.logs.tsx
    import { loadLogViewer } from "@y-core/forge/logging/show"
    import { definePage } from "@y-core/forge/app"
    import { CoreIcon } from "@assets"

    export const showLogsController = definePage<AppEnv, AppConfig, Response>({
      loader: (c, _config) =>
        loadLogViewer(c, {
          channel: (cc) => kvLogChannel(cc.env.LOGS_KV),
          access: (cc) => configStore.get(cc.env).site.debug,
          icon: CoreIcon,
          basePath: routes.showcase.logs.href(),
        }),
      view: (_c, _cfg, state) => state.data,
    })

`loadLogViewer` queries LOGS_KV with optional `?q=`, `?level=`, `?limit=` and `?cursor=` query
parameters for filter and cursor-based pagination. It returns a fully rendered `Response` for
every path — the full page, the `<tbody>` HTMX partial, the `<tr>` cursor page and the detail
cell — because the record-rendering components are internal. A loader returning a `Response`
short-circuits rendering, so the `view` is a pass-through and there is no separate view component
in the app. The viewer builds no document of its own — it renders through the shell `worker.ts`
registers, which is what puts it inside the `<html>` carrying the dark class and the pre-paint theme
script.

### 4b. Access Control — debug-gated, fail-closed

`/showcase/logs` carries no auth guard and needs none in this app: `loadLogViewer`'s `access`
predicate reads `configStore.get(cc.env).site.debug`, which is true only when `LOG_LEVEL=DEBUG`.
Production leaves `LOG_LEVEL` unset, so the route answers 403. `access` runs before the channel is
built, so a denial never reads KV — logs carry request paths, request ids and error messages.

Adding sessions to this app would make an auth middleware the better gate; until then the config
flag is the whole control, and it is fail-closed by default rather than by remembering to set it.

---

## 5. What This App Is Allowed to Log

`BOUNDARIES.md` §4 states the no-PII rule and the field classes it prohibits. **This app narrows it
to a closed set**: the seven fields at §3b, plus whatever `bindings` merges — and `bindings` merges
`requestId` and nothing else (§1a). Any other field is a change to that one factory in
`src/app/middleware.ts`, which is the single place to review a new field against the rule.

Two consequences worth stating, because both are easy to reach by accident:

- **The contact submission is never logged**, not even redacted. `sendContactEmail` receives the
  submitter's name, email and message; it logs the outcome, not the payload.
- **`/showcase/logs` is a PII surface even so**, because request paths and error messages reach KV.
  That is why §4b gates it fail-closed rather than trusting the field set alone.
