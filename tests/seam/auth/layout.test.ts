import { describe, expect, it } from "bun:test";

import { attrOf, elementOf, innerOf, tagOf } from "@y-core/forge/testing";

import { app } from "../../../src/worker";
import { CONFIG_ENV, createTestBindings } from "../../env";

const MOCK_ASSETS = { fetch: async () => new Response("", { status: 200 }) } as unknown as Fetcher;

const MINIMUM_ENV = { ASSETS: MOCK_ASSETS, SITE_ORIGIN: "https://example.com", ...CONFIG_ENV, ...createTestBindings() } as unknown as Env;

const NOINDEX = '<meta name="robots" content="noindex">';

async function getHomeHtml(): Promise<string> {
  return (await app.request("/", {}, MINIMUM_ENV)).text();
}

/** The anchor pointing at `href`, as its slot, its role and the text it shows. */
function linkAt(html: string, href: string): { slot: string; role: string; label: string } | null {
  const element = elementOf(html, "a", `href="${href}"`);
  if (element === "") return null;
  return { slot: attrOf(element, "data-slot"), role: attrOf(element, "role"), label: innerOf(element) };
}

describe("Layout — the auth slice's page descriptor", () => {
  // The mount writes the title and the `noindex`; this app never restates either.
  it("renders forge's sign-in page descriptor through the shell", async () => {
    // The auth group rate-limits its reads, keyed on the caller's address, so both have to be present.
    const env = { ...MINIMUM_ENV, RATE_LIMITER: { limit: async () => ({ success: true }) } } as unknown as Env;
    const res = await app.request("/auth/signin", { headers: { "CF-Connecting-IP": "203.0.113.1" } }, env);
    const text = await res.text();
    expect(elementOf(text, "title")).toBe("<title>Sign in — Forge Studio</title>");
    expect(elementOf(text, "meta", 'name="robots"')).toBe(NOINDEX);
    expect(elementOf(text, "link", 'rel="canonical"')).toBe("");
  });
});

describe("Layout — the Account menu", () => {
  it("hands the navbar scope an anonymous visitor's filter", async () => {
    expect(tagOf(await getHomeHtml(), 'data-scope="navbar"')).toBe(
      '<div data-scope="navbar" data-island-state="{&quot;filters&quot;:[&quot;anonymous&quot;]}">',
    );
  });

  it('renders the "Account" trigger label, which is not the toggle\'s accessible name', async () => {
    const nav = elementOf(await getHomeHtml(), "nav", 'aria-label="Primary"');
    const entries = [...nav.matchAll(/data-slot="(menu-trigger|navbar-link)"[^>]*>\s*(?:<span>)?([^<]*)/g)].map(([, slot, label]) => ({
      slot,
      label,
    }));

    expect(entries.filter((entry) => entry.label === "Account")).toEqual([{ slot: "menu-trigger", label: "Account" }]);
    expect(nav).not.toContain('aria-label="Account"');
  });

  it("nests Sign in and Sign up as menu items inside the Account popover", async () => {
    const text = await getHomeHtml();

    expect([linkAt(text, "/auth/signin"), linkAt(text, "/auth/signup")]).toEqual([
      { slot: "menu-link-item", role: "menuitem", label: "Sign in" },
      { slot: "menu-link-item", role: "menuitem", label: "Sign up" },
    ]);
  });
});
