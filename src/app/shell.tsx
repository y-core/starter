/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import type { PageShell } from "@y-core/forge/app";

import { Layout } from "../views/layout";
import { configStore } from "./config";
import { renderContext } from "./context";
import type { AppEnv } from "./types";

// No `csrfPath`, so `ctx.csrfToken` is `""`: every mountable mints its own path-bound token into the
// props its views receive, and a token minted at this level would carry the shell's path, not theirs.
/** The one document shell this app registers, wrapping every mount's content in the site chrome. */
export const appShell: PageShell<AppEnv> = async (c, content, slot) => (
  <Layout ctx={await renderContext(c, configStore.get(c.env))} meta={slot.meta}>
    {content}
  </Layout>
);
