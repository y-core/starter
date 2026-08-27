import { expect, test } from "@playwright/test";

/** The reference loopback-https shape: the page over https, its assets, then the contact POST. */

const ORIGIN = "https://localhost:8787";

/** The server under test must name `ORIGIN` as its `SITE_ORIGIN`, since `allowedOrigins` is derived
 *  from it alone and the canonical link is rendered from it. `reuseExistingServer` adopts whatever
 *  dev server is already listening, so a plain `bun run dev` — which takes the devbox origin from
 *  `.dev.vars` — would fail two of these tests on a mismatch nothing else reports. Read it once and
 *  say so in one place, rather than four times as an assertion diff. */
async function siteOrigin(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/");
  const canonical = await page.locator("link[rel='canonical']").getAttribute("href");
  return canonical === null ? "" : new URL(canonical).origin;
}

test.beforeEach(async ({ page }) => {
  const origin = await siteOrigin(page);
  expect(
    origin,
    `the dev server under test names SITE_ORIGIN=${origin || "(none)"}, not ${ORIGIN} — start it with \`bun run dev:browser\`, which passes the override this suite needs`,
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
