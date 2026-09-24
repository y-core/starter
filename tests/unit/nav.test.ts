import { describe, expect, it } from "bun:test";

import type { NavSectionItem } from "@y-core/forge/ui/chrome";

import type { NavState } from "../../src/app/types";
import { createPrimaryNav, type NavStateResolver, type PrimaryNav } from "../../src/views/nav";

function labelOf(item: NavSectionItem): string {
  if ("heading" in item) return item.heading;
  return item.label ?? "";
}

function labels(nav: PrimaryNav): string[] {
  return nav.definition().sections.flatMap((section) => section.items.map(labelOf));
}

function fixedState(state: NavState): NavStateResolver {
  return () => Promise.resolve(state);
}

const ALPHA = { items: [{ label: "Alpha", href: "alpha" }], hrefs: { alpha: "/alpha" } };
const BETA = { items: [{ label: "Beta", href: "beta" }], hrefs: { beta: "/beta" } };

describe("createPrimaryNav — the skeleton", () => {
  it("renders the Logs bar link alone when nothing is contributed", () => {
    expect(labels(createPrimaryNav())).toEqual(["Logs"]);
  });

  it("returns one section", () => {
    expect(createPrimaryNav().definition().sections.length).toBe(1);
  });
});

describe("createPrimaryNav — resolveHref", () => {
  it("resolves the skeleton key logs -> /logs", () => {
    expect(createPrimaryNav().resolveHref("logs")).toBe("/logs");
  });

  it("falls back to the home route on an unknown key", () => {
    expect(createPrimaryNav().resolveHref("unknown-key")).toBe("/");
  });

  it("still falls back to the home route on an unknown key after an unrelated contribution", () => {
    const nav = createPrimaryNav();
    nav.contribute(ALPHA);
    expect(nav.resolveHref("unknown-key")).toBe("/");
  });

  it("resolves a contributed key to the href its contributor supplied", () => {
    const nav = createPrimaryNav();
    nav.contribute(ALPHA);
    expect(nav.resolveHref("alpha")).toBe("/alpha");
  });
});

describe("createPrimaryNav — contribute", () => {
  it("places unplaced contributions after the skeleton's entries, in arrival order", () => {
    const nav = createPrimaryNav();
    nav.contribute(ALPHA);
    nav.contribute(BETA);
    expect(labels(nav)).toEqual(["Logs", "Alpha", "Beta"]);
  });

  it("refuses an item labelled Menu, which would share the mobile toggle's accessible name", () => {
    const nav = createPrimaryNav();
    expect(() => nav.contribute({ items: [{ label: "Menu", href: "menu" }], hrefs: { menu: "/menu" } })).toThrow(
      'nav: a nav entry may not be labelled "Menu".',
    );
    expect(labels(nav)).toEqual(["Logs"]);
  });

  it("refuses Menu whatever its case and surrounding whitespace", () => {
    const nav = createPrimaryNav();
    expect(() => nav.contribute({ items: [{ label: " menu ", href: "menu" }], hrefs: { menu: "/menu" } })).toThrow(
      'nav: a nav entry may not be labelled " menu ".',
    );
    expect(labels(nav)).toEqual(["Logs"]);
  });

  it("refuses Menu on a nested entry, which renders inside the same toggle's panel", () => {
    const nav = createPrimaryNav();
    const nested = { label: "Outer", items: [{ label: "Inner", items: [{ label: "Menu", href: "menu" }] }] };
    expect(() => nav.contribute({ items: [nested], hrefs: { menu: "/menu" } })).toThrow('nav: a nav entry may not be labelled "Menu".');
    expect(labels(nav)).toEqual(["Logs"]);
    expect(nav.resolveHref("menu")).toBe("/");
  });

  it("refuses an href key the skeleton already owns, and keeps the skeleton's href", () => {
    const nav = createPrimaryNav();
    expect(() => nav.contribute({ items: [{ label: "Elsewhere", href: "logs" }], hrefs: { logs: "/elsewhere" } })).toThrow(
      'nav: the route-map key "logs" is already contributed.',
    );
    expect(nav.resolveHref("logs")).toBe("/logs");
    expect(labels(nav)).toEqual(["Logs"]);
  });

  it("refuses an href key an earlier contribution already owns, and keeps the first", () => {
    const nav = createPrimaryNav();
    nav.contribute(ALPHA);
    expect(() => nav.contribute({ items: [{ label: "Alpha again", href: "alpha" }], hrefs: { alpha: "/other" } })).toThrow(
      'nav: the route-map key "alpha" is already contributed.',
    );
    expect(nav.resolveHref("alpha")).toBe("/alpha");
    expect(labels(nav)).toEqual(["Logs", "Alpha"]);
  });

  it("keeps each instance's contributions to itself", () => {
    const contributed = createPrimaryNav();
    const untouched = createPrimaryNav();
    contributed.contribute(ALPHA);

    expect(labels(untouched)).toEqual(["Logs"]);
    expect(untouched.resolveHref("alpha")).toBe("/");
  });
});

describe("createPrimaryNav — before", () => {
  it("places a contribution naming the logs placement directly ahead of Logs", () => {
    const nav = createPrimaryNav();
    nav.contribute({ ...ALPHA, before: "logs" });
    expect(labels(nav)).toEqual(["Alpha", "Logs"]);
  });

  it("keeps arrival order among contributions placed before the same entry", () => {
    const nav = createPrimaryNav();
    nav.contribute({ ...ALPHA, before: "logs" });
    nav.contribute({ ...BETA, before: "logs" });
    expect(labels(nav)).toEqual(["Alpha", "Beta", "Logs"]);
  });

  it("keeps a placed contribution at its entry whichever arrives first", () => {
    const nav = createPrimaryNav();
    nav.contribute({ items: [{ label: "After", href: "after" }], hrefs: { after: "/after" } });
    nav.contribute({ items: [{ label: "Ahead", href: "ahead" }], hrefs: { ahead: "/ahead" }, before: "logs" });
    expect(labels(nav)).toEqual(["Ahead", "Logs", "After"]);
  });

  it("composes the requested bar: a nested menu ahead of Logs, then a link and a menu following it in arrival order", () => {
    const nav = createPrimaryNav();
    nav.contribute({
      items: [{ label: "Forge Showcase", items: [{ label: "UI", items: [{ label: "Components", href: "components" }] }] }],
      hrefs: { components: "/components" },
      before: "logs",
    });
    nav.contribute({ items: [{ label: "Contact", href: "contact" }], hrefs: { contact: "/#contact" } });
    nav.contribute({ items: [{ label: "Account", items: [{ label: "Sign in", href: "signin" }] }], hrefs: { signin: "/signin" } });
    expect(labels(nav)).toEqual(["Forge Showcase", "Logs", "Contact", "Account"]);
  });

  it("refuses a key naming no skeleton placement, and leaves the bar unchanged", () => {
    const nav = createPrimaryNav();
    expect(() => nav.contribute({ ...ALPHA, before: "nowhere" })).toThrow('nav: no skeleton bar entry has the placement key "nowhere".');
    expect(labels(nav)).toEqual(["Logs"]);
    expect(nav.resolveHref("alpha")).toBe("/");
  });

  it("refuses a key only a contribution owns", () => {
    const nav = createPrimaryNav();
    nav.contribute(ALPHA);
    expect(() => nav.contribute({ ...BETA, before: "alpha" })).toThrow('nav: no skeleton bar entry has the placement key "alpha".');
    expect(labels(nav)).toEqual(["Logs", "Alpha"]);
  });
});

describe("createPrimaryNav — states", () => {
  it("holds no resolver when nothing is contributed", () => {
    expect(createPrimaryNav().states()).toEqual([]);
  });

  it("holds no resolver for a contribution that states none", () => {
    const nav = createPrimaryNav();
    nav.contribute(ALPHA);
    expect(nav.states()).toEqual([]);
  });

  it("holds each contributed resolver in arrival order, whatever the bar placement", () => {
    const nav = createPrimaryNav();
    const first = fixedState({ activeFilters: ["first"], slots: {} });
    const second = fixedState({ activeFilters: ["second"], slots: {} });
    nav.contribute({ ...ALPHA, state: first });
    nav.contribute({ ...BETA, before: "logs", state: second });
    expect(nav.states()).toEqual([first, second]);
  });

  it("refuses a contribution's resolver along with the contribution", () => {
    const nav = createPrimaryNav();
    expect(() => nav.contribute({ ...ALPHA, before: "nowhere", state: fixedState({ activeFilters: [], slots: {} }) })).toThrow(
      'nav: no skeleton bar entry has the placement key "nowhere".',
    );
    expect(nav.states()).toEqual([]);
  });
});

describe("createPrimaryNav — footer", () => {
  it("is empty when nothing is contributed", () => {
    expect(createPrimaryNav().footer()).toEqual([]);
  });

  it("resolves each contributed footer link's key to its href, in contribution order", () => {
    const nav = createPrimaryNav();
    nav.contribute({ ...ALPHA, footer: [{ label: "Alpha", href: "alpha" }] });
    nav.contribute({ ...BETA, footer: [{ label: "Beta", href: "beta" }] });
    expect(nav.footer()).toEqual([
      { label: "Alpha", href: "/alpha" },
      { label: "Beta", href: "/beta" },
    ]);
  });
});
