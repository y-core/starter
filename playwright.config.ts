/** The browser set — real Chromium over loopback https, one verb of its own
 *  (`bun run test:browser`).
 *
 *  The gate runs it as the full-only `test:browser` row (`config/steps.ts` sets `browser: true`), so
 *  it is skipped by a fast `bun run verify` and runs under `--full` — a browser binary is a
 *  *prerequisite*, which is the only legitimate ground for holding a set back. `bun run test:browser`
 *  is the same command by hand.
 *
 *  `bun test` is untouched: the two never share a process, and discovery cannot collide — `bun test`
 *  matches `*.test.*` / `*_test.*` / `*.spec.*` / `*_spec.*`, none of which is `*.browser.ts`.
 *
 *  Run under node, which is what `playwright`'s own shebang is: the browser resolution comes from
 *  `@y-core/forge/tooling/gate/chromium`, a committed bundle of the one symbol a config needs, so
 *  nothing here asks node to strip types from a `.ts` under `node_modules`. Importing the gate
 *  barrel instead is what forced `bunx --bun`, and under bun a dev server playwright spawns itself
 *  binds where the browser cannot reach it in a sandbox.
 *
 *  Deliberately outside `tsconfig.json`'s `include`, for the same reason `config/steps.ts` is: it
 *  reads node's `process`, which `"types": []` withholds from the Worker.
 */

import { defineConfig, devices } from "@playwright/test";
import { resolveChromiumPath } from "@y-core/forge/tooling/gate/chromium";

const PORT = 8787;
const LOOPBACK = `https://localhost:${PORT}`;

/** Routes the browser through a workspace proxy when one is configured, but never for loopback. */
function egressProxy() {
  const raw = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  if (!raw) return undefined;
  const url = new URL(raw);
  return {
    server: `${url.protocol}//${url.host}`,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    bypass: "localhost,127.0.0.1",
  };
}

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.browser.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: LOOPBACK, ignoreHTTPSErrors: true, proxy: egressProxy() },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // `--ignore-certificate-errors` as well as `ignoreHTTPSErrors`: the context flag alone
        // leaves wrangler's self-signed cert rejected in the handshake (SSLV3_ALERT_CERTIFICATE_UNKNOWN).
        launchOptions: { executablePath: resolveChromiumPath(), args: ["--no-sandbox", "--ignore-certificate-errors"] },
      },
    },
  ],
  webServer: {
    // `--var SITE_ORIGIN` outranks `.dev.vars` (verified), so `allowedOrigins` is derived from the
    // loopback origin the browser actually uses — SECURITY_HARDENING §3f's canonical dev origin,
    // stated for this case. The suite is one of three mutually exclusive cases, each with a single
    // browser origin, so forge's `extraOrigins` (a second origin at once) buys nothing here.
    command: `bun run build:assets && wrangler dev src/worker.dev.ts --var SITE_ORIGIN:${LOOPBACK} --show-interactive-dev-session=false`,
    stdout: "pipe",
    // A TCP probe, not `url`: playwright's readiness fetch ignores `NO_PROXY`, so an https `url`
    // probe is sent to the workspace proxy and never reaches loopback.
    port: PORT,
    // Inside the devbox sandbox a server playwright spawns itself binds where neither the browser
    // nor a sibling curl can reach it, so start one first and this reuses it (README). Reuse is the
    // normal path, not the fallback — which means the `--var` above usually never runs, so the
    // server started by hand has to carry the same override. `bun run dev:browser` is that command,
    // and a `beforeEach` in the suite refuses a server naming any other origin.
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
