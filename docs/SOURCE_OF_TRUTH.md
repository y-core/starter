---
title: Source of Truth Register
description: "Which file owns each fact in the starter, so every other document cites it and restates none of it."
---

# Source of Truth Register

> The register `AGENT_GUIDE.md` §8 requires: every fact that would otherwise drift, and the one file
> that owns it. A source file named here is **authoritative over any prose about it**, anywhere in
> `docs/` or `CLAUDE.md`.
>
> The rule lives in the canon; the rows are the starter's own and live here.
>
> Defers to: `AGENT_GUIDE.md` §8 for the single-home rule this table serves, and
> `AGENT_GUIDE.md` §5d for why a document names a canon file in prose rather than linking it.

---

## 0. Quick Reference

- §1 How to use the register: what "authoritative" means in practice
- §1a Reading a row: the source file beats prose, always
- §1b Adding a row: when a fact earns one
- §2 The register: every owned fact and its file
- §2a Build-time facts: the gate and the asset pipeline
- §2b Request-path facts: routes, middleware, context
- §2c Deployment facts: config, bindings, theme

---

## 1. How to Use the Register

### 1a. Reading a Row

**When a row names a file, that file wins.** A document that contradicts it is wrong by default,
and the fix is to delete the prose rather than to reconcile the two. Prose may describe the shape of
a fact and the reasoning behind it; it may not re-enumerate the fact itself, because a second copy
drifts silently.

### 1b. Adding a Row

A fact earns a row when it is enumerable, it changes, and more than one document is tempted to
restate it — a list of routes, a set of bindings, a table of steps. A fact that appears in exactly
one place already has a single home and needs no row.

---

## 2. The Register

### 2a. Build-Time Facts

| Fact owned                                                           | File that owns it  |
| -------------------------------------------------------------------- | ------------------ |
| The gate's steps and each one's tier                                 | `config/steps.ts`  |
| The asset pipeline's inputs and outputs                              | `config/assets.ts` |
| The queries retrieval is held to, and the ones it must refuse        | `config/golden.ts` |
| Where seeds live, and any library migration source beyond convention | `config/db.ts`     |

### 2b. Request-Path Facts

| Fact owned                                                               | File that owns it                           |
| ------------------------------------------------------------------------ | ------------------------------------------- |
| The route map and its controller bindings                                | `src/routes.ts`, `src/router.tsx`           |
| The middleware chain and its order                                       | `src/app/middleware.ts`                     |
| Which second factors this deployment offers, and what it demands of each | `src/app/config.ts` (`AUTH_SECOND_FACTORS`) |
| The auth seams, stores and step-up window                                | `src/app/auth.ts`                           |
| The typed context accessors                                              | `src/app/context.ts`                        |
| Which allowances development gets and production does not                | `src/worker.dev.ts`                         |

`src/worker.dev.ts` owns the Turnstile posture in the sense that matters: `TURNSTILE_DEV_HOSTNAME`
is declared in `src/app/config.ts` like every other value, but whether it is consulted at all is
decided by the middleware only this entry point registers. Read the entry point to know what a
running app allows; the schema alone cannot tell you.

The route row names two files because the map and the binding are separable: `src/routes.ts` owns
which paths exist and what guards each carries, and `src/router.tsx` owns which controller each path
reaches.

The two auth rows are why [AUTH.md](./AUTH.md) describes the factor policy and the step-up window
without re-enumerating either: it owns the _reasoning_ — why a factor absent from the record is
invisible, why the window is decided at bootstrap — and the source files own the values. Everything
else in that document is forge's behaviour, which the installed library's own `AUTH_MOUNTING.md` and
`AUTH_FLOWS.md` own and which nothing here restates.

### 2c. Deployment Facts

| Fact owned                                                                     | File that owns it                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| The config schema, and every env var and binding behind it                     | `src/app/config.ts`                                    |
| Workers bindings as deployed, and the migrations directory each database reads | `wrangler.jsonc`                                       |
| Which files `forge db` reads at all                                            | `config/db.ts`                                         |
| What this app's own schema should be                                           | `config/schema.sql`                                    |
| Every migration that runs, and what the last compose saw                       | `config/migrations/` and `config/schema.snapshot.json` |
| The theme tokens                                                               | `src/assets/tailwind.css`                              |

`src/app/config.ts` and `wrangler.jsonc` are both authoritative and neither is derived from the
other: the schema owns what the application requires, the wrangler file owns what the platform
provides. A binding added to one without the other fails at startup validation, which is the
intended way for the disagreement to surface.

The database's owners split the same way. `config/db.ts` owns **which files `forge db` reads at
all** — its `schemas` list names every desired-state file by path, in load order, and nothing else is
read, so an installed package contributes DDL only because this app asked for it. `wrangler.jsonc`
owns `migrations_dir`, the position of the one directory every migration runs from.
`config/schema.sql` owns **what this app's own schema should be** — its tables alone, never a
library's. `config/migrations/` owns **everything that runs**, this app's flat numbered sequence,
generated by `bun run db:compose` from every declared file, and never written by hand where compose
can express the change. `config/schema.snapshot.json` owns **what the last compose saw** — a digest
per declared file, this app's migrations digest, and the model of everything they build together —
which is what makes an upgraded library fail `bun run db:schema:check` by path
([DATA_STORAGE.md](./DATA_STORAGE.md) §3c).
