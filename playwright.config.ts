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
 *  barrel instead is what forced `bunx --bun` — and it was under bun that a dev server playwright
 *  spawned itself bound where the browser could not reach it, which is why this config starts its
 *  own server rather than attaching to one.
 *
 *  Deliberately outside `tsconfig.json`'s `include`, for the same reason `config/steps.ts` is: it
 *  reads node's `process`, which `"types": []` withholds from the Worker.
 */

import { defineConfig, devices } from "@playwright/test";
import { egressProxy, resolveChromiumPath } from "@y-core/forge/tooling/gate/chromium";

// The browser slot, 8788 on loopback — never 8787, which `wrangler.jsonc` declares on `0.0.0.0` for
// the application's own dev server and so answers *as* the app across the container network
// (the canon's port-slot rule in `TESTING.md`). The origin is spelled to match the bind address:
// `allowedOrigins` is a string comparison, so `https://localhost:8788` is not `https://127.0.0.1:8788`.
const PORT = 8788;
const LOOPBACK = `https://127.0.0.1:${PORT}`;

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
        //
        // `--no-sandbox` because Chromium's own sandbox needs user namespaces this container does
        // not grant, and without it the browser exits before the first navigation. The pages it
        // loads are this repository's own, served from loopback — so what the flag drops is a second
        // layer under a container that is already the boundary. It belongs to the test runner and
        // nothing else: no production path launches a browser.
        launchOptions: { executablePath: resolveChromiumPath(), args: ["--no-sandbox", "--ignore-certificate-errors"] },
      },
    },
  ],
  webServer: {
    // `--var SITE_ORIGIN` outranks `.dev.vars` (verified), so `allowedOrigins` is derived from the
    // loopback origin the browser actually uses — SECURITY_HARDENING §3f's canonical dev origin,
    // stated for this case. The suite is one of three mutually exclusive cases, each with a single
    // browser origin, so forge's `extraOrigins` (a second origin at once) buys nothing here.
    command: `bun run build:assets && wrangler dev src/worker.dev.ts --port ${PORT} --ip 127.0.0.1 --var SITE_ORIGIN:${LOOPBACK} --show-interactive-dev-session=false`,
    stdout: "pipe",
    // A TCP probe, not `url`: playwright's readiness fetch ignores `NO_PROXY`, so an https `url`
    // probe is sent to the workspace proxy and never reaches loopback.
    port: PORT,
    // Never reuse, and this is correctness rather than caution (the canon's port-slot rule in
    // `TESTING.md`): `build:assets` runs Tailwind as the server boots, so a reused server serves the
    // CSS the source had at boot and a run against edited views measures the previous layout. The
    // suite's `beforeEach` still refuses a server naming any other origin, which is what catches a
    // stray listener on this port.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
