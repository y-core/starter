import { describe, expect, it } from "bun:test";

import { loadTurnstileOptions, TURNSTILE_DEMO_DEFAULTS, TURNSTILE_TEST_KEYS } from "../../../src/showcase/model/turnstile";

const params = (query: string) => new URLSearchParams(query);

describe("loadTurnstileOptions", () => {
  it("defaults every option when the query string says nothing", () => {
    expect(loadTurnstileOptions(params(""))).toEqual(TURNSTILE_DEMO_DEFAULTS);
  });

  it("reads every option the panel can set", () => {
    expect(
      loadTurnstileOptions(
        params("key=block&size=compact&load=focus&challenge=submit&appearance=execute&action=sign_up&cData=order-4821&language=de&tabindex=3"),
      ),
    ).toEqual({
      key: "block",
      size: "compact",
      load: "focus",
      challenge: "submit",
      appearance: "execute",
      action: "sign_up",
      cData: "order-4821",
      language: "de",
      tabindex: 3,
    });
  });

  it("falls back to the default for a value no control could produce", () => {
    expect(loadTurnstileOptions(params("key=hostile&size=huge&load=later&challenge=maybe&appearance=never&language=xx"))).toEqual(
      TURNSTILE_DEMO_DEFAULTS,
    );
  });

  it("drops an action outside Cloudflare's charset rather than forwarding it", () => {
    expect(loadTurnstileOptions(params("action=sign up")).action).toBe("");
    expect(loadTurnstileOptions(params(`action=${"a".repeat(33)}`)).action).toBe("");
    expect(loadTurnstileOptions(params(`action=${"a".repeat(32)}`)).action).toBe("a".repeat(32));
  });

  it("drops a cData outside Cloudflare's charset rather than forwarding it", () => {
    expect(loadTurnstileOptions(params("cData=order 4821")).cData).toBe("");
    expect(loadTurnstileOptions(params(`cData=${"a".repeat(256)}`)).cData).toBe("");
    expect(loadTurnstileOptions(params(`cData=${"a".repeat(255)}`)).cData).toBe("a".repeat(255));
  });

  it("drops a tabindex that is not a whole number in range", () => {
    expect(loadTurnstileOptions(params("tabindex=1.5")).tabindex).toBeNull();
    expect(loadTurnstileOptions(params("tabindex=-2")).tabindex).toBeNull();
    expect(loadTurnstileOptions(params("tabindex=99999")).tabindex).toBeNull();
    expect(loadTurnstileOptions(params("tabindex=-1")).tabindex).toBe(-1);
  });
});

describe("TURNSTILE_TEST_KEYS", () => {
  it("offers only keys Cloudflare publishes as test keys", () => {
    expect(TURNSTILE_TEST_KEYS.map((key) => key.siteKey)).toEqual([
      "1x00000000000000000000AA",
      "2x00000000000000000000AB",
      "3x00000000000000000000FF",
      "1x00000000000000000000BB",
    ]);
  });
});
