import { expect, test } from "@playwright/test";

/** The reference loopback-https shape: the page over https, its assets, then the contact POST. */

const ORIGIN = "https://127.0.0.1:8788";

/** The `SITE_ORIGIN` the server under test was started with, read back off the canonical link it renders. */
async function siteOrigin(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/");
  const canonical = await page.locator("link[rel='canonical']").getAttribute("href");
  return canonical === null ? "" : new URL(canonical).origin;
}

test.beforeEach(async ({ page }) => {
  const origin = await siteOrigin(page);
  expect(
    origin,
    `the dev server under test names SITE_ORIGIN=${origin || "(none)"}, not ${ORIGIN} — something else is already listening on 8788; stop it, or start the observation server with \`bun run dev:browser\``,
  ).toBe(ORIGIN);
});

test("home renders over loopback https", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).protocol).toBe("https:");
});

test("canonical link names the loopback origin the browser used", async ({ page }) => {
  await page.goto("/");
  const canonical = await page.locator("link[rel='canonical']").getAttribute("href");
  expect(canonical).toBe(`${new URL(page.url()).origin}/`);
});

test("assets load over the same origin without a TLS or mixed-content refusal", async ({ page }) => {
  const failed: string[] = [];
  const statuses = new Map<string, number>();
  page.on("requestfailed", (request) => failed.push(request.url()));
  page.on("response", (response) => statuses.set(response.url(), response.status()));

  await page.goto("/");

  const assets = [...statuses].filter(([url]) => url.startsWith(`${ORIGIN}/assets/`));
  expect(assets.length).toBeGreaterThan(0);
  expect(assets.filter(([, status]) => status >= 400)).toEqual([]);
  expect(failed.filter((url) => url.startsWith(`${ORIGIN}/`))).toEqual([]);
});

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
