# CLAUDE.md — Architectural Constitution

> A Cloudflare Workers application on `@y-core/forge` — the fleet's **starter**, and its proof that
> the shared library is sufficient for a Worker app on its own. fetch-router over Tailwind v4 and
> HTMX, rendered SSR; static assets in `public/` are served by Wrangler.

---

## Behavioral Rules (always enforced)

- ONLY do what has been asked, and never add a runtime dependency without approval
  (`AGENT_WORKFLOW.md` §1)
- NEVER hardcode API keys, secrets, or credentials in source files; never commit `.dev.vars` or `.env`
- NEVER provide deprecation shims or backward-compatible paths before v1.0.0 — if the best design
  breaks existing behaviour, update every call site
- NEVER reach into `node_modules` or import a wrapped dependency directly — every forge capability
  comes from its published subpath (`FORGE_CONSUMPTION.md` §2)
- NEVER write a comment outside the budget in `CODE_RULES.md` §5 — one line
  of TSDoc per export, the `@public`/`@internal` tags, and the rare inline _why_. Nothing else.
  No `@example` blocks, no multi-paragraph rationale, no restating the code, no section banners,
  no TODOs. Code is the documentation; prose is a cost paid on every read. Fix an unclear line
  with a better name, not a comment
- ALWAYS delete unbudgeted comments from any file you touch — there is no grandfathering, and
  rationale worth keeping is routed to its single home (`CODE_RULES.md` §5c)
- ALWAYS give an exported symbol a domain word, so it can be found from a question and not only
  from a reference — `create` plus a generic noun is a prefix, not a name. One domain word is the
  floor and roughly the ceiling; do not lengthen a name past it
  (`CODE_RULES.md` §7)
- ALWAYS check forge before writing a cross-cutting capability
  (`FORGE_CONSUMPTION.md` §1a)
- ALWAYS validate untrusted input at the boundary; services receive typed domain objects, and any
  path segment is sanitized against `../` traversal
- ALWAYS declare a route's guards in its middleware list, never inline in the handler
- ALWAYS enforce exact-match test assertions accounting for HTML entities — never substring
  matching on markup. Tests live in `tests/`, **not** co-located with source
- ALWAYS run local verification after changes — **the full gate goes to `cc-tester`**; a single
  scoped step is yours to run (see _Verification Delegation_, and `AGENT_WORKFLOW.md` §4)
- ALWAYS write for the reader, not the record — a governing document and a message to a person are
  both judged on whether their reader gets what they need, can find it, can understand it, and can
  act on it (`PLAIN_LANGUAGE.md` §2). Lead with the outcome, match length to substance,
  and never compress away a caveat that would change what the reader does next
  (`PLAIN_LANGUAGE.md` §3d, §8)
- ALWAYS report a command's exit status with the one canonical suffix — never a variant (see
  _Shell Exit Checks_, and `AGENT_WORKFLOW.md` §3)
- ALWAYS reach the ledger over MCP, and never work from a remembered copy of its rules — the tool
  descriptions and the refusals carry them, and a refusal is acted on rather than guessed past
  (`AGENT_WORKFLOW.md` §5)
- **Governance is overwrite-on-sync.** Never edit the canon to record a ruling that is this
  repository's own; it is byte-identical across every application that reads the shared corpus, and
  it is not writable from here in any case. A local ruling goes in `docs/`
  (`AGENT_GUIDE.md` §6d)
- Use `rg` for content search, `find` for file search, and LSP for definitions and references
  (`AGENT_WORKFLOW.md` §2)

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
why exported names carry a domain word (`CODE_RULES.md` §7).

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
| `tsc` (`typescript` 7) | Type checker |
| `oxlint` | Linter (use instead of `eslint`) |
| `oxfmt` | Formatter (use instead of `prettier`) |
| `wrangler` | Cloudflare Workers dev server and deploy |
| `forge assets` | Client bundle (esbuild), Tailwind v4 and Lucide sprite pipeline |
| `warden` | Governing-document index, agent sync, and the MCP server over both |

```bash
bun run verify                 # the gate (`standard`) — the run a task closes on
bun run verify:fast            # the inner loop (`fast`) — same rows, one tolerance
bun run verify --mode full     # the release gate — adds the browser row (`--full` is sugar)
bun run verify --only lint     # one step, for the dev loop (any step label)
bun run verify --only format   # oxfmt --check, the step lint no longer covers
bun run verify --list          # print the steps of the selected mode, run none
bun run dev                    # asset build + wrangler dev (dev entry, live-reload)
bun run build:assets           # production asset build
bun run fix                    # auto-fix lint and formatting, then re-run the gate
```

**One command, three modes** — `fast ⊆ standard ⊆ full`, selected with `--mode`, never three
commands. `config/steps.ts` is the single source of truth for the gate's steps and the `tier` each
runs from; it default-exports the table `forge verify` loads, with no binding script between the two
and no `&&` chain anywhere — generation leads judgement, so a stale generated type surfaces as a
type error rather than as a silent pass.

A bare `bun run verify` is **`standard`**, the run a task closes on. `fast` is the inner loop and is
opt-in. The table's one `full`-tier step is `test:browser`, which needs a browser binary — and a
machine prerequisite is the only legitimate ground for holding a step back.

**`fast` and `standard` select the same rows here**, because the table declares no `standard`-tier
step. They differ in one tolerance: `validate-asset-manifest` accepts a types-only
`.forge/assets.ts` under `fast`, and fails it under `standard` and `full` — a manifest nothing has
built is exactly what a run closing a task must catch. So `verify:fast` is for the loop where
`bun run build:assets` has not run yet, not a cheaper gate.

Gate philosophy and the prerequisite rule: `TESTING.md` §6. That section still says "One Command,
Two Modes" — it predates the third and is overwrite-on-sync, so the correction belongs in forge's
canon, never here.

The table is near-pure `cloudflareWorkerSteps()` from `@y-core/forge/tooling/gate` — this app is the
fleet's proof that the preset is sufficient for a Worker app, so a row that the preset does not emit
is a bug report against the preset rather than a local convenience. The four warden rows —
`validate-docs`, `warden:index`, `warden:queries`, `warden:duplicates` — are appended and are not
such a bug report: they come from `@y-core/forge/warden/steps`, which the preset cannot import.
`test:workerd` is appended too, and *is* one. The three knowledge rows measure what an agent here
actually queries, so each passes `dependency: true` and `warden:duplicates` warns rather than fails
(`config/steps.ts`); `config/golden.ts` is the retrieval set `warden:queries` holds the index to.

**Avoid:** `npm`/`pnpm`/`yarn` (use `bun`), `eslint`/`prettier` (use `oxlint`/`oxfmt`),
runtime-specific type packages (use the hand-written stub).

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

**The full gate goes to `cc-tester`** — `bun run verify` and any cross-cutting suite. It returns a
terse verdict — `✓ green`, or `✗` with the failing step and a minimal excerpt — **never the full
stream**.

**The reason is context isolation, not distrust.** A gate stream is thousands of lines the owning
agent would otherwise carry for the rest of its turn, so the rule follows the size of the output
rather than the question of who may be trusted to read a result: cross-cutting or voluminous goes
to `cc-tester`; a single scoped step — `bun run verify --only lint`, or the one test file you just
wrote — is yours to run, because routing a handful of lines through a second agent buys nothing
(`PLAIN_LANGUAGE.md` §12). **A scoped green is never reported as a green gate**, whoever ran it.

On failure the **owning** agent fixes and re-delegates — the gate never re-runs inside the agent
that owns the fix, and `cc-tester` never edits the code it judges. The baseline it established
is part of its verdict. A **markdown-only change runs no gate**; the doc edit is its own evidence.

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
search for the governing `docs/` document rather than restating any of it here.

---

## Governing Documents

Every governing document — the fleet canon, this repository's own `docs/`, and the installed forge's
consumer-facing `docs/` — is indexed by warden and reached by asking, never from a table here.
`knowledge_search` ranks the corpus and returns a chunk id; `knowledge_read` returns that section
whole; `knowledge_outline` lists a document's sections. The `knowledge://catalogue` resource is the
map of all three corpora, each document with the sentence its own frontmatter uses. From a terminal
the same index is `warden search`, `warden read <id>` and `warden outline <path>` — each needing
`--dependency` for the third corpus, which `.mcp.json` already passes to `warden serve`. Search
before inferring an architectural rule — an empty result is an answer (`AGENT_GUIDE.md` §1).

**A hit says which corpus governs it, and the library's is advisory.** `dependency:forge/<DOC>.md`
is the installed library answering about itself, labelled `installed @y-core/forge (advisory)` and
weighted below this repository's own `docs/`, so where both address a question this repository's
answer is the one that binds. It is still read from the installed package, so a question about
forge's behaviour is asked here rather than by opening `node_modules`.

When a question stops finding its answer, `warden probe --dependency` prints the whole retrieval
picture in one diffable block — per-corpus counts, every golden query's rank, the canon documents no
query reaches, and the term frequencies that decide what the floor refuses. It writes nothing.

**The canon is not on disk here.** It is read from the installed `@y-core/forge`, so cite one of its
documents by name and section in prose (`CODE_RULES.md` §5c), never by a path
(`AGENT_GUIDE.md` §6d). A document in `docs/` is on disk and may be linked relatively.

`docs/SOURCE_OF_TRUTH.md` is the register of which file owns which fact; consult it before
asserting one somewhere else (`AGENT_GUIDE.md` §8).

---

## Growth Rules

Add new code in the layer its concern belongs to; reuse an existing export before adding one, and
never duplicate a capability forge already provides.

| Adding… | Goes to | Recipe |
|---|---|---|
| Route | `src/routes.ts` + a controller in `src/controllers/` + the binding in `src/router.tsx` | `ROUTING.md` §6a |
| HTMX fragment route | the same three files, returning `fragmentResponse` — never `renderPage` | `ROUTING.md` §6c |
| Route guard, or a change to guard order | `src/app/middleware.ts`, declared in the route's middleware list and never inline in the handler | `MIDDLEWARE_AND_CONTEXT.md` §3d |
| Global middleware | `registerMiddleware` in `src/app/middleware.ts`, ordered explicitly | `MIDDLEWARE_AND_CONTEXT.md` §1a |
| Context variable a handler reads | the typed accessors in `src/app/context.ts` — never an untyped `c.get` at a call site | `MIDDLEWARE_AND_CONTEXT.md` §2b |
| Per-request presentation value (nonce, CSRF token, base URL) | `renderContext` in `src/app/context.ts` | `MIDDLEWARE_AND_CONTEXT.md` §4a |
| Config value, env var, or binding | `AppConfigSchema` in `src/app/config.ts` — validated at startup, never read from `env` at a call site | `CONFIGURATION_AND_SECRETS.md` §1a |
| Workers binding declaration | `wrangler.jsonc` **and** the `AppEnv` type, amended together | `CONFIGURATION_AND_SECRETS.md` §4 |
| A secret | `.dev.vars` locally and `wrangler secret` in production — never a source file, never a commit | `CONFIGURATION_AND_SECRETS.md` §6d |
| Validation rule for submitted input | the valibot schema beside its handler, parsed with `v.safeParse` before any service call | `INPUT_VALIDATION.md` §1b |
| Bot or abuse check | ordered against the existing honeypot / CSRF / Turnstile sequence, never appended blindly | `INPUT_VALIDATION.md` §3c |
| A failure path a handler can return | a dedicated fragment renderer call **and** a test case for that status | `ERROR_HANDLING.md` §6 |
| Log field or channel | the channel set in `src/app/middleware.ts` — method, path, status, duration, requestId, and no PII | `STRUCTURED_LOGGING.md` §5 |
| KV access | a typed store from `createKVStore` with an explicit codec — never a raw binding call at a handler | `DATA_STORAGE.md` §2a |
| A D1 or R2 binding | the documented pattern plus startup validation in the same change | `DATA_STORAGE.md` §3, §4 |
| SSR component | a forge `ui/core` primitive composed in `src/views/` — never a raw element where a primitive exists | `FORGE_CONSUMPTION.md` §1b |
| Inline script in a view | `src/views/layout.tsx`, carrying the nonce — never an unnonced `<script>` | `UI_GUIDE.md` §2a |
| Theme token | the `@theme` block in `src/assets/tailwind.css` — never an arbitrary value at a call site | `UI_GUIDE.md` §5a |
| Client behaviour | a mounted resumable scope in `src/client/main.ts` — never domain logic, and never a mode the server could render | `UI_GUIDE.md` §6c |
| Typed page or site content | `src/model/` — plain shapes, no I/O | `ARCHITECTURE_GUIDE.md` §2a |
| External integration | `src/services/`, reached only from a controller | `ARCHITECTURE_GUIDE.md` §2c |
| A test | `tests/`, using the `app.request` pattern against `MINIMUM_ENV` | `HANDLER_TESTING.md` §1a |
| Build-time config module — asset pipeline, gate step table, retrieval set | `config/assets.ts`, `config/steps.ts` and `config/golden.ts` — outside `tsconfig.json`'s `include`, because a module that ships to no runtime must not widen the type program | see _Type System_ |
| A governing document | `docs/` — warden indexes it, so it needs no registration anywhere. **Never the canon**, which this repository only reads | `AGENT_GUIDE.md` §6d |

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

**Note:** `tests/workerd/` is outside `include` for the same reason `tests/browser/` is: its fixture
spawns the wrangler CLI, so it reads `node:child_process`, `process` and `Buffer` — node globals
`"types": []` withholds. It is still linted and formatted, via `sources`.

**Note:** `config/` is deliberately outside `include`. `config/steps.ts` imports
`@y-core/forge/tooling/gate` and `@y-core/forge/warden/steps`, `config/assets.ts` imports
`@y-core/forge/tooling/assets`, and `config/golden.ts` is read only by the step table, any of which
pulls forge's build-time tree into the type program; that tree typechecks only with node's `process`
and `Buffer` in global scope — exactly what `"types": []` withholds from the Worker. All three are
still linted, via `sources` in the step table.

---

## Agents

Five agents, with their rulesets inlined: `cc-plan` → `cc-dev` → `cc-test`, with `cc-doc` outside
that pipeline and `cc-tester` as the runner of the full gate (_Verification Delegation_ above). They
live in `.claude/agents/`; reusable slash commands (`c-review`, `c-unreview`) live in
`.claude/commands/`. Both directories are written by `warden sync` and overwritten wholesale — a
local change to either belongs in the corpus, not here. `warden sync --check` reconciles the `cc-`
names above against `.claude/agents/` in both directions, so a rename lands in both places or the
gate fails.
