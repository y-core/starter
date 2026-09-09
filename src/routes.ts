import { accountRoutes, adminRoutes, authRoutes } from "@y-core/forge/auth/web";
import { get, post, route } from "@y-core/forge/router";
import { showcaseRoutes } from "@y-core/forge/ui/show";

export const routes = route({
  health: get("/api/health"),
  contact: post("/api/contact"),
  home: get("/"),
  authEmailConfirm: get("/auth/email-change/confirm"),
  account: get("/account"),
  welcome: get("/welcome"),
  showcase: { logs: get("/showcase/logs"), ...showcaseRoutes("/showcase/ui") },
});

export const authRouteMap = authRoutes("/auth");
export const accountRouteMap = accountRoutes("/account");
export const adminRouteMap = adminRoutes("/admin");
