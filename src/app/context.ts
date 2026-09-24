import type { AppContext as ForgeAppContext } from "@y-core/forge/context";
import { getNonce } from "@y-core/forge/security";

import type { PrimaryNav } from "../views/nav";
import type { AppConfig, AppEnv, NavState, RenderContext } from "./types";

/** Runs every contributed nav resolver for this request and merges what they show: filters concatenated, slots merged. */
async function resolveNavState(c: ForgeAppContext<AppEnv>, primaryNav: PrimaryNav): Promise<NavState> {
  const states = await Promise.all(primaryNav.states().map((resolve) => resolve(c)));
  return {
    activeFilters: states.flatMap((state) => state.activeFilters),
    slots: states.reduce<NavState["slots"]>((slots, state) => ({ ...slots, ...state.slots }), {}),
  };
}

/** Materializes per-request values into a typed `ctx`, taking config explicitly rather than off the context. */
export async function renderContext(c: ForgeAppContext<AppEnv>, config: AppConfig, primaryNav: PrimaryNav): Promise<RenderContext> {
  return { nav: await resolveNavState(c, primaryNav), baseUrl: config.site.url.origin, nonce: getNonce(c) };
}
