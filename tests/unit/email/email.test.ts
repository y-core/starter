import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";

import { nullLogger } from "@y-core/forge/testing";

import { type EmailConfig, type EmailMessage, sendEmail } from "../../../src/email/mod";

const EMAIL_API_URL = "https://api.mailchannels.net/tx/v1/send";

const BASE_EMAIL: EmailConfig = {
  apiKey: "test-key",
  apiUrl: EMAIL_API_URL,
  from: "from@example.com",
  senderName: "Atlas Studio",
  to: "to@example.com",
};

const MESSAGE: EmailMessage = { subject: "A subject line", html: "<p>A body</p>", replyTo: { email: "jane@example.com", name: "Jane Example" } };

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

describe("sendEmail — API payload", () => {
  it("POSTs to the configured email API endpoint", async () => {
    await sendEmail(MESSAGE, BASE_EMAIL, nullLogger);
    expect(capturedUrl).toBe(EMAIL_API_URL);
    expect(capturedMethod).toBe("POST");
  });

  it("uses senderName from config as from.name", async () => {
    await sendEmail(MESSAGE, { ...BASE_EMAIL, senderName: "Custom Sender Name" }, nullLogger);
    expect(capturedBody!.from.name).toBe("Custom Sender Name");
  });

  it("sends content-type=application/json and x-api-key headers", async () => {
    await sendEmail(MESSAGE, BASE_EMAIL, nullLogger);
    expect(capturedHeaders!["content-type"]).toBe("application/json");
    expect(capturedHeaders!["x-api-key"]).toBe("test-key");
  });

  it("sets from.email to the configured email.from", async () => {
    await sendEmail(MESSAGE, BASE_EMAIL, nullLogger);
    expect(capturedBody!.from.email).toBe("from@example.com");
  });

  it("sets personalizations[0].to[0].email to the configured email.to", async () => {
    await sendEmail(MESSAGE, BASE_EMAIL, nullLogger);
    expect(capturedBody!.personalizations[0]!.to[0]!.email).toBe("to@example.com");
  });

  it("sends the message's subject, reply-to and HTML as given", async () => {
    await sendEmail(MESSAGE, BASE_EMAIL, nullLogger);
    expect(capturedBody!.subject).toBe("A subject line");
    expect(capturedBody!.reply_to).toEqual({ email: "jane@example.com", name: "Jane Example" });
    expect(capturedBody!.content).toEqual([{ type: "text/html", value: "<p>A body</p>" }]);
  });
});

describe("sendEmail — response handling", () => {
  it("returns ok on a 202 response", async () => {
    const result = await sendEmail(MESSAGE, BASE_EMAIL, nullLogger);
    expect(result).toEqual({ ok: true });
  });

  it("returns the status as the reason on a 503 response", async () => {
    mockStatus = 503;
    const result = await sendEmail(MESSAGE, BASE_EMAIL, nullLogger);
    expect(result).toEqual({ ok: false, reason: "http-503" });
  });

  it("returns the status as the reason on a 400 response", async () => {
    mockStatus = 400;
    const result = await sendEmail(MESSAGE, BASE_EMAIL, nullLogger);
    expect(result).toEqual({ ok: false, reason: "http-400" });
  });

  it("returns network-error reason when fetch throws", async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("Network failure");
    };
    try {
      const result = await sendEmail(MESSAGE, BASE_EMAIL, nullLogger);
      expect(result).toEqual({ ok: false, reason: "network-error" });
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it("returns network-error reason when fetch times out (AbortError)", async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    };
    try {
      const result = await sendEmail(MESSAGE, BASE_EMAIL, nullLogger);
      expect(result).toEqual({ ok: false, reason: "network-error" });
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
});
