import type { ConfigVariables } from "@y-core/forge/config";
import type { CsrfVariables } from "@y-core/forge/form";
import type { Context } from "@y-core/forge/router";
import type { AppConfig } from "./config/app";

export type Bindings = { ASSETS: Fetcher; LOG_LEVEL?: string; RATE_LIMITER?: RateLimit };

export type AppEnv = { Bindings: Bindings; Config: AppConfig; Variables: ConfigVariables<AppConfig>["Variables"] & CsrfVariables["Variables"] };
export type AppContext = Context<AppEnv>;
