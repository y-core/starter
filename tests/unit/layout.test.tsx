/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import { describe, expect, it } from "bun:test";

import { elementOf, render } from "@y-core/forge/testing";

import { Layout } from "../../src/views/layout";
import { createPrimaryNav, type PrimaryNav } from "../../src/views/nav";

const CTX = { nonce: "n", nav: { activeFilters: [], slots: {} } };

function renderLayout(primaryNav: PrimaryNav): Promise<string> {
  return render(
    <Layout ctx={CTX} meta={{ title: "Forge Studio" }} primaryNav={primaryNav}>
      <main id='main-content' />
    </Layout>,
  );
}

describe("Layout — the footer nav", () => {
  it("renders no footer nav when nothing contributes a footer link", async () => {
    expect(elementOf(await renderLayout(createPrimaryNav()), "nav", 'aria-label="Footer"')).toBe("");
  });

  it("renders exactly the contributed link, at its resolved href", async () => {
    const nav = createPrimaryNav();
    nav.contribute({ items: [], hrefs: { alpha: "/alpha" }, footer: [{ label: "Alpha", href: "alpha" }] });

    expect(elementOf(await renderLayout(nav), "nav", 'aria-label="Footer"')).toBe(
      '<nav class="flex flex-wrap justify-center gap-6 text-sm" aria-label="Footer"><a href="/alpha" class="text-muted-foreground hover:text-foreground motion-safe:transition">Alpha</a></nav>',
    );
  });
});
