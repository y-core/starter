import { describe, expect, it } from "bun:test";

import { AUTH_SESSION_MAX_MS, createEmailChangeFlow, createNonceStore, createUserStore, importAuthKeyRing } from "@y-core/forge/auth";
import { AUTH_PENDING_SIGNIN_SESSION_KEY, AUTH_SESSION_KEY, AUTH_SIGNED_IN_SESSION_KEY, AUTH_STEP_UP_SESSION_KEY } from "@y-core/forge/auth/web";
import { ok } from "@y-core/forge/result";
import { createKVSessionStorage, createSignedCookie } from "@y-core/forge/session";
import { createD1Client } from "@y-core/forge/storage/db";
import { fakeAuthD1, fakeKV, mintTestCsrfToken } from "@y-core/forge/testing";

import type { StepUpFactor } from "../src/app/types";
import { routes } from "../src/routes";
import { app } from "../src/worker";

const CSRF_SECRET = "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e";
const SESSION_SECRET = "6f2b4a7c0d3e5f7a9b1c3d5e9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e";
const AUTH_KEY_RING = "9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e6f2b4a7c0d3e5f7a9b1c3d5e";

const USER_ID = "01890a5d-ac96-774b-bcce-b302099a8057";
const USER_EMAIL = "ada@example.com";
const UNKNOWN_EMAIL = "grace@example.com";
const NEW_EMAIL = "ada.lovelace@example.com";

const SIGNIN_PATH = "/auth/signin";
const SIGNUP_PATH = "/auth/signup";
const ENROL_FINISH_PATH = "/auth/enrol/passkey/register/finish";

const NOT_SIGNED_IN = '{"error":"Not signed in."}';
const CEREMONY_REFUSED = '{"error":"The passkey was not accepted."}';
const NOTHING_OWED = '{"error":"This account owes no factor enrolment."}';
const STEP_UP_OWED = '{"error":"This account owes a step-up verification."}';

const CONFIRMED = "Your email address has been changed.";
const REFUSED = "That confirmation link is no longer valid. Request the change again from your account.";

/** Every lowercase discriminant of `AuthSigninReason`, `AuthEmailChangeReason` and `AuthStoreError` a body must never echo. */
const REASON_WORDS = [
  "unrecognised",
  "unavailable",
  "consumed",
  "expired",
  "deactivated",
  "unchanged",
  "throttled",
  "conflict",
  "not-found",
  "invalid",
];

const MOCK_ASSETS = { fetch: async () => new Response("Not Found", { status: 404 }) } as unknown as Fetcher;

interface AuthState {
  admin?: boolean;
  /** The second factors this account holds, confirmed. Absent is an account that enrolled none. */
  factors?: readonly StepUpFactor[];
  sessionsInvalidBefore?: number;
}

// Every factor this app mandates, plus the one it merely offers: the state of an account that owes
// nothing at all. Anything less owes an enrolment, which is the point of the mandatory requirement.
const SETTLED: readonly StepUpFactor[] = ["totp-app", "passkey"];

function authEnv(state: AuthState = {}) {
  const kv = fakeKV();
  const db = fakeAuthD1([
    {
      id: USER_ID,
      email: USER_EMAIL,
      isAdmin: state.admin === true,
      sessionsInvalidBefore: state.sessionsInvalidBefore ?? null,
      factors: (state.factors ?? []).map((kind) => ({ kind })),
    },
  ]);
  const env = {
    ASSETS: MOCK_ASSETS,
    SITE_ORIGIN: "https://example.com",
    CSRF_SECRET,
    EMAIL_API_KEY: "test-api-key",
    EMAIL_FROM: "from@example.com",
    EMAIL_TO: "to@example.com",
    TURNSTILE_SECRET_KEY: "test-ts-key",
    TURNSTILE_SITE_KEY: "test-site-key",
    AUTH_KEY_RING,
    SESSION_SECRET,
    AUTH_KV: kv,
    AUTH_DB: db,
  } as unknown as Env;
  return { env, kv, db };
}

async function session(kv: ReturnType<typeof fakeKV>, values: Record<string, unknown>): Promise<{ cookie: string; id: string }> {
  const storage = createKVSessionStorage(kv, { prefix: "sess" });
  const opened = await storage.read(null);
  for (const [key, value] of Object.entries(values)) opened.set(key, value);
  const saved = await storage.save(opened);
  if (saved === null) throw new Error("session fixture: pass at least one value, or the session is never dirty and no cookie is issued.");
  const signed = createSignedCookie("__Host-session", { secrets: [SESSION_SECRET], sameSite: "Lax" });
  return { cookie: (await signed.serialize(saved)).split(";")[0] as string, id: opened.id };
}

function anonymous(kv: ReturnType<typeof fakeKV>) {
  return session(kv, { [AUTH_PENDING_SIGNIN_SESSION_KEY]: USER_EMAIL });
}

// The stamp is minted here because `establishAuthSession` mints one: a session carrying no stamp is
// revoked rather than admitted, so a fixture without it proves nothing about the guard it clears.
function signedIn(kv: ReturnType<typeof fakeKV>, steppedUp = false, signedInAt = Date.now()) {
  return session(kv, {
    [AUTH_SESSION_KEY]: USER_ID,
    [AUTH_SIGNED_IN_SESSION_KEY]: signedInAt,
    ...(steppedUp ? { [AUTH_STEP_UP_SESSION_KEY]: Date.now() } : {}),
  });
}

function headingOf(html: string): string {
  return /<h1[^>]*>[^<]*<\/h1>/.exec(html)?.[0] ?? "";
}

function paragraphOf(html: string): string {
  return /<p class="text-muted-foreground">[^<]*<\/p>/.exec(html)?.[0] ?? "";
}

// A browser submits every named control the form rendered, not the two fields a test remembered to
// build — so a field a view grows and the action does not accept fails here rather than in production.
/** Every `name`/`value` pair of the first form in `html`, as the body a browser would post. */
function formBody(html: string, typed: Record<string, string> = {}): URLSearchParams {
  const form = /<form[^>]*>[\s\S]*?<\/form>/.exec(html)?.[0] ?? "";
  const body = new URLSearchParams();
  for (const match of form.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const tag = match[2] ?? "";
    const name = /\sname="([^"]*)"/.exec(tag)?.[1];
    if (name === undefined) continue;
    body.set(name, typed[name] ?? /\svalue="([^"]*)"/.exec(tag)?.[1] ?? "");
  }
  return body;
}

async function post(path: string, env: Env, cookie: string, token: string, body: BodyInit, contentType?: string): Promise<Response> {
  return app.request(
    path,
    { method: "POST", headers: { cookie, "X-CSRF-Token": token, ...(contentType === undefined ? {} : { "content-type": contentType }) }, body },
    env,
  );
}

/** Mints a real email-change token against the same key ring and nonce store the mounted app reads. */
async function emailChangeToken(db: ReturnType<typeof fakeAuthD1>): Promise<string> {
  let issued = "";
  const deferred: Promise<unknown>[] = [];
  const flow = createEmailChangeFlow({
    keys: await importAuthKeyRing([AUTH_KEY_RING]),
    users: createUserStore(createD1Client(db)),
    nonces: createNonceStore(createD1Client(db), { prefix: "nonce" }),
    notifier: {
      send: (message) => {
        issued = message.url ?? "";
        return Promise.resolve(ok());
      },
    },
    defer: (work) => {
      deferred.push(work);
    },
    confirmUrl: (token) => token,
  });
  await flow.request(USER_ID, NEW_EMAIL, Date.now());
  await Promise.all(deferred);
  return issued;
}

describe("auth mount", () => {
  it("serves the sign-in page from the mounted auth route map", async () => {
    const { env } = authEnv();
    const res = await app.request(SIGNIN_PATH, {}, env);
    expect(res.status).toBe(200);
    expect(headingOf(await res.text())).toBe('<h1 class="text-xl">Sign in</h1>');
  });

  it("serves the sign-up page from the mounted auth route map", async () => {
    const { env } = authEnv();
    const res = await app.request(SIGNUP_PATH, {}, env);
    expect(res.status).toBe(200);
    expect(headingOf(await res.text())).toBe('<h1 class="text-xl">Create an account</h1>');
  });

  it("carries the security headers onto a guard refusal", async () => {
    const { env } = authEnv();
    const res = await app.request("/account/passkeys", {}, env);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});

describe("requireAuth on /account", () => {
  it("sends an anonymous visitor to sign-in with the return path", async () => {
    const { env } = authEnv();
    const res = await app.request("/account/passkeys", {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/signin?next=%2Faccount%2Fpasskeys");
  });

  it("admits a signed-in visitor who owes nothing", async () => {
    const { env, kv } = authEnv({ factors: SETTLED });
    const { cookie } = await signedIn(kv, true);
    const res = await app.request("/account/passkeys", { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    expect(headingOf(await res.text())).toBe('<h1 class="text-xl">Your passkeys</h1>');
  });
});

// Each of these differs from the admitted visitor above in exactly one fact about the session, and
// every one of them is a sign-in the mounted guard has to refuse rather than merely fail to renew.
describe("the absolute session lifetime and the revocation barrier", () => {
  const SIGNIN_NEXT = "/auth/signin?next=%2Faccount%2Fpasskeys";

  it("refuses a session carrying no sign-in stamp", async () => {
    const { env, kv } = authEnv({ factors: SETTLED });
    const { cookie } = await session(kv, { [AUTH_SESSION_KEY]: USER_ID, [AUTH_STEP_UP_SESSION_KEY]: Date.now() });
    const res = await app.request("/account/passkeys", { headers: { cookie } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SIGNIN_NEXT);
  });

  it("refuses a session established longer ago than the absolute lifetime", async () => {
    const { env, kv } = authEnv({ factors: SETTLED });
    const { cookie } = await signedIn(kv, true, Date.now() - AUTH_SESSION_MAX_MS);
    const res = await app.request("/account/passkeys", { headers: { cookie } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SIGNIN_NEXT);
  });

  it("refuses a session established at the account's revocation barrier", async () => {
    const barrier = Date.now() - 1000;
    const { env, kv } = authEnv({ factors: SETTLED, sessionsInvalidBefore: barrier });
    const { cookie } = await signedIn(kv, true, barrier);
    const res = await app.request("/account/passkeys", { headers: { cookie } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(SIGNIN_NEXT);
  });
});

// This app ships `AUTH_SECOND_FACTORS = { "totp-app": "mandatory", passkey: "optional" }`, so an
// account owes an authenticator app before it reaches any signed-in page, and may add a passkey
// besides. Flipping that switch is what each of these four would change.
describe("the second-factor configuration this app ships", () => {
  // This app's own page carries the same two guards forge's account group does. Without the
  // enrolment guard it would render to a visitor still owing the factor the deployment demands,
  // which reads a mandatory second factor as optional.
  it("sends a signed-in visitor owing the mandatory factor to the page that enrols it", async () => {
    const { env, kv } = authEnv();
    const { cookie } = await signedIn(kv);
    const res = await app.request(routes.account.href(), { headers: { cookie } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/enrol/totp");
  });

  it("sends an anonymous visitor to sign in, carrying the page it was asked for", async () => {
    const { env } = authEnv();
    const res = await app.request(routes.account.href(), {}, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/signin?next=%2Faccount");
  });

  // The gap the per-factor requirement closes. An account holding only the optional passkey used to
  // read as settled — it had *a* second factor — so the deployment that believes it mandates the
  // authenticator app did not. `resolve` now names only what is owed, and the visitor lands on it.
  it("owes the mandatory factor to a visitor who enrolled only the optional one", async () => {
    const { env, kv } = authEnv({ factors: ["passkey"] });
    const { cookie } = await signedIn(kv, true);
    const res = await app.request(routes.account.href(), { headers: { cookie } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/auth/enrol/totp");
  });

  it("names the mandatory factor as the enrolment a settled visitor is bounced from", async () => {
    const { env, kv } = authEnv({ factors: SETTLED });
    const { cookie } = await signedIn(kv, true);
    const res = await app.request("/auth/enrol/totp", { headers: { cookie } }, env);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(routes.account.href());
  });
});

describe("the JSON enrolment ceremony group", () => {
  it("refuses an anonymous finish with JSON and never a redirect", async () => {
    const { env, kv } = authEnv();
    const { cookie, id } = await anonymous(kv);
    const token = await mintTestCsrfToken(CSRF_SECRET, ENROL_FINISH_PATH, { subject: id });
    const res = await post(ENROL_FINISH_PATH, env, cookie, token, "{}", "application/json");
    expect(res.status).toBe(401);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(await res.text()).toBe(NOT_SIGNED_IN);
  });

  it("admits a signed-in visitor who genuinely owes an enrolment", async () => {
    const { env, kv } = authEnv();
    const { cookie, id } = await signedIn(kv);
    const token = await mintTestCsrfToken(CSRF_SECRET, ENROL_FINISH_PATH, { subject: id });
    const res = await post(ENROL_FINISH_PATH, env, cookie, token, "{}", "application/json");
    expect(res.status).toBe(400);
    expect(await res.text()).toBe(CEREMONY_REFUSED);
  });

  it("refuses a visitor owing a step-up rather than letting them enrol around it", async () => {
    const { env, kv } = authEnv({ factors: ["totp-app"] });
    const { cookie, id } = await signedIn(kv);
    const token = await mintTestCsrfToken(CSRF_SECRET, ENROL_FINISH_PATH, { subject: id });
    const res = await post(ENROL_FINISH_PATH, env, cookie, token, "{}", "application/json");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(STEP_UP_OWED);
  });

  it("refuses a settled visitor with JSON", async () => {
    const { env, kv } = authEnv({ factors: SETTLED });
    const { cookie, id } = await signedIn(kv, true);
    const token = await mintTestCsrfToken(CSRF_SECRET, ENROL_FINISH_PATH, { subject: id });
    const res = await post(ENROL_FINISH_PATH, env, cookie, token, "{}", "application/json");
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(NOTHING_OWED);
  });

  it("refuses a finish carrying no CSRF token before the auth guard sees it", async () => {
    const { env, kv } = authEnv();
    const { cookie } = await anonymous(kv);
    const res = await app.request(ENROL_FINISH_PATH, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" }, env);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
  });
});

describe("requireAdmin on /admin", () => {
  it("refuses a non-admin the user list", async () => {
    const { env, kv } = authEnv({ factors: SETTLED });
    const { cookie } = await signedIn(kv, true);
    const res = await app.request("/admin/users", { headers: { cookie } }, env);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
  });

  it("admits an admin to the user list", async () => {
    const { env, kv } = authEnv({ factors: SETTLED, admin: true });
    const { cookie } = await signedIn(kv, true);
    const res = await app.request("/admin/users", { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    expect(headingOf(await res.text())).toBe('<h1 class="text-xl font-semibold text-foreground">Users</h1>');
  });

  it("admits a non-admin to the elevation bootstrap, which is deliberately not admin-gated", async () => {
    const { env, kv } = authEnv({ factors: SETTLED });
    const { cookie } = await signedIn(kv, true);
    const res = await app.request("/admin/elevate", { headers: { cookie } }, env);
    expect(res.status).toBe(200);
    expect(headingOf(await res.text())).toBe('<h1 class="text-xl">Claim the administrator role</h1>');
  });
});

describe("authCsrfGuard on the auth prefixes", () => {
  it("refuses a sign-in submission carrying no token", async () => {
    const { env, kv } = authEnv();
    const { cookie } = await anonymous(kv);
    const res = await app.request(SIGNIN_PATH, { method: "POST", headers: { cookie }, body: new URLSearchParams({ email: USER_EMAIL }) }, env);
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
  });

  it("refuses a token minted for a different path", async () => {
    const { env, kv } = authEnv();
    const { cookie, id } = await anonymous(kv);
    const token = await mintTestCsrfToken(CSRF_SECRET, SIGNUP_PATH, { subject: id });
    const res = await post(SIGNIN_PATH, env, cookie, token, new URLSearchParams({ email: USER_EMAIL }));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
  });

  it("refuses a token minted under another session id", async () => {
    const { env, kv } = authEnv();
    const { cookie } = await anonymous(kv);
    const other = await anonymous(kv);
    const token = await mintTestCsrfToken(CSRF_SECRET, SIGNIN_PATH, { subject: other.id });
    const res = await post(SIGNIN_PATH, env, cookie, token, new URLSearchParams({ email: USER_EMAIL }));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
  });

  it("admits a path-bound token minted under this session", async () => {
    const { env, kv } = authEnv();
    const { cookie, id } = await anonymous(kv);
    const token = await mintTestCsrfToken(CSRF_SECRET, SIGNIN_PATH, { subject: id });
    const res = await post(SIGNIN_PATH, env, cookie, token, new URLSearchParams({ email: USER_EMAIL }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/auth/verify");
  });
});

// Every other mutation case here pre-persists a session with `anonymous(kv)`, which is what a real
// first-time visitor does not have. The token is bound to a session id, so the id has to survive the
// GET that minted it: forge marks the session dirty when the CSRF subject resolver reads `.id`, and
// this is the consumer-side proof that the resulting `Set-Cookie` carries the same session into the POST.
describe("a first-time visitor with no session at all", () => {
  it("accepts the sign-up its own signed-out page rendered", async () => {
    const { env } = authEnv();
    const page = await app.request(SIGNUP_PATH, {}, env);
    const html = await page.text();
    const cookie = (page.headers.get("set-cookie") ?? "").split(";")[0] as string;

    expect(cookie).toStartWith("__Host-session=");

    const token = /<input[^>]*data-slot="form-csrf"[^>]*\svalue="([^"]*)"/.exec(html)?.[1] ?? "";
    const res = await post(SIGNUP_PATH, env, cookie, token, formBody(html, { email: UNKNOWN_EMAIL }));

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/auth/verify");
  });
});

describe("sign-up enumeration parity", () => {
  it("answers a known and an unknown address with the same status and body", async () => {
    const known = authEnv();
    const knownSession = await anonymous(known.kv);
    const knownToken = await mintTestCsrfToken(CSRF_SECRET, SIGNUP_PATH, { subject: knownSession.id });
    const first = await post(SIGNUP_PATH, known.env, knownSession.cookie, knownToken, new URLSearchParams({ email: USER_EMAIL }));

    const unknown = authEnv();
    const unknownSession = await anonymous(unknown.kv);
    const unknownToken = await mintTestCsrfToken(CSRF_SECRET, SIGNUP_PATH, { subject: unknownSession.id });
    const second = await post(SIGNUP_PATH, unknown.env, unknownSession.cookie, unknownToken, new URLSearchParams({ email: UNKNOWN_EMAIL }));

    expect(second.status).toBe(first.status);
    expect(second.headers.get("location")).toBe(first.headers.get("location"));
    expect(await second.text()).toBe(await first.text());
  });
});

describe("refusal redaction", () => {
  it("echoes no domain refusal reason from any guarded refusal", async () => {
    const { env, kv } = authEnv({ factors: SETTLED });
    const { cookie, id } = await signedIn(kv, true);
    const token = await mintTestCsrfToken(CSRF_SECRET, ENROL_FINISH_PATH, { subject: id });
    const bodies = await Promise.all([
      app.request("/account/passkeys", {}, env).then((res) => res.text()),
      app.request("/admin/users", { headers: { cookie } }, env).then((res) => res.text()),
      post(ENROL_FINISH_PATH, env, cookie, token, "{}", "application/json").then((res) => res.text()),
      app.request("/auth/email-change/confirm?token=not-a-token", {}, env).then((res) => res.text()),
    ]);
    expect(bodies.flatMap((body) => REASON_WORDS.filter((word) => body.includes(word)))).toEqual([]);
  });
});

describe("GET /auth/email-change/confirm", () => {
  it("moves the address and reports success for a token issued to it", async () => {
    const { env, db } = authEnv();
    const token = await emailChangeToken(db);
    const res = await app.request(`/auth/email-change/confirm?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(200);
    expect(paragraphOf(await res.text())).toBe(`<p class="text-muted-foreground">${CONFIRMED}</p>`);
  });

  it("refuses the same token a second time", async () => {
    const { env, db } = authEnv();
    const token = await emailChangeToken(db);
    await app.request(`/auth/email-change/confirm?token=${encodeURIComponent(token)}`, {}, env);
    const res = await app.request(`/auth/email-change/confirm?token=${encodeURIComponent(token)}`, {}, env);
    expect(res.status).toBe(400);
    expect(paragraphOf(await res.text())).toBe(`<p class="text-muted-foreground">${REFUSED}</p>`);
  });

  it("refuses a request carrying no token", async () => {
    const { env } = authEnv();
    const res = await app.request("/auth/email-change/confirm", {}, env);
    expect(res.status).toBe(400);
    expect(paragraphOf(await res.text())).toBe(`<p class="text-muted-foreground">${REFUSED}</p>`);
  });

  it("refuses a malformed token without echoing why", async () => {
    const { env } = authEnv();
    const res = await app.request("/auth/email-change/confirm?token=%20not.a.token%20", {}, env);
    expect(res.status).toBe(400);
    expect(paragraphOf(await res.text())).toBe(`<p class="text-muted-foreground">${REFUSED}</p>`);
  });
});

// The two proofs that forge's auth views are placeable: one page this app owns renders forge's own
// sign-in card inside this app's chrome, and the email-change confirmation — which is no
// `AuthViewName`, so it reaches no forge renderer at all — now shares that same chrome.
describe("GET /welcome — forge's sign-in card on a route this app owns", () => {
  it("renders the app's own layout around it, with the app's heading above the card's", async () => {
    const { env } = authEnv();
    const res = await app.request("/welcome", {}, env);
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(headingOf(html)).toBe('<h1 class="font-serif text-3xl font-semibold text-balance">Welcome back</h1>');
    expect(/<h2[^>]*>[^<]*<\/h2>/.exec(html)?.[0]).toBe('<h2 class="text-xl">Sign in</h2>');
    expect(html).toInclude('id="primary-nav"');
  });

  // The token an embedded form carries is worth nothing unless the guarded path it posts to accepts
  // it, so this drives the submission rather than comparing two tokens minted under two sessions.
  it("mints a token the mounted sign-in path accepts, on the action that path serves", async () => {
    const { env, kv } = authEnv();
    const { cookie } = await anonymous(kv);
    const html = await (await app.request("/welcome", { headers: { cookie } }, env)).text();

    expect(/<form[^>]*\saction="([^"]*)"/.exec(html)?.[1]).toBe(SIGNIN_PATH);
    const token = /<input[^>]*data-slot="form-csrf"[^>]*\svalue="([^"]*)"/.exec(html)?.[1] ?? "";

    const res = await post(SIGNIN_PATH, env, cookie, token, formBody(html, { email: USER_EMAIL }));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/auth/verify");
  });
});

describe("the email-change confirmation shares the app's own layout", () => {
  it("renders the app's chrome around the outcome it reports", async () => {
    const { env, db } = authEnv();
    const token = await emailChangeToken(db);
    const html = await (await app.request(`/auth/email-change/confirm?token=${encodeURIComponent(token)}`, {}, env)).text();

    expect(paragraphOf(html)).toBe(`<p class="text-muted-foreground">${CONFIRMED}</p>`);
    expect(html).toInclude('id="primary-nav"');
  });
});
