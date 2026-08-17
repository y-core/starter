/** @jsxImportSource @y-core/forge/jsx */

import { assets, CoreIcon } from "@assets";
import { rawHtml } from "@y-core/forge/http";
import type { JSXNode } from "@y-core/forge/jsx";
import { FOUC_SCRIPT, Navbar } from "@y-core/forge/ui/chrome";
import type { RenderContext } from "../app/context";
import { site } from "../model/site.content";
import { routes } from "../routes";
import { primaryNav, resolveNavHref } from "./nav";
import { ThemeToggle } from "./ui";

interface LayoutProps {
  ctx: RenderContext;
  children?: JSXNode;
}

export function Layout({ ctx, children }: LayoutProps) {
  const { nonce, baseUrl } = ctx;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: site.title,
    description: site.description,
    url: baseUrl ? `${baseUrl}/` : undefined,
  });
  return (
    <html lang='en'>
      <head>
        <meta charset='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <title>{site.title}</title>
        <meta name='description' content={site.description} />

        <meta property='og:title' content={site.title} />
        <meta property='og:description' content={site.description} />
        <meta property='og:type' content='website' />
        {baseUrl && <meta property='og:url' content={`${baseUrl}/`} />}

        <meta name='twitter:card' content='summary' />
        <meta name='twitter:title' content={site.title} />
        <meta name='twitter:description' content={site.description} />

        {baseUrl && <link rel='canonical' href={`${baseUrl}/`} />}

        <link rel='icon' href='/favicon.ico' sizes='48x48' />
        <link rel='icon' href='/favicon.svg' type='image/svg+xml' />
        <link rel='apple-touch-icon' href='/apple-touch-icon.png' />
        <link rel='manifest' href='/site.webmanifest' />

        {/* FOUC_SCRIPT before stylesheet to set data-theme-preference */}
        <script nonce={nonce}>{rawHtml(FOUC_SCRIPT)}</script>

        <link rel='stylesheet' href={assets.path("css/main.css")} />

        <script nonce={nonce} type='application/ld+json'>
          {rawHtml(jsonLd)}
        </script>
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
      <body class='flex min-h-dvh flex-col has-[[data-fill-viewport]]:h-dvh has-[[data-fill-viewport]]:overflow-hidden'>
        <a
          href='#main-content'
          class='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground'>
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
              <div class='min-w-0 font-display text-xl font-semibold tracking-wider text-foreground'>Forge Studio</div>
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
                icon={CoreIcon}
                collapsedAs='drawer'
                class='static z-auto bg-transparent'
              />
              <ThemeToggle />
            </div>
          </div>
        </header>

        {children}

        <footer class='mt-auto border-t border-border bg-card px-6 py-8 text-card-foreground'>
          <div class='mx-auto max-w-7xl'>
            <div class='flex flex-col items-center justify-between gap-4 md:flex-row'>
              <div>
                <p class='font-display text-lg font-semibold text-card-foreground'>{site.footer.entity}</p>
                <p class='mt-1 text-sm text-muted-foreground'>Digital Product Studio</p>
              </div>
              <nav class='flex flex-wrap justify-center gap-6 text-sm' aria-label='Footer'>
                <a href='#contact' class='text-muted-foreground transition hover:text-foreground'>
                  Contact
                </a>
              </nav>
            </div>
            <div class='mt-6 border-t border-border pt-6 text-center text-xs text-muted-foreground'>
              © {site.footer.copyrightStart}–{new Date().getFullYear()} {site.footer.entity}. All rights reserved.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
