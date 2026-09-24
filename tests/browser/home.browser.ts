import { expect, test } from "@playwright/test";

/** The reference loopback-https shape: the page over https, then its assets. */

const ORIGIN = "https://127.0.0.1:8788";

test("home renders over loopback https", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  expect(new URL(page.url()).protocol).toBe("https:");
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
