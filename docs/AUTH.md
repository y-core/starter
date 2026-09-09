---
title: Authentication
description: "What this deployment mounts of forge's auth: the three route groups, the second-factor configuration, the session model and revocation barrier, the stores behind AUTH_DB, and the scheduled purge."
---

# Authentication

> Every flow, page, ceremony and store here is forge's. This document owns only what **this
> deployment decided**: which factors it offers, which guards its own pages carry, and how the
> ephemera it accumulates is reclaimed.
>
> Defers to: the installed library's `AUTH_MOUNTING.md` for what each `register*` mounts and what
> `AuthWebOptions` seams exist, and `AUTH_FLOWS.md` for the sign-in, sign-up, step-up and
> email-change flows themselves. Neither is citable by path here — reach them with
> `warden search --dependency "…"`.
>
> Complements [CONFIGURATION_AND_SECRETS.md](./CONFIGURATION_AND_SECRETS.md) §4d (the bindings),
> [DATA_STORAGE.md](./DATA_STORAGE.md) §1d and §3 (the stores), and
> [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3 (guard placement).

---

## 0. Quick Reference

- §1 What is mounted: three forge route groups plus three pages this app owns
- §1a The three register calls
- §1b The three pages this app owns
- §2 Stores: one D1 client per request, one KV namespace for sessions
- §2a authStores — the eight stores over AUTH_DB
- §2b resolveAuthRequestServices — the per-request seam
- §3 The session model: absolute lifetime, the revocation barrier, the step-up window
- §3a The three session keys
- §3b The seven-day absolute lifetime
- §3c The revocation barrier
- §3d The fifteen-minute step-up window
- §4 AUTH_SECOND_FACTORS — what this deployment demands
- §5 The guard chain, in registration order
- §6 purgeAuthStores — the scheduled reclaim

---

## 1. What Is Mounted

### 1a. The Three Register Calls

`src/router.tsx` mounts three forge route groups, each over a prefix declared in `src/routes.ts`:

    registerAuth(app, authRouteMap, authWebOptions)        // authRoutes("/auth")
    registerAccount(app, accountRouteMap, authWebOptions)  // accountRoutes("/account")
    registerAdmin(app, adminRouteMap, authWebOptions)      // adminRoutes("/admin")

`authWebOptions` in `src/app/auth.ts` is the one options object all three read. It names the
`resolveServices` seam (§2b), the `paths` builders so no path literal is written twice, the icon
sprite, and `settledPath: routes.account.href()` — this app's own page, never forge's passkey list,
which a deployment that switched passkeys off would have no page to land on.

### 1b. The Three Pages This App Owns

| Route                        | Controller                     | What it is                                                                                                                                      |
| ---------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `/welcome`                   | `welcomeController`            | Forge's `SigninView` — the same paths and the same path-bound token `/auth/signin` renders — inside this app's chrome, on a route this app owns |
| `/account`                   | `accountController`            | The signed-in landing page: address, verification and creation dates, and links to the factor and email-change pages                            |
| `/auth/email-change/confirm` | `emailChangeConfirmController` | Consumes the emailed token and reports the outcome                                                                                              |

`/account` is this app's rather than forge's passkey list because the second factor is a switch here
(§4): a landing page belonging to one factor breaks the moment that switch stops naming it.

---

## 2. Stores

### 2a. authStores — the Eight Stores over AUTH_DB

`authStores(env)` in `src/app/auth.ts` builds one `createD1Client(env.AUTH_DB)` and hands it to
every store forge asks for: users, admin users, factor enrolments, credentials, identity links, OTP
state, challenges and nonces. Challenges and nonces take a prefix (`chal`, `nonce`) so two stores
over one table cannot collide.

Sessions are the exception — they live in `AUTH_KV`, not `AUTH_DB`, through
`createKVSessionStorage(env.AUTH_KV, { prefix: "sess" })` in `authSessionGuard`.

### 2b. resolveAuthRequestServices — the Per-Request Seam

`resolveAuthRequestServices(c)` is what every forge loader, action and guard reaches the domain
through. It memoises on a context variable, so the key ring import, the store construction and the
factor registry cost one build per request no matter how many guards ask.

---

## 3. The Session Model

### 3a. The Three Session Keys

Forge writes three keys into the signed `__Host-session` cookie's session: the user id, the instant
the session was established, and the instant it last completed a step-up.

### 3b. The Seven-Day Absolute Lifetime

A session is over seven days after it was **established**, not after it was last used: the
established-at stamp is written once at sign-in and never refreshed. A session carrying no stamp at
all is treated as expired rather than unbounded, because there is no bound a missing stamp could be
checked against.

**That is why the 0.1.9 deploy signs everyone out once.** Any session issued before the stamp
existed carries none, so the first request after the deploy revokes it and the visitor signs in
again. It is a one-time operational effect, not a defect.

### 3c. The Revocation Barrier

A user row carries a `sessionsInvalidBefore` instant, and every session established at or before it
dies on its own next request — including the ones the request raising the barrier cannot see.
Removing a passkey, moving an address or deactivating an account all raise it. A store outage denies
the request without clearing the session, so a database blip does not sign the whole site out.

### 3d. The Fifteen-Minute Step-Up Window

`STEP_UP_WINDOW_MS` in `src/app/auth.ts` is 900,000 ms. A mutation on the account or admin pages
demands a step-up completed inside that window; an older mark is stale and the visitor is sent to
`authWebPaths.auth.verify.show()`.

---

## 4. AUTH_SECOND_FACTORS — What This Deployment Demands

`src/app/config.ts` owns the one declaration a developer edits:

    export const AUTH_SECOND_FACTORS: Record<StepUpFactor, "mandatory" | "optional" | "off"> =
      { "totp-app": "mandatory", passkey: "optional" }

Three consequences follow, and each is why the switch is a literal rather than an env read:

- **A factor set to `"off"` is never constructed.** There is no enrolment page to reach, no ceremony
  button to render and no demand to owe — a visitor is never shown the factor exists. The map is
  total and `"off"` is the switch, because a partial record admits `{ passkey: undefined }`, which
  TypeScript does not catch and which reaches forge's `demanded()` as a TypeError on every guarded
  page.
- **Declared order decides which factor the verify page demands** when two are enrolled, because
  forge renders no chooser.
- **Naming `passkey` offers it as a step-up, and nothing more.** No configuration makes a passkey
  start a sign-in: forge's primary factor must identify the visitor, and a passkey identifies nobody.

The emailed one-time code is the primary factor and is always present; it is not a `StepUpFactor`
and is not listed here.

It is a literal and not an `env()` read because the guard chain is built once at bootstrap, where no
request `env` exists and `freshStepUpMaxAgeMs` has to be decided in the same pass.

---

## 5. The Guard Chain, in Registration Order

`registerMiddleware` in `src/app/middleware.ts` registers, in this order:

1. `authSessionGuard` on `*` — the signed session every guard and action below reads.
2. `authCsrfGuard` on `/auth/*`, `/account/*`, `/admin/*`, `/welcome` and `/account` — CSRF tokens
   additionally bound to the session that minted them. `/welcome` joins the auth prefixes because it
   embeds forge's sign-in form, which posts to `/auth/signin`: the token has to be minted under the
   same session binding that path is verified with.
3. `authGuardGroups()` — forge's own group table, built from `createAuthGuards`. It carries the
   identity and enrolment guards, the origin policy for the four unauthenticated POSTs (whose groups
   declare no guards of their own), and the rate-limit policies.
4. `accountGuards` on `/account` — `requireAuth` then `requireEnrolment`, so this app's own landing
   page demands exactly what forge's account group demands. Without `requireEnrolment` a visitor who
   still owes the mandatory factor would sit on a signed-in page, which reads the demand as optional.

Guards are declared here and never inline in a handler
([MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §3d).

---

## 6. purgeAuthStores — the Scheduled Reclaim

KV expired a key on its own; SQLite keeps the row. `purgeAuthStores(env)` in `src/app/auth.ts`
calls forge's `purgeAuthEphemera(db, Date.now())`, which deletes the `auth_challenges` and
`auth_nonces` rows that have expired.

It is driven by the worker's `scheduled` handler, on the hourly cron declared in `wrangler.jsonc`:

    "triggers": { "crons": ["0 * * * *"] }

Both worker entries export a module object rather than the app itself, because `fetch` is a method
on the Forge instance and `scheduled` is a second entry point, not a route:

    export const app = createWorker(securityHeaders)
    export default {
      fetch: (request, env, ctx) => app.fetch(request, env, ctx),
      scheduled: (_event, env, ctx) => ctx.waitUntil(purgeAuthStores(env)),
    }

**This is housekeeping, not correctness.** Every read already holds a row against the clock, so an
expired challenge or nonce is inert long before the purge reaches it — a deployment that never
purges is slower, not wrong. Hourly is chosen on that basis. `purgeAuthStores` still throws on a
store failure, so a scheduled run that has silently stopped reclaiming shows up in the run's logs.
