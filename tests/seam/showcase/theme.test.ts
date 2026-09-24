/** The theme customiser as this app serves it: inside the shell, kept out of the index, and read entirely off its URL. */
import { describe, expect, it } from "bun:test";

import { attrOf, elementOf, fakeD1, fakeKV, innerOf, tagOf } from "@y-core/forge/testing";

import { app } from "../../../src/worker";
import { CONFIG_ENV } from "../../env";

const MINIMUM_ENV = {
  ASSETS: { fetch: async () => new Response("", { status: 200 }) },
  SITE_ORIGIN: "https://example.com",
  ...CONFIG_ENV,
  AUTH_KV: fakeKV(),
  DB: fakeD1(),
} as unknown as Env;

const NOINDEX = '<meta name="robots" content="noindex">';

const THEME_PATH = "/showcase/ui/theme";

const pageText = async (search = "") => (await app.request(`${THEME_PATH}${search}`, {}, MINIMUM_ENV)).text();

const sliderValue = (html: string, field: string) => attrOf(tagOf(html, `data-field="${field}"`), "value");

describe("the theme customiser page", () => {
  it("answers 200 inside this app's shell, titled Theme and kept out of the index", async () => {
    const res = await app.request(THEME_PATH, {}, MINIMUM_ENV);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(elementOf(text, "title")).toBe("<title>Theme — Forge Studio</title>");
    expect(elementOf(text, "meta", 'name="robots"')).toBe(NOINDEX);
    expect(tagOf(text, 'id="primary-nav"')).not.toBe("");
  });

  it("heads the page Theme customiser", async () => {
    expect(innerOf(elementOf(await pageText(), "h1"))).toBe("Theme customiser");
  });

  it("prints forge's neutral gray step 11 at the default dials", async () => {
    const grayLight = elementOf(await pageText(), "tbody", 'data-scale-row="gray-light"');
    expect(innerOf(elementOf(grayLight, "td", 'data-hex="10"'))).toBe("#646464");
  });

  it("carries each dial the URL names into its slider", async () => {
    const text = await pageText("?gh=256&gc=45&ah=267&ac=195&r=4");

    expect(["grayHue", "grayChroma", "accentHue", "accentChroma", "radius"].map((field) => sliderValue(text, field))).toEqual([
      "256",
      "45",
      "267",
      "195",
      "4",
    ]);
  });

  it("clamps an out-of-range dial and falls back on an unparseable one rather than refusing the page", async () => {
    const res = await app.request(`${THEME_PATH}?gc=99999&gh=abc`, {}, MINIMUM_ENV);
    const text = await res.text();

    expect(res.status).toBe(200);
    expect([sliderValue(text, "grayChroma"), sliderValue(text, "grayHue")]).toEqual(["100", "0"]);
  });

  it("offers a share URL on this app's own theme route, carrying every dial", async () => {
    const res = await app.request(`${THEME_PATH}?gh=256&gc=45`, {}, MINIMUM_ENV);

    expect(elementOf(await res.text(), "code", "data-share-url")).toBe(
      "<code data-share-url>/showcase/ui/theme?ah=267&amp;ac=195&amp;gh=256&amp;gc=45&amp;r=10&amp;rf=10&amp;rb=16&amp;ch=40</code>",
    );
  });
});
