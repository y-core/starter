/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import type { PageShell } from "@y-core/forge/app";

import { Layout } from "../views/layout";
import type { PrimaryNav } from "../views/nav";
import { configStore } from "./config";
import { renderContext } from "./context";
import type { AppEnv } from "./types";

/** Creates the one document shell this app registers, wrapping every mount's content in the site chrome. */
export function createAppShell(primaryNav: PrimaryNav): PageShell<AppEnv> {
  return async (c, content, slot) => (
    <Layout ctx={await renderContext(c, configStore.get(c.env), primaryNav)} meta={slot.meta} primaryNav={primaryNav}>
      {content}
    </Layout>
  );
}
