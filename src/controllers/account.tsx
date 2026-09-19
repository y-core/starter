/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { definePage, renderShell } from "@y-core/forge/app";
import { authCtx } from "@y-core/forge/auth/web";
import { mintCsrf } from "@y-core/forge/form";

import { authWebPaths, resolveAuthRequestServices } from "../app/auth";
import type { AppConfig, AppEnv } from "../app/types";
import { AccountView } from "../views/account";

interface AccountData {
  email: string;
  emailVerifiedAt: number | null;
  createdAt: number | null;
  factorsPath: string;
  emailChangePath: string;
  signoutPath: string;
  signoutToken: string;
}

// Not forge's passkey list: the second factor is a switch here, and a landing page belonging to one
// factor breaks the moment `AUTH_SECOND_FACTORS` stops naming it.
export const accountController = definePage<AppEnv, AppConfig, AccountData>({
  cache: "no-store",
  loader: async (c, _config) => {
    const signoutPath = authWebPaths.auth.signout();
    // `requireAuth` runs ahead of this route and publishes the identity it established, so the
    // address costs no read of its own; the dates are not on it, and are read from the store.
    const identity = authCtx.get(c);
    const services = await resolveAuthRequestServices(c);
    const found = await services.users.findById(identity.userId);
    const user = found.ok ? found.data : null;
    return {
      email: identity.email,
      emailVerifiedAt: user?.emailVerifiedAt ?? null,
      createdAt: user?.createdAt ?? null,
      factorsPath: authWebPaths.account.factors(),
      emailChangePath: authWebPaths.account.emailChange(),
      signoutPath,
      // Minted for the path it posts to, never borrowed from the page's own: `csrfProtection` binds
      // a token to one path, so a shared one is a guaranteed 403.
      signoutToken: await mintCsrf(c, signoutPath),
    };
  },
  view: (c, _config, state) =>
    renderShell(
      c,
      <main id='main-content' class='mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-16'>
        <AccountView {...state.data} />
      </main>,
      { mount: "app", page: "account", meta: { title: "Your account", robots: "noindex" } },
    ),
});
