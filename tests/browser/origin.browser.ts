import { expect, test } from "@playwright/test";

const ORIGIN = "https://127.0.0.1:8788";

test("the server on the browser slot names the loopback SITE_ORIGIN", async ({ page }) => {
  await page.goto("/");
  const canonical = await page.locator("link[rel='canonical']").getAttribute("href");
  const origin = canonical === null ? "" : new URL(canonical).origin;
  expect(
    origin,
    `the dev server under test names SITE_ORIGIN=${origin || "(none)"}, not ${ORIGIN} — something else is already listening on 8788; stop it, or start the observation server with \`bun run dev:browser\``,
  ).toBe(ORIGIN);
});
