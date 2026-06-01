import type { ConfigContext } from "@y-core/forge/config";
import type { CsrfContext } from "@y-core/forge/form";
import type { LoggerContext } from "@y-core/forge/logging";
import type { Context } from "@y-core/forge/router";
import type { RequestIdContext, SecureHeadersContext } from "@y-core/forge/security";
import type { KVNamespace } from "@y-core/forge/storage/kv";
import type { AppConfig } from "./config";

export type AppEnv = Context<AppEnvironment>;
export type Bindings = { ASSETS: Fetcher; LOGS_KV?: KVNamespace; LOG_LEVEL?: string; RATE_LIMITER?: RateLimit };
export type AppEnvironment = {
  Bindings: Bindings;
  Config: AppConfig;
  Variables: ConfigContext<AppConfig> & CsrfContext & RequestIdContext & LoggerContext & SecureHeadersContext;
};
