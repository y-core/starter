/** @jsxImportSource @y-core/forge/jsx */

import { assets, CoreIcon } from "@assets";
import { rawHtml } from "@y-core/forge/http";
import type { JSXNode } from "@y-core/forge/ui";
import { FOUC_SCRIPT } from "@y-core/forge/ui/client";
import type { RenderContext } from "../app/context";
import { site } from "../model/site.content";
import { routes } from "../routes";
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
      <body>
        <a
          href='#main-content'
          class='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground'>
          Skip to main content
        </a>

        <header class='sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg'>
          <div class='mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10'>
            <a href={routes.home.href()} class='flex items-center gap-3' aria-label='Forge Studio — Home'>
              <div class='h-9 shrink-0'>
                <CoreIcon name='logo' class='h-7 w-auto md:h-10' />
              </div>
              <div class='min-w-0 font-display text-xl font-semibold tracking-wider text-foreground'>Forge Studio</div>
            </a>

            <nav class='hidden items-center gap-8 md:flex' aria-label='Primary'>
              <ThemeToggle />
              <a
                href='#contact'
                class='rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90'>
                Contact
              </a>
            </nav>

            <div class='flex items-center gap-2 md:hidden'>
              <ThemeToggle />
              <button
                type='button'
                data-ref='nav-toggle'
                class='rounded-lg p-2 text-foreground transition hover:bg-accent'
                aria-label='Toggle navigation'
                aria-expanded='false'
                aria-controls='nav-menu'>
                <CoreIcon name='hamburger' width={22} height={22} />
              </button>
            </div>
          </div>

          <div id='nav-menu' data-ref='nav-menu' class='hidden border-t border-border bg-background/95 px-6 py-5 md:hidden'>
            <nav class='flex flex-col gap-5' aria-label='Mobile'>
              <a data-ref='nav-link' href='#contact' class='text-sm font-semibold text-primary'>
                Contact Us
              </a>
            </nav>
          </div>
        </header>

        {children}

        <footer class='border-t border-border bg-card px-6 py-14 text-card-foreground'>
          <div class='mx-auto max-w-7xl'>
            <div class='flex flex-col items-center justify-between gap-8 md:flex-row'>
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
            <div class='mt-10 border-t border-border pt-8 text-center text-xs text-muted-foreground'>
              © {site.footer.copyrightStart}–{new Date().getFullYear()} {site.footer.entity}. All rights reserved.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
