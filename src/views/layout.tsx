/** @jsxImportSource @y-core/forge/jsx */

import { assets, CoreIcon, ICON_LINKS } from "@assets";
import type { PageMeta } from "@y-core/forge/app";
import { mergeMeta, metaTags } from "@y-core/forge/app";
import { rawHtml } from "@y-core/forge/http";
import type { JSXNode } from "@y-core/forge/jsx";
import { FOUC_SCRIPT, Navbar, ThemeToggle } from "@y-core/forge/ui/chrome";
import { Separator } from "@y-core/forge/ui/core";

import type { RenderContext } from "../app/types";
import { site, siteMeta } from "../model/site.content";
import { routes } from "../routes";
import { primaryNav, resolveNavHref } from "./nav";

interface LayoutProps {
  ctx: RenderContext;
  /** Merged over `siteMeta`; the shell is the only caller, and a `ShellSlot` always resolves one. */
  meta: PageMeta;
  children?: JSXNode | undefined;
}

// Composed here rather than by each caller: a page states the thing it is, and which site it belongs
// to is the shell's fact — including for the auth, showcase and log pages, whose titles forge writes.
/** A page's title as the document carries it, the site's own left uncomposed. */
function documentTitle(title: string): string {
  return title === site.title ? title : `${title} — ${site.title}`;
}

/** Whether a descriptor asks to be kept out of the index, in either spelling `robots` allows. */
function hidden(robots: PageMeta["robots"]): boolean {
  return robots === "noindex" || (Array.isArray(robots) && robots.includes("noindex"));
}

export function Layout({ ctx, meta, children }: LayoutProps) {
  const { nonce, baseUrl } = ctx;
  const merged = mergeMeta(siteMeta(baseUrl), meta);
  // The base names the site root, which on a `noindex` page would point a crawler at a URL other
  // than the one it was just told to drop. Cleared here, so no page has to restate it.
  const canonical = hidden(merged.robots) ? undefined : merged.canonical;
  return (
    <html lang='en'>
      <head>
        <meta charset='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />

        {metaTags({ ...merged, title: documentTitle(merged.title), canonical }, { nonce })}

        {ICON_LINKS.map((link) => (
          <link rel={link.rel} href={link.href} type={link.type} sizes={link.sizes} />
        ))}

        {/* FOUC_SCRIPT before stylesheet to set data-theme-preference */}
        <script nonce={nonce}>{rawHtml(FOUC_SCRIPT)}</script>

        <link rel='stylesheet' href={assets.path("css/main.css")} />

        <script nonce={nonce} src={assets.path("js/main.js")} type='module' />
      </head>
      {/* Sticky footer: the column is at least a viewport tall and the footer takes the slack through
          `mt-auto`. An auto margin is what keeps this indifferent to what a page view renders — no
          `flex-1` wrapper around the `children` Slot, so a page owns its own `<main>` sizing as before.

          The `has-` pair is the opt-in second regime, for a page that fills the viewport rather than
          flowing down it (the log viewer's `<main>` stamps `data-fill-viewport`). `min-h-dvh` leaves the
          column's height indefinite, and an indefinite flex column takes its height from its items'
          content — so a long log table would grow the document no matter how the items flex. `h-dvh`
          makes the height definite, which is what lets `flex-1` hand the page a fixed box to scroll
          inside; `overflow-hidden` keeps the shell itself from scrolling. Every other page is untouched. */}
      <body class='flex min-h-dvh flex-col has-data-fill-viewport:h-dvh has-data-fill-viewport:overflow-hidden'>
        <a
          href='#main-content'
          class='sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:rounded-lg focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-primary-foreground'>
          Skip to main content
        </a>

        {/* The blur sits on a sibling layer rather than on the <header> itself: `backdrop-filter`
            establishes a containing block, against which the drawer's fixed panel would position —
            it would land inside the header band instead of over the page. */}
        <header class='sticky top-0 z-50 border-b border-border'>
          <div class='absolute inset-0 -z-10 bg-background/80 backdrop-blur-lg' aria-hidden='true' />
          <div class='mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10'>
            <a href={routes.home.href()} class='flex items-center gap-3' aria-label='Forge Studio — Home'>
              <div class='h-9 shrink-0'>
                <CoreIcon name='logo' class='h-7 w-auto md:h-10' />
              </div>
              <div class='min-w-0 font-serif text-xl font-semibold tracking-wider text-foreground'>Forge Studio</div>
            </a>

            {/* ThemeToggle is a NavSlot per forge's own guidance (rule:forge-ui-nav-theme-toggle-placement),
                but it is rendered here — once, outside <Navbar> — rather than slotted in, since
                everything inside the bar lives under PANEL_CLASS.mobile (hidden until the mobile
                menu opens), which would hide a slotted toggle from the mobile header. Deliberate
                override of rule:forge-ui-nav-slot-not-link. */}
            <div class='flex items-center gap-2'>
              <Navbar
                id='primary-nav'
                aria-label='Primary'
                config={primaryNav}
                resolveHref={resolveNavHref}
                activeFilters={ctx.nav.activeFilters}
                slots={ctx.nav.slots}
                icon={CoreIcon}
                collapsedAs='drawer'
                class='static z-auto bg-transparent'
              />
              <ThemeToggle icon={CoreIcon} />
            </div>
          </div>
        </header>

        {children}

        <footer class='mt-auto border-t border-border bg-card px-6 py-8 text-card-foreground'>
          <div class='mx-auto max-w-7xl'>
            <div class='flex flex-col items-center justify-between gap-4 md:flex-row'>
              {/* modern-css-allow: forge-ui-platform-display-contents — the wrapper groups two lines into one flex item; dissolving it makes `justify-between` distribute three items on `md`, and swaps the `mt-1` line gap for `gap-4` on mobile. */}
              <div>
                <p class='font-serif text-lg font-semibold text-card-foreground'>{site.footer.entity}</p>
                <p class='mt-1 text-sm text-muted-foreground'>Digital Product Studio</p>
              </div>
              <nav class='flex flex-wrap justify-center gap-6 text-sm' aria-label='Footer'>
                <a href='#contact' class='text-muted-foreground hover:text-foreground motion-safe:transition'>
                  Contact
                </a>
              </nav>
            </div>
            <Separator class='mt-6' />
            <div class='pt-6 text-center text-xs text-muted-foreground'>
              © {site.footer.copyrightStart}–{new Date().getFullYear()} {site.footer.entity}. All rights reserved.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
