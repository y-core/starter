# forge-starter

A Cloudflare Workers application on [`@y-core/forge`](https://github.com/y-core/forge) — the
fleet's starter, and its proof that the shared library is sufficient for a Worker app on its own.
fetch-router over Tailwind v4 and HTMX, rendered SSR; static assets in `public/` are served by
Wrangler.

This file is the day-one guide for a human. Agent-facing detail lives in
[`CLAUDE.md`](CLAUDE.md) and the governing documents in [`docs/`](docs/), which warden indexes
alongside the fleet canon it reads from the installed `@y-core/forge`.

---

## Day one, behind devctl

```sh
devctl up starter
```

Then browse **https://starter.devbox.test:8443**. The same URL works from inside the container, so
a link you paste from a terminal is the link you open in a browser.

Registration is auto-detected from the `dev` block in `wrangler.jsonc` — already
`local_protocol: "https"` on port 8787 — so there is nothing to register by hand.

`devctl` is a host command; it cannot be run from inside the workspace.

## Day one, without the proxy

```sh
bun install
cp .dev.vars.example .dev.vars   # then edit CSRF_SECRET
bun run dev
```

Browse **https://localhost:8787** and accept the self-signed certificate.

Wrangler serves dev over https, so `SITE_ORIGIN` must name the origin the browser actually uses.
`.dev.vars` ships the canonical devbox origin, so for the proxy-less path set the override it
documents:

```
SITE_ORIGIN=https://localhost:8787
```

`allowedOrigins` is derived solely from `SITE_ORIGIN`, so an origin the browser uses but `SITE_ORIGIN`
does not name makes every form POST fail the origin check with a 403. Swapping `SITE_ORIGIN` is the
posture, not a workaround (`CONFIGURATION_AND_SECRETS.md` §3d): the dev origin is the one the browser
is pointed at. The `extraOrigins` escape hatch allows a *second* origin at once, which no case here
needs.

**`SITE_ORIGIN` is set in exactly three places**, one per case, and `wrangler.jsonc` is none of them:
the literal in `src/app/config.ts`, which is production's value and the fallback when the environment
carries nothing; `.dev.vars`, which sets the dev origin; and the `--var` on `dev:browser` in
`package.json`, which points the browser suite at `https://localhost:8787`. A fourth spelling in
`wrangler.jsonc` would be one nothing checks.

The fallback is this app's own origin, never a placeholder like `yourdomain.com` — an allowlist
naming somebody else's domain fails silently, with every mutation 403ing and nothing saying why.
Nothing is lost by having a default: the dev server still cannot boot without `.dev.vars`, because
`CSRF_SECRET` has none.

## Verifying

```sh
bun run verify          # the gate — every step must pass
bun run verify --full   # the release gate — adds the browser row
bun run verify --list   # print the steps, run none
bun run fix             # auto-fix lint and formatting, then re-run the gate
bun test tests/         # the Worker suite alone
bun run test:browser    # the browser set — real Chromium over loopback https
```

`bun run verify` is the gate. `config/steps.ts` is the single source of truth for its steps.

**The browser set is a full-only step, not a suite outside the gate.** `config/steps.ts` sets
`browser: true`, so `test:browser` is the last row of the table — skipped by a fast `bun run verify`
and run by `bun run verify --full`. A browser binary is a *prerequisite*, and that is the only
legitimate reason to hold a step back; cost never is. `bun run test:browser` is the same command by
hand. It runs against a real dev server over loopback https and pins the posture the sections above
describe: the page and its assets load over https, the canonical link names the origin the browser
used, and the contact POST is not refused as cross-origin.

**Nothing installs the browser.** The workspace image bakes Chromium and sets `CHROME_PATH`, which
is what the gate's prerequisite probe resolves and what `playwright.config.ts` points
`executablePath` at. There is no install script because there is nothing to install.

Inside the devbox sandbox, a dev server that Playwright spawns itself binds where the browser
cannot reach it. Start one first and the suite reuses it:

```sh
bun run dev:browser    # in one shell
bun run test:browser   # in another
```

**`dev:browser`, not `dev`.** The suite drives the browser over loopback, and `allowedOrigins` and
the canonical link both come from `SITE_ORIGIN` alone — so the server under test must name
`https://localhost:8787`, while `.dev.vars` names the devbox origin for ordinary browsing.
`dev:browser` is `dev` plus that one `--var` override, so neither path has to edit `.dev.vars`.
Reuse is why the override cannot live in `playwright.config.ts`'s `webServer.command`: that command
runs only when nothing is already listening, which inside the sandbox is never. The suite refuses a
server naming any other origin, and the refusal names this command.

## Layout

| Path | Contents |
|---|---|
| `src/` | routes, controllers, middleware, SSR views, CSP — never ships to the browser |
| `src/model/` | typed page and site content shapes |
| `src/services/` | external integrations, reached only from a controller |
| `src/client/` | HTMX wiring and mounted scopes — the only code that runs in the browser |
| `tests/` | the Worker suite, run by `bun test` |
| `tests/browser/` | the browser set, run by `playwright test` |
| `config/` | build-time config: the gate's step table |
| `docs/` | this repository's governing documents — search them with `warden search` |

`src/worker.ts` is the composition root and the production entry. `src/worker.dev.ts` layers the
Wrangler live-reload script hash onto that CSP, so the reload hash cannot reach production by
construction.

## Secrets

Never commit `.dev.vars`. Locally it holds dev values; in production every secret is set with
`wrangler secret`. `.dev.vars.example` is the committed template — copy it, then generate a real
CSRF secret:

```sh
openssl rand -hex 32
```

The Turnstile `1x…` values in the template are Cloudflare's official test keys: the site key always
renders the widget and the secret key always passes verification. They are safe to commit and must
never reach production.
