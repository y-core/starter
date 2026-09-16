/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { definePage, renderShell } from "@y-core/forge/app";
import type { AuthViewResolved } from "@y-core/forge/auth/web";
import { resolveAuthView, SigninView } from "@y-core/forge/auth/web";
import type { Result } from "@y-core/forge/result";

import { authWebOptions } from "../app/auth";
import type { AppConfig, AppEnv } from "../app/types";

interface WelcomeData {
  signin: Result<AuthViewResolved<"signin">, Response>;
}

// The proof that forge's auth views are placeable: this is forge's own sign-in card — the same
// paths and the same path-bound token `/auth/signin` renders — inside this app's chrome, on a route
// this app owns. `level={2}` because the page already has an `<h1>`.
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
