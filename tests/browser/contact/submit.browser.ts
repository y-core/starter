import { expect, test } from "@playwright/test";

/** The contact POST over loopback https, from the form the home page renders. */

test("contact POST is not refused as a cross-origin request", async ({ page }) => {
  await page.goto("/");

  const posted = page.waitForResponse((response) => response.url().endsWith("/api/contact") && response.request().method() === "POST");

  await page.fill("#field-name", "Jane Example");
  await page.fill("#field-email", "jane@example.com");
  await page.fill("#field-message", "I would like help building a digital product.");
  await page.locator("[data-ref='contact-submit']").click();

  const response = await posted;
  // 200 is out of reach locally — Turnstile's testing key reports `hostname: "example.com"`, so the
  // action refuses with 422 — and 403 is the origin guard's only verdict, so "not 403" is the pin.
  expect(response.status()).not.toBe(403);
  expect(await response.text()).not.toContain("Forbidden");
});

test("swaps the 422 refusal into the result target rather than leaving the form looking inert", async ({ page }) => {
  await page.goto("/");
  const result = page.locator("#contact-result");
  expect((await result.innerHTML()).trim()).toBe("");

  const posted = page.waitForResponse((response) => response.url().endsWith("/api/contact") && response.request().method() === "POST");
  await page.fill("#field-name", "Jane Example");
  await page.fill("#field-email", "jane@example.com");
  await page.fill("#field-message", "I would like help building a digital product.");
  await page.locator("[data-ref='contact-submit']").click();

  expect((await posted).status()).toBe(422);
  await expect(result).not.toBeEmpty();
  await expect(result).toContainText("Please correct the following fields.");
});
