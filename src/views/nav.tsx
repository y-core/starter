/** @jsxImportSource @y-core/forge/jsx */

import type { NavDefinition } from "@y-core/forge/ui/chrome";
import { routes } from "../routes";

/**
 * Route-map keys used by `primaryNav`, each resolved to a URL below. `contact` resolves to the home
 * route plus a fragment rather than to a route of its own — `/api/contact` is POST-only, not a page
 * — which forge's own docs sanction: `resolveHref`'s return need not be a route
 * (`@y-core/forge/src/ui/design/reference/08-navigation.md:33-35`). The route half is what a bare
 * `#contact` lacked: the bar is in the shared layout, so it is rendered on pages that have no
 * `#contact` section of their own.
 */
const NAV_HREFS: Record<string, string> = {
  contact: `${routes.home.href()}#contact`,
  showcaseUi: routes.showcase.ui.index.href(),
  showcaseTheme: routes.showcase.ui.theme.href(),
  showcaseLogs: routes.showcase.logs.href(),
  showcaseInteractive: routes.showcase.ui.interactive.href(),
  showcaseRuntime: routes.showcase.ui.runtime.href(),
  showcaseHtmx: routes.showcase.ui.htmx.href(),
  showcaseChrome: routes.showcase.ui.chrome.href(),
};

/** Resolves a `primaryNav` route-map key to a URL; falls back to the home route on an unknown key. */
export function resolveNavHref(key: string): string {
  return NAV_HREFS[key] ?? routes.home.href();
}

/** The primary navbar configuration: one menu of destinations behind a single trigger. */
export const primaryNav: NavDefinition = {
  sections: [
    {
      items: [
        {
          // Never name this "Menu": forge hard-codes `aria-label='Menu'` on the mobile toggle
          // (`ui/chrome/navbar.tsx`), and this trigger renders inside that toggle's panel — two
          // nested controls sharing one name.
          label: "Showcase",
          items: [
            { label: "Logs", href: "showcaseLogs" },
            { label: "Theme", href: "showcaseTheme" },
            { label: "UI", href: "showcaseUi" },
          ],
        },
        { label: "Contact", href: "contact" },
      ],
    },
  ],
};
