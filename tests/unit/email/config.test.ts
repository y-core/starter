import { describe, expect, it } from "bun:test";

import { configStore } from "../../../src/app/config";
import { CONFIG_ENV } from "../../env";

const COMPLETE_ENV: Record<string, string> = { SITE_ORIGIN: "https://example.com", ...CONFIG_ENV };

function envWithout(key: string): Record<string, unknown> {
  const { [key]: _dropped, ...rest } = COMPLETE_ENV;
  return rest;
}

describe("configStore — the delivery addresses", () => {
  it("carries the envelope sender and the recipient the environment names", () => {
    const config = configStore.get({ ...COMPLETE_ENV });
    expect(config.email.from).toBe("from@example.com");
    expect(config.email.to).toBe("to@example.com");
  });

  it("refuses a missing recipient rather than defaulting one", () => {
    expect(() => configStore.get(envWithout("EMAIL_TO"))).toThrow();
  });

  it("refuses an empty sender, which a bare `EMAIL_FROM=` line supplies", () => {
    expect(() => configStore.get({ ...COMPLETE_ENV, EMAIL_FROM: "" })).toThrow();
  });
});
