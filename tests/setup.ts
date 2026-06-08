// Polyfill URLPattern for Bun test environment (not built into Bun's runtime).
import "urlpattern-polyfill";
import { beforeEach } from "bun:test";
import { ConfigKey } from "@y-core/forge/app";
import { EnvKey, ExecutionContextKey, RequestContext } from "@y-core/forge/context";
import type { Logger } from "@y-core/forge/logging";
import { requestLog } from "@y-core/forge/logging";
import { type AppConfig, configStore } from "../src/app/config";
import type { AppContext, AppEnv } from "../src/app/context";

// biome-ignore lint/suspicious/noExplicitAny: mock context for testing only
const MOCK_CTX: ExecutionContext = { waitUntil: () => {}, passThroughOnException: () => {} } as any;

export const nullLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  flush: async () => {},
  child: () => nullLogger,
};

/** Creates a RequestContext pre-loaded with env, executionCtx, config, and a null logger — for direct handler tests. */
export function makeTestContext(request: Request, env: AppEnv, config: AppConfig): AppContext {
  const context = new RequestContext(request);
  context.set(EnvKey, env, { property: "env" });
  context.set(ExecutionContextKey, MOCK_CTX, { property: "executionCtx" });
  context.set(ConfigKey, config, { property: "config" });
  requestLog.set(context, nullLogger);
  return context as unknown as AppContext;
}

function suppressLogger(original: (...args: unknown[]) => void) {
  return (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("{")) {
      try {
        const obj = JSON.parse(first);
        if ("level" in obj && "prefix" in obj && "message" in obj) return;
      } catch {}
    }
    original.apply(console, args);
  };
}

// Config is a per-isolate singleton (first env wins). bun test runs all files in
// one process, so reset between cases to stop one file's env (e.g. CSRF_SECRET)
// leaking into the next. See forge Config.get() docs.
beforeEach(() => {
  configStore.reset();
});

// Suppress structured logger output (JSON lines with level+prefix+message).
console.log = suppressLogger(console.log);
console.warn = suppressLogger(console.warn);
console.error = suppressLogger(console.error);
