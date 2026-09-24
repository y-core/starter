/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */

import { describe, expect, it } from "bun:test";

import { render } from "@y-core/forge/testing";

import { TURNSTILE_DEMO_DEFAULTS, TURNSTILE_TEST_KEYS } from "../../../src/showcase/model/turnstile";
import type { TurnstileDemoOptions } from "../../../src/showcase/model/types";
import { ShowcaseContent } from "../../../src/showcase/views/components";
import {
  SHOW_TURNSTILE_VERDICT_ID,
  TurnstileVerdictFragment,
  turnstileSiteKey,
  turnstileSnippet,
} from "../../../src/showcase/views/turnstile-demo";
import { sectionBodies } from "./coverage.fixture";

const page = (turnstile: TurnstileDemoOptions = TURNSTILE_DEMO_DEFAULTS) => render(<ShowcaseContent data={{ turnstile }} page='turnstile' />);

const bodyOf = async (id: string, turnstile?: TurnstileDemoOptions) => sectionBodies(await page(turnstile)).get(id) ?? "";

const attrOf = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;

const widgetsIn = (html: string) => [...html.matchAll(/<div[^>]*data-ref="turnstile"[^>]*>/g)].map((match) => match[0]);

/** Every code block the band prints, which is where the reproducing snippet lands. */
const snippetsIn = (html: string) => [...html.matchAll(/<code[^>]*>([\s\S]*?)<\/code>/g)].map((match) => match[1]);

/** A verdict alert's tone, title and description — each string pinned to the slot carrying it. */
const alertParts = (html: string) => [
  attrOf(html.match(/<div[^>]*data-slot="alert"[^>]*>/)?.[0] ?? "", "data-tone"),
  html.match(/<div[^>]*data-slot="alert-title"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? null,
  html.match(/<div[^>]*data-slot="alert-description"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? null,
];

describe("turnstileSiteKey", () => {
  it("resolves the preset the options name", () => {
    expect(turnstileSiteKey({ ...TURNSTILE_DEMO_DEFAULTS, key: "block" })).toBe("2x00000000000000000000AB");
  });

  it("answers the always-passes key for a preset that does not exist", () => {
    expect(turnstileSiteKey({ ...TURNSTILE_DEMO_DEFAULTS, key: "nonesuch" })).toBe("1x00000000000000000000AA");
  });
});

describe("turnstileSnippet", () => {
  it("prints only the sitekey when every other option is its default", () => {
    expect(turnstileSnippet(TURNSTILE_DEMO_DEFAULTS)).toBe("<Turnstile siteKey='1x00000000000000000000AA' />");
  });

  it("prints every option that departs from its default, and nothing else", () => {
    expect(
      turnstileSnippet({
        key: "block",
        size: "compact",
        load: "focus",
        challenge: "submit",
        appearance: "interaction-only",
        action: "sign_up",
        cData: "order-4821",
        language: "de",
        tabindex: 0,
      }),
    ).toBe(
      "<Turnstile siteKey='2x00000000000000000000AB' size='compact' load='focus' challenge='submit' appearance='interaction-only' action='sign_up' cData='order-4821' language='de' tabindex={0} />",
    );
  });

  it("omits the token-scoping string while it is empty, printing no prop for it", () => {
    const snippet = turnstileSnippet({ ...TURNSTILE_DEMO_DEFAULTS, cData: "" });
    expect(snippet).toBe("<Turnstile siteKey='1x00000000000000000000AA' />");
  });

  it("prints the token-scoping string once it is set", () => {
    expect(turnstileSnippet({ ...TURNSTILE_DEMO_DEFAULTS, cData: "order-4821" })).toBe(
      "<Turnstile siteKey='1x00000000000000000000AA' cData='order-4821' />",
    );
  });
});

describe("the Turnstile playground", () => {
  it("renders the widget the options describe, and the snippet that reproduces it", async () => {
    const options: TurnstileDemoOptions = {
      key: "interactive",
      size: "flexible",
      load: "focus",
      challenge: "submit",
      appearance: "interaction-only",
      action: "sign_up",
      cData: "order-4821",
      language: "de",
      tabindex: 2,
    };
    const body = await bodyOf("turnstile-widget", options);
    const widget = widgetsIn(body)[0] ?? "";
    expect(attrOf(widget, "data-sitekey")).toBe("3x00000000000000000000FF");
    expect(attrOf(widget, "data-size")).toBe("flexible");
    expect(attrOf(widget, "data-load")).toBe("focus");
    expect(attrOf(widget, "data-challenge")).toBe("submit");
    expect(attrOf(widget, "data-appearance")).toBe("interaction-only");
    expect(attrOf(widget, "data-action")).toBe("sign_up");
    expect(attrOf(widget, "data-cdata")).toBe("order-4821");
    expect(attrOf(widget, "data-language")).toBe("de");
    expect(attrOf(widget, "data-tabindex")).toBe("2");
    expect(snippetsIn(body)).toEqual([
      "&lt;Turnstile siteKey=&#39;3x00000000000000000000FF&#39; size=&#39;flexible&#39; load=&#39;focus&#39; challenge=&#39;submit&#39; appearance=&#39;interaction-only&#39; action=&#39;sign_up&#39; cData=&#39;order-4821&#39; language=&#39;de&#39; tabindex={2} /&gt;",
    ]);
  });

  it("omits the attribute for every option left at its default, rather than stamping the default", async () => {
    const widget = widgetsIn(await bodyOf("turnstile-widget"))[0] ?? "";
    expect(attrOf(widget, "data-sitekey")).toBe("1x00000000000000000000AA");
    expect(attrOf(widget, "data-challenge")).toBeNull();
    expect(attrOf(widget, "data-appearance")).toBeNull();
    expect(attrOf(widget, "data-action")).toBeNull();
    expect(attrOf(widget, "data-cdata")).toBeNull();
    expect(attrOf(widget, "data-language")).toBeNull();
    expect(attrOf(widget, "data-tabindex")).toBeNull();
  });

  it("keeps the whole configuration in the URL: the panel is a GET form back to the page itself", async () => {
    const body = await bodyOf("turnstile-widget");
    const forms = [...body.matchAll(/<form[^>]*>/g)].map((match) => match[0]);
    expect(forms.map((form) => attrOf(form, "method"))).toEqual(["get", "post"]);
    expect(attrOf(forms[0] ?? "", "action")).toBe("/showcase/ui/turnstile");
    const names = [...body.matchAll(/<(?:select|input)[^>]*\sname="([^"]*)"[^>]*>/g)].map((match) => match[1]);
    expect(names.slice(0, 9)).toEqual(["key", "size", "load", "challenge", "appearance", "language", "action", "cData", "tabindex"]);
  });

  it("posts the widget's form to the verify endpoint, swapping the verdict into its own target", async () => {
    const body = await bodyOf("turnstile-widget");
    const submit = [...body.matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/g)][1];
    const submitForm = `<form${submit?.[1] ?? ""}>`;
    expect(attrOf(submitForm, "action")).toBe("/showcase/ui/api/turnstile-verify");
    expect(attrOf(submitForm, "hx-post")).toBe("/showcase/ui/api/turnstile-verify");
    expect(attrOf(submitForm, "hx-target")).toBe(`#${SHOW_TURNSTILE_VERDICT_ID}`);
    expect(attrOf(submitForm, "hx-swap")).toBe("innerHTML");
    expect(body.match(new RegExp(`<div[^>]*\\sid="${SHOW_TURNSTILE_VERDICT_ID}"[^>]*>`))?.[0]).toBe(
      `<div id="${SHOW_TURNSTILE_VERDICT_ID}" class="mt-6">`,
    );
    expect((await bodyOf("turnstile-verify")).match(/<p class="mt-1[^"]*">([\s\S]*?)<\/p>/)?.[1]).toBe(
      "The playground form above posts here. The route is an ordinary defineAction behind its guards, and the snippet shows what declaring Turnstile looks like. Its onBotDetected reports the reason instead of hiding it.",
    );
  });

  it("offers no sitekey the page did not publish as a test key", async () => {
    const body = await bodyOf("turnstile-widget");
    const values = [...body.matchAll(/<option[^>]*\svalue="([^"]*)"[^>]*>/g)].map((match) => match[1]);
    expect(values.slice(0, 4)).toEqual(TURNSTILE_TEST_KEYS.map((key) => key.id));
  });
});

describe("the Turnstile variants band", () => {
  it("guards each size with its own form, self-scoping widget and distinct email field", async () => {
    const body = await bodyOf("turnstile-variants");
    expect([...body.matchAll(/data-slot="turnstile"[^>]*?data-size="([^"]*)"/g)].map((match) => match[1])).toEqual([
      "normal",
      "compact",
      "flexible",
      "normal",
    ]);

    const forms = [...body.matchAll(/<form([^>]*)>([\s\S]*?)<\/form>/g)];
    // The showcase adds no scope of its own — each widget carries `data-scope="turnstile"`, which is
    // the whole wiring a consuming app needs.
    expect(forms.map((form) => attrOf(`<form${form[1]}>`, "data-scope"))).toEqual([null, null, null, null]);
    const widgets = forms.map((form) => (form[2] ?? "").match(/<div[^>]*data-ref="turnstile"[^>]*>/)?.[0] ?? "");
    expect(widgets.map((widget) => attrOf(widget, "data-scope"))).toEqual(["turnstile", "turnstile", "turnstile", "turnstile"]);
    expect(widgets.map((widget) => attrOf(widget, "data-challenge"))).toEqual([null, null, null, "submit"]);
    expect(forms.map((form) => attrOf(`<form${form[1]}>`, "hx-post"))).toEqual([null, null, null, "#"]);

    const parts = /<input[^>]*type="email"[^>]*>|<div[^>]*data-ref="turnstile"[^>]*>|<button[^>]*type="submit"[^>]*>/g;
    for (const form of forms) {
      expect([...(form[2] ?? "").matchAll(parts)].map((match) => match[0].match(/^<([a-z]+)/)?.[1])).toEqual(["input", "div", "button"]);
    }

    const emails = forms.map((form) => (form[2] ?? "").match(/<input[^>]*type="email"[^>]*>/)?.[0] ?? "").map((tag) => attrOf(tag, "name"));
    expect(emails).toEqual(["turnstile-email", "turnstile-email-compact", "turnstile-email-flexible", "turnstile-email-submit"]);
  });
});

describe("the Turnstile resilience band", () => {
  it("server-renders both refusal messages hidden, carrying the demo's own copy", async () => {
    const body = await bodyOf("turnstile-resilience");
    const messages = [...body.matchAll(/<p[^>]*data-ref="turnstile-(fallback|unsupported)"[^>]*>([\s\S]*?)<\/p>/g)];
    expect(messages.map((match) => match[1])).toEqual(["fallback", "unsupported"]);
    expect(messages.map((match) => attrOf(match[0] ?? "", "hidden"))).toEqual([null, null]);
    expect(messages.map((match) => (match[0] ?? "").includes("hidden"))).toEqual([true, true]);
    expect(messages[0]?.[2]).toBe("Our bot check could not load. Turn off your blocker for this site and reload.");
    expect(messages[1]?.[2]).toBe("This browser is too old to run our bot check.");
  });
});

describe("TurnstileVerdictFragment", () => {
  it("names the guard and the reason a turnstile refusal carries", async () => {
    const html = await render(<TurnstileVerdictFragment verdict={{ kind: "rejected", guard: "turnstile", reason: "verification-failed" }} />);
    expect(alertParts(html)).toEqual([
      "destructive",
      "Refused by the turnstile guard",
      "Cloudflare refused the token. On the always-blocks key this is the expected answer.",
    ]);
  });

  it("falls back to a generic line for a reason the copy does not spell out", async () => {
    const html = await render(<TurnstileVerdictFragment verdict={{ kind: "rejected", guard: "turnstile", reason: "cdata-mismatch" }} />);
    expect(alertParts(html)).toEqual(["destructive", "Refused by the turnstile guard", "Verification failed."]);
  });

  it("says so when the showcase was given no secret, rather than claiming a verification", async () => {
    const html = await render(<TurnstileVerdictFragment verdict={{ kind: "unconfigured" }} />);
    expect(alertParts(html)).toEqual([
      "warning",
      "No secret key is configured",
      "The form reached the action, but no Turnstile secret is configured, so nothing was sent to siteverify.",
    ]);
  });

  it("reports a pass against the field the pipeline drops", async () => {
    const html = await render(<TurnstileVerdictFragment verdict={{ kind: "verified" }} />);
    expect(alertParts(html)).toEqual([
      "success",
      "Verified",
      "The token in `cf-turnstile-response` passed siteverify and was dropped before validation, so the handler never sees it.",
    ]);
  });
});
