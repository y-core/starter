import { env } from "@y-core/forge/config";
import { v } from "@y-core/forge/validation";

import type { StepUpFactor } from "./types";

// Total rather than partial: a partial record admits `{ passkey: undefined }`, which TypeScript does
// not catch and which reaches forge's `demanded()` as a TypeError on every guarded page.
/** What this deployment demands of each second factor, `"off"` included. A developer edits this; nothing else does. */
export const AUTH_SECOND_FACTORS: Record<StepUpFactor, "mandatory" | "optional" | "off"> = { "totp-app": "mandatory", passkey: "optional" };

/** The auth slice's entries in `AppConfigSchema`, spread into it by the core config. @public */
export const AuthConfigEntries = {
  // `rpId` and `origin` are absent by design: both derive from `site.url`, so a second dev origin
  // needs no further declaration site. `.dev.vars.example` names the three `SITE_ORIGIN` has.
  auth: v.object({
    keyRing: v.pipe(
      v.string(),
      v.transform((raw): string[] =>
        raw
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean),
      ),
      v.check((keys) => keys.length > 0 && keys.every((key) => /^[0-9a-f]{64,}$/.test(key))),
    ),
    sessionSecret: v.pipe(v.string(), v.minLength(32)),
    // Required rather than optional: forge answers `/admin/elevate` 404 without one, and it is the
    // only path to the administrator role — so an absent value mounts `/admin/*` unreachable.
    bootstrapSecret: v.pipe(v.string(), v.minLength(32)),
    rpName: v.optional(v.string(), "Forge Studio"),
  }),
};

/** The auth slice's entries in `appConfig`, read from the environment the schema above validates. @public */
export const authConfig = {
  auth: {
    keyRing: env("AUTH_KEY_RING"),
    sessionSecret: env("SESSION_SECRET"),
    bootstrapSecret: env("ADMIN_BOOTSTRAP_SECRET"),
    rpName: "Forge Studio",
  },
};
