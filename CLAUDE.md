# CLAUDE.md — Architectural Constitution

> fetch-router (TypeScript Worker) + Tailwind CSS v4 + HTMX on Cloudflare Workers.
> forge's `Forge` router owns all routes. Static assets (`public/`) served via Wrangler.

---

## Behavioral Rules (always enforced)

- ONLY do what has been asked — recommend and get approval before any additions
- NEVER create documentation files (`*.md`) unless explicitly requested
- NEVER hardcode API keys, secrets, or credentials in source files
- NEVER commit secrets, credentials, or `.env` files
- ALWAYS validate user input at system boundaries; sanitize file paths (prevent `../` traversal)
- ALWAYS ensure implementations leverage `@y-core/forge/security` (`makeSecurityHeaders`)
- ALWAYS run local verification after changes — **delegate every gate run to `cc-tester`** (see _Verification Delegation_)
- ALWAYS report a command's exit status with the one canonical suffix — never a variant (see _Shell Exit Checks_)
- ALWAYS account for HTML-encoded entities in test assertions for HTML output
- ALWAYS enforce exact-match test assertions — never substring matching
- Use native `rg` (ripgrep) for content search and `find` for file search
- NEVER provide deprecation shims or backward-compatible patterns before v1.0.0
- NEVER write a comment outside the budget in `governance/PRODUCTION_TS_RULES.md` §5 — one line of TSDoc per export, the `@public`/`@internal` tags, and the rare inline *why*. Nothing else
- ALWAYS declare a route's guards in its middleware list, never inline in the handler
- **Governance is overwrite-on-sync.** Never edit `.decisions/governance/**`; it is byte-identical across every forge application, and an in-place edit is silently reverted by the next sync. A local ruling goes in `.decisions/implementation/**` (`governance/AGENT_GUIDE.md` §6d)

---

## Code Intelligence

When tracing where a symbol is defined or finding all references to
it, use LSP (goToDefinition, findReferences, hover) instead of Grep.
LSP gives exact results; Grep gives text matches.

Use Grep/Glob for discovery (finding files, searching patterns). Use
LSP for understanding (definitions, references, type info).

After locating a file with Grep/Glob, use LSP to navigate within it
rather than reading the whole file.

---

## Ledger

ledger tasks are tracked in the task-forge ledger via the `ledger` MCP tools.
Scope is a property of the URL, so no tool takes a `project` argument.

- Move a task to `doing` when you start it; call again only when its state
  actually changes, never to narrate progress.
- A read carries the `revision` a later edit must cite — read before you write.
- Record the resolution with, or before, the move to `done`.
- On a refusal, act on the payload: `rule` names what was applied, `requires`
  names the arguments to add, `retryable` says whether the call could succeed.

---

## Toolchain

| Tool | Role |
|---|---|
| `bun` | Package manager and script runner |
| `tsgo` (`@typescript/native-preview`) | Type checker (10× faster than tsc) |
| `biome` | Linter and formatter |
| `wrangler` | Cloudflare Workers deploy and dev server |
| `forge-assets` | Client bundle (esbuild) + Tailwind CSS + Lucide sprite pipeline |

**Key commands:**

```bash
bun run verify        # the gate: wrangler runtime types → wrangler binding types → asset types
                      #   → typecheck → lint → test
bun run verify --list # the step labels, in order, without running any of them
bun run dev           # build assets + watch CSS + wrangler dev (dev entry, live-reload)
bun run fix           # auto-fix lint/format issues
bun run test          # tests
```

The gate's six steps are declared in `config/steps.ts`, which default-exports the table that the
`forge-verify` bin loads. There is no binding script between the two, and no `&&` chain anywhere:
generation leads judgement, so a stale generated type surfaces as a type error rather than as a
silent pass. The table is near-pure `cloudflareWorkerSteps()` from `@y-core/forge/pkg` — this app is
the fleet's proof that the preset is sufficient for a Worker app, so a row that the preset does not
emit is a bug report against the preset rather than a local convenience.

**Avoid:** `tsc` (use `tsgo`), `npm`/`pnpm`/`yarn` (use `bun`), `eslint`/`prettier` (use `biome`).

### Shell Exit Checks

When a command's exit status must be stated explicitly, append **exactly** this suffix — same
spelling, same casing, same quoting, every time:

```bash
<command>; echo "EXIT:$?"
```

- Use `;`, never `&&` — with `&&` the echo is skipped precisely when the command fails, which is
  the only case worth checking.
- Never pipe within the same statement; redirect to a file first, then inspect it.
- Never invent a variant — `exit=$?`, `RC=$?`, or a re-quoted spelling all miss the allowlist and
  cost a fresh permission prompt each time.

**There is exactly one permitted spelling, and `.claude/settings.local.json` allows exactly that
one.**

### Verification Delegation

**`cc-tester` is the sole runner** of the verification gate and any cross-cutting suite. It returns
a terse verdict — `✓ green`, or `✗` with the failing step and a minimal excerpt — **never the full
stream**. `cc-plan`, `cc-dev`, and `cc-doc` delegate every gate run to it; `cc-test` may smoke-run
only the single test file it just wrote.

On failure the **owning** agent fixes and re-delegates — the gate never re-runs inside the agent
that owns the fix, and `cc-tester` never edits the code it judges.

---

## Architecture

**Entry:** `src/worker.ts` exports `createWorker(security: SecurityHeadersOptions)` — a factory that calls `createApp`, `registerMiddleware` (security headers, requestId, logging, CORS), `app.map(routes, controller)`, and `applyAssets`. Its default export is the production app (base CSP: `['self', NONCE, TURNSTILE_CSP]`).

**Dev entry:** `src/worker.dev.ts` — default-exports `createWorker(mergeSecurityHeaders(securityHeaders, { scriptSrc: [WRANGLER_LIVE_RELOAD_HASH] }))`. Layers the Wrangler live-reload inline-script hash onto the prod CSP for `wrangler dev --live-reload`. The reload hash is deliberately kept out of the production CSP so it cannot leak by construction.

**Routes:** `src/routes.ts` — declarative route map using `get()`/`post()` path helpers; `src/router.tsx` — controller binding using `@y-core/forge/router`.

**Controllers:** `src/controllers/*.{ts,tsx}` — plain controller modules (`{ middleware, handler }` or a bare handler). GET handlers use `definePage({ loader, view })` from `@y-core/forge/app`; the `view` calls `renderPage()` from `@y-core/forge/render`. Mutation handlers return `fragmentResponse` with forge fragment helpers. `health` stays inline in `router.tsx`; `adminLogs` is its own controller module.

**Views:** `src/views/*.tsx` — forge JSX components (`@jsxImportSource @y-core/forge/jsx`; NOT Hugo templates). Page views own their `<Layout>` composition (the `children` Slot); `renderPage()` from `@y-core/forge/render` converts JSX to an `HtmlResponse`.

**Services:** `src/services/` — external integrations (email, etc.).

**Client JS:** `src/client/main.ts` — esbuild-bundled for browser, output to `public/assets/js/`.

**Content model:** `src/model/` — TypeScript types for page data.

**Styles:** `src/assets/tailwind.css` — Tailwind v4 entry point with `@theme {}` tokens.

**Shared lib:** `@y-core/forge` (GitHub: `github.com/y-core/forge`) — reusable utilities for fetch-router + Workers.

## Guide Index

> Before writing code, consult the relevant governing document. Each begins with a
> `## 0. Quick Reference` listing every section, so you can pick a section without reading the
> whole file.
>
> **Two tables, two directories.** `governance/` holds the portable rules shared with every forge
> application and is overwritten on sync; `implementation/` holds this app's own decisions and is
> never touched by a sync ([`AGENT_GUIDE.md`](.decisions/governance/AGENT_GUIDE.md) §6d).

### Governance — portable, overwrite-on-sync

- [`AGENT_GUIDE.md`](.decisions/governance/AGENT_GUIDE.md): how `.decisions/` docs are structured, numbered, sized, and cross-referenced; the governance/implementation boundary; the single-home rule
- [`APP_ARCHITECTURE.md`](.decisions/governance/APP_ARCHITECTURE.md): the composition root, the layer stack and its dependency rules, DI through config, concern-first placement, the feature sequence
- [`FORGE_CONSUMPTION.md`](.decisions/governance/FORGE_CONSUMPTION.md): leverage forge first, never bypass its facade, local workaround versus upstream change, upgrading
- [`WORKERS_PLATFORM.md`](.decisions/governance/WORKERS_PLATFORM.md): the isolate model, post-response work, rate limiting, deploy safety and secrets, static assets
- [`PRODUCTION_TS_RULES.md`](.decisions/governance/PRODUCTION_TS_RULES.md): six coding rules — zero global state, explicit errors, validation first, testability, **the comment budget (§5)**, declarative style
- [`BOUNDARIES.md`](.decisions/governance/BOUNDARIES.md): SSR versus browser, middleware ordering and guard placement, validate-at-boundary, no-PII logging, fail-closed
- [`ERROR_HANDLING.md`](.decisions/governance/ERROR_HANDLING.md): the one `Result` primitive, failures crossing a layer, fragment versus page, the error taxonomy
- [`TESTING.md`](.decisions/governance/TESTING.md): the app-request pattern, the environment fixture, exact-match assertions, fail-closed expectations, the gate
- [`CODE_REVIEW.md`](.decisions/governance/CODE_REVIEW.md): blocking invariants, tiered detection with a command per rule, severity calibration, known false positives

### Implementation — this app only

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

---

## Type System

- `"types": []` — global scope uses no `@types/*` packages; Cloudflare Workers types come via the generated `.types/cloudflare.d.ts`
- `.types/bun-test.d.ts` — minimal `bun:test` module stub for tests
- Do NOT install or use `bun-types` — it overrides DOM's `fetch` type with Bun-specific properties
- `@types/bun` is NOT a dependency; the custom stub covers all test needs

**Note:** `tsconfig.json` declares exactly one `paths` alias — `@assets` → `./.forge/assets.ts`, the generated asset manifest. `@y-core/forge/*` is **not** aliased: it resolves through `node_modules` like any dependency, so `bun run verify` typechecks against whatever the manifest installs. A `file:` dependency is therefore the way to verify a cross-repo change end-to-end before cutting a forge release — and the package name in `dependencies` must stay `@y-core/forge`, since that is what every import in this repo writes.

**Note:** the `file:` link costs one line, in `config/steps.ts`. bun *links* a `file:` dependency and
realpaths an imported module — though not the entry point — so forge's `app-root.ts` sees its own
checkout with no `node_modules` above it, and `resolveAppRoot`'s derived branch refuses. `steps.ts`
therefore sets `FORGE_APP_ROOT` from its own path (cwd-independent) before exporting the table; the
gate's `types:assets` row inherits it. This stays app-side deliberately — the link is this app's
workflow choice, and forge should carry no resolution branch for an install shape production never
uses. The two consequences: `types:assets` is `forge-verify --only types:assets`, so the escape hatch
and the gate row are literally one thing rather than two spellings of it; and `build:assets`, the one
asset command outside the gate, passes `--root .` explicitly.

**Note:** `config/` is deliberately outside `include`. `config/steps.ts` imports `@y-core/forge/pkg`, which pulls forge's build-time tree into the type program; that tree typechecks only with node's `process` and `Buffer` in global scope — exactly what `"types": []` withholds from the Worker. It is still linted, via `sources` in the step table.

---

## Agents

Five agents, with their rulesets inlined: `cc-plan` → `cc-dev` → `cc-test`, with `cc-doc` outside
that pipeline and `cc-tester` as the sole gate runner (_Verification Delegation_ above). They live
in `.claude/agents/`; reusable slash commands (`c-review`, `c-unreview`) live in
`.claude/commands/`.
