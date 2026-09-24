/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import { describe, expect, it } from "bun:test";

import { elementOf, render } from "@y-core/forge/testing";
import { Button } from "@y-core/forge/ui/core";

import { createHomeSlots, type HomeContribution } from "../../src/controllers/home";
import { content } from "../../src/model/home.content";
import { HomeView } from "../../src/views/home";

const CTA_ROW = 'class="flex flex-wrap justify-center gap-4 lg:justify-start"';

describe("HomeView", () => {
  it("renders a plain hero, with no call-to-action row, when nothing is contributed", async () => {
    const html = await render(<HomeView content={content} ctas={[]} sections={[]} />);

    expect(elementOf(html, "section", 'id="home"')).not.toBe("");
    expect(elementOf(html, "div", CTA_ROW)).toBe("");
  });

  it("renders a primary call to action as forge's default button and a secondary one as its outline", async () => {
    const html = await render(
      <HomeView
        content={content}
        ctas={[
          { label: "Go", href: "#go", emphasis: "primary" },
          { label: "Ask", href: "#ask", emphasis: "secondary" },
        ]}
        sections={[]}
      />,
    );
    const primary = await render(
      <Button asChild={true} size='lg'>
        <a href='#go'>Go</a>
      </Button>,
    );
    const outline = await render(
      <Button asChild={true} size='lg' tone='neutral' appearance='outline'>
        <a href='#ask'>Ask</a>
      </Button>,
    );

    expect(elementOf(html, "div", CTA_ROW)).toBe(`<div ${CTA_ROW}>${primary}${outline}</div>`);
  });

  it("renders the contributed sections in order, after the hero", async () => {
    const html = await render(<HomeView content={content} ctas={[]} sections={[<section id='one' />, <section id='two' />]} />);
    const at = ['id="home"', 'id="one"', 'id="two"'].map((needle) => html.indexOf(needle));

    expect(at[0]).toBeGreaterThan(-1);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
});

describe("createHomeSlots", () => {
  it("returns contributions in the order they arrive", () => {
    const slots = createHomeSlots();
    const first: HomeContribution = { ctas: [], section: async () => <section id='first' /> };
    const second: HomeContribution = { ctas: [], section: async () => <section id='second' /> };
    slots.contribute(first);
    slots.contribute(second);

    expect(slots.contributions()).toEqual([first, second]);
  });
});
