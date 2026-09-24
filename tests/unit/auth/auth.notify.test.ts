import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { AuthMessage } from "@y-core/forge/auth";

import { createConsoleNotifier } from "../../../src/auth/services/auth.notify";

const OTP: AuthMessage = { kind: "otp", to: "ada@example.com", code: "482913", expiresAt: 1_800_000_000_000 };
const EMAIL_CHANGE: AuthMessage = {
  kind: "email-change",
  to: "ada.lovelace@example.com",
  url: "https://example.com/auth/email/confirm?token=SECRET-TOKEN",
  expiresAt: 1_800_000_000_000,
};

let captured: string[] = [];
let originalLog: typeof console.log;

beforeEach(() => {
  captured = [];
  originalLog = console.log;
  console.log = (...args: unknown[]) => captured.push(args.map((arg) => JSON.stringify(arg) ?? String(arg)).join(" "));
});

afterEach(() => {
  console.log = originalLog;
});

async function written(message: AuthMessage, reveal: boolean): Promise<string> {
  await createConsoleNotifier(reveal).send(message);
  return captured.join("\n");
}

describe("createConsoleNotifier — the production entry, which mints no allowance", () => {
  it("writes neither the address nor the code for a sign-in code", async () => {
    const line = await written(OTP, false);

    expect(line).not.toContain("ada@example.com");
    expect(line).not.toContain("482913");
  });

  it("writes no address or token URL for an email change", async () => {
    const line = await written(EMAIL_CHANGE, false);

    expect(line).not.toContain("ada.lovelace@example.com");
    expect(line).not.toContain("SECRET-TOKEN");
    expect(line).not.toContain("https://example.com/auth/email/confirm");
  });

  it("still records that a message was sent, and of which kind", async () => {
    const line = await written(OTP, false);

    expect(line).toContain("auth.notify");
    expect(line).toContain("otp");
  });

  it("reports success, so a suppressed credential is not read as a delivery failure", async () => {
    const result = await createConsoleNotifier(false).send(OTP);

    expect(result.ok).toBe(true);
  });
});

describe("createConsoleNotifier — the development entry, where the allowance is minted", () => {
  it("prints the sign-in code, which is the whole point of the PoC notifier", async () => {
    const line = await written(OTP, true);

    expect(line).toContain("482913");
    expect(line).toContain("ada@example.com");
  });

  it("prints the email-change confirmation URL", async () => {
    const line = await written(EMAIL_CHANGE, true);

    expect(line).toContain("SECRET-TOKEN");
  });
});
