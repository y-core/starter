import { describe, expect, it } from "bun:test";

import { assets } from "@assets";
import { attrOf, attrsOf, classesOf, elementOf, fakeKV, innerOf, tagOf } from "@y-core/forge/testing";

import { app } from "../../src/worker";
import { devApp } from "../../src/worker.dev";
import { CONFIG_ENV, createTestBindings } from "../env";

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) } as unknown as Fetcher;

/** The 404 page only renders once the asset binding has declined the path. */
const MOCK_ASSETS_404 = { fetch: async () => new Response("Not Found", { status: 404 }) } as unknown as Fetcher;

const MINIMUM_ENV = { ASSETS: MOCK_ASSETS, SITE_ORIGIN: "https://example.com", ...CONFIG_ENV, ...createTestBindings() } as unknown as Env;

const NOINDEX = '<meta name="robots" content="noindex">';

async function getHomeHtml(): Promise<string> {
  const res = await app.request("/", {}, MINIMUM_ENV);
  return res.text();
}

describe("Layout — page meta", () => {
  it("leaves the site's own title uncomposed and keeps the canonical on the one indexable page", async () => {
    const text = await getHomeHtml();
    expect(elementOf(text, "title")).toBe("<title>Forge Studio</title>");
    expect(elementOf(text, "link", 'rel="canonical"')).toBe('<link rel="canonical" href="https://example.com/">');
    expect(elementOf(text, "meta", 'name="robots"')).toBe("");
  });

  it("composes a page's own title with the site's, and drops the canonical it is noindex against", async () => {
    const res = await app.request("/does-not-exist", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    const text = await res.text();
    expect(res.status).toBe(404);
    expect(elementOf(text, "title")).toBe("<title>Page not found — Forge Studio</title>");
    expect(elementOf(text, "meta", 'name="robots"')).toBe(NOINDEX);
    expect(elementOf(text, "link", 'rel="canonical"')).toBe("");
  });

  // The mount writes the title and the `noindex`; this app never restates either.
  it("renders a mounted page's own descriptor through the shell", async () => {
    const res = await devApp.request("/logs", {}, { ...MINIMUM_ENV, LOGS_KV: fakeKV() } as unknown as Env);
    const text = await res.text();
    expect(elementOf(text, "title")).toBe("<title>Logs — Forge Studio</title>");
    expect(elementOf(text, "meta", 'name="robots"')).toBe(NOINDEX);
    expect(elementOf(text, "link", 'rel="canonical"')).toBe("");
  });

  it("carries the site's shared description and OG tags onto a page that states neither", async () => {
    const res = await app.request("/does-not-exist", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    const text = await res.text();
    expect(elementOf(text, "meta", 'property="og:title"')).toBe('<meta property="og:title" content="Forge Studio">');
    expect(elementOf(text, "meta", 'property="og:type"')).toBe('<meta property="og:type" content="website">');
    expect(elementOf(text, "meta", 'name="twitter:card"')).toBe('<meta name="twitter:card" content="summary">');
  });

  it("renders the JSON-LD once, nonced, so the strict policy admits it", async () => {
    const text = await getHomeHtml();
    const scripts = text.match(/<script type="application\/ld\+json" nonce="[^"]+">/g) ?? [];
    expect(scripts.length).toBe(1);
  });
});

describe("Layout — dead mobile-nav-markup regression guards", () => {
  it("contains no data-ref nav-toggle/nav-menu/nav-link markup in double-quoted form", async () => {
    const text = await getHomeHtml();
    expect(text).not.toContain('data-ref="nav-toggle"');
    expect(text).not.toContain('data-ref="nav-menu"');
    expect(text).not.toContain('data-ref="nav-link"');
  });

  it("contains no data-ref nav-toggle/nav-menu/nav-link markup in single-quoted form", async () => {
    const text = await getHomeHtml();
    expect(text).not.toContain("data-ref='nav-toggle'");
    expect(text).not.toContain("data-ref='nav-menu'");
    expect(text).not.toContain("data-ref='nav-link'");
  });

  it('renders data-slot="navbar" on the <details> the CSS and viewport-collapse controller key off', async () => {
    const text = await getHomeHtml();
    expect(tagOf(text, 'data-slot="navbar"').startsWith("<details ")).toBe(true);
    expect(attrsOf(text, 'data-slot="navbar"')).toEqual({ "data-slot": "navbar", id: "primary-nav", "data-navbar-drawer": "" });
  });

  it('renders data-scope="navbar" so the eager Resumable scope resumes the bar', async () => {
    const text = await getHomeHtml();
    expect(tagOf(text, 'data-scope="navbar"').startsWith("<div ")).toBe(true);
    expect(Object.keys(attrsOf(text, 'data-scope="navbar"'))).toEqual(["data-scope", "data-island-state"]);
  });
});

describe("Layout — nav landmark structure", () => {
  it("renders exactly one Primary <nav>", async () => {
    const text = await getHomeHtml();
    const primaryCount = (text.match(/<nav aria-label="Primary"/g) ?? []).length;
    expect(primaryCount).toBe(1);
  });

  it('does not render a duplicate aria-label="Mobile" landmark', async () => {
    const text = await getHomeHtml();
    expect(text).not.toContain('aria-label="Mobile"');
  });

  it('renders id="primary-nav" on the navbar', async () => {
    const text = await getHomeHtml();
    expect(attrOf(text, "id", 'data-slot="navbar"')).toBe("primary-nav");
  });
});

describe("Layout — sticky neutralisation on the navbar <details>", () => {
  // Tokens rather than the whole class attribute, which would fail on a library restyle that changed
  // nothing about this override.
  function navbarTokens(html: string): Set<string> {
    return new Set(classesOf(html, 'data-slot="navbar"'));
  }

  it("keeps this app's positioning overrides through the merge", async () => {
    const tokens = navbarTokens(await getHomeHtml());

    expect(["static", "z-auto", "bg-transparent"].filter((token) => !tokens.has(token))).toEqual([]);
  });

  it("drops the library defaults those overrides conflict with, which is the whole reason they are set", async () => {
    const tokens = navbarTokens(await getHomeHtml());

    expect(["sticky", "z-40", "bg-background/95"].filter((token) => tokens.has(token))).toEqual([]);
  });

  it("reads a class attribute at all, so the two cases above are not both passing on an empty match", async () => {
    expect(navbarTokens(await getHomeHtml()).size).toBeGreaterThan(0);
  });
});

/** The anchor pointing at `href`, as its slot, its role and the text it shows. */
function linkAt(html: string, href: string): { slot: string; role: string; label: string } | null {
  const element = elementOf(html, "a", `href="${href}"`);
  if (element === "") return null;
  return { slot: attrOf(element, "data-slot"), role: attrOf(element, "role"), label: innerOf(element) };
}

function barEntries(html: string): { slot: string; label: string }[] {
  const nav = elementOf(html, "nav", 'aria-label="Primary"');
  return [...nav.matchAll(/data-slot="(menu-trigger|navbar-link)"[^>]*>\s*(?:<span>)?([^<]*)/g)].map(([, slot = "", label = ""]) => ({
    slot,
    label,
  }));
}

describe("Layout — nav content (the Logs bar link)", () => {
  it('labels the mobile toggle with the hard-coded aria-label="Menu"', async () => {
    expect(attrOf(await getHomeHtml(), "aria-label", 'data-slot="navbar-toggle"')).toBe("Menu");
  });

  it("renders Logs as an unfiltered bar link on the production entry", async () => {
    expect(linkAt(await getHomeHtml(), "/logs")).toEqual({ slot: "navbar-link", role: "", label: "Logs" });
  });

  it("renders Logs as a bar entry exactly once", async () => {
    const labels = barEntries(await getHomeHtml()).map((entry) => entry.label);
    expect(labels.filter((label) => label === "Logs")).toEqual(["Logs"]);
  });

  it("renders the theme toggle after the navbar", async () => {
    const text = await getHomeHtml();
    const nav = text.indexOf('<nav aria-label="Primary"');
    const theme = text.indexOf(tagOf(text, 'data-scope="theme"'));
    expect(nav).toBeGreaterThan(-1);
    expect(theme).toBeGreaterThan(text.indexOf("</nav>", nav));
  });
});

describe("Layout — brand link identity vs navigation", () => {
  it("renders the brand link to / outside the <nav> element", async () => {
    const text = await getHomeHtml();
    const brandIdx = text.indexOf(tagOf(text, 'aria-label="Forge Studio — Home"'));
    const navIdx = text.indexOf('<nav aria-label="Primary"');
    expect(brandIdx).toBeGreaterThan(-1);
    expect(navIdx).toBeGreaterThan(-1);
    expect(brandIdx).toBeLessThan(navIdx);
  });
});

describe("Layout — ThemeToggle single instance", () => {
  it('renders data-scope="theme" exactly once', async () => {
    const text = await getHomeHtml();
    const count = (text.match(/data-scope="theme"/g) ?? []).length;
    expect(count).toBe(1);
  });
});

describe("Layout — skip link", () => {
  it("renders the #main-content skip link before <header", async () => {
    const text = await getHomeHtml();
    const skipIdx = text.indexOf(tagOf(text, 'href="#main-content"'));
    const headerIdx = text.indexOf("<header");
    expect(skipIdx).toBeGreaterThan(-1);
    expect(headerIdx).toBeGreaterThan(-1);
    expect(skipIdx).toBeLessThan(headerIdx);
  });
});

describe("Layout — hamburger/close sprite pair", () => {
  // Read off the manifest rather than spelled out, because the sprite path carries a content hash.
  it("renders both the hamburger and close icon refs in the toggle summary, and neither panel glyph", async () => {
    const sprite = assets.path("svg/sprite.svg");
    const toggle = elementOf(await getHomeHtml(), "summary", 'data-slot="navbar-toggle"');
    const refs = [...toggle.matchAll(/<use href="([^"]*)"><\/use>/g)].map((match) => match[1]);
    expect(refs).toEqual([`${sprite}#icon-hamburger`, `${sprite}#icon-close`]);
  });
});
