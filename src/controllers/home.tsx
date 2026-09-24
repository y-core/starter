/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { definePage, renderShell } from "@y-core/forge/app";
import type { AppContext as ForgeAppContext } from "@y-core/forge/context";
import type { JSXNode } from "@y-core/forge/jsx";

import type { AppConfig, AppEnv } from "../app/types";
import { content } from "../model/home.content";
import { site } from "../model/site.content";
import type { HeroCta, HomeContent } from "../model/types";
import { HomeView } from "../views/home";

/** What one feature adds to the home page: hero calls to action, and a section rendered per request. @public */
export interface HomeContribution {
  ctas: readonly HeroCta[];
  section: (c: ForgeAppContext<AppEnv>, config: AppConfig) => Promise<JSXNode>;
}

/** The home page's contribution points, filled at registration and read on every request. @public */
export interface HomeSlots {
  contribute: (contribution: HomeContribution) => void;
  contributions: () => readonly HomeContribution[];
}

interface HomeData {
  content: HomeContent;
  ctas: readonly HeroCta[];
  sections: JSXNode[];
}

/** Creates the home page's empty contribution points, one set per app. @public */
export function createHomeSlots(): HomeSlots {
  const contributed: HomeContribution[] = [];
  return {
    contribute: (contribution) => {
      contributed.push(contribution);
    },
    contributions: () => [...contributed],
  };
}

/** The home page, a plain hero until a contribution adds calls to action and sections. */
export function createHomeController(slots: HomeSlots) {
  return definePage<AppEnv, AppConfig, HomeData>({
    cache: "no-store",
    loader: async (c, config) => {
      const contributions = slots.contributions();
      const sections = await Promise.all(contributions.map((contribution) => contribution.section(c, config)));
      return { content, ctas: contributions.flatMap((contribution) => contribution.ctas), sections };
    },
    // `site.title` rather than a page title: `documentTitle` leaves the site's own name uncomposed,
    // so the home page speaks with the site descriptor as it did before the shell.
    view: (c, _cfg, state) =>
      renderShell(c, <HomeView content={state.data.content} ctas={state.data.ctas} sections={state.data.sections} />, {
        mount: "app",
        page: "home",
        meta: { title: site.title },
      }),
  });
}
