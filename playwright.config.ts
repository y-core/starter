import { defineConfig, devices } from "@playwright/test";
import { egressProxy, resolveChromiumPath } from "@y-core/forge/tooling/gate/chromium";

const PORT = 8788;
const LOOPBACK = `https://127.0.0.1:${PORT}`;
const BROWSER_STATE = ".wrangler/browser-state";
const ORIGIN_SPEC = "origin.browser.ts";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.browser.ts",
  fullyParallel: true,
  workers: 2,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: LOOPBACK,
    ignoreHTTPSErrors: true,
    proxy: egressProxy(),
    // `--no-sandbox`: this container grants no user namespaces, and the pages are this repository's own on loopback.
    launchOptions: { executablePath: resolveChromiumPath(), args: ["--no-sandbox", "--ignore-certificate-errors"] },
  },
  projects: [
    { name: "origin", testMatch: ORIGIN_SPEC },
    { name: "chromium", testIgnore: ORIGIN_SPEC, dependencies: ["origin"] },
  ],
  webServer: {
    // Miniflare persists the rate limiter's window across restarts, so a reused state directory spends a spec's rate-limit budget.
    command: `rm -rf ${BROWSER_STATE} && bun run build:assets && wrangler dev src/worker.dev.ts --port ${PORT} --ip 127.0.0.1 --var SITE_ORIGIN:${LOOPBACK} --persist-to ${BROWSER_STATE} --show-interactive-dev-session=false`,
    stdout: "pipe",
    // A TCP probe, not `url`: playwright's readiness fetch ignores `NO_PROXY` and would go to the egress proxy.
    port: PORT,
    // `build:assets` runs Tailwind at boot, so a reused server serves the CSS the source had when it started.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
