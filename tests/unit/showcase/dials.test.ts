import { describe, expect, it } from "bun:test";

import { DIALS, SCHEME_PRESETS } from "@y-core/forge/ui/contracts/theme";

import { readDials } from "../../../src/showcase/model/dials";

describe("readDials", () => {
  it("defaults every dial to the shipped scheme", () => {
    const dials = readDials(new URLSearchParams());
    for (const dial of DIALS) expect(dials[dial.field]).toBe(dial.fallback);
    expect(dials.grayChroma).toBe(0);
  });

  it("reads each dial from its own short parameter", () => {
    const dials = readDials(new URLSearchParams("?gh=256&gc=45&ah=200&ac=120&r=4&rf=6&rb=8&ch=32"));
    expect(dials).toEqual({
      grayHue: 256,
      grayChroma: 45,
      accentHue: 200,
      accentChroma: 120,
      radius: 4,
      radiusField: 6,
      radiusBox: 8,
      controlH: 32,
    });
  });

  it("clamps to the dial's own range", () => {
    expect(readDials(new URLSearchParams("?gc=99999")).grayChroma).toBe(100);
    expect(readDials(new URLSearchParams("?gh=-40")).grayHue).toBe(0);
    expect(readDials(new URLSearchParams("?r=1000")).radius).toBe(24);
    expect(readDials(new URLSearchParams("?rb=1000")).radiusBox).toBe(32);
    expect(readDials(new URLSearchParams("?ch=0")).controlH).toBe(28);
  });

  it("falls back rather than failing on an unparseable value", () => {
    for (const bad of ["?gh=abc", "?gh=", "?gh=NaN", "?gh=Infinity"]) {
      expect(readDials(new URLSearchParams(bad)).grayHue).toBe(0);
    }
  });

  it("resolves a preset name into the two gray dials that reproduce it", () => {
    for (const preset of SCHEME_PRESETS) {
      const dials = readDials(new URLSearchParams(`?p=${preset.id}`));
      expect([dials.grayHue, dials.grayChroma]).toEqual([preset.grayHue, preset.grayChroma]);
    }
    expect(readDials(new URLSearchParams("?p=slate&ah=200&r=4"))).toMatchObject({ accentHue: 200, radius: 4 });
  });

  it("lets an explicit dial win over the preset beside it", () => {
    const dials = readDials(new URLSearchParams("?p=slate&gh=100"));
    expect(dials.grayHue).toBe(100);
    expect(dials.grayChroma).toBe(SCHEME_PRESETS.find((preset) => preset.id === "slate")?.grayChroma);
  });

  it("ignores a preset name nothing ships", () => {
    expect(readDials(new URLSearchParams("?p=vermilion"))).toEqual(readDials(new URLSearchParams()));
  });

  it("snaps to the dial's step", () => {
    expect(readDials(new URLSearchParams("?gh=12.7")).grayHue).toBe(13);
  });
});
