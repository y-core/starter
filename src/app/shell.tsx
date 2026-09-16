/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import type { PageShell } from "@y-core/forge/app";

import { Layout } from "../views/layout";
import { configStore } from "./config";
import { renderContext } from "./context";
import type { AppEnv } from "./types";

// Three constraints hold this shape:
//  - `config` is read off `configStore` rather than threaded through the signature: `PageShell`
//    carries no `Config` parameter by design, because the consumer's closure holds it.
//  - No `csrfPath`, so `ctx.csrfToken` is `""` — every mountable mints its own path-bound tokens
//    into the props its views receive, and a shell-level token would be minted for the wrong path.
//  - No `slot.mount` branch. The log viewer's full-height regime already works through `Layout`'s
//    `has-[[data-fill-viewport]]` body classes, and auth pages are meant to carry the site chrome.
//    `mount` is an open string — `app` is what this app's own pages pass, alongside forge's `auth`,
//    `showcase` and `logs` — so a branch added here needs a default arm.
//  - `slot.meta` is handed over whole: `Layout` merges it over `siteMeta`, which is the one merge
//    point this app has, so a mount's `noindex` and title land the same way a local page's do.
/** The one document shell this app registers, wrapping every mount's content in the site chrome. */
export const appShell: PageShell<AppEnv> = async (c, content, slot) => (
  <Layout ctx={await renderContext(c, configStore.get(c.env))} meta={slot.meta}>
    {content}
  </Layout>
);
