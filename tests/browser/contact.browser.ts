import { expect, test } from "@playwright/test";

/** The reference loopback-https shape: the page over https, its assets, then the contact POST. */

const ORIGIN = "https://127.0.0.1:8788";

/** The server under test must name `ORIGIN` as its `SITE_ORIGIN`, since `allowedOrigins` is derived
 *  from it alone and the canonical link is rendered from it. `playwright.config.ts` starts that
 *  server itself and passes the override, so this guard is what catches a stray listener already on
 *  8788 — a plain `bun run dev` moved there takes the devbox origin from `.dev.vars` and would fail
 *  two of these tests on a mismatch nothing else reports. Read it once and say so in one place,
 *  rather than four times as an assertion diff. */
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
  // 403 is the origin guard's only verdict, so "not 403" is what pins the posture. A green 200 is
  // out of reach locally: Turnstile's testing key always reports `hostname: "example.com"`, which
  // never matches the `expectedHostname` derived from SITE_ORIGIN, so the action refuses with 422.
  expect(response.status()).not.toBe(403);
  expect(await response.text()).not.toContain("Forbidden");
});

/** `src/client/main.ts` unshifts a `422 → swap` rule onto htmx's `responseHandling`, because htmx
 *  swaps 2xx/3xx alone and the refusal fragment would otherwise be dropped on the floor. Locally
 *  every submission is refused — Turnstile's testing key reports `hostname: "example.com"`, which
 *  never matches the hostname derived from SITE_ORIGIN — so the refusal path is the one reachable
 *  here, and it is the one that rule exists for. */
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
