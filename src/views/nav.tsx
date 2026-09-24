/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import type { AppContext as ForgeAppContext } from "@y-core/forge/context";
import type { NavDefinition, NavLink, NavSectionItem } from "@y-core/forge/ui/chrome";

import type { AppEnv, NavState } from "../app/types";
import { routes } from "../routes";

/** Resolves what one contributor's entries show this request's viewer. @public */
export type NavStateResolver = (c: ForgeAppContext<AppEnv>) => Promise<NavState>;

/** A contributor's bar entries and the route-map keys they name, resolved to the URLs they render as. @public */
export interface NavContribution {
  items: readonly NavSectionItem[];
  hrefs: Readonly<Record<string, string>>;
  /** The placement key of the skeleton bar entry these items render ahead of; absent, they follow the skeleton. */
  before?: string | undefined;
  footer?: readonly Pick<NavLink, "label" | "href">[] | undefined;
  state?: NavStateResolver | undefined;
}

/** One app's primary navbar, composed from the skeleton's entries and every contribution made at registration. @public */
export interface PrimaryNav {
  contribute: (contribution: NavContribution) => void;
  definition: () => NavDefinition;
  footer: () => readonly Pick<NavLink, "label" | "href">[];
  resolveHref: (key: string) => string;
  states: () => readonly NavStateResolver[];
}

interface SkeletonBarEntry {
  placement: string;
  item: NavSectionItem;
}

const SKELETON_BAR: readonly SkeletonBarEntry[] = [{ placement: "logs", item: { label: "Logs", href: "logs" } }];

const SKELETON_HREFS: Readonly<Record<string, string>> = { logs: routes.logs.href() };

// Never label a nav entry "Menu", at any depth: forge hard-codes `aria-label='Menu'` on the mobile
// toggle whose panel these entries render inside, and two nested controls must not share one name.
function refuseMenuLabel(items: readonly NavSectionItem[]): void {
  for (const item of items) {
    if ("label" in item && item.label?.trim().toLowerCase() === "menu") {
      throw new Error(`nav: a nav entry may not be labelled "${item.label}".`);
    }
    if ("items" in item) refuseMenuLabel(item.items);
  }
}

/** Creates one app's primary navbar; contributed entries follow the skeleton's in arrival order unless `before` places them. @public */
export function createPrimaryNav(): PrimaryNav {
  refuseMenuLabel(SKELETON_BAR.map((entry) => entry.item));
  const following: NavSectionItem[] = [];
  const placed = new Map<string, NavSectionItem[]>();
  const footer: Pick<NavLink, "label" | "href">[] = [];
  const states: NavStateResolver[] = [];
  const hrefs = new Map(Object.entries(SKELETON_HREFS));
  const resolveHref = (key: string): string => hrefs.get(key) ?? routes.home.href();
  return {
    contribute: ({ items, hrefs: added, before, footer: links = [], state }) => {
      refuseMenuLabel(items);
      if (before !== undefined && !SKELETON_BAR.some((entry) => entry.placement === before)) {
        throw new Error(`nav: no skeleton bar entry has the placement key "${before}".`);
      }
      const taken = Object.keys(added).find((key) => hrefs.has(key));
      if (taken !== undefined) throw new Error(`nav: the route-map key "${taken}" is already contributed.`);
      for (const [key, href] of Object.entries(added)) hrefs.set(key, href);
      if (before === undefined) following.push(...items);
      else placed.set(before, [...(placed.get(before) ?? []), ...items]);
      footer.push(...links);
      if (state !== undefined) states.push(state);
    },
    definition: () => ({
      sections: [{ items: [...SKELETON_BAR.flatMap(({ placement, item }) => [...(placed.get(placement) ?? []), item]), ...following] }],
    }),
    footer: () => footer.map((link) => ({ label: link.label, href: resolveHref(link.href) })),
    resolveHref,
    states: () => [...states],
  };
}
