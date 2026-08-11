import { describe, expect, it } from "bun:test";
import { resolveNavHref } from "../src/views/nav";

describe("resolveNavHref", () => {
  const cases: Array<[string, string, string]> = [
    ["contact", "contact", "#contact"],
    ["showcaseUi", "showcaseUi", "/showcase/ui"],
    ["showcaseLogs", "showcaseLogs", "/showcase/logs"],
    ["unknown key falls back to home route", "unknown-key", "/"],
  ];

  for (const [description, key, expected] of cases) {
    it(`resolves ${description} -> ${expected}`, () => {
      expect(resolveNavHref(key)).toBe(expected);
    });
  }
});
