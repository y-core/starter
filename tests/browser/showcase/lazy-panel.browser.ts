import { expect, test } from "@playwright/test";

const LAZY_PANEL = "[data-ref='lazy-demo']";
const LAZY_STATUS = "[data-ref='lazy-status']";

const LAZY_ROWS = ["Rich text editor182 kB", "Chart renderer94 kB", "Date picker41 kB", "Syntax highlighter77 kB", "Diff viewer36 kB"];

test("mounting the lazy panel a second time through the module the page loaded leaves exactly one payload list", async ({ page }) => {
  await page.goto("/showcase/ui/runtime");
  const anchor = page.locator(LAZY_PANEL);
  await anchor.scrollIntoViewIfNeeded();
  await expect(anchor.locator("ul")).toHaveCount(1);

  const chunks = await page.evaluate(async (selector) => {
    const urls = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => new URL(name).pathname.split("/").pop()?.startsWith("lazy-panel-"));
    const el = document.querySelector(selector);
    for (const url of urls) {
      const mod = (await import(url)) as { mountLazyPanel: (el: Element) => void };
      if (el !== null) mod.mountLazyPanel(el);
    }
    return urls.length;
  }, LAZY_PANEL);

  expect(chunks).toBe(1);
  await expect(anchor.locator("ul")).toHaveCount(1);
  await expect(anchor.locator("ul > li")).toHaveText(LAZY_ROWS);
});

test("a lazy panel with no status line still receives the payload, and nothing is reported", async ({ page }) => {
  const reports: string[] = [];
  page.on("pageerror", (error) => reports.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error") reports.push(message.text());
  });
  await page.goto("/showcase/ui/runtime");
  const anchor = page.locator(LAZY_PANEL);
  await anchor.locator(LAZY_STATUS).evaluate((status) => status.remove());

  await anchor.scrollIntoViewIfNeeded();

  await expect(anchor.locator("ul > li")).toHaveText(LAZY_ROWS);
  await expect(anchor.locator("p")).toHaveText(["Everything below arrived with the module"]);
  expect(reports).toEqual([]);
});
