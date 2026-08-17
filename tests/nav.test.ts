import { describe, expect, it } from "bun:test";
import { resolveNavHref } from "../src/views/nav";

describe("resolveNavHref", () => {
  const cases: Array<[string, string, string]> = [
    ["contact", "contact", "/#contact"],
    ["showcaseUi", "showcaseUi", "/showcase/ui"],
    ["showcaseLogs", "showcaseLogs", "/showcase/logs"],
    ["showcaseTheme", "showcaseTheme", "/showcase/ui/theme"],
    ["showcaseInteractive", "showcaseInteractive", "/showcase/ui/interactive"],
    ["showcaseRuntime", "showcaseRuntime", "/showcase/ui/runtime"],
    ["showcaseHtmx", "showcaseHtmx", "/showcase/ui/htmx"],
    ["showcaseChrome", "showcaseChrome", "/showcase/ui/chrome"],
    ["unknown key falls back to home route", "unknown-key", "/"],
  ];

  for (const [description, key, expected] of cases) {
    it(`resolves ${description} -> ${expected}`, () => {
      expect(resolveNavHref(key)).toBe(expected);
    });
  }
});
