/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import { beforeAll, describe, expect, it } from "bun:test";

import { render } from "@y-core/forge/testing";
import { COVERAGE_COMPONENTS } from "@y-core/forge/testing/coverage";

import { TURNSTILE_DEMO_DEFAULTS } from "../../../src/showcase/model/turnstile";
import { PAGE_ORDER, SECTIONS, SHOWCASE_PAGES, ShowcaseContent } from "../../../src/showcase/views/components";
import { COVERAGE_MISSING } from "./coverage-missing.fixture";
import { coverageKeys, coverageReport, DEMO_COVERAGE, explainGap, explainStale } from "./coverage.fixture";
import type { CoverageReport } from "./coverage.fixture";

const excused = new Set(COVERAGE_MISSING.map((gap) => gap.key));

let report: CoverageReport;

beforeAll(async () => {
  // Rendered page by page and merged, never joined: a joined string would let one page's last
  // section body absorb the next page's rail, and the check would pass on markup outside the section.
  const html = await Promise.all(PAGE_ORDER.map((page) => render(<ShowcaseContent data={{ turnstile: TURNSTILE_DEMO_DEFAULTS }} page={page} />)));
  report = coverageReport({ html, sectionIds: SECTIONS.map((section) => section.id), demos: DEMO_COVERAGE });
});

describe("the showcase demonstrates every published component", () => {
  it("serves every catalog entry from a declared page, and every page some entry", () => {
    const pages = new Set(PAGE_ORDER);
    expect(SECTIONS.filter((section) => !pages.has(section.page)).map((section) => `${section.id} → ${section.page}`)).toEqual([]);
    expect(PAGE_ORDER.filter((page) => !SECTIONS.some((section) => section.page === page))).toEqual([]);
    expect(PAGE_ORDER.filter((page) => SHOWCASE_PAGES[page] === undefined)).toEqual([]);
  });

  it("declares every barrel export in DEMO_COVERAGE", () => {
    const known = new Set(coverageKeys(DEMO_COVERAGE));
    expect(
      COVERAGE_COMPONENTS.filter((entry) => !known.has(entry.key)).map(
        (entry) => `${entry.barrel} exports ${entry.component}, which DEMO_COVERAGE never declares`,
      ),
    ).toEqual([]);
  });

  it("leaves no gap that COVERAGE_MISSING does not excuse", () => {
    const unexcused = report.uncovered.filter((key) => !excused.has(key));
    expect(unexcused.map((key) => explainGap(key, DEMO_COVERAGE))).toEqual([]);
  });

  it("requires every excuse to name the task that owes it", () => {
    expect(COVERAGE_MISSING.filter((gap) => gap.owner.trim() === "").map((gap) => gap.key)).toEqual([]);
  });

  it("keeps COVERAGE_MISSING free of stale and unknown excuses", () => {
    const known = new Set(coverageKeys(DEMO_COVERAGE));
    const covered = new Set(report.covered);
    expect([...excused].filter((key) => covered.has(key)).map(explainStale)).toEqual([]);
    expect([...excused].filter((key) => !known.has(key))).toEqual([]);
  });
});
