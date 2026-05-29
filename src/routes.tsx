import { healthCheck } from "@y-core/forge/app";
import type { RouteConfig } from "@y-core/forge/router";
import { route } from "@y-core/forge/router";
import type { AppEnv } from "./context";
import { handleContactAction } from "./handlers/contact";
import { homeRoute } from "./handlers/pages";
import { contactSecurity, csrfVerify, rateLimitGuard } from "./lib/middleware";

export const routes: RouteConfig<AppEnv> = [
  route("/api/health", {
    loader: healthCheck<AppEnv>({
      csrf: () => true,
    }),
  }),
  route("/api/contact", {
    middleware: [contactSecurity, rateLimitGuard, csrfVerify],
    action: handleContactAction,
  }),
  route("/", homeRoute),
];
