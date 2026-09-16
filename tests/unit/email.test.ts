import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { nullLogger } from "@y-core/forge/testing";

import type { EmailConfig } from "../../src/app/types";
import { sendContactEmail } from "../../src/services/email";

const EMAIL_API_URL = "https://api.mailchannels.net/tx/v1/send";

const BASE_EMAIL: EmailConfig = {
  apiKey: "test-key",
  apiUrl: EMAIL_API_URL,
  from: "from@example.com",
  senderName: "Atlas Studio",
  to: "to@example.com",
};

const VALID_SUBMISSION = {
  name: "Jane Example",
  email: "jane@example.com",
  phone: "+1 555 012 3456",
  message: "I need help building a digital product.",
};

let _savedFetch: typeof globalThis.fetch;
let capturedUrl: string | null = null;
let capturedMethod: string | null = null;
let capturedHeaders: Record<string, string> | null = null;
interface CapturedBody {
  from: { email: string; name?: string };
  reply_to: { email: string; name?: string };
  personalizations: Array<{ to: Array<{ email: string }> }>;
  subject: string;
  content: Array<{ type: string; value: string }>;
}
let capturedBody: CapturedBody | null = null;
let mockStatus = 202;

beforeAll(() => {
  _savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    capturedUrl = url.toString();
    capturedMethod = (init as RequestInit).method ?? null;
    capturedHeaders = (init as RequestInit).headers as Record<string, string>;
    capturedBody = JSON.parse((init as RequestInit).body as string);
    return new Response(mockStatus < 400 ? null : "error", { status: mockStatus });
  };
});

afterAll(() => {
  globalThis.fetch = _savedFetch;
});

beforeEach(() => {
  capturedUrl = null;
  capturedMethod = null;
  capturedHeaders = null;
  capturedBody = null;
  mockStatus = 202;
});

describe("sendContactEmail — HTML body", () => {
  it("includes Name, Email, and Message labels in the body", async () => {
    await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    const body: string = capturedBody!.content[0]!.value;
    expect(body).toContain("<strong>Name:</strong>");
    expect(body).toContain("<strong>Email:</strong>");
    expect(body).toContain("<strong>Message:</strong>");
  });

  it("includes the phone field when phone is provided", async () => {
    await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    const body: string = capturedBody!.content[0]!.value;
    expect(body).toContain("<strong>Phone:</strong>");
    expect(body).toContain("+1 555 012 3456");
  });

  it("omits the phone paragraph when phone is empty", async () => {
    await sendContactEmail({ ...VALID_SUBMISSION, phone: "" }, BASE_EMAIL, nullLogger);
    const body: string = capturedBody!.content[0]!.value;
    expect(body).not.toContain("Phone:");
  });

  it("escapes HTML entities in user-provided name", async () => {
    const xssName = "<script>alert(1)</script>";
    await sendContactEmail({ ...VALID_SUBMISSION, name: xssName }, BASE_EMAIL, nullLogger);
    const body: string = capturedBody!.content[0]!.value;
    expect(body).not.toContain("<script>");
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes HTML entities in user-provided phone", async () => {
    await sendContactEmail({ ...VALID_SUBMISSION, phone: "<img onerror=alert(1)>" }, BASE_EMAIL, nullLogger);
    const body: string = capturedBody!.content[0]!.value;
    expect(body).not.toContain("<img");
    expect(body).toContain("&lt;img onerror=alert(1)&gt;");
  });

  it("converts newlines to <br> in the message", async () => {
    await sendContactEmail({ ...VALID_SUBMISSION, message: "line one\nline two" }, BASE_EMAIL, nullLogger);
    const body: string = capturedBody!.content[0]!.value;
    expect(body).toContain("<br>");
    expect(body).not.toContain("\nline two");
  });
});

describe("sendContactEmail — API payload", () => {
  it("POSTs to the configured email API endpoint", async () => {
    await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    expect(capturedUrl).toBe(EMAIL_API_URL);
    expect(capturedMethod).toBe("POST");
  });

  it("uses senderName from config as from.name", async () => {
    await sendContactEmail(VALID_SUBMISSION, { ...BASE_EMAIL, senderName: "Custom Sender Name" }, nullLogger);
    expect(capturedBody!.from.name).toBe("Custom Sender Name");
  });

  it("sends content-type=application/json and x-api-key headers", async () => {
    await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    expect(capturedHeaders!["content-type"]).toBe("application/json");
    expect(capturedHeaders!["x-api-key"]).toBe("test-key");
  });

  it("sets from.email to the configured email.from", async () => {
    await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    expect(capturedBody!.from.email).toBe("from@example.com");
  });

  it("sets reply_to.email to submission.email", async () => {
    await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    expect(capturedBody!.reply_to.email).toBe("jane@example.com");
  });

  it("sets subject to the exact expected string", async () => {
    await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    expect(capturedBody!.subject).toBe("Enquiry from Jane Example");
  });

  it("sets reply_to.name to submission.name", async () => {
    await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    expect(capturedBody!.reply_to.name).toBe("Jane Example");
  });

  it("sets personalizations[0].to[0].email to the configured email.to", async () => {
    await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    expect(capturedBody!.personalizations[0]!.to[0]!.email).toBe("to@example.com");
  });

  it("sets content[0].type to text/html", async () => {
    await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    expect(capturedBody!.content[0]!.type).toBe("text/html");
  });
});

describe("sendContactEmail — response handling", () => {
  it("returns true on a 202 response", async () => {
    const result = await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    expect(result.ok).toBe(true);
  });

  it("returns false on a 503 response", async () => {
    mockStatus = 503;
    const result = await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    expect(result.ok).toBe(false);
  });

  it("returns false on a 400 response", async () => {
    mockStatus = 400;
    const result = await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
    expect(result.ok).toBe(false);
  });

  it("returns network-error reason when fetch throws", async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Network failure");
    };
    try {
      const result = await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("network-error");
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it("returns network-error reason when fetch times out (AbortError)", async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      const err = new DOMException("The operation was aborted", "AbortError");
      throw err;
    };
    try {
      const result = await sendContactEmail(VALID_SUBMISSION, BASE_EMAIL, nullLogger);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("network-error");
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
});
