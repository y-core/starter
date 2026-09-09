import { describe, expect, it } from "bun:test";

import { AUTH_PENDING_SIGNIN_SESSION_KEY, AUTH_SESSION_KEY, AUTH_SIGNED_IN_SESSION_KEY } from "@y-core/forge/auth/web";
import { createKVSessionStorage, createSignedCookie } from "@y-core/forge/session";
import { fakeAuthD1, fakeKV } from "@y-core/forge/testing";

import { resolveNavHref } from "../src/views/nav";
import { app } from "../src/worker";

describe("resolveNavHref", () => {
  const cases: Array<[string, string, string]> = [
    ["contact", "contact", "/#contact"],
    ["showcaseUi", "showcaseUi", "/showcase/ui"],
    ["showcaseLogs", "showcaseLogs", "/showcase/logs"],
    ["showcaseTheme", "showcaseTheme", "/showcase/ui/theme"],
    ["showcaseInteractive", "showcaseInteractive", "/showcase/ui/interactive"],
    ["showcaseRuntime", "showcaseRuntime", "/showcase/ui/runtime"],
    ["showcaseHtmx", "showcaseHtmx", "/showcase/ui/htmx"],
    ["showcaseChrome", "showcaseChrome", "/showcase/ui/chrome"],
    ["unknown key falls back to home route", "unknown-key", "/"],
  ];

  for (const [description, key, expected] of cases) {
    it(`resolves ${description} -> ${expected}`, () => {
      expect(resolveNavHref(key)).toBe(expected);
    });
  }
});

const CSRF_SECRET = "de7bf4aef360e3a4c3254c9cec7e45d0f1fd98cc2219c62b5b07e826ba1bcc6e";
const SESSION_SECRET = "6f2b4a7c0d3e5f7a9b1c3d5e9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e";
const AUTH_KEY_RING = "9c1c1c5f57bd50b8b2df5b6d5a51c5cb3a8e9d1e6f2b4a7c0d3e5f7a9b1c3d5e";

const USER_ID = "01890a5d-ac96-774b-bcce-b302099a8057";
const USER_EMAIL = "ada@example.com";

const MOCK_ASSETS = { fetch: async () => new Response("Not Found", { status: 404 }) } as unknown as Fetcher;

function navEnv(admin = false) {
  const kv = fakeKV();
  const db = fakeAuthD1([{ id: USER_ID, email: USER_EMAIL, isAdmin: admin, sessionsInvalidBefore: null, factors: [] }]);
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
  return { env, kv };
}

async function session(kv: ReturnType<typeof fakeKV>, values: Record<string, unknown>): Promise<string> {
  const storage = createKVSessionStorage(kv, { prefix: "sess" });
  const opened = await storage.read(null);
  for (const [key, value] of Object.entries(values)) opened.set(key, value);
  const saved = await storage.save(opened);
  if (saved === null) throw new Error("session fixture: pass at least one value, or the session is never dirty and no cookie is issued.");
  const signed = createSignedCookie("__Host-session", { secrets: [SESSION_SECRET], sameSite: "Lax" });
  return (await signed.serialize(saved)).split(";")[0] as string;
}

/** A session that exists but names nobody — what an anonymous visitor mid-sign-in carries. */
function anonymous(kv: ReturnType<typeof fakeKV>): Promise<string> {
  return session(kv, { [AUTH_PENDING_SIGNIN_SESSION_KEY]: USER_EMAIL });
}

function signedIn(kv: ReturnType<typeof fakeKV>): Promise<string> {
  return session(kv, { [AUTH_SESSION_KEY]: USER_ID, [AUTH_SIGNED_IN_SESSION_KEY]: Date.now() });
}

/** The home page as this visitor is served it, which is where the shared navbar renders. */
async function homeFor(cookie?: string, admin = false): Promise<string> {
  const { env, kv } = navEnv(admin);
  const headers: Record<string, string> = cookie === undefined ? {} : { cookie: await (cookie === "anonymous" ? anonymous(kv) : signedIn(kv)) };
  const res = await app.request("/", { headers }, env);
  expect(res.status).toBe(200);
  return res.text();
}

// `hidden` and not absence: forge stamps the attribute server-side for a flash-free first paint and
// re-applies it from the same tokens on the client, so the item is in the markup either way.
/** Whether the nav item pointing at `href` is hidden from this render's viewer. */
function itemHidden(html: string, href: string): boolean {
  const tag = new RegExp(`<a[^>]*\\shref="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`).exec(html)?.[0] ?? "";
  if (tag === "") throw new Error(`nav item for ${href} is not in the rendered page at all`);
  return /\shidden(?=[\s>=])/.test(tag);
}

/** The sign-out form's open tag, which an anonymous render must not carry at all. */
function signoutForm(html: string): string {
  return /<form[^>]*\saction="\/auth\/signout"[^>]*>/.exec(html)?.[0] ?? "";
}

/** The sign-out form's hidden token field. */
function csrfField(html: string): string {
  return /<input[^>]*\sname="_csrf"[^>]*>/.exec(html)?.[0] ?? "";
}

/** One attribute off an open tag — the whole tag is not asserted, since its class list is forge's to change. */
function attrOf(tag: string, name: string): string {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
}

// The wiring these hold, and the unit tests behind `authNav` cannot: that `Layout` passes the
// filters and slots at all. Drop either prop and the nav still renders — showing every visitor the
// administrative destinations.
describe("the navbar an identity decides", () => {
  it("offers an anonymous visitor the ways in, and hides the ways on", async () => {
    const html = await homeFor();

    expect(itemHidden(html, "/auth/signin")).toBe(false);
    expect(itemHidden(html, "/auth/signup")).toBe(false);
    expect(itemHidden(html, "/account")).toBe(true);
    expect(itemHidden(html, "/admin/users")).toBe(true);
  });

  it("renders no sign-out form for an anonymous visitor, who has nothing to sign out of", async () => {
    expect(signoutForm(await homeFor())).toBe("");
  });

  it("renders no sign-out form for a session that exists but names nobody", async () => {
    expect(signoutForm(await homeFor("anonymous"))).toBe("");
  });

  it("offers a signed-in member their account and hides the ways in", async () => {
    const html = await homeFor("signedIn");

    expect(itemHidden(html, "/auth/signin")).toBe(true);
    expect(itemHidden(html, "/auth/signup")).toBe(true);
    expect(itemHidden(html, "/account")).toBe(false);
  });

  // An ordinary member offered the users list would be linked to a 403, so the item carries the
  // admin token rather than the signed-in one.
  it("hides the administrative destination from an ordinary member", async () => {
    expect(itemHidden(await homeFor("signedIn"), "/admin/users")).toBe(true);
  });

  it("offers an administrator both their account and the users list", async () => {
    const html = await homeFor("signedIn", true);

    expect(itemHidden(html, "/account")).toBe(false);
    expect(itemHidden(html, "/admin/users")).toBe(false);
  });

  it("gives a signed-in member a sign-out form that posts to the sign-out path under a token", async () => {
    const html = await homeFor("signedIn");
    const form = signoutForm(html);

    expect(attrOf(form, "action")).toBe("/auth/signout");
    expect(attrOf(form, "method")).toBe("post");
    expect(attrOf(csrfField(html), "name")).toBe("_csrf");
    expect(attrOf(csrfField(html), "value")).not.toBe("");
  });
});
