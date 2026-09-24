import { describe, expect, it } from "bun:test";

import { createTestContext } from "@y-core/forge/testing";

import { configStore } from "../../src/app/config";
import { renderContext } from "../../src/app/context";
import type { AppEnv } from "../../src/app/types";
import { createPrimaryNav } from "../../src/views/nav";
import { CONFIG_ENV } from "../env";

const SITE_ORIGIN = "https://example.com";

const ENV = { SITE_ORIGIN, ...CONFIG_ENV } as unknown as AppEnv;

function context() {
  return createTestContext<AppEnv>(new Request(`${SITE_ORIGIN}/`), { env: ENV });
}

describe("renderContext — the navbar state", () => {
  it("shows no filter and no slot when no contribution states a resolver", async () => {
    const nav = createPrimaryNav();
    nav.contribute({ items: [{ label: "Alpha", href: "alpha" }], hrefs: { alpha: "/alpha" } });

    const rendered = await renderContext(context(), configStore.get(ENV), nav);

    expect(rendered).toEqual({ nav: { activeFilters: [], slots: {} }, baseUrl: SITE_ORIGIN, nonce: "" });
  });

  it("concatenates every resolver's filters in arrival order and merges their slots", async () => {
    const nav = createPrimaryNav();
    nav.contribute({
      items: [{ label: "Alpha", href: "alpha" }],
      hrefs: { alpha: "/alpha" },
      state: () => Promise.resolve({ activeFilters: ["anonymous"], slots: { alphaSlot: "alpha" } }),
    });
    nav.contribute({
      items: [{ label: "Beta", href: "beta" }],
      hrefs: { beta: "/beta" },
      state: () => Promise.resolve({ activeFilters: ["member", "admin"], slots: { betaSlot: "beta" } }),
    });

    const rendered = await renderContext(context(), configStore.get(ENV), nav);

    expect(rendered.nav).toEqual({ activeFilters: ["anonymous", "member", "admin"], slots: { alphaSlot: "alpha", betaSlot: "beta" } });
  });

  it("runs each resolver against the request it renders", async () => {
    const nav = createPrimaryNav();
    nav.contribute({ items: [], hrefs: {}, state: (c) => Promise.resolve({ activeFilters: [c.url.pathname], slots: {} }) });

    const rendered = await renderContext(context(), configStore.get(ENV), nav);

    expect(rendered.nav.activeFilters).toEqual(["/"]);
  });
});
