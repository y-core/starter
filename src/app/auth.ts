import { CoreIcon } from "@assets";
import type { MiddlewareGuardGroup } from "@y-core/forge/app";
import type { AuthDeferral, AuthFactorOffer, AuthFactorRegistry, AuthFactorService, AuthKeyRing, UserStore } from "@y-core/forge/auth";
import {
  createAdminUserService,
  createAdminUserStore,
  createChallengeStore,
  createCredentialStore,
  createEmailChangeFlow,
  createEmailOtpFactor,
  createFactorRegistry,
  createFactorStore,
  createIdentityLinkStore,
  createNonceStore,
  createOtpStateStore,
  createPasskeyFactor,
  createSigninFlow,
  createSignupFlow,
  createTotpAppFactor,
  createUserStore,
  importAuthKeyRing,
  purgeAuthEphemera,
} from "@y-core/forge/auth";
import type { AuthEnrolmentGuardOptions, AuthGuardOptions, AuthRequestServices, AuthWebOptions, AuthWebPaths } from "@y-core/forge/auth/web";
import { authEnrolmentPaths, authPaths, createAuthGuards } from "@y-core/forge/auth/web";
import type { AppContext as ForgeAppContext, Middleware } from "@y-core/forge/context";
import { contextVar, getAppContext } from "@y-core/forge/context";
import { createSignedCookie, createKVSessionStorage, sessionCtx, sessionMiddleware } from "@y-core/forge/session";
import { createD1Client } from "@y-core/forge/storage/db";

import { accountRouteMap, adminRouteMap, authRouteMap, routes } from "../routes";
import { consoleNotifier } from "../services/auth.notify";
import { AUTH_SECOND_FACTORS, authLimitPolicy, configStore, consoleLimitPolicy, originPolicy } from "./config";
import type { AppConfig, AppEnv, StepUpFactor } from "./types";

type AuthStores = ReturnType<typeof authStores>;

/** How recently a step-up must have happened for a mutation on the account or admin pages to stand. */
const STEP_UP_WINDOW_MS = 900_000;

const SESSION_PREFIX = "sess";
const CHALLENGE_PREFIX = "chal";
const NONCE_PREFIX = "nonce";

const authServicesCtx = contextVar<Promise<AuthRequestServices>>("authRequestServices");

/** Href builders for the three mounted auth route groups, so no path literal is written twice. */
export const authWebPaths: AuthWebPaths = { auth: authPaths(authRouteMap), account: authPaths(accountRouteMap), admin: authPaths(adminRouteMap) };

/** What every forge auth loader, action and `register*` reads this deployment's seams off. */
export const authWebOptions: AuthWebOptions<AppEnv> = {
  resolveServices: resolveAuthRequestServices,
  paths: authWebPaths,
  icon: CoreIcon,
  // Both this and the guard chain's own `settledPath` name it: this one is where a completed
  // sign-in lands, the guard's is where a settled visitor is bounced to, and forge defaults both to
  // the passkey list — which a deployment with no passkeys must not send anyone to.
  settledPath: routes.account.href(),
};

/** The signed session every auth guard and action reads, built per request because its storage is a binding. */
export const authSessionGuard: Middleware = (context, next) => {
  const c = getAppContext<AppEnv, Record<string, string>, AppConfig>(context);
  const config = configStore.get(c.env);
  const storage = createKVSessionStorage(c.env.AUTH_KV, { prefix: SESSION_PREFIX });
  const cookie = createSignedCookie("__Host-session", { secrets: [config.auth.sessionSecret], sameSite: "Lax" });
  return sessionMiddleware(storage, cookie)(context, next);
};

/** What every identity guard reads, shared between forge's groups and this app's account page. */
export const authIdentityOptions: AuthGuardOptions<AppEnv> = {
  users: async (c) => (await resolveAuthRequestServices(c)).users,
  signinPath: authWebPaths.auth.signin(),
};

/** What the enrolment guards read, shared so this app's own account page demands what forge's does. */
export const authEnrolmentOptions: AuthEnrolmentGuardOptions<AppEnv> = {
  factors: async (c) => (await resolveAuthRequestServices(c)).factors,
  // Total over both enrollable kinds, so a session owing an authenticator app is never sent to
  // the passkey page — which could not clear the enrolment and would loop against the guard.
  enrolmentPaths: authEnrolmentPaths(authWebPaths.auth),
  stepUpPath: authWebPaths.auth.verify.show(),
  // This app's own page, never a forge one: a deployment with no second factor has no passkey
  // list to land on, and a settled path naming one would advertise the factor it switched off.
  settledPath: routes.account.href(),
  freshStepUpMaxAgeMs: STEP_UP_WINDOW_MS,
};

function authStores(env: AppEnv) {
  const db = createD1Client(env.AUTH_DB);
  return {
    users: createUserStore(db),
    adminUsers: createAdminUserStore(db),
    enrolments: createFactorStore(db),
    credentials: createCredentialStore(db),
    identityLinks: createIdentityLinkStore(db),
    otpState: createOtpStateStore(db),
    challenges: createChallengeStore(db, { prefix: CHALLENGE_PREFIX }),
    nonces: createNonceStore(db, { prefix: NONCE_PREFIX }),
  };
}

// SQLite keeps an expired row where KV dropped it for free. Every read already holds a row against
// the clock, so this reclaims space rather than correctness — but it throws on failure, because a
// scheduled run that silently stopped reclaiming is a disk that silently stops.
/** Deletes the expired challenge and nonce rows, driven by the worker's scheduled handler. */
export async function purgeAuthStores(env: AppEnv): Promise<void> {
  const outcome = await purgeAuthEphemera(createD1Client(env.AUTH_DB), Date.now());
  if (!outcome.ok) throw outcome.error;
}

async function authAddress(users: UserStore, userId: string): Promise<string> {
  const found = await users.findById(userId);
  if (!found.ok || found.data === null) throw new Error("auth: no address for the identity a challenge was issued to");
  return found.data.email;
}

/** What the factors this deployment builds are held against, beyond the stores themselves. */
interface AuthFactorOptions {
  readonly rpId: string;
  readonly rpName: string;
  readonly origin: string;
  /** This request's session; the challenge every passkey ceremony issues is bound to it. */
  readonly sessionId: string;
}

function authFactors(stores: AuthStores, keys: AuthKeyRing, options: AuthFactorOptions): AuthFactorRegistry {
  const emailOtp = createEmailOtpFactor({
    keys,
    state: stores.otpState,
    nonces: stores.nonces,
    notifier: consoleNotifier,
    address: (userId) => authAddress(stores.users, userId),
  });
  const passkeyFactor = createPasskeyFactor({
    rpId: options.rpId,
    rpName: options.rpName,
    origin: options.origin,
    sessionId: options.sessionId,
    users: stores.users,
    factors: stores.enrolments,
    credentials: stores.credentials,
    challenges: stores.challenges,
    subject: async (userId) => {
      const email = await authAddress(stores.users, userId);
      return { name: email, displayName: email };
    },
  });
  const totpFactor = createTotpAppFactor({
    keys,
    factors: stores.enrolments,
    issuer: options.rpName,
    account: (userId) => authAddress(stores.users, userId),
  });
  // Only what this deployment demands is built. A factor switched `"off"` is absent from `offered`,
  // and every page, guard and ceremony forge serves is derived from `offered` — which is what makes
  // an unselected factor invisible rather than merely unlinked.
  //
  // Declared order still decides which factor the verify page demands when two are enrolled, because
  // forge renders no chooser.
  const built: Record<StepUpFactor, AuthFactorService> = { "totp-app": totpFactor, passkey: passkeyFactor };
  const seconds = Object.entries(AUTH_SECOND_FACTORS)
    .filter(([, requirement]) => requirement !== "off")
    .map<AuthFactorOffer>(([kind, requirement]) => ({
      service: built[kind as StepUpFactor],
      role: "second",
      requirement: requirement as "mandatory" | "optional",
    }));
  return createFactorRegistry(stores.enrolments, { offered: [{ service: emailOtp, role: "primary" }, ...seconds] });
}

/** The domain services one auth request runs against — the `resolveServices` seam, built once per request. */
export function resolveAuthRequestServices(c: ForgeAppContext<AppEnv>): Promise<AuthRequestServices> {
  const resolved = authServicesCtx.getOptional(c);
  if (resolved !== undefined) return resolved;
  const building = buildAuthRequestServices(c);
  authServicesCtx.set(c, building);
  return building;
}

async function buildAuthRequestServices(c: ForgeAppContext<AppEnv>): Promise<AuthRequestServices> {
  const config = configStore.get(c.env);
  const keys = await importAuthKeyRing(config.auth.keyRing as [string, ...string[]]);
  const stores = authStores(c.env);
  const factors = authFactors(stores, keys, {
    rpId: config.site.url.hostname,
    rpName: config.auth.rpName,
    origin: config.site.url.origin,
    sessionId: sessionCtx.get(c).id,
  });
  const defer: AuthDeferral = (work) => c.executionCtx.waitUntil(work);

  return {
    users: stores.users,
    credentials: stores.credentials,
    factors,
    enrolments: stores.enrolments,
    signin: createSigninFlow({ keys, users: stores.users, factors, state: stores.otpState, nonces: stores.nonces, defer }),
    signup: createSignupFlow({ users: stores.users, factors, defer }),
    emailChange: createEmailChangeFlow({
      keys,
      users: stores.users,
      nonces: stores.nonces,
      notifier: consoleNotifier,
      defer,
      confirmUrl: (token) => `${config.site.url.origin}${routes.authEmailConfirm.href()}?token=${encodeURIComponent(token)}`,
    }),
    admin: createAdminUserService({ users: stores.adminUsers }),
  };
}

/** The middleware stack for every guarded auth route group, built off forge's own group table. */
export function authGuardGroups(): MiddlewareGuardGroup<AppEnv>[] {
  return createAuthGuards<AppEnv>({
    routes: { auth: authRouteMap, account: accountRouteMap, admin: adminRouteMap },
    auth: authIdentityOptions,
    enrolment: authEnrolmentOptions,
    // Without this the three unauthenticated POSTs — sign-in, sign-up and sign-out — carry no
    // cross-origin defence at all: their group declares no guards, so it is emitted for the origin
    // check alone.
    origin: originPolicy,
    rateLimit: { auth: authLimitPolicy, "auth.verify": authLimitPolicy, account: consoleLimitPolicy, admin: consoleLimitPolicy },
  });
}
