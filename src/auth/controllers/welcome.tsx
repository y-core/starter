/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { definePage, renderShell } from "@y-core/forge/app";
import type { AuthViewResolved } from "@y-core/forge/auth/web";
import { resolveAuthView, SigninView } from "@y-core/forge/auth/web";
import type { Result } from "@y-core/forge/result";

import type { AppConfig, AppEnv } from "../../app/types";
import { authWebOptions } from "../app/auth";

interface WelcomeData {
  signin: Result<AuthViewResolved<"signin">, Response>;
}

/** Forge's own sign-in card, with its paths and its path-bound token, on a route this app owns. */
export const welcomeController = definePage<AppEnv, AppConfig, WelcomeData>({
  cache: "no-store",
  loader: async (c, _config) => ({ signin: await resolveAuthView(c, authWebOptions, { name: "signin" }) }),
  view: (c, _config, state) => {
    const { signin } = state.data;
    if (!signin.ok) return signin.error;
    return renderShell(
      c,
      <main id='main-content' class='mx-auto flex w-full max-w-xl flex-col gap-8 px-6 py-16'>
        <h1 class='font-serif text-3xl font-semibold text-balance'>Welcome back</h1>
        <SigninView {...signin.data.props} class='max-w-none' level={2} />
      </main>,
      { mount: "app", page: "welcome", meta: { title: "Welcome back", robots: "noindex" } },
      { status: signin.data.status ?? 200 },
    );
  },
});
