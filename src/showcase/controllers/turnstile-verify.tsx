/** @jsxRuntime automatic */
/** @jsxImportSource @y-core/forge/jsx */
import { type ActionTurnstileOptions, defineAction } from "@y-core/forge/app";
import { TURNSTILE_FIELD_DEFAULT } from "@y-core/forge/form";
import { fragmentResponse } from "@y-core/forge/http";
import { renderToString } from "@y-core/forge/jsx";
import { createMiddleware } from "@y-core/forge/router";
import { crossOriginProtection, requireFormContentType } from "@y-core/forge/security";
import { v } from "@y-core/forge/validation";

import type { AppConfig, AppEnv } from "../../app/types";
import type { TurnstileVerdict } from "../model/types";
import { TurnstileVerdictFragment } from "../views/turnstile-demo";

// The token is declared as well as dropped: a configured pipeline strips it before validation, and
// an unconfigured one hands it to this schema, where a strict object would refuse the whole post.
/** The playground form's fields, as a configured and an unconfigured action present them. */
const TURNSTILE_VERIFY_SCHEMA = v.strictObject({ email: v.optional(v.string()), [TURNSTILE_FIELD_DEFAULT]: v.optional(v.string()) });

async function renderTurnstileVerdict(verdict: TurnstileVerdict): Promise<Response> {
  const body = await renderToString(<TurnstileVerdictFragment verdict={verdict} />);
  return fragmentResponse(body, verdict.kind === "rejected" ? 422 : 200);
}

/** The Turnstile playground's verify action, which reports its verdict and calls siteverify only when given a secret. */
export function createTurnstileVerifyController(secretKey?: ActionTurnstileOptions<AppEnv, AppConfig>["secretKey"]) {
  return {
    middleware: createMiddleware(requireFormContentType(), crossOriginProtection()),
    handler: defineAction<typeof TURNSTILE_VERIFY_SCHEMA, AppEnv, AppConfig>({
      schema: TURNSTILE_VERIFY_SCHEMA,
      ...(secretKey === undefined ? {} : { turnstile: { secretKey, verify: (c) => ({ expectedHostname: c.url.hostname }) } }),
      // The one place a showcase departs from a real route: an app answers every guard the same way,
      // so a bot cannot read off which one spoke. Naming it is the whole point of this page.
      onBotDetected: (rejection) => renderTurnstileVerdict({ kind: "rejected", guard: "turnstile", reason: rejection.reason }),
      handle: () => renderTurnstileVerdict(secretKey === undefined ? { kind: "unconfigured" } : { kind: "verified" }),
    }),
  };
}
