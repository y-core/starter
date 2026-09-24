import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { nullLogger } from "@y-core/forge/testing";

import { configStore } from "../../../src/app/config";
import { sendEnquiry } from "../../../src/contact/services/enquiry";
import { CONFIG_ENV } from "../../env";

const EMAIL = configStore.get({ SITE_ORIGIN: "https://example.com", ...CONFIG_ENV }).email;

const VALID_SUBMISSION = {
  name: "Jane Example",
  email: "jane@example.com",
  phone: "+1 555 012 3456",
  message: "I need help building a digital product.",
};

interface CapturedBody {
  reply_to: { email: string; name: string };
  subject: string;
  content: Array<{ type: string; value: string }>;
}

let _savedFetch: typeof globalThis.fetch;
let capturedBody: CapturedBody | null = null;

beforeAll(() => {
  _savedFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    capturedBody = JSON.parse((init as RequestInit).body as string);
    return new Response(null, { status: 202 });
  };
});

afterAll(() => {
  globalThis.fetch = _savedFetch;
});

beforeEach(() => {
  capturedBody = null;
});

/** The HTML the enquiry handed the email slice. */
function html(): string {
  return capturedBody!.content[0]!.value;
}

describe("sendEnquiry — HTML body", () => {
  it("renders every field of a complete submission, each under its label", async () => {
    await sendEnquiry(VALID_SUBMISSION, EMAIL, nullLogger);
    expect(html()).toBe(
      "<p><strong>Name:</strong> Jane Example</p>\n" +
        "<p><strong>Email:</strong> jane@example.com</p>\n" +
        "<p><strong>Phone:</strong> +1 555 012 3456</p>\n" +
        "<p><strong>Message:</strong></p>\n<p>I need help building a digital product.</p>",
    );
  });

  it("omits the phone paragraph when phone is empty", async () => {
    await sendEnquiry({ ...VALID_SUBMISSION, phone: "" }, EMAIL, nullLogger);
    expect(html()).not.toContain("Phone:");
  });

  it("escapes HTML entities in user-provided name", async () => {
    await sendEnquiry({ ...VALID_SUBMISSION, name: "<script>alert(1)</script>" }, EMAIL, nullLogger);
    expect(html()).not.toContain("<script>");
    expect(html()).toContain("<p><strong>Name:</strong> &lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  it("escapes HTML entities in user-provided phone", async () => {
    await sendEnquiry({ ...VALID_SUBMISSION, phone: "<img onerror=alert(1)>" }, EMAIL, nullLogger);
    expect(html()).not.toContain("<img");
    expect(html()).toContain("<p><strong>Phone:</strong> &lt;img onerror=alert(1)&gt;</p>");
  });

  it("converts newlines to <br> in the message", async () => {
    await sendEnquiry({ ...VALID_SUBMISSION, message: "line one\nline two" }, EMAIL, nullLogger);
    expect(html().endsWith("<p>line one<br>line two</p>")).toBe(true);
  });
});

describe("sendEnquiry — the message it composes", () => {
  it("names the enquirer in the subject", async () => {
    await sendEnquiry(VALID_SUBMISSION, EMAIL, nullLogger);
    expect(capturedBody!.subject).toBe("Enquiry from Jane Example");
  });

  it("makes the enquirer the address a reply reaches", async () => {
    await sendEnquiry(VALID_SUBMISSION, EMAIL, nullLogger);
    expect(capturedBody!.reply_to).toEqual({ email: "jane@example.com", name: "Jane Example" });
  });

  it("answers the delivery outcome the email slice reports", async () => {
    expect(await sendEnquiry(VALID_SUBMISSION, EMAIL, nullLogger)).toEqual({ ok: true });
  });
});
