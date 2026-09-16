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
- NEVER exceed the comment budget, and delete unbudgeted comments from any file you touch
  (`CODE_RULES.md` §5, §5c)
- ALWAYS give an exported symbol a domain word (`CODE_RULES.md` §7)
- ALWAYS check forge before writing a cross-cutting capability
  (`FORGE_CONSUMPTION.md` §1a)
- ALWAYS validate untrusted input at the boundary; services receive typed domain objects, and any
  path segment is sanitized against `../` traversal (`BOUNDARIES.md` §3a)
- NEVER build an `hx-*` attribute value from request data — build every one from a route definition
  or a literal. `hx-on:*` is evaluated as JavaScript, and only the shipped CSP's absent
  `'unsafe-eval'` stops it (`forge/HTMX.md` §7b); selector- and JSON-valued attributes cannot be
  sanitized at all (`forge/HTMX.md` §7); URL-valued ones are emitted verbatim, because sanitizing one
  would turn a loud refusal into a successful wrong request (`forge/HTMX.md` §7a)
- ALWAYS enforce exact-match test assertions accounting for HTML entities (`TESTING.md` §3a, §3c).
  **Tests live in `tests/`, not co-located with source** — the placement decision `TESTING.md` §2a
  requires be stated once, stated here because this repository keeps no `docs/` (see _Governing
  Documents_). **Four directories, one per question a set answers, each its own gate row:**
  `tests/unit/` a module in isolation, `tests/seam/` driven through the composition root,
  `tests/workerd/` under a real wrangler process, `tests/browser/` under a real browser. A new spec
  goes in the one whose question it answers; `tests/setup.ts` and `tests/sqlite-d1.ts` are shared by
  all four and stay at the root
- NEVER expect a value copied out of the source under test — derive it from the spec, the domain
  rule, an external table or the observable outcome (`TESTING.md` §3e)
- ALWAYS run local verification after changes — **the full gate goes to `cc-tester`**; a single
  scoped step is yours to run (`AGENT_WORKFLOW.md` §4)
- ALWAYS write for the reader, not the record (`PLAIN_LANGUAGE.md` §2, §3d, §8)
- ALWAYS report a command's exit status with the one canonical suffix — never a variant
  (`AGENT_WORKFLOW.md` §3), and keep a command in a shape the harness can parse
  (`AGENT_WORKFLOW.md` §3a)
- ALWAYS start a code review with the `warden-review` skill (`AGENT_GUIDE.md` §5c)
- ALWAYS reach the ledger over MCP, and never work from a remembered copy of its rules
  (`AGENT_WORKFLOW.md` §5). Scope is a property of the URL, so no ledger tool takes a `project`
  argument
- **Governance is overwrite-on-sync.** Never edit the canon to record a ruling that is this
  repository's own; it is byte-identical across every application that reads the shared corpus, and
  it is not writable from here in any case. **This repository holds no governing prose of its own**
  — a local ruling goes in a budgeted comment at the code it governs, and a ruling that would bind
  every forge app is a bug report against the canon (`AGENT_GUIDE.md` §6d)
- Use `rg` for content search, `find` for file search, and LSP for definitions and references
  (`AGENT_WORKFLOW.md` §2)

---

## Toolchain

| Tool           | Role                                                               |
| -------------- | ------------------------------------------------------------------ |
| `oxlint`       | Linter (use instead of `eslint`)                                   |
| `oxfmt`        | Formatter (use instead of `prettier`)                              |
| `forge assets` | Client bundle (esbuild), Tailwind v4 and Lucide sprite pipeline    |
| `warden`       | Governing-document index, agent sync, and the MCP server over both |

A bare `bun run verify` is the `standard` tier, the run a task closes on. Three flags are not
findable from `package.json`:

```bash
bun run verify --only lint     # one step, for the dev loop (any step label)
bun run verify --only format   # oxfmt --check, the step lint no longer covers
bun run verify --list          # print the steps of the selected mode, run none
```

Gate philosophy, the three nested modes and the prerequisite rule: `TESTING.md` §6a.
`config/steps.ts` is the single source of truth for the gate's steps and the `tier` each runs from.

`fast` selects 19 rows, `standard` those 19 plus six — `lint:types`, `validate-dev-boundary`,
`db:schema:digests` and the three `warden:*` rows — and `full` adds `db:schema`, `test:browser` and
`test:workerd`. `fast` also relaxes one tolerance: `validate-asset-manifest` accepts a types-only
`.forge/assets.ts` there and fails it under `standard` and `full`, because a manifest nothing has
built is exactly what a run closing a task must catch. Read the membership off `--list`, never off
this paragraph.

The table is near-pure `cloudflareWorkerSteps()` from `@y-core/forge/tooling/gate` — this app is the
fleet's proof that the preset is sufficient for a Worker app, so a row that the preset does not emit
is a bug report against the preset rather than a local convenience. It takes every opt-in the preset
offers but one: **`jsx` is deliberately declined**, because that row holds each `.tsx` to a per-file
pragma pair — a library's problem, its files compiling under each consumer's tsconfig, where this
app's compile under its own and `tsconfig.json` states `jsxImportSource` once.

The four warden rows — `validate-docs`, `warden:index`, `warden:queries`, `warden:duplicates` — are
appended and are not such a bug report: they come from `wardenAppSteps()` in
`@y-core/forge/warden/steps`, a second preset because the first lives under forge's `src/` and
nothing there may import warden. The three knowledge rows measure what an agent here actually
queries, so each passes `dependency: true` and `warden:duplicates` warns rather than fails
(`config/steps.ts`); `config/warden.ts` is the retrieval set `warden:queries` holds the index to.

Three preset options carry data this repository owns, and each is stated at the call site rather
than defaulted: `exposure` demands `require: "unroutable"` — the three keys must hold the values
that keep the Worker off the public internet, not merely be stated; `ssrBoundary` names `src/client`
as the browser-only tree and `main.ts` as the one basename allowed to cross it; and `contrast`
audits forge's pairs against **this app's** palette, with `config/contrast.ts` carrying the one
exemption `src/assets/css/custom.css` invalidates by re-declaring the gray ramp.

**Avoid:** `npm`/`pnpm`/`yarn` (use `bun`), `eslint`/`prettier` (use `oxlint`/`oxfmt`),
runtime-specific type packages (use the hand-written stub).

---

## Architecture

**TypeScript everywhere, one composition root.** `src/worker.ts` exports
`createWorker(security: SecurityHeadersOptions, dev?: DevAllowance)`, which calls `createApp`, `registerMiddleware`,
`app.map(routes, controller)` and `applyAssets`; its default export is the production app.
`src/worker.dev.ts` layers the Wrangler live-reload script hash onto that CSP, so the reload hash
cannot leak into production by construction.

| Layer        | Role                                                        | Location        | Runtime                                        |
| ------------ | ----------------------------------------------------------- | --------------- | ---------------------------------------------- |
| **server**   | routes, controllers, middleware, SSR views, CSP             | `src/`          | Cloudflare Worker — never ships to the browser |
| **domain**   | typed page and site content shapes                          | `src/model/`    | isomorphic                                     |
| **services** | external integrations (email, and anything else off-Worker) | `src/services/` | Cloudflare Worker                              |
| **client**   | HTMX wiring + mounted scopes                                | `src/client/`   | browser                                        |

**Pattern:** one composition root → global middleware → declarative route map → controllers →
services → views, over a model of typed domain shapes.

**Layer discipline:** every unit belongs to exactly one layer, and the layer decides what it may
import. Resolve placement by **concern first, then latency, then thread cost**; when two layers
fit, pick the one further from the request path.

The route inventory, the config schema, the bindings, the guard chain and the theme tokens are each
**read off the one file that owns them** — `src/routes.ts`, `src/app/config.ts`, `wrangler.jsonc`,
`src/app/middleware.ts`, `src/assets/tailwind.css` — never off prose. A second copy of an
enumerable fact drifts silently, and this repository has already paid that cost once.

---

## Governing Documents

Every governing document — the fleet canon and the installed forge's consumer-facing `docs/` — is
indexed by warden and reached by asking, never from a table here.
`knowledge_search` ranks the corpus and returns a chunk id; `knowledge_read` returns that section
whole; `knowledge_outline` lists a document's sections. The `knowledge://catalogue` resource is the
map of all three corpora, each document with the sentence its own frontmatter uses. From a terminal
the same index is `warden search`, `warden read <id>` and `warden outline <path>` — each needing
`--dependency` for the third corpus, which `.mcp.json` already passes to `warden serve`. Search
before inferring an architectural rule — an empty result is an answer (`AGENT_GUIDE.md` §1).

**A hit says which corpus governs it, and the library's is advisory.** `dependency:forge/<DOC>.md`
is the installed library answering about itself, labelled `installed @y-core/forge (advisory)` and
weighted below the canon, which is what binds where both address a question. It is still read from
the installed package, so a question about forge's behaviour is asked here rather than by opening
`node_modules`. **Two corpora is the whole set** — this repository contributes no third, and a
`project:` hit means somebody added governing prose that has to justify itself first.

When a question stops finding its answer, `warden probe --dependency` prints the whole retrieval
picture in one diffable block — per-corpus counts, every golden query's rank, the canon documents no
query reaches, and the term frequencies that decide what the floor refuses. It writes nothing.

**The canon is not on disk here.** It is read from the installed `@y-core/forge`, so cite one of its
documents by name and section in prose (`CODE_RULES.md` §5c), never by a path
(`AGENT_GUIDE.md` §6d).

**This repository keeps no `docs/`, so it has no `docs/SOURCE_OF_TRUTH.md` either**, and that is a
decision rather than an omission (`AGENT_GUIDE.md` §8). **Which file owns a fact is answered by
`rg`, not by a register:** the single-home rule is satisfied here by there being exactly one copy to
find, the owning file being the only place the fact is written. A local ruling the canon would route
to `docs/` is carried instead by a budgeted comment at the code it governs, or — where the ruling is
about the repository rather than about one file, as the `tests/` placement decision is — by a line
in this file.

---

## Growth Rules

Add new code in the layer its concern belongs to; reuse an existing export before adding one, and
never duplicate a capability forge already provides. Resolve placement by **concern first, then
latency, then thread cost**; when two layers fit, pick the one further from the request path.

**Where a thing goes is read off the file that already holds one of its kind**, and the layer table
under _Architecture_ names every destination. `src/app/middleware.ts` holds the guards and the
registration order, `src/app/config.ts` the schema and every env-sourced value, `src/routes.ts` the
paths, `config/schema.sql` this app's tables, `src/assets/tailwind.css` the theme tokens,
`src/client/main.ts` the mounted scopes, `tests/` every test. Open the neighbour and follow it.

**Two placement rules are not visible from a neighbour, so they are stated here:**

- **A `config/` module ships to no runtime and must not widen the type program.**
  `config/assets.ts`, `config/steps.ts`, `config/warden.ts` and `config/contrast.ts` sit outside
  `tsconfig.json`'s `include` for that reason (see _Type System_).
- **This repository adds no governing document.** A ruling that binds only this app is a budgeted
  comment at the code it governs; one that would bind every forge app is a bug report against the
  canon, which is not writable from here (`AGENT_GUIDE.md` §6d).

For anything else, ask warden before inferring a rule — an empty result is an answer
(`AGENT_GUIDE.md` §1).

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

**Forge is pinned to a released tarball** — a GitHub Release asset in `package.json`, built by
forge's `release` workflow with `bun pm pack`, so `files` in forge's manifest is the single thing
deciding what arrives here. `bun i` always restores exactly that, and the lock carries its `sha512`.

**Never point this at a `codeload.github.com` URL instead.** That serves a git snapshot of the tag,
which honours no manifest: it ships forge's `tests/`, `config/` and `tsconfig.json` along with
everything else, roughly twice the files the release asset carries.

**Working on forge and starter together is an explicit override: `bun run dev:forge`.** It packs the
sibling `../forge` as `bun publish` would — honouring `files`, so no `.git`, no `node_modules`, no
tests — and extracts it over `node_modules/@y-core/forge`. The result knowingly disagrees with
`bun.lock`, which is the point; it is never a `postinstall`, so the override is always asked for and
a plain `bun i` is how you undo it. Re-run it after any `bun i`, and after any forge edit — the tree
is a copy, not a link.

**The capability is forge's, not this app's**, so every consumer gets one implementation: it lives
at `src/tooling/dev/sync.ts` in the checkout, and `dev:forge` runs it by path rather than through
the installed `forge` binary. That is deliberate — the installed forge is the pinned tag, which by
definition does not yet carry a change you are developing, whereas the sibling is exactly the forge
being synced.

**A `file:../forge` directory dependency is not the alternative it looks like.** Bun materialises
it as ~5000 per-file symlinks whose targets are container-absolute (`/src/forge/...`), so an editor
running outside the container finds every one dangling and reports the package as missing — the
whole package, since `jsxImportSource` routes through it too. `--backend=symlink` does not change
this; `--linker=isolated` and a `workspaces` entry avoid it only by copying, which is what
`dev:forge` already does without reshaping the install for every other consumer.

**Note:** `tsconfig.json` carries no `exclude`, and the whole of `tests/` is in the program.
`tests/workerd/` needs node globals `"types": []` withholds — its fixture spawns the wrangler CLI —
and gets them from one `/// <reference types="@y-core/forge/testing/node" />` at the top of the
spec. The directive is file-scoped, so the Worker half of the program is unmoved by it; a
node-globals stub or a second tsconfig would have widened the whole program instead.

**Note:** `config/` is deliberately outside `include`. `config/steps.ts` imports
`@y-core/forge/tooling/gate` and `@y-core/forge/warden/steps`, `config/assets.ts` imports
`@y-core/forge/tooling/assets`, and `config/warden.ts` and `config/contrast.ts` are read only by the
step table, any of which pulls forge's build-time tree into the type program; that tree typechecks
only with node's `process` and `Buffer` in global scope — exactly what `"types": []` withholds from
the Worker. All four are still linted, via `sources` in the step table.

---

## Agents

Five agents, with their rulesets inlined: `cc-plan` → `cc-dev` → `cc-test`, with `cc-doc` outside
that pipeline and `cc-tester` as the runner of the full gate (`AGENT_WORKFLOW.md` §4). They
live in `.claude/agents/`; the corpus-driven review (`warden-review`) is a skill in
`.claude/skills/`. Both directories are written by `warden sync` and overwritten wholesale — a local
change to either belongs in the corpus, not here. `warden sync --check` reconciles the `cc-`
names above against `.claude/agents/` in both directions, so a rename lands in both places or the
gate fails.
