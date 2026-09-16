/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import { describe, expect, it } from "bun:test";

import { render } from "@y-core/forge/testing";

import { AccountView } from "../../src/views/account";

// `tests/seam/router.auth.test.ts` drives this page through the real app, which is where every case that
// can be reached that way belongs. These two branches cannot: `fakeAuthD1` answers a verified
// address for every user it holds and always carries a creation date, so nothing driven through the
// app reaches the unverified badge or the page with no date on it.
const PROPS = {
  email: "ada@example.com",
  emailVerifiedAt: 1_700_000_000_000,
  createdAt: Date.UTC(2021, 4, 17),
  factorsPath: "/account/factors",
  emailChangePath: "/account/email-change",
  signoutPath: "/auth/signout",
  signoutToken: "token",
};

const ref = (html: string, tag: string, name: string): string =>
  new RegExp(`<${tag}[^>]*\\sdata-ref="${name}"[^>]*>[\\s\\S]*?</${tag}>`).exec(html)?.[0] ?? "";

const inner = (element: string): string => element.replace(/^<[a-z]+[^>]*>/, "").replace(/<\/[a-z]+>$/, "");

const attr = (element: string, name: string): string => new RegExp(`\\s${name}="([^"]*)"`).exec(element)?.[1] ?? "";

describe("AccountView", () => {
  it("warns a visitor whose address is unconfirmed, rather than defaulting to reassurance", async () => {
    const badge = ref(await render(<AccountView {...PROPS} emailVerifiedAt={null} />), "span", "account-verified");

    expect(inner(badge)).toBe("Address unverified");
    expect(attr(badge, "data-tone")).toBe("warning");
  });

  it("confirms an address the store stamped, on the tone that reads as settled", async () => {
    const badge = ref(await render(<AccountView {...PROPS} />), "span", "account-verified");

    expect(inner(badge)).toBe("Address verified");
    expect(attr(badge, "data-tone")).toBe("success");
  });

  it("says nothing about when the account was created where the store holds no date", async () => {
    expect(ref(await render(<AccountView {...PROPS} createdAt={null} />), "p", "account-created")).toBe("");
  });

  it("renders that line when the store does hold one, so the case above is an absence and not a broken selector", async () => {
    expect(ref(await render(<AccountView {...PROPS} />), "p", "account-created")).not.toBe("");
  });
});
