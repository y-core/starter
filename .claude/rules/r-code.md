# r-code — TypeScript/Hono Coding Rules

> Ruleset for `cc-dev`. Read entirely before writing code.

---

## TypeScript Patterns

## Code Style

### Naming
- Functions: camelCase verb-first (`handleContactAction`, `renderContext`, `applyMiddleware`)
- Types: PascalCase (`AppEnv`, `RenderContext`, `ContactInput`)
- Schemas: PascalCase + `Schema` suffix (`ContactSchema`, `AppConfigSchema`)
- Guards: camelCase + `Guard` suffix (`contactSecurityGuard`, `csrfVerifyGuard`)

### Structure
- Early returns over nested `if`
- Handlers validate and delegate to services — no business logic in handlers
- Services receive typed domain data (not raw `FormData`)
- Views receive data via props (not from services directly)
- One exported function per exported concern — no multi-purpose helpers

### Forge Consumption Rules
- Always import from `@y-core/forge/{namespace}`
- Never re-implement security headers, CSRF, validation, or fragment renderers — use forge
- Config via `configStore.get(c.env)`, never `process.env`

### Where to Put New Code
Consult `.decisions/ARCHITECTURE_GUIDE.md` and `.decisions/ROUTING.md` for ownership model.

- `src/model/` — TypeScript types and valibot schemas
- `src/services/` — external integrations (email, third-party APIs)
- `src/handlers/` — Hono route action handlers
- `src/views/` — Hono JSX page and fragment components
- `src/routes.tsx` — declarative route config (single source of truth)
- `src/app/` — config, middleware, worker setup

Never reach into forge internals to bypass its public API. To change behavior, upstream to the forge repository.
