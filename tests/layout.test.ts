import { describe, expect, it } from "bun:test";

import { assets } from "@assets";

import app from "../src/worker";

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) } as unknown as Fetcher;

const MINIMUM_ENV = {
  ASSETS: MOCK_ASSETS,
  SITE_ORIGIN: "https://example.com",
  CSRF_SECRET: "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e",
  EMAIL_API_KEY: "test-api-key",
  EMAIL_FROM: "from@example.com",
  EMAIL_TO: "to@example.com",
  TURNSTILE_SECRET_KEY: "test-ts-key",
  TURNSTILE_SITE_KEY: "test-site-key",
} as unknown as Env;

async function getHomeHtml(): Promise<string> {
  const res = await app.request("/", {}, MINIMUM_ENV);
  return res.text();
}

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
  it("merges the override classes and drops forge's default sticky/z-40/bg-background/95", async () => {
    const text = await getHomeHtml();
    const match = text.match(/<details data-slot="navbar" class="([^"]*)"/);
    expect(match).not.toBeNull();
    const classAttr = match?.[1] ?? "";
    expect(classAttr).toBe(
      "group backdrop-blur inset-y-0 left-0 md:inset-x-0 md:top-0 md:right-auto md:bottom-auto max-md:bg-transparent max-md:backdrop-blur-none static z-auto bg-transparent",
    );

    // Overrides applied by cn():
    expect(classAttr).toContain("static");
    expect(classAttr).toContain("z-auto");
    expect(classAttr).toContain("bg-transparent");

    // forge defaults neutralised by cn()'s conflict-group merge:
    expect(classAttr).not.toContain("sticky");
    expect(classAttr).not.toContain("z-40");
    expect(classAttr).not.toContain("bg-background/95");

    // Known limitation: backdrop-blur has no conflict group in cn(), so it survives the merge.
    expect(classAttr).toContain("backdrop-blur");
  });
});

/** Forge's `menu-link-item` class string, lifted from rendered output. */
const MENU_ITEM_CLASS =
  "flex w-full items-center gap-2 rounded-field px-2 py-1.5 text-start text-sm text-popover-foreground bg-transparent border-0 cursor-pointer outline-none hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground state-disabled";

/** Forge's `navbar-link` class string, lifted from rendered output. */
const BAR_LINK_CLASS =
  "inline-flex items-center gap-1 rounded-field px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer focus-ring aria-[current]:bg-accent aria-[current]:font-semibold aria-[current]:text-accent-foreground";

const menuItem = (href: string, label: string): string =>
  `<a role="menuitem" data-slot="menu-link-item" class="${MENU_ITEM_CLASS}" href="${href}">${label}</a>`;

describe("Layout — nav content (Showcase menu + Contact bar link)", () => {
  it('renders the "Showcase" trigger label distinct from the hard-coded aria-label="Menu" toggle', async () => {
    const text = await getHomeHtml();
    expect(text).toContain('aria-label="Menu"');
    expect(text).toContain("<span>Showcase</span>");
    // The two labels must be distinct strings — not both "Menu".
    expect(text).not.toContain('aria-label="Showcase"');
  });

  it("nests Logs, Theme and UI as menu items inside the Showcase popover", async () => {
    const text = await getHomeHtml();
    expect(text).toContain(menuItem("/showcase/logs", "Logs"));
    expect(text).toContain(menuItem("/showcase/ui/theme", "Theme"));
    expect(text).toContain(menuItem("/showcase/ui", "UI"));
  });

  it("renders Contact as a sibling bar link, not a menu item", async () => {
    const text = await getHomeHtml();
    expect(text).toContain(`<a href="/#contact" data-slot="navbar-link" class="${BAR_LINK_CLASS}">Contact</a>`);
    // Promoted out of the dropdown — it must not also render as a menu row.
    expect(text).not.toContain(menuItem("/#contact", "Contact"));
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
  // Read off the manifest rather than spelled out: the sprite path carries a content hash. The pair
  // itself is the contract — the header is a top bar, so it keeps the hamburger even though
  // `collapsedAs='drawer'` slides its panel in off-canvas; the panel glyphs are the rails'.
  it("renders both the hamburger and close icon refs in the toggle summary, and neither panel glyph", async () => {
    const sprite = assets.path("svg/sprite.svg");
    const text = await getHomeHtml();
    expect(text).toContain(`<use href="${sprite}#icon-hamburger"></use>`);
    expect(text).toContain(`<use href="${sprite}#icon-close"></use>`);
    expect(text).not.toContain("#icon-panel-open");
    expect(text).not.toContain("#icon-panel-close");
  });
});
