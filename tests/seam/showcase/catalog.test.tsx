import { describe, expect, it } from "bun:test";

import { elementOf, fakeD1, fakeKV, innerOf } from "@y-core/forge/testing";

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

const CATALOG_PAGES = [
  {
    path: "/showcase/ui",
    label: "Catalog",
    needs: "Nothing beyond the stylesheet — every section here is server-rendered markup and native behaviour, and works with JavaScript disabled.",
  },
  {
    path: "/showcase/ui/interactive",
    label: "Interactive",
    needs:
      "Import &quot;@y-core/forge/ui/core/client&quot; and call resume() — each section here registers a scope that is inert until you do. Toolbar is the ui/core primitive; the configuration-driven chrome Toolbar is on the Chrome page.",
  },
  {
    path: "/showcase/ui/runtime",
    label: "Runtime",
    needs:
      "This app&#39;s showcase scopes (src/showcase/client/scopes.ts, imported by src/client/main.ts) and a call to resume() — signals drive the bound controls through bindControls, and lazy() holds the panel module back until its anchor is seen.",
  },
  {
    path: "/showcase/ui/htmx",
    label: "HTMX",
    needs:
      "Import &quot;@y-core/forge/ui/client/htmx&quot; and serve the api.* endpoints src/showcase/routes.ts declares. Flash reads here because its message links the toast demo in the HTMX band.",
  },
  {
    path: "/showcase/ui/turnstile",
    label: "Turnstile",
    needs:
      "Import &quot;@y-core/forge/ui/core/client&quot; and call resume(), plus &quot;@y-core/forge/ui/client/htmx&quot; — the deferred challenge is run from the htmx:confirm seam. The verification panel reaches siteverify only when a secret is configured.",
  },
  {
    path: "/showcase/ui/chrome",
    label: "Chrome",
    needs:
      "Import &quot;@y-core/forge/ui/chrome/client&quot;, call resume(), and supply the NavDefinition and ToolbarDefinition these sections render from.",
  },
];

describe("catalog pages", () => {
  for (const { path, label, needs } of CATALOG_PAGES) {
    describe(path, () => {
      it("answers 200 inside this app's shell, titled after the page and kept out of the index", async () => {
        const res = await app.request(path, {}, MINIMUM_ENV);
        const text = await res.text();

        expect(res.status).toBe(200);
        expect(elementOf(text, "title")).toBe(`<title>${label} — Forge Studio</title>`);
        expect(elementOf(text, "meta", 'name="robots"')).toBe(NOINDEX);
      });

      it("heads the page with its label and states what it needs beneath", async () => {
        const text = await (await app.request(path, {}, MINIMUM_ENV)).text();
        const heading = elementOf(text, "h1");

        expect(innerOf(heading)).toBe(`UI Component Showcase — ${label}`);
        expect(innerOf(elementOf(text.slice(text.indexOf(heading) + heading.length), "p"))).toBe(needs);
      });
    });
  }
});
