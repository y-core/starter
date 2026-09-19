/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import { AUTH_NAV_FILTERS, AUTH_NAV_SIGNOUT_SLOT } from "@y-core/forge/auth/web";
import type { NavDefinition } from "@y-core/forge/ui/chrome";

import { authWebPaths } from "../app/auth";
import { routes } from "../routes";

/** Every route-map key `primaryNav` names, resolved to the URL it renders as. */
const NAV_HREFS: Record<string, string> = {
  // The bar is in the shared layout, so a bare `#contact` would point at nothing on a page that has
  // no contact section; `resolveHref` need not return a route.
  contact: `${routes.home.href()}#contact`,
  showcaseUi: routes.showcase.ui.index.href(),
  showcaseTheme: routes.showcase.ui.theme.href(),
  showcaseLogs: routes.showcase.logs.href(),
  showcaseInteractive: routes.showcase.ui.interactive.href(),
  showcaseRuntime: routes.showcase.ui.runtime.href(),
  showcaseHtmx: routes.showcase.ui.htmx.href(),
  showcaseChrome: routes.showcase.ui.chrome.href(),
  authSignin: authWebPaths.auth.signin(),
  authSignup: authWebPaths.auth.signup(),
  account: routes.account.href(),
  adminUsers: authWebPaths.admin.users.list(),
};

/** The primary navbar configuration: one menu of destinations behind a single trigger. */
export const primaryNav: NavDefinition = {
  sections: [
    {
      items: [
        {
          // Never name this "Menu": forge hard-codes `aria-label='Menu'` on the mobile toggle whose
          // panel this trigger renders inside, and two nested controls must not share one name.
          label: "Showcase",
          items: [
            { label: "Logs", href: "showcaseLogs" },
            { label: "Theme", href: "showcaseTheme" },
            { label: "UI", href: "showcaseUi" },
          ],
        },
        {
          // Naming a second factor here would advertise one `AUTH_SECOND_FACTORS` may have switched
          // off, so the entries name only the pages every deployment serves.
          label: "Account",
          items: [
            { label: "Sign in", href: "authSignin", filters: [AUTH_NAV_FILTERS.anonymous] },
            { label: "Sign up", href: "authSignup", filters: [AUTH_NAV_FILTERS.anonymous] },
            { label: "Your account", href: "account", filters: [AUTH_NAV_FILTERS.signedIn] },
            // The admin token rather than the signed-in one: the users list is behind `requireAdmin`,
            // so offering it to an ordinary member links to a 403.
            { label: "Users", href: "adminUsers", filters: [AUTH_NAV_FILTERS.admin] },
            { slot: AUTH_NAV_SIGNOUT_SLOT, filters: [AUTH_NAV_FILTERS.signedIn] },
          ],
        },
        { label: "Contact", href: "contact" },
      ],
    },
  ],
};

/** Resolves a `primaryNav` route-map key to a URL; falls back to the home route on an unknown key. */
export function resolveNavHref(key: string): string {
  return NAV_HREFS[key] ?? routes.home.href();
}
