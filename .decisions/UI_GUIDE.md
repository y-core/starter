---
title: "UI Guide"
description: "views directory, layout component, home view, logs view, not-found view, forge ui components, HTMX patterns, Tailwind v4 @theme tokens, theme toggle, FOUC_SCRIPT, mountTheme, SEO JSON-LD, OG tags, mountTurnstile, mountNav, nonce inline scripts"
weight: 30
---

# UI Guide

> The starter's view layer: layout, views, forge UI components, Tailwind tokens, HTMX, SEO.

---

## 0. Quick Reference

- §1 views/ directory: layout, home, not-found (logs rendered by adminLogsController via forge LogViewerContent)
- §2 Layout: FOUC_SCRIPT, nonce, deferred scripts
- §3 Home view: hero, contact form, JSON-LD, OG meta
- §4 HTMX patterns: hx-post, hx-target, hx-swap
- §5 Tailwind v4 @theme tokens: brand-*, system fonts
- §6 Theme toggle: FOUC_SCRIPT, mountTheme

---

## 1. views/ Directory

The `src/views/` directory contains all forge JSX components that render full pages or
page fragments (`@jsxImportSource @y-core/forge`). Each file exports one primary component.
Views receive all data via props and never call services or perform validation directly.

### 1a. layout.tsx — Root Layout

Wraps all pages — composed by each page view as `<Layout ctx={ctx}>…</Layout>` (the
`children` Slot). Injects: FOUC_SCRIPT inline (synchronous, in head), CSS link, nav,
deferred client scripts. All inline scripts carry `nonce={ctx.nonce}`. `Layout` sources
`site` itself via `import { site } from "../model/site.content"`.

    export function Layout({ ctx, children }: { ctx: RenderContext; children?: JSXNode }) {
      const { nonce } = ctx
      return (
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>{site.title}</title>
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

`RenderContext` is produced by `renderContext(c, config, csrfPath?)` in the controller's
`loader` and passed to the page view as a prop. The page view owns its `<Layout ctx={ctx}>…</Layout>`
composition. `Layout` sources the site title from `../model/site.content`; asset paths come from
the `@assets` alias (`assets.path(…)`). The controller's `view` calls `renderPage(<HomeView ctx={ctx} …/>)`
from `@y-core/forge/render`. See [MIDDLEWARE_AND_CONTEXT.md](./MIDDLEWARE_AND_CONTEXT.md) §4.

### 1b. home.tsx — Home Page

Full home page with hero section and contact form. Receives `RenderContext` for nonce,
CSRF token, and Turnstile site key. Emits JSON-LD and OG meta in the `<head>` slot.

### 1c. Log Viewer — adminLogsController

The `/admin/logs` page is rendered by `adminLogsController` in `src/controllers/admin-logs.tsx`.
It uses `definePage` with a `loader` that calls `readLogViewer` and a `view` that calls
`renderPage(<Layout ctx={ctx}><LogViewerContent data={state.data} icon={CoreIcon} /></Layout>)`.
Both `readLogViewer` and `LogViewerContent` are imported from `@y-core/forge/logging/http`.
There is no `logs.tsx` view component in the app — the log viewer UI comes from forge.

### 1d. not-found.tsx — 404 Page

Minimal view: "Page not found" heading with a link back to `/`. The `NotFoundView` in
`src/views/not-found.tsx` owns its `<Layout ctx={ctx}>` composition. Rendered by the
`notFoundController` in `src/controllers/not-found.tsx`, which marshals `renderContext`
(no `csrfPath` → empty token) and calls `renderPage(<NotFoundView ctx={ctx} />, { status: 404 })`
from `@y-core/forge/render`. `notFoundController` is passed to
`applyAssets(app, { notFoundView: notFoundController })` in `worker.ts` as the catch-all 404 handler.

---

## 2. Layout Component Patterns

### 2a. Nonce on All Inline Scripts

Every `<script>` tag — whether inline or external — must carry `nonce={ctx.nonce}` to
satisfy the CSP nonce policy enforced by `makeSecurityHeaders`. Omitting the nonce
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

### 2c. Deferred Scripts and Mount Functions

Client-side mount functions (`mountTheme`, `mountNav`, `mountTurnstile`) are bundled
into `/assets/js/main.js` via esbuild and loaded with `defer`. They initialize
interactive behavior after `DOMContentLoaded` without blocking first paint.

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

### 3b. JSON-LD and OG Meta

Structured data and Open Graph tags are emitted in a `<head>` slot passed to `Layout`.

    <script type="application/ld+json" nonce={ctx.nonce}>
      {JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: "Forge Studio",
        url: "https://example.com",
      })}
    </script>
    <meta property="og:title" content="Forge Studio" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://example.com" />
    <meta property="og:description" content="Build with Forge." />

The `nonce` attribute on the JSON-LD `<script>` is required by CSP even though the
script type is not executable JavaScript. Omitting it causes CSP violations in strict
configurations.

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
`contactGuard` (or an equivalent guard) checks this header and returns 403
for non-HTMX requests. This prevents direct form POST abuse outside the UI.

    {/* router.tsx — guard order matters */}
    contact: { middleware: contactGuards, handler: handleContact }

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

    <Form hx-post="/api/contact" hx-indicator="#spinner">
      <span id="spinner" class="htmx-indicator">Sending…</span>
      ...
    </Form>

Tailwind's `htmx-indicator` utility hides the element by default and shows it during
the request via the `.htmx-request` class added by HTMX.

---

## 5. Tailwind v4 Theme Tokens

### 5a. @theme Block in tailwind.css

Custom design tokens live in the `@theme {}` block in `src/assets/tailwind.css`. These
generate CSS custom properties and corresponding Tailwind utility classes.

    @theme {
      --color-brand-50:  oklch(97% 0.02 210);
      --color-brand-100: oklch(93% 0.05 210);
      --color-brand-500: oklch(55% 0.18 210);
      --color-brand-700: oklch(38% 0.14 210);
      --color-brand-900: oklch(20% 0.08 210);

      --color-surface:   oklch(99% 0.005 210);
      --color-muted:     oklch(62% 0.04  210);
    }

Use brand color classes directly: `bg-brand-500`, `text-brand-900`, `border-brand-100`.
Dark mode variants: `dark:bg-brand-900 dark:text-brand-50`.

### 5b. System Font Stacks Only

No external web fonts are loaded — zero layout shift, zero external requests.

    @theme {
      --font-sans: ui-sans-serif, system-ui, -apple-system, sans-serif;
      --font-mono: ui-monospace, Menlo, "Courier New", monospace;
    }

### 5c. Dark Mode via Class Strategy

Tailwind v4 dark mode is configured with the `class` strategy. The `dark` class on
`<html>` (applied by FOUC_SCRIPT and toggled by mountTheme) activates all `dark:*`
variants.

---

## 6. Theme Toggle

### 6a. FOUC_SCRIPT Import and Placement

Import `FOUC_SCRIPT` from the forge client module and render it as the **first**
`<script>` in `<head>`, before any stylesheets:

    import { FOUC_SCRIPT } from "@y-core/forge/ui/client"
    import { rawHtml } from "@y-core/forge/http"

    // In Layout <head>:
    <script nonce={ctx.nonce}>{rawHtml(FOUC_SCRIPT)}</script>
    <link rel="stylesheet" href="/assets/styles.css" nonce={ctx.nonce} />

Placement before the stylesheet ensures the `dark` class is set before the browser
computes styles, eliminating the flash.

### 6b. mountTheme Client Function

`mountTheme()` is called from `src/client/main.ts` after DOM is ready. It:

1. Reads the current theme from `localStorage`
2. Wires the toggle button's `click` handler
3. Toggles the `dark` class on `<html>` and persists to `localStorage`

Import `DARK_CLASS` from forge for the canonical class name:

    import { mountTheme, DARK_CLASS } from "@y-core/forge/ui/client"
    // DARK_CLASS === "dark"
    mountTheme()

The toggle button in the nav must have `data-ref="theme-toggle"` for `mountTheme`
to locate it. Use the forge `ThemeToggle` component from `@y-core/forge/ui` which
includes the correct `data-ref`.

### 6c. mountNav Client Function

`mountNav()` wires mobile nav open/close behavior. The nav must include elements with
`data-ref="nav-toggle"` and `data-ref="nav-menu"`. Use the forge `Nav` component
from `@y-core/forge/ui` which provides these markers.

    import { mountNav } from "@y-core/forge/ui/client"
    mountNav()
