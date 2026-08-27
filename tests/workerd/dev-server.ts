import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A `wrangler dev` process serving this app, the two origins it answers on, and all it printed. */
export interface DevServer {
  origin: string;
  siteOrigin: string;
  logs(): string;
  stop(): void;
}

const READY_TIMEOUT_MS = 180_000;

/** A port nothing holds, released before the caller binds it — the CLI takes a number, not a socket. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close(() => reject(new Error("dev server: could not reserve a port")));
        return;
      }
      probe.close(() => resolve(address.port));
    });
  });
}

async function waitForReady(origin: string, child: { killed: boolean }): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.killed) throw new Error("dev server: the wrangler process exited before it was ready");
    try {
      await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2_000) });
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`dev server: not ready after ${READY_TIMEOUT_MS}ms`);
}

// Through a file rather than `--var`, which leaves a developer's own `.dev.vars` merged in
// underneath — its `LOG_LEVEL`, its real keys, whatever it holds. `--env-file` replaces that
// discovery outright, so the suite reads one environment on a machine that has one and on CI that
// does not.
/** Writes `vars` where wrangler will read them instead of `.dev.vars`. */
function writeEnv(port: number, vars: Record<string, string>): string {
  const path = join(tmpdir(), `starter-workerd-${port}.env`);
  writeFileSync(
    path,
    Object.entries(vars)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  return path;
}

// Under node, not bun: the wrangler CLI refuses bun outright. Spawning it keeps `bun test` the only
// test runner while the code under test still executes inside workerd.
/** Starts `wrangler dev` over `entry` with `vars` plus a matching `SITE_ORIGIN`, and resolves once it answers. @internal */
export async function startDevServer(entry: string, vars: Record<string, string>): Promise<DevServer> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  // The listener is http, but the dev server stamps `https` onto every origin-bearing header before
  // the Worker sees it (`WORKERS_PLATFORM.md` §4e). The origin the app is told it has must therefore
  // be the https one, or the guard 403s every request the suite makes.
  const siteOrigin = `https://127.0.0.1:${port}`;
  const envFile = writeEnv(port, { ...vars, SITE_ORIGIN: siteOrigin });
  // `node`, never `process.execPath`: under `bun test` that is the bun binary.
  const cli = new URL("../../node_modules/wrangler/bin/wrangler.js", import.meta.url).pathname;
  const args = [cli, "dev", entry, "--port", String(port), "--ip", "127.0.0.1", "--local-protocol", "http", "--env-file", envFile];

  const child = spawn("node", args, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  const output: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => void output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => void output.push(chunk.toString()));

  try {
    await waitForReady(origin, child);
  } catch (error) {
    child.kill("SIGKILL");
    throw new Error(`${(error as Error).message}\n${output.join("")}`);
  }

  return { origin, siteOrigin, logs: () => output.join(""), stop: () => void child.kill("SIGKILL") };
}
