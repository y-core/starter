---
title: UI Guide
description: "The view layer and layout composition, the HTMX interaction patterns, the Tailwind theme tokens, and the theme toggle."
---

# UI Guide

> The starter's view layer: layout, views, forge UI components, Tailwind tokens, HTMX, SEO.

---

## 0. Quick Reference

- §1 views/ directory: layout, home, not-found (logs rendered by showLogsController via forge `loadLogViewer`)
- §1a layout.tsx — the chrome the shell renders
- §1b home.tsx — Home Page
- §1c Log Viewer — showLogsController
- §1d not-found.tsx — 404 Page
- §2 The document shell: the single writer of `<html>`, FOUC_SCRIPT, nonce, deferred scripts
- §2a Nonce on All Inline Scripts
- §2b FOUC Prevention
- §2c Deferred Scripts and Resumable Scopes
- §3 Home view: hero, contact form, page meta
- §3a Contact Form HTMX Pattern
- §3b Page Meta, JSON-LD and OG
- §4 HTMX patterns: hx-post, hx-target, hx-swap
- §4a Fragment Target Pattern
- §4b HX-Request Header Enforcement
- §4c Turnstile Widget
- §4d Loading Indicators
- §5 Tailwind v4 Theme Tokens: the palette lives in custom.css; system font stacks
- §5a @theme Block in tailwind.css
- §5b System Font Stacks Only — why `--font-display` was a bug
- §5c Dark Mode via Class Strategy
- §6 Theme toggle and navbar: FOUC_SCRIPT, theme and navbar resumable scopes, resume()
- §6a FOUC_SCRIPT Import and Placement
- §6b Theme Resumable Scope
- §6c Navbar Component and Navbar Resumable Scope
- §6d The Navbar Varies By Identity — no HTML cache layer without `Vary: Cookie`

---

## 1. views/ Directory

The `src/views/` directory contains all forge JSX components that render full pages or
page fragments (`@jsxImportSource @y-core/forge`). Each file exports one primary component.
Views receive all data via props and never call services or perform validation directly.

### 1a. layout.tsx — the chrome the shell renders

`Layout` is the whole document: FOUC_SCRIPT inline (synchronous, in head), meta tags, CSS link, nav,
footer, deferred client scripts. All inline scripts carry `nonce={ctx.nonce}`. It sources `site`
itself via `import { site } from "../model/site.content"`.

**No page view composes it.** `Layout` has exactly one caller — `appShell` in `src/app/shell.tsx` —
and every page reaches it through the shell (§2). A view that wrote `<Layout>` itself would render a
second `<html>` inside the shell's.

    export function Layout({ ctx, meta, children }: { ctx: RenderContext; meta: PageMeta; children?: JSXNode }) {
      const { nonce, baseUrl } = ctx
      const merged = mergeMeta(siteMeta(baseUrl), meta)
      return (
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            {metaTags({ ...merged, title: documentTitle(merged.title) }, { nonce })}
            {/* FOUC_SCRIPT before stylesheet — sets data-theme-preference synchronously */}
            <script nonce={nonce}>{rawHtml(FOUC_SCRIPT)}</script>
            <link rel="stylesheet" href={assets.path("css/main.css")} />
            <script nonce={nonce} src={assets.path("js/main.js")} type="module" />
          </head>
          <body>
            <header>…nav with ThemeToggle…</header>
            {children}
            <footer>…</footer>
          </body>
        </html>
      )
    }

`meta` is a full `PageMeta`, not a partial: the shell is the only caller and a `ShellSlot` always
carries one resolved. `Layout` merges it over `siteMeta` and composes the title — `documentTitle`
leaves the site's own name uncomposed, so a page naming `site.title` renders `Forge Studio` and a
page naming `Catalog` renders `Catalog — Forge Studio`. A `noindex` page has its canonical cleared,
since the base URL would point a crawler at a page other than the one it was just told to drop.

`RenderContext` — `nonce` and `baseUrl` here — is produced by `renderContext(c, config, csrfPath?)`,
which the shell calls once per request. A page view builds its own only when it needs a CSRF token
or the Turnstile site key (§1b). See [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §4.

### 1b. home.tsx — Home Page

Full home page with hero section and contact form — a `<main>`, not a document. It is the one page
whose controller still builds a `RenderContext`, for the CSRF token bound to `/api/contact` and the
Turnstile site key; the shell supplies everything else. Its controller names `meta: { title: site.title }`,
which `documentTitle` leaves uncomposed, so the page speaks with the site's own descriptor (§3b).

Its chrome comes from forge, not from hand-rolled class strings: the two hero CTAs and the submit
are `Button` (the anchors under `asChild`, so the box, tone, size, focus ring and the
`state-busy`/`state-disabled` recipes are the design system's); the contact panel is `Card`, so it
tracks `--radius` instead of a frozen `rounded-2xl`; the htmx indicator wraps `Spinner`. The pill
shape is gone — `Button`'s `rounded-field` is the system's answer for a text button, and taking it
is the point of adopting the system. Page-level layout — the grids, the `space-y-*` columns, the
section padding — stays raw markup; that is view rendering, which is legitimately app code.

### 1c. Log Viewer — showLogsController

The `/showcase/logs` page is rendered by `showLogsController` in `src/controllers/show.logs.tsx`.
It uses `definePage` with a `loader` that calls `loadLogViewer(c, options)` from
`@y-core/forge/logging/show`. The viewer builds no document of its own: it renders through the shell
`worker.ts` registers, so it is inside the app's chrome by registration rather than by anything this
controller passes. The loader returns a `Response`, so the `view` is a pass-through. There is no
`logs.tsx` view component in the app — the log viewer UI comes from forge.

### 1d. not-found.tsx — 404 Page

Built on `EmptyState` / `.Figure` / `.Description` / `.Actions`, with a `Button asChild` return-home
link inside `.Actions` — a 404 is the canonical empty state.

The title is `EmptyState.Title` carrying `level={1}`: it defaults to an `<h3>`, and this is the
page's only heading, so the document would otherwise have no `<h1>` for a screen reader to land on.

`NotFoundView` takes no props — it is a `<main>`, and the chrome is the shell's. Rendered by the
`notFoundController` in `src/controllers/not-found.tsx`, which calls
`renderShell(c, <NotFoundView />, { mount: "app", page: "not-found", meta: { title: "Page not found", robots: "noindex" } }, { status: 404 })`.
`notFoundController` is passed to `createApp` as `notFound` in `worker.ts` — the one answer to an
unmatched URL, whether the router found no route or the asset catch-all declined.

---

## 2. The Document Shell

`src/app/shell.tsx` registers `appShell` with `createApp`, and it is the **single writer of
`<html>`** in this application. Every page — this app's own, forge's auth pages, the showcase and the
log viewer — is content handed to that shell, which resolves the `RenderContext` once and renders
`<Layout>` around it.

A controller reaches the shell with `renderShell` from `@y-core/forge/app`:

    return renderShell(
      c,
      <main id="main-content">…</main>,
      { mount: "app", page: "welcome", meta: { title: "Welcome back", robots: "noindex" } },
      { status: 200 },
    )

- **`content` is a `<main>`, never a document.** The `<head>`, `<body>`, nav and footer are `Layout`'s.
- **`slot.meta` is a full `PageMeta`**, so `title` is required; `Layout` merges it over `siteMeta`.
- **`slot.mount` is an open string.** `app` is what this application's own pages pass; forge's
  mountables pass `auth`, `showcase` and `logs`. `appShell` branches on none of them, and a branch
  added there needs a default arm.
- **A fragment never reaches the shell.** An HTMX route returns `fragmentResponse`; see
  [ERROR_HANDLING.md](./ERROR_HANDLING.md) §2b.

### 2a. Nonce on All Inline Scripts

Every `<script>` tag — whether inline or external — must carry `nonce={ctx.nonce}` to
satisfy the CSP nonce policy enforced by `createSecurityHeaders`. Omitting the nonce
causes the browser to block script execution in production.

    {/* Correct */}
    <script nonce={ctx.nonce}>{rawHtml(FOUC_SCRIPT)}</script>
    <script defer src="/assets/js/main.js" nonce={ctx.nonce} />

    {/* Wrong — missing nonce, will be blocked by CSP */}
    <script>{rawHtml(FOUC_SCRIPT)}</script>

See [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) for how `ctx.nonce` is
generated per-request.

### 2b. FOUC Prevention

`FOUC_SCRIPT` runs **synchronously** in `<head>` before CSS is parsed. It reads
`localStorage.getItem("theme")` and immediately applies the `dark` class to `<html>`.
Without it, dark-mode users see a flash of the light theme on every page load.

Import from forge:

    import { FOUC_SCRIPT } from "@y-core/forge/ui/client"

Because the script runs inline, it is injected with `rawHtml(FOUC_SCRIPT)` — this is a
known-valid pattern. See [CODE_REVIEW.md §8](./CODE_REVIEW.md) for why it is not flagged.

### 2c. Deferred Scripts and Resumable Scopes

Client-side initializers are bundled into `/assets/js/main.js` via esbuild and loaded
with `defer`, initializing interactive behavior after `DOMContentLoaded` without
blocking first paint. Two kinds live there:

- **Explicit mount calls** — `mountTurnstile()`, for behavior the app opts into.
- **Resumable scopes** — registered as a side effect of importing a forge client
  module (`ui/chrome/client`, `ui/core/client`, `ui/show/client`) and activated by a
  single `resume()` call. Components declare their scope in markup, so there is no
  per-component mount call to keep in sync. See §6b and §6c.

    <script defer src="/assets/js/main.js" nonce={ctx.nonce} />


The entry point is `src/client/main.ts`. Add new client-side initializers there.

---

## 3. Home View and Contact Form

### 3a. Contact Form HTMX Pattern

The contact form uses HTMX attributes for progressive-enhancement submissions. On
submit, HTMX POSTs the form to `/api/contact` and swaps the result div with the
fragment returned by the handler.

    <Form
      hx-post="/api/contact"
      hx-target="#contact-result"
      hx-swap="outerHTML"
    >
      <input type="hidden" name="__csrf" value={ctx.csrfToken} />
      <Field name="name">
        <FieldLabel>Name</FieldLabel>
        <Input type="text" name="name" required />
      </Field>
      <Field name="email">
        <FieldLabel>Email</FieldLabel>
        <Input type="email" name="email" required />
      </Field>
      <Field name="message">
        <FieldLabel>Message</FieldLabel>
        <Textarea name="message" rows={5} required />
      </Field>
      <Button type="submit">Send</Button>
    </Form>
    <div id="contact-result" data-ref="contact-result" />

`hx-swap="outerHTML"` replaces the entire result `<div>` with the action's response
fragment. The handler returns `renderSuccess(c, <SuccessFragment />)` or
`renderValidationErrors(c, errors)`.

### 3b. Page Meta, JSON-LD and OG

No page writes a `<head>` tag. A page names its descriptor as the `meta` of the `ShellSlot` it hands
`renderShell` (§2); `Layout` merges it over `siteMeta` from `model/site.content.ts` and hands the
result to forge's `metaTags` — the one place a descriptor becomes markup. Forge documents the
descriptor itself; `warden search --dependency "meta descriptor"` is how that section is reached,
since the installed library's documents are not citable by name here.

    { mount: "app", page: "account", meta: { title: "Your account", robots: "noindex" } }

Three rules hold here, and each is enforced in `views/layout.tsx` rather than by every caller:

- **A page states only what is its own.** Description, OG, Twitter and JSON-LD live on `siteMeta`
  and are inherited; a page names its title and, where it applies, its `robots`.
- **The title is composed, the site's own is not.** `Layout` renders `Sign in — Forge Studio` from a
  page's `Sign in`, and the bare `Forge Studio` when the merged title is already the site's — which
  is why the home page names `title: site.title` rather than a page title of its own.
- **A `noindex` page carries no canonical.** The base names the site root, which on a page a crawler
  was told to drop would point it at a different URL — conflicting signals.

The mounted pages — auth, showcase and the log viewer — arrive through `app/shell.tsx` carrying a
descriptor forge wrote, `robots: "noindex"` included. This app never restates it.

The `nonce` on the JSON-LD `<script>` is required by CSP even though the script type is not
executable JavaScript; `metaTags` receives it and renders no script without one.

---

## 4. HTMX Patterns

### 4a. Fragment Target Pattern

Handlers return HTML fragments, not full pages. The HTMX target div is a named anchor
for the fragment. Naming convention: `id` and `data-ref` use the same slug.

    {/* In view */}
    <div id="contact-result" data-ref="contact-result" />

    {/* In handler — success path */}
    return fragmentResponse(renderSuccess("Thanks — we'll be in touch."))

    {/* In handler — validation error path */}
    return renderValidationErrors(c, validationErrors)

`renderSuccess` and `renderValidationErrors` are imported from `@y-core/forge/http`.
They set the correct `Content-Type: text/html` and status codes expected by HTMX.

### 4b. HX-Request Header Enforcement

HTMX automatically adds `HX-Request: true` to all requests it initiates. The
`htmxOnlyGuard` checks this header and returns 403
for non-HTMX requests. This prevents direct form POST abuse outside the UI.

    {/* router.tsx — guard order matters */}
    contact: { middleware: contactGuards, handler: contactAction }

See [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §2 for guard ordering rules.

### 4c. Turnstile Widget

The Cloudflare Turnstile widget is injected via a `<div>` marker and wired client-side
by `mountTurnstile`. The response token is written into a hidden field before submission.

    <div class="cf-turnstile" data-sitekey={ctx.turnstileSiteKey} />
    <input type="hidden" name="cf-turnstile-response" />

`mountTurnstile` is called from `src/client/main.ts`:

    import { mountTurnstile } from "@y-core/forge/ui/client"
    mountTurnstile()

The site key is read from `ctx.turnstileSiteKey`, which is populated by
`renderContext` from `config.services.turnstile.siteKey`.

### 4d. Loading Indicators

Add `hx-indicator` and an indicator element for long-running requests:

    <Form hx-post="/api/contact" hx-indicator="#form-spinner">
      <Button data-ref="contact-submit" type="submit" size="lg">
        Send Message
        <span id="form-spinner" class="htmx-indicator" aria-hidden="true">
          <Spinner icon={CoreIcon} size="sm" />
        </span>
      </Button>
    </Form>

Tailwind's `htmx-indicator` utility hides the element by default and shows it during
the request via the `.htmx-request` class added by HTMX. The wrapping `span` is htmx wiring, not
styling, so it stays; only the glyph inside it is forge's `Spinner`.

**Not `Button`'s `loading` prop.** That is a server-render-time boolean — it decides once, when the
page is rendered — whereas the indicator is driven by CSS as htmx adds and removes `.htmx-request`.

---

## 5. Tailwind v4 Theme Tokens

### 5a. @theme Block in tailwind.css

**There is no brand-colour scale to declare.** The palette lives in `src/assets/css/custom.css`,
a forge-shaped scheme generated by forge's customiser: `--gray-1..12` and `--accent-1..12` in one
`:root`, each step a `light-dark()` pair. `tailwind.css` imports it after `forge.css`, and forge's
own theme maps those steps onto `--color-background`, `--color-foreground`, `--color-primary` and
the rest. Do **not** import a named theme file (`theme-gray.css` and friends) — it re-declares the
twelve gray steps and would clobber the ones `custom.css` deliberately chose.

The app's own `@theme` block is therefore three lines, and every one of them is a token a call site
would otherwise inline:

    @theme {
      --font-serif: Georgia, "Times New Roman", serif;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --tracking-eyebrow: 0.3em;
    }

`--tracking-eyebrow` exists so the hero eyebrow reads `tracking-eyebrow` rather than
`tracking-[0.3em]`; FORGE_CONSUMPTION §5b forbids inlining a step in markup.

**Reserved namespaces matter.** `cn`'s class-group table reads the _root_ of a utility, so a custom
name must extend a root the table already knows. A custom font size must be `--text-size-hero`, not
`--text-hero`, or `cn` reads `text-hero` as a colour.

### 5b. System Font Stacks Only

No external web fonts are loaded — zero layout shift, zero external requests. The two faces extend
Tailwind's own `--font-sans` and `--font-serif` roots, which is what `theme-base.css` documents.

**This is not a naming preference.** `cn`'s class-group table gives the root `font` the concern
`--tw-font-weight`, with exceptions only for `mono | sans | serif`. A `--font-display` token —
which this app carried until forge 0.1.2 — produces `font-display`, which is not in that set, so
`cn("font-display …", "font-semibold")` **silently drops the face**. It was harmless only while
every call site was a raw intrinsic element; the moment one reached a forge component that runs
`cn` (`Card.Title`, whose base is `leading-none font-semibold …`), the face would disappear.

Views use `font-serif` for display copy and inherit `font-sans` from the `@layer base` body rule.

### 5c. Dark Mode via Class Strategy

Tailwind v4 dark mode is configured with the `class` strategy. The `dark` class on
`<html>` (applied by FOUC_SCRIPT and toggled by the `theme` scope — see §6b) activates
all `dark:*` variants.

---

## 6. Theme Toggle

### 6a. FOUC_SCRIPT Import and Placement

Import `FOUC_SCRIPT` from the forge client module and render it as the **first**
`<script>` in `<head>`, before any stylesheets:

    import { FOUC_SCRIPT } from "@y-core/forge/ui/chrome"
    import { rawHtml } from "@y-core/forge/http"

    // In Layout <head>:
    <script nonce={ctx.nonce}>{rawHtml(FOUC_SCRIPT)}</script>
    <link rel="stylesheet" href="/assets/styles.css" nonce={ctx.nonce} />

Placement before the stylesheet ensures the `dark` class is set before the browser
computes styles, eliminating the flash.

### 6b. Theme Resumable Scope

There is no `mountTheme()`; forge exports no such function. Importing
`@y-core/forge/ui/chrome/client` for its side effect registers an **eager `theme`
scope**; `resume()` then reconciles the signal with what `FOUC_SCRIPT` already applied
from `localStorage` and wires the toggle's `cycleTheme` action.

    // src/client/main.ts — order matters: register, then resume
    import "@y-core/forge/ui/chrome/client"
    import { resume } from "@y-core/forge/ui/client"

    resume()

Render the toggle with `ThemeToggle` from `@y-core/forge/ui/chrome`. It emits the
`data-scope="theme"` marker `resume()` discovers, so no `data-ref` wiring is needed.
`DARK_CLASS`, `THEME_ATTR`, and `THEME_STORAGE_KEY` are exported from the same
namespace when markup or a test needs the canonical strings.

Render it **once per page**. Each instance is a separate scope, so a second copy is a
second theme controller rather than a mirror of the first.

### 6c. Navbar Component and Navbar Resumable Scope

There is no `mountNav()` — forge 0.0.83 removed it, and the `data-ref="nav-toggle"` /
`data-ref="nav-menu"` markup it drove is dead. Use `Navbar` from
`@y-core/forge/ui/chrome`, whose disclosure is a native `<details>`/`<summary>` and so
opens and closes without JavaScript. The same `ui/chrome/client` side-effect import
registers an eager `navbar` scope for the parts that do need script — auth filtering
and viewport collapse.

`Navbar` is configuration-driven: the tree comes from a `NavDefinition`, not from JSX
children, and every `href` is a **route-map key** resolved through a required
`resolveHref`. That return need not be a route — an in-page fragment is a valid
resolution. See `src/views/nav.tsx` for the starter's config and §1a for how the
header composes it.

    <Navbar
      id='primary-nav'
      aria-label='Primary'
      config={primaryNav}
      resolveHref={resolveNavHref}
      icon={CoreIcon}
      class='static z-auto bg-transparent'
    />

Two consequences worth knowing before composing it:

- **Pass `aria-label` explicitly** or the landmark renders unnamed.
- **Everything inside the bar is hidden on mobile until the disclosure opens** (the
  panel is `hidden group-open:flex md:flex`). Content that must stay visible in the
  mobile header — brand mark, theme toggle — belongs beside `<Navbar>`, not in a
  `NavSlot`.

### 6d. The Navbar Varies By Identity

`activeFilters` and `slots` come from forge's `authNav`, resolved once per request into
`ctx.nav` (`src/app/context.ts`) and spread onto `Navbar` by `Layout`. Each item names the
tokens that may see it with `AUTH_NAV_FILTERS`; `navIdentityGuard` in
`src/app/middleware.ts` is what establishes the identity those tokens are read off, on
every path but `/api/*`.

**Every page response is therefore identity-dependent, and nothing here sets
`Cache-Control` or `Vary`.** Today that is safe: Wrangler serves the static assets, and
nothing caches the Worker's HTML. It stops being safe the moment anything does — a
`cf.cacheEverything` route, a Cache API layer, a CDN rule in front of the Worker — which
would hand one visitor's navbar to the next. **Add `Vary: Cookie` in the same change that
adds any HTML cache layer, or do not add one.**

**A hidden item is in the markup, not absent from it.** An anonymous page's source still
carries the account and administrative entries, each with `hidden` and its `data-filter`
tokens, because the navbar scope re-applies the filters on the client. The guards are what
enforce access, so this discloses a route name and never data — but it is a deliberate
trade for the runtime re-sync, not an oversight. Prune the `NavDefinition` server-side
instead only if you are also giving up that re-sync.
