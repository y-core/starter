import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const MAIN = "#main-content";
const PAGES_RAIL = "#showcase-pages";
const TOC_RAIL = "#showcase-toc";
const TOC_SCOPE = "[data-scope='show-toc']";
const PAGES_LINK = `nav[aria-label='Showcase pages'] > ${PAGES_RAIL} a[href^='/']`;
const TOC_LINK = `nav[aria-label='On this page'] > ${TOC_RAIL} a[href^='#']`;

function focusedSlots(page: Page): Promise<string[]> {
  return page.evaluate(() => document.activeElement?.getAttribute("data-slot")?.split(" ") ?? []);
}

test.describe("the showcase page as a whole", () => {
  test("makes every toolbar on the interactive page exactly one tab stop", async ({ page }) => {
    await page.goto("/showcase/ui/interactive");

    const stops = await page.evaluate(
      (main) =>
        [...document.querySelectorAll<HTMLElement>(`${main} [data-slot~='toolbar']`)].map(
          (rail) => [...rail.querySelectorAll<HTMLElement>("[data-toolbar-item]")].filter((item) => item.tabIndex === 0).length,
        ),
      MAIN,
    );

    expect(stops.length).toBeGreaterThan(0);
    expect(stops.every((count) => count === 1)).toBe(true);
  });
});

test.describe("primitives coexisting on one page", () => {
  const FIRST_TOOLBAR_ITEM = `${MAIN} [data-toolbar-item]`;
  const FIRST_TAB = `${MAIN} [data-slot~='tab']`;
  const FILE_MENU_TRIGGER = `${MAIN} [data-slot~='menu-trigger'][commandfor='show-file-menu']`;

  test("driving the tabs leaves the toolbar's tab stop where it was", async ({ page }) => {
    await page.goto("/showcase/ui/interactive");

    const before = await page.evaluate((selector) => document.querySelector<HTMLElement>(selector)?.tabIndex, FIRST_TOOLBAR_ITEM);
    await page.locator(FIRST_TAB).first().focus();
    await page.keyboard.press("ArrowRight");

    expect(await focusedSlots(page)).toContain("tab");
    expect(await page.evaluate((selector) => document.querySelector<HTMLElement>(selector)?.tabIndex, FIRST_TOOLBAR_ITEM)).toBe(before);
  });

  test("the tabs select as focus moves, and only one panel is visible", async ({ page }) => {
    await page.goto("/showcase/ui/interactive");

    await page.locator(FIRST_TAB).first().focus();
    await page.keyboard.press("ArrowRight");

    const state = await page.evaluate(() => {
      const widget = document.activeElement?.closest("[data-slot~='tabs']");
      if (!widget) return null;
      return {
        selected: [...widget.querySelectorAll("[data-slot~='tab']")].filter((el) => el.getAttribute("aria-selected") === "true").length,
        visible: [...widget.querySelectorAll<HTMLElement>("[data-slot~='tabs-content']")].filter((el) => !el.hidden).length,
      };
    });

    expect(state).toEqual({ selected: 1, visible: 1 });
  });

  test("opening the showcase menu focuses its first row and Escape gives the trigger back", async ({ page }) => {
    await page.goto("/showcase/ui/interactive");

    await page.locator(FILE_MENU_TRIGGER).first().click();
    await expect.poll(() => focusedSlots(page)).toContain("menu-item");

    await page.keyboard.press("Escape");

    await expect.poll(() => focusedSlots(page)).toContain("menu-trigger");
  });

  test("a menu open on the page does not steal the toolbar's keys", async ({ page }) => {
    await page.goto("/showcase/ui/interactive");
    await page.locator(FILE_MENU_TRIGGER).first().click();
    await expect.poll(() => focusedSlots(page)).toContain("menu-item");

    await page.keyboard.press("Escape");
    await page.locator(FIRST_TOOLBAR_ITEM).first().focus();
    await page.keyboard.press("ArrowRight");

    expect(await focusedSlots(page)).toContain("toolbar-button");
  });

  test("the native disclosures toggle open on their own, with no controller", async ({ page }) => {
    await page.goto("/showcase/ui");

    const isOpen = () => page.evaluate((main) => document.querySelector<HTMLDetailsElement>(`${main} [data-slot~='collapsible']`)?.open, MAIN);
    const before = await isOpen();
    await page.locator(`${MAIN} [data-slot~='collapsible'] > [data-slot~='collapsible-trigger']`).first().click();

    await expect.poll(isOpen).toBe(!before);
  });

  test("the number field's steppers are live, which only an eager scope makes true", async ({ page }) => {
    await page.goto("/showcase/ui/interactive");
    const input = page.locator(`${MAIN} [data-slot~='number-field-input']`).first();
    await expect(input).toHaveValue("1");

    await page.locator(`${MAIN} [data-slot~='number-field-increment']`).first().click();

    await expect(input).toHaveValue("2");
  });
});

test.describe("the showcase's own filter island", () => {
  const FILTER_INPUT = `${MAIN} #filter-input`;

  function shown(page: Page): Promise<{ labels: string[]; count: string | null | undefined }> {
    return page.evaluate(
      (main) => ({
        labels: [...document.querySelectorAll<HTMLElement>(`${main} [data-filter-item]`)]
          .filter((el) => !el.hidden)
          .map((el) => (el.textContent ?? "").trim()),
        count: document.querySelector(`${main} [data-ref='count']`)?.textContent,
      }),
      MAIN,
    );
  }

  test("typing in the filter hides the items that do not match and updates the count", async ({ page }) => {
    await page.goto("/showcase/ui/runtime");
    const all = await shown(page);
    expect(all.labels.length).toBeGreaterThan(1);
    expect(all.count).toBe(String(all.labels.length));

    await page.fill(FILTER_INPUT, all.labels[0] ?? "");

    await expect.poll(async () => (await shown(page)).labels.length).toBeLessThan(all.labels.length);
    const after = await shown(page);
    expect(after.labels).toContain(all.labels[0]);
    expect(after.count).toBe(String(after.labels.length));
  });

  test("clearing the filter restores every item", async ({ page }) => {
    await page.goto("/showcase/ui/runtime");
    const all = await shown(page);

    await page.fill(FILTER_INPUT, "zzz-matches-nothing");
    await expect.poll(async () => (await shown(page)).labels).toEqual([]);
    await page.fill(FILTER_INPUT, "");

    await expect.poll(() => shown(page)).toEqual(all);
  });
});

const VALIDATE_PATH = "/showcase/ui/api/validate";
const VALIDATE_FIELD = `${MAIN} #show-validate-field`;
const VALIDATE_INPUT = `${VALIDATE_FIELD} input[name='email']`;

function recordValidateRequests(page: Page): string[] {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === VALIDATE_PATH) requested.push(request.url());
  });
  return requested;
}

async function countSettles(page: Page): Promise<void> {
  await page.evaluate(() => {
    const counted = window as Window & { showcaseSettles?: number };
    counted.showcaseSettles = 0;
    document.body.addEventListener("htmx:afterSettle", () => {
      counted.showcaseSettles = (counted.showcaseSettles ?? 0) + 1;
    });
  });
}

function settledSwaps(page: Page): Promise<number> {
  return page.evaluate(() => (window as Window & { showcaseSettles?: number }).showcaseSettles ?? 0);
}

function validateFieldState(page: Page) {
  return page.evaluate(
    ({ field, input }) => ({
      dataInvalid: document.querySelector(field)?.hasAttribute("data-invalid") ?? null,
      ariaInvalid: document.querySelector(input)?.getAttribute("aria-invalid"),
      error: document.querySelector(`${field} [data-slot~='field-error']`)?.textContent?.trim() ?? null,
      errorIcons: document.querySelectorAll(`${field} [data-slot~='field-error'] [data-slot~='icon']`).length,
    }),
    { field: VALIDATE_FIELD, input: VALIDATE_INPUT },
  );
}

async function typeEmail(page: Page, value: string): Promise<void> {
  await page.fill(VALIDATE_INPUT, value);
  await page.locator(VALIDATE_INPUT).blur();
}

test.describe("the showcase's inline-validation demo", () => {
  test("sends the field's own value to the validate endpoint, which only attributes on the control can do", async ({ page }) => {
    const requested = recordValidateRequests(page);
    await page.goto("/showcase/ui/htmx");

    await typeEmail(page, "not-an-email");

    await expect.poll(() => requested.length).toBeGreaterThan(0);
    const sent = [...new Set(requested)].map((href) => {
      const url = new URL(href);
      return { path: url.pathname, params: [...url.searchParams] };
    });
    expect(sent).toEqual([{ path: VALIDATE_PATH, params: [["email", "not-an-email"]] }]);
  });

  test("swaps back a field that carries all three invalid signals", async ({ page }) => {
    await page.goto("/showcase/ui/htmx");

    await typeEmail(page, "not-an-email");

    await expect
      .poll(() => validateFieldState(page))
      .toEqual({ dataInvalid: true, ariaInvalid: "true", error: "Please enter a valid email address.", errorIcons: 1 });
  });

  test("keeps validating after a swap, which attributes outside the swapped fragment would not", async ({ page }) => {
    const requested = recordValidateRequests(page);
    await page.goto("/showcase/ui/htmx");
    await countSettles(page);

    await typeEmail(page, "not-an-email");
    await expect.poll(() => settledSwaps(page)).toBeGreaterThan(0);
    await expect
      .poll(() => validateFieldState(page))
      .toEqual({ dataInvalid: true, ariaInvalid: "true", error: "Please enter a valid email address.", errorIcons: 1 });
    const firstRound = requested.length;

    await typeEmail(page, "user@example.com");

    await expect.poll(() => requested.length).toBeGreaterThan(firstRound);
    await expect.poll(() => validateFieldState(page)).toEqual({ dataInvalid: false, ariaInvalid: null, error: null, errorIcons: 0 });
  });
});

const TURNSTILE_SCRIPT_PREFIX = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const TURNSTILE_TEST_KEY = "1x00000000000000000000AA";
const TURNSTILE_FORM = `${MAIN} form:has([data-scope='turnstile'])`;
const TURNSTILE_FOCUS_FIELDS = ["turnstile-email", "turnstile-email-compact", "turnstile-email-flexible", "turnstile-email-resilient"];

const FAKE_TURNSTILE_SCRIPT = `
  window.showcaseTurnstileRenders = [];
  window.turnstile = {
    render: function (el, params) {
      window.showcaseTurnstileRenders.push({
        sitekey: params.sitekey,
        size: params.size,
        theme: params.theme,
        execution: params.execution ?? null,
      });
      return "widget-" + window.showcaseTurnstileRenders.length;
    },
    reset: function () {},
    remove: function () {},
    execute: function () {},
  };
`;

interface TurnstileRender {
  sitekey: unknown;
  size: unknown;
  theme: unknown;
  execution: unknown;
}

function turnstileState(page: Page) {
  return page.evaluate((main) => {
    const recorded = window as Window & { showcaseTurnstileRenders?: TurnstileRender[] };
    return {
      renders: recorded.showcaseTurnstileRenders ?? [],
      fallbackHidden: document.querySelector<HTMLElement>(`${main} [data-ref='turnstile-fallback']`)?.hidden ?? null,
    };
  }, MAIN);
}

async function renderSignatures(page: Page): Promise<string[]> {
  const { renders } = await turnstileState(page);
  return renders.map((entry) => `${String(entry.size)}/${String(entry.execution ?? "render")}`).sort();
}

async function renderKeys(page: Page): Promise<string[]> {
  const { renders } = await turnstileState(page);
  return [...new Set(renders.map((entry) => `${String(entry.sitekey)}/${String(entry.theme)}`))];
}

test.describe("the showcase's Turnstile page", () => {
  test.use({ colorScheme: "light" });

  let scriptRequests = 0;

  test.beforeEach(async ({ page }) => {
    scriptRequests = 0;
    await page.route(
      (url) => url.href.startsWith(TURNSTILE_SCRIPT_PREFIX),
      (route) => {
        scriptRequests += 1;
        return route.fulfill({ contentType: "application/javascript", body: FAKE_TURNSTILE_SCRIPT });
      },
    );
  });

  test("renders the widget once a reader engages with the form it sits in", async ({ page }) => {
    await page.goto("/showcase/ui/turnstile");

    await expect.poll(() => renderSignatures(page)).toEqual(["normal/execute", "normal/render"]);
    await expect.poll(async () => (await turnstileState(page)).fallbackHidden).toBe(true);

    await page.focus(`${TURNSTILE_FORM} input[name='turnstile-email']`);

    await expect.poll(() => renderSignatures(page)).toEqual(["normal/execute", "normal/render", "normal/render"]);
  });

  test("mounts each demo form's own widget, on one shared load of Cloudflare's script", async ({ page }) => {
    await page.goto("/showcase/ui/turnstile");

    for (const name of TURNSTILE_FOCUS_FIELDS) {
      await page.focus(`${TURNSTILE_FORM} input[name='${name}']`);
    }

    await expect
      .poll(() => renderSignatures(page))
      .toEqual(["compact/render", "flexible/render", "normal/execute", "normal/render", "normal/render", "normal/render"]);
    expect(scriptRequests).toBe(1);
    expect(await renderKeys(page)).toEqual([`${TURNSTILE_TEST_KEY}/light`]);
  });

  test("puts the widget between the field and the submit control", async ({ page }) => {
    await page.goto("/showcase/ui/turnstile");

    const order = await page.evaluate((scope) => {
      const form = document.querySelector(scope);
      if (!form) return null;
      return [...form.querySelectorAll("input[type='email'], [data-ref], button")]
        .map((el) => (el.getAttribute("data-ref") === "turnstile" ? "widget" : el.tagName === "BUTTON" ? "submit" : el.getAttribute("type")))
        .filter((name) => name === "widget" || name === "submit" || name === "email");
    }, TURNSTILE_FORM);

    expect(order).toEqual(["email", "widget", "submit"]);
  });
});

test.describe("the showcase's context-menu island", () => {
  const SURFACE = `${MAIN} [data-scope='show-context-menu']`;
  const POPUP = "#show-context-menu-popup";

  test("a right-click on the surface opens the popup with its corner at the pointer", async ({ page }) => {
    await page.goto("/showcase/ui/interactive");
    const popup = page.locator(POPUP);
    expect(await popup.evaluate((el) => el.matches(":popover-open"))).toBe(false);

    const surface = page.locator(SURFACE);
    await surface.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));
    const box = await surface.boundingBox();
    if (!box) throw new Error("the context-menu surface has no box");
    const x = Math.round(box.x + box.width / 2);
    const y = Math.round(box.y + box.height / 2);
    await page.mouse.click(x, y, { button: "right" });

    const state = await popup.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        open: el.matches(":popover-open"),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        viewport: { width: window.innerWidth, height: window.innerHeight },
      };
    });
    expect(
      state.right <= state.viewport.width && state.bottom <= state.viewport.height,
      "the panel was clamped, so it cannot sit at the pointer",
    ).toBe(true);
    expect({ open: state.open, left: state.left, top: state.top }).toEqual({ open: true, left: x, top: y });
  });
});

test.describe("the component catalog's rails", () => {
  test("hands the keyboard a pages-rail link the browser itself agrees is focus-visible, and draws a ring on it", async ({ page }) => {
    await page.goto("/showcase/ui");

    let focused: { inPagesRail: boolean; focusVisible: boolean; outline: string; shadow: string } | null = null;
    for (let press = 0; press < 40; press++) {
      await page.keyboard.press("Tab");
      focused = await page.evaluate((selector) => {
        const link = document.activeElement;
        if (!(link instanceof HTMLElement)) return null;
        const style = getComputedStyle(link);
        return {
          inPagesRail: link.matches(selector),
          focusVisible: link.matches(":focus-visible"),
          outline: style.outlineStyle,
          shadow: style.boxShadow,
        };
      }, PAGES_LINK);
      if (focused?.inPagesRail === true) break;
    }

    expect(focused?.inPagesRail, "forty Tabs never reached a pages-rail link").toBe(true);
    expect(focused?.focusVisible).toBe(true);
    expect(focused?.outline !== "none" || focused.shadow !== "none").toBe(true);
  });

  test("collapses and re-opens each rail from its own toggle, leaving the other alone", async ({ page }) => {
    await page.goto("/showcase/ui");

    const open = (rail: string) => page.evaluate((selector) => document.querySelector<HTMLDetailsElement>(selector)?.open, rail);
    const toggle = (rail: string) => page.click(`${rail} [data-slot~='navbar-toggle']`);
    expect({ pages: await open(PAGES_RAIL), toc: await open(TOC_RAIL) }).toEqual({ pages: true, toc: true });

    await toggle(TOC_RAIL);
    expect({ pages: await open(PAGES_RAIL), toc: await open(TOC_RAIL) }).toEqual({ pages: true, toc: false });

    await toggle(TOC_RAIL);
    expect({ pages: await open(PAGES_RAIL), toc: await open(TOC_RAIL) }).toEqual({ pages: true, toc: true });
  });

  test("splits the two navigations across the content: pages leading, anchors trailing", async ({ page }) => {
    await page.goto("/showcase/ui");

    const layout = await page.evaluate(
      ({ pages, toc, pagesLink, tocLink, main }) => {
        const x = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().x ?? Number.NaN;
        const hrefs = (selector: string) => [...document.querySelectorAll<HTMLAnchorElement>(selector)].map((a) => a.getAttribute("href") ?? "");
        return {
          pagesX: x(pages),
          mainX: x(main),
          tocX: x(toc),
          pageHrefs: hrefs(pagesLink),
          anchorCount: hrefs(tocLink).length,
          allTocLinks: document.querySelectorAll(`${toc} a[href]`).length,
        };
      },
      { pages: PAGES_RAIL, toc: TOC_RAIL, pagesLink: PAGES_LINK, tocLink: TOC_LINK, main: MAIN },
    );

    expect(layout.pagesX).toBeLessThan(layout.mainX);
    expect(layout.tocX).toBeGreaterThan(layout.mainX);
    expect(layout.pageHrefs).toEqual([
      "/showcase/ui",
      "/showcase/ui/interactive",
      "/showcase/ui/runtime",
      "/showcase/ui/htmx",
      "/showcase/ui/turnstile",
      "/showcase/ui/chrome",
    ]);
    expect(layout.anchorCount).toBeGreaterThan(0);
    expect(layout.allTocLinks).toBe(layout.anchorCount);
  });

  test("points every table-of-contents entry at a section that is actually on the page", async ({ page }) => {
    await page.goto("/showcase/ui");

    const state = await page.evaluate(
      ({ selector, main }) => {
        const links = [...document.querySelectorAll<HTMLAnchorElement>(selector)];
        return {
          total: links.length,
          dangling: links
            .map((link) => link.getAttribute("href") ?? "")
            .filter((href) => document.querySelector(`${main} [id='${href.slice(1)}']`) === null),
        };
      },
      { selector: TOC_LINK, main: MAIN },
    );

    expect(state.total).toBeGreaterThan(0);
    expect(state.dangling).toEqual([]);
  });
});

const TOC_TOGGLE = `${TOC_SCOPE} [data-slot~='navbar-toggle']`;
const HIT_TARGET_FLOOR = 32;

test.describe("the table of contents as a column", () => {
  test("sizes the column on the scope root at 256px, and the landmark fills the box inside its border in both axes", async ({ page }) => {
    await page.goto("/showcase/ui");

    const box = await page.evaluate((scope) => {
      const root = document.querySelector(scope);
      const nav = root?.querySelector("nav");
      if (!(root instanceof HTMLElement) || !(nav instanceof HTMLElement)) return null;
      const column = root.getBoundingClientRect();
      const landmark = nav.getBoundingClientRect();
      return {
        column: Math.round(column.width),
        navFillsWidth: Math.round(landmark.width) === root.clientWidth,
        navFillsHeight: Math.round(landmark.height) === Math.round(column.height),
        columnHasHeight: column.height > 0,
      };
    }, TOC_SCOPE);

    expect(box).toEqual({ column: 256, navFillsWidth: true, navFillsHeight: true, columnHasHeight: true });
  });

  test("keeps the rail pinned at one height in the viewport however far the reader scrolls", async ({ page }) => {
    await page.goto("/showcase/ui");
    const railTop = () =>
      page.evaluate((selector) => Math.round(document.querySelector(selector)?.getBoundingClientRect().top ?? Number.NaN), TOC_RAIL);

    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "instant" }));
    const atFirst = { scrolled: Math.round(await page.evaluate(() => window.scrollY)), top: await railTop() };
    await page.evaluate(() => window.scrollTo({ top: 2400, behavior: "instant" }));
    const atSecond = { scrolled: Math.round(await page.evaluate(() => window.scrollY)), top: await railTop() };

    expect({ scrolled: [atFirst.scrolled, atSecond.scrolled], sameTop: atFirst.top === atSecond.top }).toEqual({
      scrolled: [1200, 2400],
      sameTop: true,
    });
  });

  test("shrinks to the toggle's own box when the rail is closed, leaving the control that reopens it hittable", async ({ page }) => {
    await page.goto("/showcase/ui");
    await page.click(TOC_TOGGLE);

    const collapsed = await page.evaluate(
      ({ scope, toggle, rail, floor }) => {
        const root = document.querySelector(scope);
        const control = document.querySelector(toggle);
        if (!(root instanceof HTMLElement) || !(control instanceof HTMLElement)) return null;
        const box = control.getBoundingClientRect();
        const column = root.getBoundingClientRect();
        return {
          open: document.querySelector<HTMLDetailsElement>(rail)?.open,
          columnIsTheToggle: Math.round(column.width) === Math.round(box.width) && Math.round(column.height) === Math.round(box.height),
          clearsHitTarget: box.width >= floor && box.height >= floor,
        };
      },
      { scope: TOC_SCOPE, toggle: TOC_TOGGLE, rail: TOC_RAIL, floor: HIT_TARGET_FLOOR },
    );

    expect(collapsed).toEqual({ open: false, columnIsTheToggle: true, clearsHitTarget: true });
  });

  test("marks the entry for the section the reader has scrolled to, and only that one — on the trailing rail alone", async ({ page }) => {
    await page.goto("/showcase/ui/interactive");

    await page.locator(`${MAIN} #menu`).evaluate((section) => section.scrollIntoView({ block: "start", behavior: "instant" }));

    await expect
      .poll(() =>
        page.evaluate(
          (selector) => [...document.querySelectorAll(selector)].map((el) => el.getAttribute("href")),
          `${TOC_RAIL} [aria-current='location']`,
        ),
      )
      .toEqual(["#menu"]);
    expect(await page.locator(`${PAGES_RAIL} [aria-current='location']`).count()).toBe(0);
  });
});

test.describe("the two rails as edge drawers on a phone", () => {
  test.use({ viewport: { width: 375, height: 700 } });

  const panelOf = (rail: string) => `${rail} [data-slot~='navbar-backdrop'] + div`;

  function scrollSettled(page: Page): Promise<void> {
    return page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          const cap = setTimeout(resolve, 1000);
          addEventListener("scrollend", () => (clearTimeout(cap), resolve()), { once: true });
        }),
    );
  }

  test("shuts both rails on load, so neither reserves a column the content has lost", async ({ page }) => {
    await page.goto("/showcase/ui");

    const state = await page.evaluate(
      ({ pages, toc, main }) => ({
        open: [pages, toc].map((selector) => document.querySelector<HTMLDetailsElement>(selector)?.open),
        drawers: [pages, toc].map((selector) => document.querySelector(selector)?.hasAttribute("data-navbar-drawer")),
        mainWidth: Math.round(document.querySelector(main)?.getBoundingClientRect().width ?? 0),
      }),
      { pages: PAGES_RAIL, toc: TOC_RAIL, main: MAIN },
    );

    expect({ open: state.open, drawers: state.drawers }).toEqual({ open: [false, false], drawers: [true, true] });
    expect(state.mainWidth).toBeGreaterThan(200);
  });

  test("opens each rail from its own edge at 288px, over content that does not move", async ({ page }) => {
    await page.goto("/showcase/ui");
    const mainTop = () => page.evaluate((main) => Math.round(document.querySelector(main)?.getBoundingClientRect().top ?? Number.NaN), MAIN);
    const box = (selector: string) =>
      page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el === null) throw new Error(`no element for ${sel}`);
        const rect = el.getBoundingClientRect();
        return { x: Math.round(rect.x), right: Math.round(rect.right), width: Math.round(rect.width), viewport: window.innerWidth };
      }, selector);
    const before = await mainTop();

    await page.click(`${PAGES_RAIL} [data-slot~='navbar-toggle']`);
    await expect.poll(async () => (await box(panelOf(PAGES_RAIL))).x).toBe(0);
    await expect
      .poll(() => page.evaluate((panel) => document.querySelector(panel)?.contains(document.activeElement) ?? false, panelOf(PAGES_RAIL)))
      .toBe(true);
    await scrollSettled(page);
    const pages = await box(panelOf(PAGES_RAIL));
    expect({ x: pages.x, width: pages.width, mainMoved: (await mainTop()) !== before }).toEqual({ x: 0, width: 288, mainMoved: false });

    await page.click(`${PAGES_RAIL} [data-slot~='navbar-toggle']`);
    await page.click(`${TOC_RAIL} [data-slot~='navbar-toggle']`);
    await expect.poll(async () => (await box(panelOf(TOC_RAIL))).right).toBe(375);
    await scrollSettled(page);
    const toc = await box(panelOf(TOC_RAIL));

    expect({ right: toc.right, width: toc.width, mainMoved: (await mainTop()) !== before }).toEqual({
      right: toc.viewport,
      width: 288,
      mainMoved: false,
    });
  });
});

const CONTROLS_BAND = `${MAIN} [data-scope='show-controls']`;
const BOUND_TEXT_INPUT = `${CONTROLS_BAND} [data-slot~='input'][data-field='text']`;
const BOUND_SWITCH = `${CONTROLS_BAND} label[data-slot~='switch']:has([data-field='enabled'])`;

function readout(page: Page, field: string): Promise<string | null> {
  return page.textContent(`${CONTROLS_BAND} [data-bind-text='${field}']`);
}

test.describe("the showcase's bound-control band", () => {
  test("mirrors what the reader types into the bound text input", async ({ page }) => {
    await page.goto("/showcase/ui/runtime");
    expect(await readout(page, "text")).toBe(await page.locator(BOUND_TEXT_INPUT).inputValue());

    await page.fill(BOUND_TEXT_INPUT, "Grace Hopper");

    await expect.poll(() => readout(page, "text")).toBe("Grace Hopper");
  });

  test("flips the switch readout on each click, and back again", async ({ page }) => {
    await page.goto("/showcase/ui/runtime");
    expect(await readout(page, "enabled")).toBe("on");

    await page.click(BOUND_SWITCH);
    await expect.poll(() => readout(page, "enabled")).toBe("off");

    await page.click(BOUND_SWITCH);
    await expect.poll(() => readout(page, "enabled")).toBe("on");
  });
});

const THEME_TOGGLE = `${MAIN} [data-scope='theme'] button`;

async function paintedToken(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.appendChild(probe);
    const painted = getComputedStyle(probe).color;
    probe.remove();
    return painted;
  }, token);
}

async function themeState(page: Page): Promise<{ dark: boolean; background: string; ring: string }> {
  const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  return { dark, background: await paintedToken(page, "--background"), ring: await paintedToken(page, "--ring") };
}

test.describe("the showcase's theme toggle", () => {
  test("cycles the document's preference system, light, dark, and back to system", async ({ page }) => {
    await page.goto("/showcase/ui/chrome");
    const root = page.locator("html");
    const toggle = page.locator(THEME_TOGGLE).first();

    const seen = [await root.getAttribute("data-theme-preference")];
    for (let i = 0; i < 3; i++) {
      const previous = seen.at(-1) ?? "";
      await toggle.click();
      await expect(root).not.toHaveAttribute("data-theme-preference", previous);
      seen.push(await root.getAttribute("data-theme-preference"));
    }

    expect(seen).toEqual(["system", "light", "dark", "system"]);
  });

  test("re-maps the painted tokens through the dark class, and hands them back when the preference returns to a light system", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/showcase/ui/chrome");
    const toggle = page.locator(THEME_TOGGLE).first();
    const system = await themeState(page);

    await toggle.click();
    await toggle.click();
    await expect.poll(async () => (await themeState(page)).dark).toBe(true);
    const dark = await themeState(page);
    await toggle.click();
    await expect.poll(async () => (await themeState(page)).dark).toBe(false);
    const back = await themeState(page);

    expect({ systemIsDark: system.dark, backgroundMoved: dark.background !== system.background, ringMoved: dark.ring !== system.ring }).toEqual({
      systemIsDark: false,
      backgroundMoved: true,
      ringMoved: true,
    });
    expect(back).toEqual(system);
  });
});

const NAVBAR_BAND = `${MAIN} [data-scope='show-navbar']`;
const ADMIN_FILTER = `${NAVBAR_BAND} button[data-filters='user admin']`;
const SIGNED_OUT_FILTER = `${NAVBAR_BAND} button[data-filters='']`;
const DEMO_ADMIN_LINK = "#show-navbar-top a[data-filter='admin']";
const TOOLBAR_RAIL = `${MAIN} #show-toolbar-rail`;
const TOOLBAR_PANEL = `${MAIN} [data-ref='toolbar-panel']`;

function chromeFilterState(page: Page): Promise<{ adminHidden: boolean; tocHidden: boolean[] }> {
  return page.evaluate(
    ({ link, toc }) => ({
      adminHidden: (document.querySelector<HTMLElement>(link)?.hidden ?? true) === true,
      tocHidden: [...document.querySelectorAll<HTMLElement>(toc)].map((el) => el.hidden === true),
    }),
    { link: DEMO_ADMIN_LINK, toc: TOC_LINK },
  );
}

function primaryNavItems(page: Page): Promise<Array<{ href: string | null; hidden: boolean }>> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("#primary-nav a[href]")].map((el) => ({
      href: el.getAttribute("href"),
      hidden: el.hidden === true,
    })),
  );
}

const panelHidden = (page: Page) => page.evaluate((selector) => document.querySelector<HTMLElement>(selector)?.hidden, TOOLBAR_PANEL);

test.describe("the showcase's chrome band", () => {
  test("shows and re-hides the filtered demo link as the filter buttons publish tokens, leaving the table of contents alone", async ({ page }) => {
    await page.goto("/showcase/ui/chrome");
    const initial = await chromeFilterState(page);
    const untouched = initial.tocHidden.map(() => false);
    expect(initial).toEqual({ adminHidden: true, tocHidden: untouched });

    await page.click(ADMIN_FILTER);
    await expect.poll(() => chromeFilterState(page)).toEqual({ adminHidden: false, tocHidden: untouched });

    await page.click(SIGNED_OUT_FILTER);
    await expect.poll(() => chromeFilterState(page)).toEqual({ adminHidden: true, tocHidden: untouched });
  });

  test("leaves the site's primary navigation exactly as the server rendered it when the demo publishes filter tokens", async ({ page }) => {
    await page.goto("/showcase/ui/chrome");
    const rendered = await primaryNavItems(page);
    expect(rendered.length).toBeGreaterThan(0);

    await page.click(ADMIN_FILTER);
    await expect.poll(() => chromeFilterState(page)).toMatchObject({ adminHidden: false });

    expect(await primaryNavItems(page)).toEqual(rendered);
  });

  test("hides the panel from the scope-dispatched toggle and restores it from the command-dispatched reset", async ({ page }) => {
    await page.goto("/showcase/ui/chrome");
    expect(await panelHidden(page)).toBe(false);

    await page.click(`${TOOLBAR_RAIL} [data-ref='toggle']`);
    await expect.poll(() => panelHidden(page)).toBe(true);

    await page.click(`${TOOLBAR_RAIL} [data-ref='reset']`);
    await expect.poll(() => panelHidden(page)).toBe(false);
  });
});

test.describe("the showcase's dialog band", () => {
  test("flows the non-modal dialog inside its own section rather than over the page", async ({ page }) => {
    await page.goto("/showcase/ui/interactive");

    const placement = await page.evaluate((main) => {
      const dialog = document.querySelector<HTMLElement>(`${main} #show-dialog-inline`);
      const section = document.querySelector(`${main} #dialog`);
      if (dialog === null || section === null) return null;
      const box = dialog.getBoundingClientRect();
      const within = section.getBoundingClientRect();
      return {
        position: getComputedStyle(dialog).position,
        margin: getComputedStyle(dialog).margin,
        containedVertically: box.top >= within.top - 1 && box.bottom <= within.bottom + 1,
      };
    }, MAIN);

    expect(placement).toEqual({ position: "static", margin: "0px", containedVertically: true });
  });

  test("still gives a modal dialog the 1rem viewport gutter it centres in", async ({ page }) => {
    await page.goto("/showcase/ui/interactive");

    await page.locator(`${MAIN} [data-slot~='dialog-trigger'][commandfor='show-dialog']`).click();

    const modal = await page.evaluate((main) => {
      const dialog = document.querySelector<HTMLDialogElement>(`${main} #show-dialog`);
      if (dialog === null) return null;
      const style = getComputedStyle(dialog);
      return { matchesModal: dialog.matches(":modal"), position: style.position, top: style.top };
    }, MAIN);

    expect(modal).toEqual({ matchesModal: true, position: "fixed", top: "16px" });
  });
});
