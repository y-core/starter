import { describe, expect, it } from "bun:test";

import { AUTH_PENDING_SIGNIN_SESSION_KEY, AUTH_SESSION_KEY, AUTH_SIGNED_IN_SESSION_KEY } from "@y-core/forge/auth/web";
import { createKVSessionStorage, createSignedCookie } from "@y-core/forge/session";
import { attrOf, attrsOf, elementOf, fakeAuthD1, fakeKV, tagOf } from "@y-core/forge/testing";

import { app } from "../../../src/worker";
import { CONFIG_ENV, createTestBindings, SESSION_SECRET } from "../../env";

const USER_ID = "01890a5d-ac96-774b-bcce-b302099a8057";
const USER_EMAIL = "ada@example.com";

const MOCK_ASSETS = { fetch: async () => new Response("Not Found", { status: 404 }) } as unknown as Fetcher;

function navEnv(admin = false) {
  const kv = fakeKV();
  const db = fakeAuthD1([{ id: USER_ID, email: USER_EMAIL, isAdmin: admin, sessionsInvalidBefore: null, factors: [] }]);
  const env = {
    ASSETS: MOCK_ASSETS,
    SITE_ORIGIN: "https://example.com",
    ...CONFIG_ENV,
    ...createTestBindings(),
    AUTH_KV: kv,
    DB: db,
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
  const tag = tagOf(html, `href="${href}"`);
  if (tag === "") throw new Error(`nav item for ${href} is not in the rendered page at all`);
  return "hidden" in attrsOf(tag);
}

/** The sign-out form's open tag, which an anonymous render must not carry at all. */
function signoutForm(html: string): string {
  return tagOf(html, 'action="/auth/signout"');
}

/** The sign-out form's hidden token field. */
function csrfField(html: string): string {
  return tagOf(html, 'name="_csrf"');
}

// Drop either the filters or the slots prop and the nav still renders — showing every visitor the
// administrative destinations — which is why these are driven through `Layout` and not `authNav`.
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

  it("closes the bar with the Account menu, which follows every other entry", async () => {
    const nav = elementOf(await homeFor(), "nav", 'aria-label="Primary"');
    const entries = [...nav.matchAll(/data-slot="(menu-trigger|navbar-link)"[^>]*>\s*(?:<span>)?([^<]*)/g)].map(([, slot, label]) => ({
      slot,
      label,
    }));

    expect(entries.at(-1)).toEqual({ slot: "menu-trigger", label: "Account" });
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
