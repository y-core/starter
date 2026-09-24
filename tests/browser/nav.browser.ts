import { expect, test } from "@playwright/test";

/** The chrome a visitor drives with the keyboard and the pointer: the drawer, and the theme switch. */

const NARROW = { width: 390, height: 844 };

test("opens the nav drawer from the toggle and closes it on Escape", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await page.goto("/");
  const drawer = page.locator("details#primary-nav");

  await expect(drawer).not.toHaveAttribute("open");
  await page.locator("[data-slot='navbar-toggle']").click();
  await expect(drawer).toHaveAttribute("open", "");

  await page.keyboard.press("Escape");
  await expect(drawer).not.toHaveAttribute("open");
});

test("reaches a page from inside the open drawer, which is the whole reason it opens", async ({ page }) => {
  await page.setViewportSize(NARROW);
  await page.goto("/");

  await page.locator("[data-slot='navbar-toggle']").click();
  await page.locator("[data-slot='navbar-link'][href='/logs']").click();

  await expect(page).toHaveURL(/\/logs$/);
});

test("cycles the theme preference and keeps it across a reload", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("html");

  await expect(root).toHaveAttribute("data-theme-preference", "system");
  await page.locator("[data-on-click='cycleTheme']").click();
  const chosen = await root.getAttribute("data-theme-preference");
  expect(chosen).not.toBe("system");

  await page.reload();
  await expect(root).toHaveAttribute("data-theme-preference", chosen as string);
});
