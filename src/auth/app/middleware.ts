import type { MiddlewareGuardGroup } from "@y-core/forge/app";
import { createAuthGuards, requireAuth, requireEnrolment, resolveAuth } from "@y-core/forge/auth/web";
import { getAppContext, type Middleware } from "@y-core/forge/context";
import type { DevAllowance } from "@y-core/forge/dev";
import { csrfProtection } from "@y-core/forge/form";
import type { RateLimitOptions } from "@y-core/forge/security";
import { sessionCtx } from "@y-core/forge/session";

import { originPolicy, resolveCsrfKey } from "../../app/config";
import type { MiddlewareContribution } from "../../app/middleware";
import type { AppConfig, AppEnv } from "../../app/types";
import { rateLimitPolicy } from "../../rate-limit/mod";
import { accountRouteMap, adminRouteMap, authPageRouteMap, authRouteMap } from "../routes";
import { authEnrolmentOptions, authIdentityOptions, authSessionGuard } from "./auth";

// The navbar shows a signed-in visitor different destinations, so the identity is needed on the
// unguarded routes too. `/api/` renders none, and would pay a user-store read for nothing.
/** Establishes the identity for every request that can render the shared navbar. */
export const navIdentityGuard: Middleware = (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  if (c.url.pathname.startsWith("/api/")) return next();
  return resolveAuth<AppEnv>({ users: authIdentityOptions.users })(context, next);
};

// Dropping `requireEnrolment` would leave a visitor who still owes the mandatory factor sitting on
// a signed-in page, which is a mandatory demand read as an optional one.
/** The identity and enrolment guards this app's own account page carries, as forge's group does. */
export const accountGuards: readonly Middleware[] = [requireAuth<AppEnv>(authIdentityOptions), requireEnrolment<AppEnv>(authEnrolmentOptions)];

/** The auth prefixes' own CSRF protection, whose tokens are bound to the session that minted them. */
export const authCsrfGuard: Middleware = csrfProtection({ secret: resolveCsrfKey, subject: (context) => sessionCtx.getOptional(context)?.id });

/** The signed-in console's budget, keyed per route so one page's limit is not another's. */
export function consoleLimitPolicy(dev?: DevAllowance): RateLimitOptions<Env> {
  return { ...rateLimitPolicy(dev), key: (c) => `${c.request.headers.get("CF-Connecting-IP") ?? "unknown"}:${new URL(c.request.url).pathname}` };
}

/** The middleware stack for every guarded auth route group, built off forge's own group table. */
export function authGuardGroups(dev?: DevAllowance): MiddlewareGuardGroup<AppEnv>[] {
  return createAuthGuards<AppEnv>({
    routes: { auth: authRouteMap, account: accountRouteMap, admin: adminRouteMap },
    auth: authIdentityOptions,
    enrolment: authEnrolmentOptions,
    // The unauthenticated auth POSTs declare no guards of their own, so without this their group is
    // emitted with no cross-origin defence at all.
    origin: originPolicy,
    rateLimit: {
      auth: rateLimitPolicy(dev),
      "auth.verify": rateLimitPolicy(dev),
      account: consoleLimitPolicy(dev),
      admin: consoleLimitPolicy(dev),
    },
  });
}

/** Auth's part of the global chain: its KV binding, the session, the navbar identity and every auth route group's guards. */
export function createAuthMiddleware(dev?: DevAllowance): MiddlewareContribution {
  return {
    bindings: [{ name: "AUTH_KV", methods: ["get", "put"], label: "the auth KV binding" }],
    session: authSessionGuard,
    globals: [navIdentityGuard],
    guards: [
      // `/welcome` embeds forge's sign-in view, whose form posts to `/auth/signin` — so its token
      // must be minted under the same session binding that path verifies against.
      { paths: ["/auth/*", "/account/*", "/admin/*", authPageRouteMap.welcome.href(), authPageRouteMap.account.href()], guards: [authCsrfGuard] },
      ...authGuardGroups(dev),
      // This app's own signed-in landing page, outside forge's account group but owing its guards.
      { paths: [authPageRouteMap.account.href()], guards: [...accountGuards] },
      // App-owned, so outside `authGuardGroups`, and on the same unkeyed budget as the /auth POSTs: a
      // token grind costs a D1 read and a nonce consume per hit. No `origin` — a GET is exempt from it.
      { paths: [authPageRouteMap.authEmailConfirm.href()], rateLimit: rateLimitPolicy(dev) },
    ],
  };
}
