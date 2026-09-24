import { expect, test } from "@playwright/test";

/** The showcase pages as a visitor loads them, driven through the scopes `src/client/main.ts` bundles. */

const CATALOG_PAGES = [
  "/showcase/ui",
  "/showcase/ui/interactive",
  "/showcase/ui/runtime",
  "/showcase/ui/htmx",
  "/showcase/ui/turnstile",
  "/showcase/ui/chrome",
];

const LAZY_PANEL = "[data-ref='lazy-demo']";
const LAZY_STATUS = "[data-ref='lazy-status']";
const LAZY_RETRY_PANEL = "[data-ref='lazy-retry-demo']";
const LAZY_RETRY_STATUS = "[data-ref='lazy-retry-status']";

const LAZY_ROWS = ["Rich text editor182 kB", "Chart renderer94 kB", "Date picker41 kB", "Syntax highlighter77 kB", "Diff viewer36 kB"];

for (const path of CATALOG_PAGES) {
  test(`${path} resumes its scopes with no resume warning or setup error`, async ({ page }) => {
    const reports: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "warning" || message.type() === "error") reports.push(message.text());
    });
    const served = await (await page.request.get(path)).text();

    const response = await page.goto(path);
    await page.waitForLoadState("load");

    expect(response?.status()).toBe(200);
    const servedToc = served.slice(
      served.indexOf('<nav aria-label="On this page"'),
      served.indexOf("</nav>", served.indexOf('<nav aria-label="On this page"')),
    );
    expect([servedToc.length > 0, servedToc.split('aria-current="location"').length - 1]).toEqual([true, 0]);
    const target = (await page.locator("[data-scope='show-toc'] a[href^='#']").first().getAttribute("href")) ?? "";
    await page.locator(target).evaluate((section) => section.scrollIntoView({ block: "start" }));
    await expect(page.locator("[data-scope='show-toc'] [aria-current='location']")).toHaveCount(1);
    expect(reports.filter((text) => text.includes("[resume]"))).toEqual([]);
  });
}

test("the theme toggle changes the document's theme preference", async ({ page }) => {
  await page.goto("/showcase/ui/interactive");
  const root = page.locator("html");
  const before = await root.getAttribute("data-theme-preference");

  await page.locator("[data-on-click='cycleTheme']").click();

  await expect(root).not.toHaveAttribute("data-theme-preference", before as string);
});

test("a menu trigger opens its popup and reports itself expanded", async ({ page }) => {
  await page.goto("/showcase/ui/interactive");
  const trigger = page.locator("[data-slot~='menu-trigger'][commandfor='show-file-menu']");

  await trigger.click();

  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => document.querySelector("#show-file-menu")?.matches(":popover-open"))).toBe(true);
});

test("a dismissible toast is removed by its close button", async ({ page }) => {
  await page.goto("/showcase/ui/interactive");
  const untimedDismissible = page.locator("#toast [data-slot~='toast']:has([data-slot~='toast-close']):not([data-scope='show-toast-cycle'] *)");
  const before = await untimedDismissible.count();
  expect(before).toBeGreaterThan(0);

  await untimedDismissible.first().locator("[data-slot~='toast-close']").click();

  await expect(untimedDismissible).toHaveCount(before - 1);
});

test("the lazy panel shows its pending line and no rows until it is scrolled into view", async ({ page }) => {
  await page.goto("/showcase/ui/runtime");
  const anchor = page.locator(LAZY_PANEL);

  await expect(anchor.locator(LAZY_STATUS)).toHaveText("Not loaded yet — the module for this panel arrives when it scrolls into view.");
  await expect(anchor.locator("li")).toHaveCount(0);

  await anchor.scrollIntoViewIfNeeded();

  await expect(anchor.locator("li")).toHaveCount(LAZY_ROWS.length);
});

test("the lazy panel loads its module when scrolled into view and renders the deferred rows", async ({ page }) => {
  await page.goto("/showcase/ui/runtime");
  const anchor = page.locator(LAZY_PANEL);

  await anchor.scrollIntoViewIfNeeded();

  await expect(anchor.locator(LAZY_STATUS)).toHaveText("Loaded — the module was fetched and evaluated on first sight of this panel.");
  await expect(anchor.locator("p")).toHaveText([
    "Loaded — the module was fetched and evaluated on first sight of this panel.",
    "Everything below arrived with the module",
  ]);
  await expect(anchor.locator("ul")).toHaveCount(1);
  await expect(anchor.locator("ul > li")).toHaveText(LAZY_ROWS);
});

test("the retry panel reports each rejected load, then renders once an attempt resolves", async ({ page }) => {
  await page.goto("/showcase/ui/runtime");
  const anchor = page.locator(LAZY_RETRY_PANEL);

  await expect(anchor.locator(LAZY_RETRY_STATUS)).toHaveText("Not loaded yet — this anchor's first two loads will reject on purpose.");
  await page.evaluate((selector) => {
    const status = document.querySelector(selector);
    const seen: string[] = [];
    Object.assign(window, { retryStatuses: seen });
    if (status !== null)
      new MutationObserver(() => seen.push(status.textContent ?? "")).observe(status, { childList: true, characterData: true, subtree: true });
  }, LAZY_RETRY_STATUS);
  await anchor.scrollIntoViewIfNeeded();

  await expect(anchor.locator(LAZY_RETRY_STATUS)).toHaveText("Loaded on attempt 3, after 2 rejections.");
  await expect(anchor.locator("ul > li")).toHaveText(LAZY_ROWS);
  const statuses = await page.evaluate(() => (window as Window & { retryStatuses?: string[] }).retryStatuses ?? []);
  expect(statuses).toEqual([
    "Attempt 1 of 3 rejected — retrying.",
    "Attempt 2 of 3 rejected — retrying.",
    "Loaded on attempt 3, after 2 rejections.",
  ]);
});
