import { healthCheck } from "@y-core/forge/app";
import { logViewer } from "@y-core/forge/logging/http";
import type { RouteConfig, RouteModule } from "@y-core/forge/router";
import { route } from "@y-core/forge/router";
import type { AppEnv, AppEnvironment } from "./app/env";
import { contactSecurityGuard, csrfVerifyGuard, rateLimitGuard } from "./app/middleware";
import { handleContactAction } from "./handlers/contact";
import { homeRoute } from "./handlers/pages";
import { logsView } from "./views/logs";

export const routes: RouteConfig<AppEnvironment> = [
  route("/api/health", { loader: healthCheck<AppEnvironment>({ csrf: () => true }) }),
  route("/api/contact", { middleware: [contactSecurityGuard, rateLimitGuard, csrfVerifyGuard], action: handleContactAction }),
  route("/", { ...homeRoute, middleware: csrfVerifyGuard }),
  // TODO(auth): mount an auth middleware before exposing this route in production
  // Cast: logViewer returns RouteModule<Env>; AppEnvironment is a compatible superset
  // biome-ignore lint/style/noNonNullAssertion: LOGS_KV is required when the viewer route is mounted
  route("/admin/logs", { ...logViewer({ kv: (c) => (c as AppEnv).env.LOGS_KV! }), view: logsView } as unknown as RouteModule<AppEnvironment>),
];
