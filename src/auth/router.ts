import type { Forge } from "@y-core/forge/app";
import {
  AUTH_NAV_FILTERS,
  AUTH_NAV_SIGNOUT_SLOT,
  authNav,
  registerAccount,
  registerAdmin,
  registerAuth as registerAuthGroup,
} from "@y-core/forge/auth/web";
import { createController } from "@y-core/forge/router";

import { resolveCsrfKey } from "../app/config";
import type { AppEnv } from "../app/types";
import type { PrimaryNav } from "../views/nav";
import { authWebOptions, authWebPaths } from "./app/auth";
import { accountController } from "./controllers/account";
import { emailChangeConfirmController } from "./controllers/actions/email-change-confirm";
import { welcomeController } from "./controllers/welcome";
import { accountRouteMap, adminRouteMap, authPageRouteMap, authRouteMap } from "./routes";

/** Mounts the auth slice's own pages and forge's auth, account and admin groups, and contributes the Account menu to the navbar. */
export function registerAuth(app: Forge<AppEnv>, primaryNav: PrimaryNav): void {
  app.map(
    authPageRouteMap,
    createController(authPageRouteMap, {
      actions: { authEmailConfirm: emailChangeConfirmController, account: accountController, welcome: welcomeController },
    }),
  );
  registerAuthGroup(app, authRouteMap, authWebOptions);
  registerAccount(app, accountRouteMap, authWebOptions);
  registerAdmin(app, adminRouteMap, authWebOptions);
  primaryNav.contribute({
    items: [
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
    ],
    hrefs: {
      authSignin: authWebPaths.auth.signin(),
      authSignup: authWebPaths.auth.signup(),
      account: authPageRouteMap.account.href(),
      adminUsers: authWebPaths.admin.users.list(),
    },
    // `authCsrfGuard` covers only the auth prefixes, so the sign-out token every page carries is minted
    // here — making each page identity-dependent with no `Vary`: add `Vary: Cookie` with any cache.
    state: authNav({ signoutPath: authWebPaths.auth.signout(), secret: resolveCsrfKey }),
  });
}
