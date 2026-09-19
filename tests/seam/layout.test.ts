import { describe, expect, it } from "bun:test";

import { assets } from "@assets";
import { fakeD1, fakeKV } from "@y-core/forge/testing";

import { app } from "../../src/worker";

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) } as unknown as Fetcher;

/** The 404 page only renders once the asset binding has declined the path. */
const MOCK_ASSETS_404 = { fetch: async () => new Response("Not Found", { status: 404 }) } as unknown as Fetcher;

const MINIMUM_ENV = {
  ASSETS: MOCK_ASSETS,
  SITE_ORIGIN: "https://example.com",
  CSRF_SECRET: "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e",
  EMAIL_API_KEY: "test-api-key",
  EMAIL_FROM: "from@example.com",
  EMAIL_TO: "to@example.com",
  TURNSTILE_SECRET_KEY: "test-ts-key",
  TURNSTILE_SITE_KEY: "test-site-key",
  AUTH_KEY_RING: "9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e6f2b4a7c0d3e5f7a9b1c3d5e",
  SESSION_SECRET: "6f2b4a7c0d3e5f7a9b1c3d5e9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e",
  ADMIN_BOOTSTRAP_SECRET: "3d5e9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e6f2b4a7c0d3e5f7a9b1c",
  AUTH_KV: fakeKV(),
  AUTH_DB: fakeD1(),
} as unknown as Env;

async function getHomeHtml(): Promise<string> {
  const res = await app.request("/", {}, MINIMUM_ENV);
  return res.text();
}

describe("Layout — page meta", () => {
  it("leaves the site's own title uncomposed and keeps the canonical on the one indexable page", async () => {
    const text = await getHomeHtml();
    expect(text).toContain("<title>Forge Studio</title>");
    expect(text).toContain('<link rel="canonical" href="https://example.com/">');
    expect(text).not.toContain('name="robots"');
  });

  it("composes a page's own title with the site's, and drops the canonical it is noindex against", async () => {
    const res = await app.request("/does-not-exist", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    const text = await res.text();
    expect(res.status).toBe(404);
    expect(text).toContain("<title>Page not found — Forge Studio</title>");
    expect(text).toContain('<meta name="robots" content="noindex">');
    expect(text).not.toContain('rel="canonical"');
  });

  // The mount writes the title and the `noindex`; this app never restates either.
  it("renders a mounted page's own descriptor through the shell", async () => {
    const res = await app.request("/showcase/ui", {}, MINIMUM_ENV);
    const text = await res.text();
    expect(text).toContain("<title>Catalog — Forge Studio</title>");
    expect(text).toContain('<meta name="robots" content="noindex">');
    expect(text).not.toContain('rel="canonical"');
  });

  it("carries the site's shared description and OG tags onto a page that states neither", async () => {
    const res = await app.request("/does-not-exist", {}, { ...MINIMUM_ENV, ASSETS: MOCK_ASSETS_404 });
    const text = await res.text();
    expect(text).toContain('<meta property="og:title" content="Forge Studio">');
    expect(text).toContain('<meta property="og:type" content="website">');
    expect(text).toContain('<meta name="twitter:card" content="summary">');
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
    expect(text).toContain('data-slot="navbar"');
  });

  it('renders data-scope="navbar" so the eager Resumable scope resumes the bar', async () => {
    const text = await getHomeHtml();
    expect(text).toContain('data-scope="navbar"');
  });
});

describe("Layout — nav landmark structure", () => {
  it("renders exactly one Primary <nav> and the total <nav> count is 2 (header bar + footer)", async () => {
    const text = await getHomeHtml();
    const navOpenTags = text.match(/<nav/g) ?? [];
    expect(navOpenTags.length).toBe(2);
    const primaryCount = (text.match(/<nav aria-label="Primary"/g) ?? []).length;
    expect(primaryCount).toBe(1);
    const footerCount = (text.match(/<nav[^>]*aria-label="Footer"/g) ?? []).length;
    expect(footerCount).toBe(1);
  });

  it('does not render a duplicate aria-label="Mobile" landmark', async () => {
    const text = await getHomeHtml();
    expect(text).not.toContain('aria-label="Mobile"');
  });

  it('renders id="primary-nav" on the navbar', async () => {
    const text = await getHomeHtml();
    expect(text).toContain('id="primary-nav"');
  });
});

describe("Layout — sticky neutralisation on the navbar <details>", () => {
  // Tokens rather than the whole class attribute, which would fail on a library restyle that changed
  // nothing about this override.
  function navbarTokens(html: string): Set<string> {
    return new Set((/<details data-slot="navbar" class="([^"]*)"/.exec(html)?.[1] ?? "").split(" ").filter(Boolean));
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
  const escaped = href.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const element = new RegExp(`<a[^>]*\\shref="${escaped}"[^>]*>([^<]*)</a>`).exec(html);
  if (element === null) return null;
  const tag = element[0];
  return { slot: /\sdata-slot="([^"]*)"/.exec(tag)?.[1] ?? "", role: /\srole="([^"]*)"/.exec(tag)?.[1] ?? "", label: element[1] ?? "" };
}

describe("Layout — nav content (Showcase menu + Contact bar link)", () => {
  it('renders the "Showcase" trigger label distinct from the hard-coded aria-label="Menu" toggle', async () => {
    const text = await getHomeHtml();
    expect(text).toContain('aria-label="Menu"');
    expect(text).toContain("<span>Showcase</span>");
    expect(text).not.toContain('aria-label="Showcase"');
  });

  it("nests Logs, Theme and UI as menu items inside the Showcase popover", async () => {
    const text = await getHomeHtml();

    expect([linkAt(text, "/showcase/logs"), linkAt(text, "/showcase/ui/theme"), linkAt(text, "/showcase/ui")]).toEqual([
      { slot: "menu-link-item", role: "menuitem", label: "Logs" },
      { slot: "menu-link-item", role: "menuitem", label: "Theme" },
      { slot: "menu-link-item", role: "menuitem", label: "UI" },
    ]);
  });

  it("promotes Contact to a bar link, so it is not also a row inside the dropdown", async () => {
    expect(linkAt(await getHomeHtml(), "/#contact")).toEqual({ slot: "navbar-link", role: "", label: "Contact" });
  });

  it("orders the bar as Showcase menu, then Contact, then the theme toggle", async () => {
    const text = await getHomeHtml();
    const showcase = text.indexOf("<span>Showcase</span>");
    const contact = text.indexOf('<a href="/#contact" data-slot="navbar-link"');
    const theme = text.indexOf('data-scope="theme"');
    expect(showcase).toBeGreaterThan(-1);
    expect(contact).toBeGreaterThan(showcase);
    expect(theme).toBeGreaterThan(contact);
  });
});

describe("Layout — brand link identity vs navigation", () => {
  it("renders the brand link to / outside the <nav> element", async () => {
    const text = await getHomeHtml();
    const brandIdx = text.indexOf('aria-label="Forge Studio — Home"');
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
    const skipIdx = text.indexOf('href="#main-content"');
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
    const text = await getHomeHtml();
    expect(text).toContain(`<use href="${sprite}#icon-hamburger"></use>`);
    expect(text).toContain(`<use href="${sprite}#icon-close"></use>`);
    expect(text).not.toContain("#icon-panel-open");
    expect(text).not.toContain("#icon-panel-close");
  });
});
