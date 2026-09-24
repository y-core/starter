import { accountRoutes, adminRoutes, authRoutes } from "@y-core/forge/auth/web";
import { get, route } from "@y-core/forge/router";

export const authPageRouteMap = route({ authEmailConfirm: get("/auth/email-change/confirm"), account: get("/account"), welcome: get("/welcome") });

export const authRouteMap = authRoutes("/auth");
export const accountRouteMap = accountRoutes("/account");
export const adminRouteMap = adminRoutes("/admin");
