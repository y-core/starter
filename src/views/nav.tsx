/** @jsxImportSource @y-core/forge/jsx */

import type { NavDefinition } from "@y-core/forge/ui/chrome";
import { routes } from "../routes";

/**
 * Route-map keys used by `primaryNav`, each resolved to a URL below. `contact` resolves to an
 * in-page fragment rather than a route — `/api/contact` is POST-only, not a page — which forge's
 * own docs sanction: `resolveHref`'s return need not be a route
 * (`@y-core/forge/src/ui/design/reference/08-navigation.md:33-35`), and forge's own showcase
 * resolves its table-of-contents links the same way: `const tocHref = (key) => \`#${key}\`;`
 * (`@y-core/forge/src/ui/show/components.tsx:135`).
 */
const NAV_HREFS: Record<string, string> = {
  contact: "#contact",
  showcaseUi: routes.showcase.ui.index.href(),
  showcaseTheme: routes.showcase.ui.theme.href(),
  showcaseLogs: routes.showcase.logs.href(),
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
