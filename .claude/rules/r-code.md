# r-code — TypeScript/fetch-router Coding Rules

> Ruleset for `cc-dev`. Read entirely before writing code.

---

## TypeScript Patterns

### Naming
- Functions: camelCase verb-first (`handleContact`, `renderContext`, `registerMiddleware`)
- Types: PascalCase (`AppEnv`, `RenderContext`, `ContactInput`)
- Schemas: PascalCase + `Schema` suffix (`ContactSchema`, `AppConfigSchema`)
- Guards: camelCase + `Guard` suffix (`contactGuard`, `csrfVerifyGuard`)

### Structure
- Early returns over nested `if`
- Handlers validate and delegate to services — no business logic in handlers
- Services receive typed domain data (not raw `FormData`)
- Views receive data via props (not from services directly)
- One exported function per exported concern — no multi-purpose helpers

### External Module Imports
- Always import from `@y-core/forge/{namespace}` — never reach into forge internals
- Named exports only — no default exports except Worker entry and app factory
- No deep-reach into `node_modules` for dependencies wrapped by forge

## Forge Consumption Rules
- Always import from `@y-core/forge/{namespace}`
- Never re-implement security headers, CSRF, validation, or fragment renderers — use forge
- Config via `configStore.get(c.env)`, never `process.env`

## Where to Put New Code
Consult `.decisions/ARCHITECTURE_GUIDE.md` and `.decisions/ROUTING.md` for ownership model.

- `src/model/` — TypeScript types and valibot schemas
- `src/services/` — external integrations (email, third-party APIs)
- `src/controllers/` — plain controller modules (`{ middleware, handler }` or a bare handler); each marshals data inline and returns `c.render(view)` for GET routes or a `fragmentResponse` for HTMX mutations
- `src/views/` — forge JSX page and fragment components (`@jsxImportSource @y-core/forge`); page views own their `<Layout>` composition (the `children` Slot)
- `src/routes.ts` — declarative route map using the `get()`/`post()` path helpers (single source of truth)
- `src/router.tsx` — controller binding (`createController` — maps route names to controllers)
- `src/app/` — config, middleware, worker setup; `render.ts` is a thin JSX→HtmlResponse bridge

Never reach into forge internals to bypass its public API. To change behavior, upstream to the forge repository.
