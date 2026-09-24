import { CoreIcon } from "@assets";
import type {
  AuthDeferral,
  AuthFactorOffer,
  AuthFactorRegistry,
  AuthFactorService,
  AuthKeyRing,
  AuthNotifier,
  UserStore,
} from "@y-core/forge/auth";
import {
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
import { authEnrolmentPaths, authPaths } from "@y-core/forge/auth/web";
import type { AppContext as ForgeAppContext, Middleware } from "@y-core/forge/context";
import { contextVar, getAppContext } from "@y-core/forge/context";
import { createSignedCookie, createKVSessionStorage, sessionCtx, sessionMiddleware } from "@y-core/forge/session";
import { createD1Client } from "@y-core/forge/storage/db";

import { configStore } from "../../app/config";
import { devAllowanceCtx } from "../../app/dev";
import type { AppConfig, AppEnv } from "../../app/types";
import { accountRouteMap, adminRouteMap, authPageRouteMap, authRouteMap } from "../routes";
import { createConsoleNotifier } from "../services/auth.notify";
import { AUTH_SECOND_FACTORS } from "./config";
import type { StepUpFactor } from "./types";

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
  // Where a completed sign-in lands. Forge defaults it to the passkey list, which a deployment that
  // switched passkeys off must not send anyone to.
  settledPath: authPageRouteMap.account.href(),
  // The whole gate on the first-admin claim: forge grants the role to whoever presents this, and
  // answers 404 where no deployment configured one.
  bootstrapSecret: (c) => configStore.get(c.env).auth.bootstrapSecret,
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
  factors: async (c) => (await resolveAuthRequestServices(c)).factors,
  stepUpPath: authWebPaths.auth.verify.show(),
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
  settledPath: authPageRouteMap.account.href(),
  freshStepUpMaxAgeMs: STEP_UP_WINDOW_MS,
};

function authStores(env: AppEnv) {
  const db = createD1Client(env.DB);
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

// Reclaims space rather than correctness — every read already holds a row against the clock — but it
// throws, because a scheduled run that silently stopped reclaiming is a disk that silently fills.
/** Deletes the expired challenge and nonce rows, driven by the worker's scheduled handler. */
export async function purgeAuthStores(env: AppEnv): Promise<void> {
  const outcome = await purgeAuthEphemera(createD1Client(env.DB), Date.now());
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
  /** Delivers every code and link this request issues; one instance, shared by the factors and the flows. */
  readonly notifier: AuthNotifier;
}

function authFactors(stores: AuthStores, keys: AuthKeyRing, options: AuthFactorOptions): AuthFactorRegistry {
  const emailOtp = createEmailOtpFactor({
    keys,
    state: stores.otpState,
    nonces: stores.nonces,
    notifier: options.notifier,
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
  // Declared order decides which factor the verify page demands when two are enrolled, because forge
  // renders no chooser.
  const built: Record<StepUpFactor, AuthFactorService> = { "totp-app": totpFactor, passkey: passkeyFactor };
  // Every page, guard and ceremony forge serves derives from `offered`, so a factor filtered out here
  // is invisible rather than merely unlinked.
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
  // The same gate `logsController` uses: a token only `worker.dev.ts` mints, where an env var
  // would be a value a production deployment could set.
  const notifier = createConsoleNotifier(devAllowanceCtx.getOptional(c) !== undefined);
  const factors = authFactors(stores, keys, {
    rpId: config.site.url.hostname,
    rpName: config.auth.rpName,
    origin: config.site.url.origin,
    sessionId: sessionCtx.get(c).id,
    notifier,
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
      notifier,
      defer,
      confirmUrl: (token) => `${config.site.url.origin}${authPageRouteMap.authEmailConfirm.href()}?token=${encodeURIComponent(token)}`,
    }),
    admin: stores.adminUsers,
  };
}
