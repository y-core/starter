# CLAUDE.md — Architectural Constitution

> Hono JSX (TypeScript Worker) + Tailwind CSS v4 + HTMX on Cloudflare Workers.
> Hono owns all routes. Static assets (`public/`) served via Wrangler.

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

**Entry:** `src/worker.ts` exports `createWorker(security: SecurityHeadersOptions)` — a factory that builds the Hono app, applies `makeSecurityHeaders(security)`, `applyRoutes`, and `serveAssets`. Its default export is the production app (base CSP: `['self', NONCE, TURNSTILE_CSP]`).

**Dev entry:** `src/worker.dev.ts` — default-exports `createWorker(mergeSecurityHeaders(securityHeaders, { scriptSrc: [WRANGLER_LIVE_RELOAD_HASH] }))`. Layers the Wrangler live-reload inline-script hash onto the prod CSP for `wrangler dev --live-reload`. The reload hash is deliberately kept out of the production CSP so it cannot leak by construction.

**Routes:** `src/routes.tsx` — declarative route config using `@y-core/forge/router`.

**Views:** `src/views/*.tsx` — Hono JSX components (NOT Hugo templates).

**Handlers:** `src/handlers/` — action handlers for form submissions and API endpoints.

**Services:** `src/services/` — external integrations (email, etc.).

**Client JS:** `src/client/main.ts` — esbuild-bundled for browser, output to `public/assets/js/`.

**Content model:** `src/model/` — TypeScript types for page data.

**Styles:** `src/assets/tailwind.css` — Tailwind v4 entry point with `@theme {}` tokens.

**Shared lib:** `@y-core/forge` (GitHub: `github.com/y-core/forge`) — reusable utilities for Hono + Workers.

## Design System

**Color palette**, defined in `src/assets/tailwind.css` via `@theme`:

**Typography** — system stacks only, no external web fonts:

**SVG illustrations** — inline, stroke-based line art:

---

## Type System

- `"types": []` — global scope uses no `@types/*` packages; Cloudflare Workers types come via the generated `.types/cloudflare.d.ts`
- `.types/bun-test.d.ts` — minimal `bun:test` module stub for tests
- Do NOT install or use `bun-types` — it overrides DOM's `fetch` type with Bun-specific properties
- `@types/bun` is NOT a dependency; the custom stub covers all test needs

**Note:** `tsconfig.json` has a `paths` alias (`@y-core/forge/*`) pointing to the host filesystem path. This is a Zed editor workaround (host path differs from Docker container path). In practice it governs bun run check resolution — which verifies cross-repo changes end-to-end before git releases.
