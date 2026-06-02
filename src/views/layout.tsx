/** @jsxImportSource @y-core/forge */

import { assets, CoreIcon } from "@assets";
import type { Child } from "@y-core/forge/ui";
import { FOUC_SCRIPT } from "@y-core/forge/ui/client";
import type { RenderContext } from "../app/context";
import type { SiteContent } from "../model/home.content";

interface LayoutProps {
  ctx: RenderContext;
  content: SiteContent;
  children?: Child;
}

export function Layout({ ctx, content, children }: LayoutProps) {
  const { nonce, baseUrl } = ctx;
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: content.title,
    description: content.description,
    url: baseUrl ? `${baseUrl}/` : undefined,
  });
  return (
    <html lang='en'>
      <head>
        <meta charset='utf-8' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <title>{content.title}</title>
        <meta name='description' content={content.description} />

        <meta property='og:title' content={content.title} />
        <meta property='og:description' content={content.description} />
        <meta property='og:type' content='website' />
        {baseUrl && <meta property='og:url' content={`${baseUrl}/`} />}

        <meta name='twitter:card' content='summary' />
        <meta name='twitter:title' content={content.title} />
        <meta name='twitter:description' content={content.description} />

        {baseUrl && <link rel='canonical' href={`${baseUrl}/`} />}

        <link rel='icon' href='/favicon.ico' sizes='48x48' />
        <link rel='icon' href='/favicon.svg' type='image/svg+xml' />
        <link rel='apple-touch-icon' href='/apple-touch-icon.png' />
        <link rel='manifest' href='/site.webmanifest' />

        <script type='application/ld+json' dangerouslySetInnerHTML={{ __html: jsonLd }} />

        <link rel='stylesheet' href={assets.path("css/main.css")} />
        <script src={assets.path("js/main.js")} type='module' />
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: FOUC_SCRIPT }} />
      </head>
      <body>
        <a
          href='#main-content'
          class='sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white'>
          Skip to main content
        </a>

        <header class='sticky top-0 z-50 border-b border-brand-200/40 bg-white/80 backdrop-blur-lg dark:border-brand-700/40 dark:bg-brand-900/80'>
          <div class='mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10'>
            <a href='/' class='flex items-center gap-3' aria-label='Forge Studio — Home'>
              <div class='h-9 shrink-0'>
                <CoreIcon name='logo' class='h-7 w-auto md:h-10' />
              </div>
              <div class='font-display text-xl font-semibold tracking-wider text-brand-900 dark:text-brand-50'>Forge Studio</div>
            </a>

            <nav class='hidden items-center gap-8 md:flex' aria-label='Primary'>
              <button
                type='button'
                data-ref='theme-toggle'
                aria-label='Toggle theme'
                class='rounded-lg p-2 text-brand-900 transition hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-brand-800'>
                <span class='theme-light-icon'>
                  <CoreIcon name='sun' width={20} height={20} />
                </span>
                <span class='theme-dark-icon'>
                  <CoreIcon name='moon' width={20} height={20} />
                </span>
                <span class='theme-system-icon'>
                  <CoreIcon name='monitor' width={20} height={20} />
                </span>
              </button>
              <a href='#contact' class='rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700'>
                Contact
              </a>
            </nav>

            <div class='flex items-center gap-2 md:hidden'>
              <button
                type='button'
                data-ref='theme-toggle'
                aria-label='Toggle theme'
                class='rounded-lg p-2 text-brand-900 transition hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-brand-800'>
                <span class='theme-light-icon'>
                  <CoreIcon name='sun' width={20} height={20} />
                </span>
                <span class='theme-dark-icon'>
                  <CoreIcon name='moon' width={20} height={20} />
                </span>
                <span class='theme-system-icon'>
                  <CoreIcon name='monitor' width={20} height={20} />
                </span>
              </button>
              <button
                type='button'
                data-ref='nav-toggle'
                class='rounded-lg p-2 text-brand-900 transition hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-brand-800'
                aria-label='Toggle navigation'
                aria-expanded='false'
                aria-controls='nav-menu'>
                <CoreIcon name='hamburger' width={22} height={22} />
              </button>
            </div>
          </div>

          <div
            id='nav-menu'
            data-ref='nav-menu'
            class='hidden border-t border-brand-200/30 bg-white/95 px-6 py-5 md:hidden dark:border-brand-700/30 dark:bg-brand-900/95'>
            <nav class='flex flex-col gap-5' aria-label='Mobile'>
              <a data-ref='nav-link' href='#contact' class='text-sm font-semibold text-brand-600 dark:text-brand-300'>
                Contact Us
              </a>
            </nav>
          </div>
        </header>

        {children}

        <footer class='bg-brand-900 px-6 py-14 text-brand-100'>
          <div class='mx-auto max-w-7xl'>
            <div class='flex flex-col items-center justify-between gap-8 md:flex-row'>
              <div>
                <p class='font-display text-lg font-semibold text-white'>{content.footer.entity}</p>
                <p class='mt-1 text-sm text-brand-300'>Digital Product Studio</p>
              </div>
              <nav class='flex flex-wrap justify-center gap-6 text-sm' aria-label='Footer'>
                <a href='#contact' class='text-brand-300 transition hover:text-white'>
                  Contact
                </a>
              </nav>
            </div>
            <div class='mt-10 border-t border-brand-800 pt-8 text-center text-xs text-brand-500'>
              © {content.footer.copyrightStart}–{new Date().getFullYear()} {content.footer.entity}. All rights reserved.
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
