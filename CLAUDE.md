# CLAUDE.md — Architectural Constitution

> A Cloudflare Workers application on `@y-core/forge` — the fleet's **starter**, and its proof that
> the shared library is sufficient for a Worker app on its own. fetch-router over Tailwind v4 and
> HTMX, rendered SSR; static assets in `public/` are served by Wrangler.

---

## Behavioral Rules (always enforced)

- ONLY do what has been asked — recommend and get approval before any additions
- NEVER add runtime dependencies without approval
- NEVER hardcode API keys, secrets, or credentials in source files; never commit `.dev.vars` or `.env`
- NEVER provide deprecation shims or backward-compatible paths before v1.0.0 — if the best design
  breaks existing behaviour, update every call site
- NEVER reach into `node_modules` or import a wrapped dependency directly — every forge capability
  comes from its published subpath (`governance/FORGE_CONSUMPTION.md` §2)
- NEVER write a comment outside the budget in `governance/PRODUCTION_TS_RULES.md` §5 — one line
  of TSDoc per export, the `@public`/`@internal` tags, and the rare inline *why*. Nothing else.
  No `@example` blocks, no multi-paragraph rationale, no restating the code, no section banners,
  no TODOs. Code is the documentation; prose is a cost paid on every read. Fix an unclear line
  with a better name, not a comment
- ALWAYS delete unbudgeted comments from any file you touch — there is no grandfathering, and
  rationale worth keeping is routed to its single home (`governance/PRODUCTION_TS_RULES.md` §5c)
- ALWAYS give an exported symbol a domain word, so it can be found from a question and not only
  from a reference — `create` plus a generic noun is a prefix, not a name. One domain word is the
  floor and roughly the ceiling; do not lengthen a name past it
  (`governance/PRODUCTION_TS_RULES.md` §7)
- ALWAYS check forge before writing a cross-cutting capability
  (`governance/FORGE_CONSUMPTION.md` §1a)
- ALWAYS validate untrusted input at the boundary; services receive typed domain objects, and any
  path segment is sanitized against `../` traversal
- ALWAYS declare a route's guards in its middleware list, never inline in the handler
- ALWAYS enforce exact-match test assertions accounting for HTML entities — never substring
  matching on markup. Tests live in `tests/`, **not** co-located with source
- ALWAYS run local verification after changes — **delegate every gate run to `cc-tester`** (see
  _Verification Delegation_)
- ALWAYS report a command's exit status with the one canonical suffix — never a variant (see
  _Shell Exit Checks_)
- ALWAYS reach the ledger over MCP, and never work from a remembered copy of its rules — the tool
  descriptions and the refusals carry them, and a refusal is acted on rather than guessed past
- **Governance is overwrite-on-sync.** Never edit `.decisions/governance/**` in this repository;
  it is byte-identical across every application that clones the shared corpus, and an in-place
  edit is silently reverted by the next sync. A local ruling goes in
  `.decisions/implementation/**` (`governance/AGENT_GUIDE.md` §6d)
- Use `rg` for content search and `find` for file search

---

## Code Intelligence

When tracing where a symbol is defined or finding all references to it, use LSP
(goToDefinition, findReferences, hover) instead of Grep. LSP gives exact results; Grep gives
text matches.

Use Grep/Glob for discovery (finding files, searching patterns). Use LSP for understanding
(definitions, references, type info).

After locating a file with Grep/Glob, use LSP to navigate within it rather than reading the
whole file.

LSP resolves a symbol exactly once you hold one; a name is what gets you the first one, which is
why exported names carry a domain word (`governance/PRODUCTION_TS_RULES.md` §7).

**`.decisions/` is a hidden directory, so a bare `rg` from the repository root does not search
it.** A broad `rg 'pattern'` silently returns no governance hit — which reads as "no such rule"
rather than "not searched". Search the governing documents by explicit path, or with `--hidden`:

```bash
rg 'pattern' .decisions/          # explicit path — preferred
rg --hidden 'pattern'             # whole tree, including .decisions/ and .claude/
```

The Guide Index below hands you the path, so the explicit form is the normal one; reach for
`--hidden` only when searching across governance and source at once.

---

## Ledger

Tasks are tracked in the task-forge ledger via the `ledger` MCP tools. Scope is a property of the
URL, so no tool takes a `project` argument.

- Move a task to `doing` when you start it; call again only when its state actually changes,
  never to narrate progress.
- A read carries the `revision` a later edit must cite — read before you write.
- Record the resolution with, or before, the move to `done`.
- On a refusal, act on the payload: `rule` names what was applied, `requires` names the arguments
  to add, `retryable` says whether the call could succeed.

---

## Toolchain

| Tool | Role |
|---|---|
| `bun` | Package manager and test runner |
| `tsgo` (`@typescript/native-preview`) | Type checker (use instead of `tsc`) |
| `biome` | Linter and formatter (use instead of `eslint`/`prettier`) |
| `wrangler` | Cloudflare Workers dev server and deploy |
| `forge-assets` | Client bundle (esbuild), Tailwind v4 and Lucide sprite pipeline |

```bash
bun run verify                 # the gate — every step must pass
bun run verify --only lint     # one step, for the dev loop (any step label)
bun run verify --list          # print the steps, run none
bun run dev                    # asset build + wrangler dev (dev entry, live-reload)
bun run build:assets           # production asset build
bun run fix                    # auto-fix lint and formatting, then re-run the gate
```

**One command, two modes**, not two commands. `config/steps.ts` is the single source of truth for
the gate's steps and which of them are full-only; it default-exports the table `forge-verify`
loads, with no binding script between the two and no `&&` chain anywhere — generation leads
judgement, so a stale generated type surfaces as a type error rather than as a silent pass. This
repository declares no full-only step, so `--full` currently adds nothing; the flag is the gate's,
not the table's. Gate philosophy, the modes, and the flags:
[`TESTING.md`](.decisions/governance/TESTING.md) §6.

The table is near-pure `cloudflareWorkerSteps()` from `@y-core/forge/pkg` — this app is the fleet's
proof that the preset is sufficient for a Worker app, so a row that the preset does not emit is a
bug report against the preset rather than a local convenience.

**Avoid:** `tsc` (use `tsgo`), `npm`/`pnpm`/`yarn` (use `bun`), `eslint`/`prettier` (use
`biome`), runtime-specific type packages (use the hand-written stub).

### Shell Exit Checks

When a command's exit status must be stated explicitly, append **exactly** this suffix — same
spelling, same casing, same quoting, every time:

```bash
<command>; echo "EXIT:$?"
```

- Use `;`, never `&&` — with `&&` the echo is skipped precisely when the command fails, which is
  the only case worth checking.
- Never pipe within the same statement: `bun run verify | tail -20; echo "EXIT:$?"` reports
  `tail`'s status, not the gate's. Redirect first, then inspect the file:
  `bun run verify > /tmp/verify.log 2>&1; echo "EXIT:$?"`.
- Never invent a variant — `exit=$?`, `RC=$?`, or a re-quoted spelling all miss the allowlist and
  cost a fresh permission prompt each time.
- Omit the suffix when the exit code is not actually in question; a bare failing command already
  surfaces its status.

**There is exactly one permitted spelling, and `.claude/settings.local.json` allows exactly that
one.** An allowlist carrying several variants is how the rule stops being a rule.

### Verification Delegation

**`cc-tester` is the sole runner** of `bun run verify`, of any narrowed `--only` run, and of any
cross-cutting suite. It returns a terse verdict — `✓ green`, or `✗` with the failing step and a
minimal excerpt — **never the full stream**. `cc-plan`, `cc-dev`, and `cc-doc` delegate every gate
run to it; `cc-test` may smoke-run only the single test file it just wrote.

On failure the **owning** agent fixes and re-delegates — the gate never re-runs inside the agent
that owns the fix, and `cc-tester` never edits the code it judges. A **markdown-only change runs no
gate**; the doc edit is its own evidence.

`cc-tester` declares a `tools:` allowlist without `Write`/`Edit`, but **enforcement is not
guaranteed**. Treat the whole split as convention: every agent obeys its stated boundaries because
it is told to, not because a mechanism stops it.

---

## Architecture

**TypeScript everywhere, one composition root.** `src/worker.ts` exports
`createWorker(security: SecurityHeadersOptions)`, which calls `createApp`, `registerMiddleware`,
`app.map(routes, controller)` and `applyAssets`; its default export is the production app.
`src/worker.dev.ts` layers the Wrangler live-reload script hash onto that CSP, so the reload hash
cannot leak into production by construction.

| Layer | Role | Location | Runtime |
|---|---|---|---|
| **server** | routes, controllers, middleware, SSR views, CSP | `src/` | Cloudflare Worker — never ships to the browser |
| **domain** | typed page and site content shapes | `src/model/` | isomorphic |
| **services** | external integrations (email, and anything else off-Worker) | `src/services/` | Cloudflare Worker |
| **client** | HTMX wiring + mounted scopes | `src/client/` | browser |

**Pattern:** one composition root → global middleware → declarative route map → controllers →
services → views, over a model of typed domain shapes.

**Layer discipline:** every unit belongs to exactly one layer, and the layer decides what it may
import. Resolve placement by **concern first, then latency, then thread cost**; when two layers
fit, pick the one further from the request path.

For the route inventory, the config schema, the bindings, the guard chain and the design system,
consult `.decisions/implementation/` via the **Guide Index** — never duplicate that detail here.

---

## Guide Index

> Before writing code, consult the relevant governing document. Each begins with a
> `## 0. Quick Reference` listing every section, so you can pick a section without reading the
> whole file.
>
> **Two tables, two directories.** `governance/` holds the portable rules and is overwritten on
> sync; `implementation/` holds this repository's own decisions and is never touched by a sync
> ([`AGENT_GUIDE.md`](.decisions/governance/AGENT_GUIDE.md) §6d). Both tables must agree with
> their directory in both directions (§5c).

### Governance — portable, overwrite-on-sync

- [`AGENT_GUIDE.md`](.decisions/governance/AGENT_GUIDE.md): how `.decisions/` docs are structured, numbered, sized, and cross-referenced; the governance/implementation boundary; the single-home rule
- [`APP_ARCHITECTURE.md`](.decisions/governance/APP_ARCHITECTURE.md): the composition root, the layer stack and its dependency rules, DI through config, concern-first placement, the feature sequence
- [`FORGE_CONSUMPTION.md`](.decisions/governance/FORGE_CONSUMPTION.md): leverage the shared library first, never bypass its facade, local workaround versus upstream change, upgrading
- [`WORKERS_PLATFORM.md`](.decisions/governance/WORKERS_PLATFORM.md): the isolate model, post-response work, rate limiting, deploy safety and secrets, static assets
- [`PRODUCTION_TS_RULES.md`](.decisions/governance/PRODUCTION_TS_RULES.md): seven coding rules — zero global state, explicit errors, validation first, testability, **the comment budget (§5)**, declarative style, name distinctiveness (§7)
- [`BOUNDARIES.md`](.decisions/governance/BOUNDARIES.md): SSR versus browser, middleware ordering and guard placement, validate-at-boundary, no-PII logging, fail-closed
- [`ERROR_HANDLING.md`](.decisions/governance/ERROR_HANDLING.md): the one `Result` primitive, failures crossing a layer, fragment versus page, the error taxonomy
- [`TESTING.md`](.decisions/governance/TESTING.md): the app-request pattern, the environment fixture, exact-match assertions, fail-closed expectations, the gate
- [`CODE_REVIEW.md`](.decisions/governance/CODE_REVIEW.md): blocking invariants, tiered detection with a command per rule, severity calibration, known false positives

### Implementation — this repository only

- [`ARCHITECTURE_GUIDE.md`](.decisions/implementation/ARCHITECTURE_GUIDE.md): the `createWorker` composition root, this app's layer directories, the dev/prod CSP split, typed config access
- [`MIDDLEWARE_AND_CONTEXT.md`](.decisions/implementation/MIDDLEWARE_AND_CONTEXT.md): the registered middleware chain, the guard sentinels each route composes, the typed context accessors
- [`ROUTING.md`](.decisions/implementation/ROUTING.md): the route map, the controller binding, the guard checklist a new route must satisfy
- [`INPUT_VALIDATION.md`](.decisions/implementation/INPUT_VALIDATION.md): the contact schema, field reading, honeypot and Turnstile wiring, the CSRF configuration
- [`ERROR_HANDLING.md`](.decisions/implementation/ERROR_HANDLING.md): the fragment renderers this app calls, its HTMX target pattern, forge's error boundary
- [`STRUCTURED_LOGGING.md`](.decisions/implementation/STRUCTURED_LOGGING.md): the channels this app installs, KV persistence, request-id correlation, the admin log viewer
- [`CONFIGURATION_AND_SECRETS.md`](.decisions/implementation/CONFIGURATION_AND_SECRETS.md): the `AppConfigSchema` fields, the env vars and bindings behind them, how secrets reach the Worker
- [`DATA_STORAGE.md`](.decisions/implementation/DATA_STORAGE.md): the KV access patterns this app uses, binding validation, the shape a future D1 or R2 binding would take
- [`HANDLER_TESTING.md`](.decisions/implementation/HANDLER_TESTING.md): the minimum environment fixture and its per-field requirements, the CSRF minting recipe, the security assertions
- [`WEB_DESIGN.md`](.decisions/implementation/WEB_DESIGN.md): this app's Workers bindings and their limits, the asset build outputs, the wrangler configuration
- [`UI_GUIDE.md`](.decisions/implementation/UI_GUIDE.md): the view layer and layout composition, HTMX patterns, Tailwind theme tokens, the theme toggle
- [`CODE_REVIEW.md`](.decisions/implementation/CODE_REVIEW.md): this app's layer-compliance and forge-consumption checklists, its security review points, the do-not-flag table

**This index lists only documents that exist**, and a new document adds its own line here in the
same change that lands it.

---

## Growth Rules

Add new code in the layer its concern belongs to; reuse an existing export before adding one, and
never duplicate a capability forge already provides.

| Adding… | Goes to | Recipe |
|---|---|---|
| Route | `src/routes.ts` + a controller in `src/controllers/` + the binding in `src/router.tsx` | `implementation/ROUTING.md` §6a |
| HTMX fragment route | the same three files, returning `fragmentResponse` — never `renderPage` | `implementation/ROUTING.md` §6c |
| Route guard, or a change to guard order | `src/app/middleware.ts`, declared in the route's middleware list and never inline in the handler | `implementation/MIDDLEWARE_AND_CONTEXT.md` §3d |
| Global middleware | `registerMiddleware` in `src/app/middleware.ts`, ordered explicitly | `implementation/MIDDLEWARE_AND_CONTEXT.md` §1a |
| Context variable a handler reads | the typed accessors in `src/app/context.ts` — never an untyped `c.get` at a call site | `implementation/MIDDLEWARE_AND_CONTEXT.md` §2b |
| Per-request presentation value (nonce, CSRF token, base URL) | `renderContext` in `src/app/context.ts` | `implementation/MIDDLEWARE_AND_CONTEXT.md` §4a |
| Config value, env var, or binding | `AppConfigSchema` in `src/app/config.ts` — validated at startup, never read from `env` at a call site | `implementation/CONFIGURATION_AND_SECRETS.md` §1a |
| Workers binding declaration | `wrangler.jsonc` **and** the `AppEnv` type, amended together | `implementation/CONFIGURATION_AND_SECRETS.md` §4 |
| A secret | `.dev.vars` locally and `wrangler secret` in production — never a source file, never a commit | `implementation/CONFIGURATION_AND_SECRETS.md` §6d |
| Validation rule for submitted input | the valibot schema beside its handler, parsed with `v.safeParse` before any service call | `implementation/INPUT_VALIDATION.md` §1b |
| Bot or abuse check | ordered against the existing honeypot / CSRF / Turnstile sequence, never appended blindly | `implementation/INPUT_VALIDATION.md` §3c |
| A failure path a handler can return | a dedicated fragment renderer call **and** a test case for that status | `implementation/ERROR_HANDLING.md` §6 |
| Log field or channel | the channel set in `src/app/middleware.ts` — method, path, status, duration, requestId, and no PII | `implementation/STRUCTURED_LOGGING.md` §5 |
| KV access | a typed store from `createKVStore` with an explicit codec — never a raw binding call at a handler | `implementation/DATA_STORAGE.md` §2a |
| A D1 or R2 binding | the documented pattern plus startup validation in the same change | `implementation/DATA_STORAGE.md` §3, §4 |
| SSR component | a forge `ui/core` primitive composed in `src/views/` — never a raw element where a primitive exists | `governance/FORGE_CONSUMPTION.md` §1b |
| Inline script in a view | `src/views/layout.tsx`, carrying the nonce — never an unnonced `<script>` | `implementation/UI_GUIDE.md` §2a |
| Theme token | the `@theme` block in `src/assets/tailwind.css` — never an arbitrary value at a call site | `implementation/UI_GUIDE.md` §5a |
| Client behaviour | a mounted resumable scope in `src/client/main.ts` — never domain logic, and never a mode the server could render | `implementation/UI_GUIDE.md` §6c |
| Typed page or site content | `src/model/` — plain shapes, no I/O | `implementation/ARCHITECTURE_GUIDE.md` §2a |
| External integration | `src/services/`, reached only from a controller | `implementation/ARCHITECTURE_GUIDE.md` §2c |
| A test | `tests/`, using the `app.request` pattern against `MINIMUM_ENV` | `implementation/HANDLER_TESTING.md` §1a |
| Build-time config module — asset pipeline, gate step table | `config/` and `src/assets/config.ts` — outside `tsconfig.json`'s `include`, because a module that ships to no runtime must not widen the type program | see _Type System_ |
| A `.decisions/` document | `.decisions/implementation/` — with its Guide Index row added in the same change. **Never `governance/`**, which a sync overwrites | `governance/AGENT_GUIDE.md` §6d |

Every row names a **concrete destination** and a **`§N`-anchored recipe**. A row whose recipe
column says only "see the docs" is not a rule; delete it or finish it.

---

## Type System

- `"types": []` — global scope uses no `@types/*` packages; Cloudflare Workers types come via the
  generated `.types/cloudflare.d.ts`
- `.types/bun-test.d.ts` — a minimal `bun:test` module stub for tests
- Do **not** install or use `bun-types` — it overrides DOM's `fetch` type with Bun-specific
  properties. `@types/bun` is not a dependency; the custom stub covers all test needs
- **`@y-core/forge` resolves to the installed package, and that is the only forge this repo has.**
  `tsconfig.json` declares exactly one `paths` alias — `@assets` → `./.forge/assets.ts`, the
  generated asset manifest. `@y-core/forge/*` is **not** aliased: it resolves through
  `node_modules` like any dependency, so `bun run verify` typechecks against whatever the manifest
  installs. A checkout of forge sitting elsewhere on the machine is not a dependency here — never
  imported, and never consulted to answer a question about behaviour

**Note:** `config/` is deliberately outside `include`. `config/steps.ts` imports
`@y-core/forge/pkg`, which pulls forge's build-time tree into the type program; that tree
typechecks only with node's `process` and `Buffer` in global scope — exactly what `"types": []`
withholds from the Worker. It is still linted, via `sources` in the step table.

---

## Agents

Five agents, with their rulesets inlined: `cc-plan` → `cc-dev` → `cc-test`, with `cc-doc` outside
that pipeline and `cc-tester` as the sole gate runner (_Verification Delegation_ above). They live
in `.claude/agents/`; reusable slash commands (`c-review`, `c-unreview`) live in
`.claude/commands/`. Both directories are synced from `@y-core/governance` and overwritten
wholesale — a local change to either belongs in the corpus, not here.
