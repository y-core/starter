import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { jsx } from "@y-core/forge/jsx/jsx-runtime";
import { attrOf, attrsOf, elementOf, fakeD1, fakeKV, innerOf, mintTestCsrfToken, render } from "@y-core/forge/testing";
import { Button } from "@y-core/forge/ui/core";

import { app } from "../../../src/worker";
import { CONFIG_ENV, CSRF_SECRET } from "../../env";

const SITE_ORIGIN = "https://example.com";

const MINIMUM_ENV = {
  ASSETS: { fetch: async () => new Response("", { status: 200 }) },
  SITE_ORIGIN,
  ...CONFIG_ENV,
  AUTH_KV: fakeKV(),
  DB: fakeD1(),
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} as unknown as Env;

/** Cloudflare's published origin for the Turnstile script, its siteverify call and its challenge frame. */
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

const EMAIL_API_URL = "https://api.mailchannels.net/tx/v1/send";
const TURNSTILE_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/siteverify`;

const SUCCESS_HTML =
  '<div class="rounded-2xl border border-status-success-border bg-status-success-subtle px-4 py-3 text-sm text-status-success-subtle-foreground" data-success><p>Thanks. We&#39;ll review your note and get back to you soon.</p></div>';

let savedFetch: typeof globalThis.fetch;

beforeAll(() => {
  savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, ...args) => {
    if (url.toString() === EMAIL_API_URL) return new Response(null, { status: 202 });
    if (url.toString() === TURNSTILE_URL) return new Response(JSON.stringify({ success: true, hostname: "example.com" }));
    return savedFetch(url, ...args);
  };
});

afterAll(() => {
  globalThis.fetch = savedFetch;
});

async function homeHtml(): Promise<string> {
  return (await app.request("/", {}, MINIMUM_ENV)).text();
}

/** Every `<a>` in `html`, whole, with its attributes, label and offset. */
function anchors(html: string): { markup: string; attrs: Record<string, string>; label: string; at: number }[] {
  return [...html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map((match) => ({
    markup: match[0],
    attrs: attrsOf(match[0]),
    label: innerOf(match[0]),
    at: match.index ?? -1,
  }));
}

function submit(token: string): Promise<Response> {
  const body = new URLSearchParams({
    name: "Jane Example",
    email: "jane@example.com",
    message: "I would like help building a digital product.",
    "cf-turnstile-response": "test-token",
  });
  return app.request(
    "/api/contact",
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "HX-Request": "true",
        Origin: SITE_ORIGIN,
        "CF-Connecting-IP": "203.0.113.1",
        "X-CSRF-Token": token,
      },
      body: body.toString(),
    },
    MINIMUM_ENV,
  );
}

describe("the contact section on GET /", () => {
  it("includes the contact form with hx-post and result target", async () => {
    const text = await homeHtml();
    expect(attrOf(text, "hx-post", 'data-ref="contact-form"')).toBe("/api/contact");
    expect(attrOf(text, "hx-target", 'data-ref="contact-form"')).toBe("#contact-result");
    expect(attrsOf(text, 'id="contact-result"')).toEqual({ "data-ref": "contact-result", id: "contact-result", "aria-live": "polite" });
  });
});

describe("the contact slice's links", () => {
  it("puts one Contact link to /#contact in the bar", async () => {
    const bar = anchors(await homeHtml()).filter((link) => link.attrs["data-slot"] === "navbar-link" && link.attrs.href === "/#contact");

    expect(bar.map((link) => link.label)).toEqual(["Contact"]);
  });

  it("places the Contact link directly after the Logs link", async () => {
    const nav = elementOf(await homeHtml(), "nav", 'aria-label="Primary"');
    const labels = [...nav.matchAll(/data-slot="(?:menu-trigger|navbar-link)"[^>]*>\s*(?:<span>)?([^<]*)/g)].map(([, label = ""]) => label);
    const logs = labels.indexOf("Logs");

    expect(logs).toBeGreaterThan(-1);
    expect(labels.slice(logs, logs + 2)).toEqual(["Logs", "Contact"]);
  });

  it("gives the footer nav exactly one link, Contact to /#contact", async () => {
    const footer = elementOf(await homeHtml(), "nav", 'aria-label="Footer"');

    expect(anchors(footer).map((link) => ({ href: link.attrs.href, label: link.label }))).toEqual([{ href: "/#contact", label: "Contact" }]);
  });

  it("gives the hero a primary 'Start a project' and an outline 'Get in touch', both to #contact", async () => {
    const primary = await render(
      jsx(Button as never, { asChild: true, size: "lg", children: jsx("a", { href: "#contact", children: "Start a project" }) }),
    );
    const outline = await render(
      jsx(Button as never, {
        asChild: true,
        size: "lg",
        tone: "neutral",
        appearance: "outline",
        children: jsx("a", { href: "#contact", children: "Get in touch" }),
      }),
    );
    const hero = elementOf(await homeHtml(), "section", 'id="home"');

    expect(anchors(hero).map((link) => link.markup)).toEqual([primary, outline]);
  });
});

describe("the contact form's CSRF token, minted on GET / and verified on POST /api/contact", () => {
  it("accepts the token the home page rendered", async () => {
    const token = /name="_csrf" value="([^"]*)"/.exec(await homeHtml())?.[1] ?? "";
    const res = await submit(token);

    expect(token).not.toBe("");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(SUCCESS_HTML);
  });

  it("refuses a token minted for another path", async () => {
    const res = await submit(await mintTestCsrfToken(CSRF_SECRET, "/auth/signin"));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe("Forbidden");
  });
});
