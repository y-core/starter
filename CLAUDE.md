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
- ALWAYS run `bun run check` after making code changes
- ALWAYS account for HTML-encoded entities in test assertions for HTML output
- ALWAYS enforce exact-match test assertions — never substring matching
- Use native `rg` (ripgrep) for content search and `find` for file search
- NEVER provide deprecation shims or backward-compatible patterns before v1.0.0

---

## Toolchain

| Tool | Role |
|---|---|
| `bun` | Package manager and script runner |
| `tsgo` (`@typescript/native-preview`) | Type checker (10× faster than tsc) |
| `esbuild` | Client JS bundler |
| `biome` | Linter and formatter |
| `tailwindcss` CLI | CSS build |
| `wrangler` | Cloudflare Workers deploy and dev server |

**Key commands:**

```bash
bun run check         # types → lint → tests (full pipeline)
bun run dev           # build assets + watch CSS + wrangler dev (dev entry, live-reload)
bun run lint:fix      # auto-fix lint/format issues
bun run test          # tests
```

**Avoid:** `tsc` (use `tsgo`), `npm`/`pnpm`/`yarn` (use `bun`), `eslint`/`prettier` (use `biome`).

---

## Architecture

**Entry:** `src/worker.ts` exports `createWorker(security: SecurityHeadersOptions)` — a factory that calls `createApp`, `registerMiddleware` (security headers, requestId, logging, CORS), `app.map(routes, controller)`, and `applyAssets`. Its default export is the production app (base CSP: `['self', NONCE, TURNSTILE_CSP]`).

**Dev entry:** `src/worker.dev.ts` — default-exports `createWorker(mergeSecurityHeaders(securityHeaders, { scriptSrc: [WRANGLER_LIVE_RELOAD_HASH] }))`. Layers the Wrangler live-reload inline-script hash onto the prod CSP for `wrangler dev --live-reload`. The reload hash is deliberately kept out of the production CSP so it cannot leak by construction.

**Routes:** `src/routes.ts` — declarative route map using `get()`/`post()` path helpers; `src/router.tsx` — controller binding using `@y-core/forge/router`.

**Controllers:** `src/controllers/*.{ts,tsx}` — plain controller modules (`{ middleware, handler }` or a bare handler). GET handlers use `definePage({ loader, view })` from `@y-core/forge/app`; the `view` calls `renderPage()` from `@y-core/forge/render`. Mutation handlers return `fragmentResponse` with forge fragment helpers. `health` stays inline in `router.tsx`; `adminLogs` is its own controller module.

**Views:** `src/views/*.tsx` — forge JSX components (`@jsxImportSource @y-core/forge`; NOT Hugo templates). Page views own their `<Layout>` composition (the `children` Slot); `renderPage()` from `@y-core/forge/render` converts JSX to an `HtmlResponse`.

**Services:** `src/services/` — external integrations (email, etc.).

**Client JS:** `src/client/main.ts` — esbuild-bundled for browser, output to `public/assets/js/`.

**Content model:** `src/model/` — TypeScript types for page data.

**Styles:** `src/assets/tailwind.css` — Tailwind v4 entry point with `@theme {}` tokens.

**Shared lib:** `@y-core/forge` (GitHub: `github.com/y-core/forge`) — reusable utilities for fetch-router + Workers.

## Guide Index

> Before writing code, consult the relevant governing document:

- [`AGENT_GUIDE.md`](.decisions/AGENT_GUIDE.md): document structure rules for tsmcp MCP efficiency
- [`ARCHITECTURE_GUIDE.md`](.decisions/ARCHITECTURE_GUIDE.md): createWorker factory, layer stack, DI via Config, dev/prod CSP split
- [`PRODUCTION_RULES.md`](.decisions/PRODUCTION_RULES.md): six rules — no globals, validate at boundary, leverage forge, dev mirrors prod
- [`MIDDLEWARE_AND_CONTEXT.md`](.decisions/MIDDLEWARE_AND_CONTEXT.md): middleware ordering, AppEnv, route guards, renderContext
- [`STRUCTURED_LOGGING.md`](.decisions/STRUCTURED_LOGGING.md): channels, KV log persistence, requestId correlation, log viewer
- [`ERROR_HANDLING.md`](.decisions/ERROR_HANDLING.md): fragment renderers, fail-closed posture, error taxonomy
- [`INPUT_VALIDATION.md`](.decisions/INPUT_VALIDATION.md): ContactSchema, readFields, v.safeParse, honeypot, Turnstile, CSRF
- [`HANDLER_TESTING.md`](.decisions/HANDLER_TESTING.md): app.request pattern, MINIMUM_ENV, CSRF minting, security assertions
- [`ROUTING.md`](.decisions/ROUTING.md): route definitions, guard checklist, adding new routes
- [`CONFIGURATION_AND_SECRETS.md`](.decisions/CONFIGURATION_AND_SECRETS.md): AppConfigSchema, env vars, Workers bindings, .dev.vars
- [`DATA_STORAGE.md`](.decisions/DATA_STORAGE.md): KV patterns, future D1/R2, binding validation
- [`UI_GUIDE.md`](.decisions/UI_GUIDE.md): views/, layout, HTMX patterns, Tailwind v4 @theme tokens, theme toggle
- [`WEB_DESIGN.md`](.decisions/WEB_DESIGN.md): Workers runtime model, ctx.waitUntil, rate limiting, deploy safety
- [`CODE_REVIEW.md`](.decisions/CODE_REVIEW.md): review checklists, layer compliance, forge consumption, severity calibration

---

## tsmcp

Registered in `.mcp.json`. Available in all agents.

**Governance docs — in order:**
1. `mcp__tsmcp__decisions_list` — list all docs with section index (start here)
2. `mcp__tsmcp__decisions_search` — locate relevant sections by keyword
3. `mcp__tsmcp__decisions_read` — read a specific section: `section: "3a"` (not the full doc)

**TypeScript symbol navigation — in order:**
1. `mcp__tsmcp__lsp_workspace_symbols` — find types, functions, interfaces by name
2. `mcp__tsmcp__lsp_definition` — jump to the definition of a known symbol
3. `mcp__tsmcp__lsp_find_references` — find all callers / implementors
4. `mcp__tsmcp__lsp_document_symbols` — list all symbols in a specific file

**Behavioral rule:** NEVER use Bash `grep` or `Read` on `.decisions/` files when tsmcp is available.

| Tool | Use |
|------|-----|
| `mcp__tsmcp__decisions_list` | List governing docs with section index — start here |
| `mcp__tsmcp__decisions_read` | Read a doc or a specific section (`section: "3a"`) |
| `mcp__tsmcp__decisions_search` | Search all governing docs by keyword |
| `mcp__tsmcp__lsp_workspace_symbols` | Find types, functions, interfaces by name (indexed, fast) |
| `mcp__tsmcp__lsp_find_references` | All callers / all implementors |
| `mcp__tsmcp__lsp_definition` | Jump to any symbol definition |
| `mcp__tsmcp__lsp_document_symbols` | List symbols in a TypeScript file by path |

---

## Design System

> See [UI_GUIDE.md](.decisions/UI_GUIDE.md) for the complete design system documentation:
> color palette (@theme tokens), typography (system stacks), SVG illustrations, HTMX patterns, and theme toggle.

---

## Type System

- `"types": []` — global scope uses no `@types/*` packages; Cloudflare Workers types come via the generated `.types/cloudflare.d.ts`
- `.types/bun-test.d.ts` — minimal `bun:test` module stub for tests
- Do NOT install or use `bun-types` — it overrides DOM's `fetch` type with Bun-specific properties
- `@types/bun` is NOT a dependency; the custom stub covers all test needs

**Note:** `tsconfig.json` has a `paths` alias (`@y-core/forge/*`) pointing to the host filesystem path. This is a Zed editor workaround (host path differs from Docker container path). In practice it governs bun run check resolution — which verifies cross-repo changes end-to-end before git releases.

## Development Phase Guide

Invoke the right agent for each phase. Each agent reads its paired rules file first.

| Phase | Agent | Rules | When |
|-------|-------|-------|------|
| Analysis & Design | `cc-plan` | `.decisions/rules/r-plan.md` | Before any code — layer placement, "leverage forge" check, architecture |
| Implementation | `cc-dev` | `.decisions/rules/r-code.md` | After plan approved — write code in correct layers, consume forge namespaces |
| Testing | `cc-test` | `.decisions/rules/r-test.md` | After implementation — app.request tests, security pass+fail |
| Architecture Review | `cc-plan` | `.decisions/rules/r-plan.md` | After tests pass — refactor planning |

Agent flow: `cc-plan` → `cc-dev` → `cc-test` → (if issues) back to `cc-plan`

Agents and rules live in `.decisions/agents/` and `.decisions/rules/`.
