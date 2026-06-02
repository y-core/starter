import { healthCheck } from "@y-core/forge/app";
import { logViewer } from "@y-core/forge/logging/http";
import type { RouteConfig, RouteView } from "@y-core/forge/router";
import { route } from "@y-core/forge/router";
import type { AppEnv } from "./app/context";
import { contactSecurityGuard, csrfVerifyGuard, rateLimitGuard } from "./app/middleware";
import { handleContactAction } from "./handlers/contact";
import { homeRoute } from "./handlers/pages";
import { logsView } from "./views/logs";

export const routes: RouteConfig<AppEnv> = [
  route("/api/health", { loader: healthCheck<AppEnv>({ csrf: () => true }) }),
  route("/api/contact", { middleware: [contactSecurityGuard, rateLimitGuard, csrfVerifyGuard], action: handleContactAction }),
  route("/", { ...homeRoute, middleware: csrfVerifyGuard }),
  // TODO(auth): mount an auth middleware before exposing this route in production
  // logsView accepts LogViewerLoaderData (more specific); cast to RouteView<AppEnv> to satisfy route()'s unknown LoaderData slot
  route("/admin/logs", { ...logViewer<AppEnv>({ kv: (c) => c.env.LOGS_KV }), view: logsView as RouteView<AppEnv> }),
];
