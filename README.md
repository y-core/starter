# forge-starter

A Cloudflare Workers application on [`@y-core/forge`](https://github.com/y-core/forge) — the
fleet's starter, and its proof that the shared library is sufficient for a Worker app on its own.
fetch-router over Tailwind v4 and HTMX, rendered SSR; static assets in `public/` are served by
Wrangler.

This file is the day-one guide for a human. Agent-facing detail lives in
[`CLAUDE.md`](CLAUDE.md) and in the fleet canon, which warden indexes from the installed
`@y-core/forge` alongside that library's own documents. This repository adds no governing prose of
its own: every ruling is in the canon, or in a comment at the code it governs.

---

## Getting started, behind devctl

```sh
devctl up starter
```

Then browse **<https://starter.devbox.test:8443>**. The same URL works from inside the container, so
a link you paste from a terminal is the link you open in a browser.

Registration is auto-detected from the `dev` block in `wrangler.jsonc` — already
`local_protocol: "https"` on port 8787 — so there is nothing to register by hand.

`devctl` is a host command; it cannot be run from inside the workspace.

## Getting started, without the proxy

```sh
bun install
cp .dev.vars.example .dev.vars   # then edit CSRF_SECRET
bun run dev
```

Browse **<https://localhost:8787>** and accept the self-signed certificate.

Wrangler serves dev over https, so `SITE_ORIGIN` must name the origin the browser actually uses.
`.dev.vars` ships the canonical devbox origin, so for the proxy-less path set the override it
documents:

```ini
SITE_ORIGIN=https://localhost:8787
```

## Start your own app

While `config/features.ts` exists, this tree is the demonstrator: the starter plus the optional
features that manifest lists. To start a project from it, clone it, install, and curate a copy
holding only the features you want:

```sh
git clone https://github.com/y-core/starter.git starter && cd starter
bun install
bunx forge curate --list                    # the features, and what each requires
bunx forge curate ../my-app --keep contact  # contact and what it requires; every other feature dropped
cd ../my-app && bun i && bun run build:assets && bun run verify
```

`--drop` is the other way to choose: `bunx forge curate ../my-app --drop showcase` drops showcase and
everything that requires it, and keeps every other feature.

`--keep` and `--drop` each take a comma-separated list, and cannot be combined; `--keep ""` keeps no
feature at all. The target must be a new or empty directory. The copy holds what git sees — tracked
and untracked files, minus anything `.gitignore` excludes — so it arrives without `node_modules`,
and a copy that keeps no feature arrives without `config/features.ts` too.

## Verifying

```sh
bun run verify          # the gate — every step must pass
bun run verify --full   # the release gate — adds the workerd, browser and (with db) schema rows
bun run verify --list   # print the steps of the selected mode, run none
bun run fix             # auto-fix what the gate can fix, then re-run it
bun run test            # the unit and seam suites, which need nothing started
bun run test:browser    # the browser set — real Chromium over loopback https
```

`config/steps.ts` is the single source of truth for the gate's steps and the tier each runs from.
Read the membership off `--list`.

`bun run test:browser` needs nothing started first: `playwright.config.ts` starts a dev server on
**8788, bound to `127.0.0.1`**, and never reuses one already listening. To watch the same pages by
hand, `bun run dev:browser` starts that server with the same port, bind address and origin override
— with `test:browser` stopped, since the two want the one port.

## Layout

| Path | Contents |
| --- | --- |
| `src/` | routes, controllers, middleware, SSR views, CSP — never ships to the browser |
| `src/model/` | typed page and site content shapes |
| `src/services/` | external integrations, reached only from a controller |
| `src/client/` | HTMX wiring and mounted scopes — the only code that runs in the browser |
| `tests/unit/` | a module in isolation |
| `tests/seam/` | driven through the composition root |
| `tests/workerd/` | under a real wrangler process |
| `tests/browser/` | under a real browser |
| `config/` | build-time config: the gate's step table, the asset pipeline, the database, the retrieval set |

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

<!-- feature:turnstile:begin -->
The Turnstile `1x…` values in the template are Cloudflare's official test keys: the site key always
renders the widget and the secret key always passes verification. They are safe to commit and must
never reach production.
<!-- feature:turnstile:end -->

## Gotchas

**`allowedOrigins` is derived from `SITE_ORIGIN` alone**, so an origin the browser uses but
`SITE_ORIGIN` does not name makes every form POST fail the origin check with a 403. Swapping
`SITE_ORIGIN` is the posture rather than a workaround (`WORKERS_PLATFORM.md` §4e); `extraOrigins`
allows a second origin at once, which no case here needs. `rg SITE_ORIGIN` finds every place it is
set — `wrangler.jsonc` is deliberately none of them.

**Nothing installs the browser.** The workspace image bakes Chromium and sets `CHROME_PATH`, which
is what the gate's prerequisite probe resolves and what `playwright.config.ts` points
`executablePath` at. There is no install script because there is nothing to install.

**A stray listener on 8788 answers *as* the browser suite's server.** The suite's `beforeEach`
refuses a server naming any other origin, which is what that hits. 8787 is the application's own
dev server on `0.0.0.0`; 8788 is the browser slot the canon's `TESTING.md` reserves.

## See also

[`CLAUDE.md`](CLAUDE.md) for the architecture, the layer rules and the toolchain. Every governing
rule is in the fleet canon, reachable with `warden search` or the `knowledge_search` MCP tool.
