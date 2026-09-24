import type { TurnstileDemoOptions, TurnstileTestKey } from "./types";

export const SIZES = ["normal", "compact", "flexible"] as const;
export const LOADS = ["eager", "focus"] as const;
export const CHALLENGES = ["render", "submit"] as const;
export const TURNSTILE_APPEARANCES = ["always", "execute", "interaction-only"] as const;
export const LANGUAGES = ["auto", "en", "de", "fr", "es", "ja", "ar"] as const;

// A fixed list rather than a free-text sitekey: a key off the query string would be an attacker's
// widget rendered under this origin's name, and no demonstration needs that.
/** The key every band other than the playground renders, and the playground's own default. @public */
export const TURNSTILE_PASS_KEY: TurnstileTestKey = {
  id: "pass",
  siteKey: "1x00000000000000000000AA",
  label: "Visible — always passes",
  note: "The widget renders and clears itself.",
};

/** Cloudflare's dummy sitekeys — the only keys the playground offers. @public */
export const TURNSTILE_TEST_KEYS: readonly TurnstileTestKey[] = [
  TURNSTILE_PASS_KEY,
  {
    id: "block",
    siteKey: "2x00000000000000000000AB",
    label: "Visible — always blocks",
    note: "The widget renders and fails; the error callback fires.",
  },
  {
    id: "interactive",
    siteKey: "3x00000000000000000000FF",
    label: "Visible — forces a challenge",
    note: "The widget always asks the visitor to interact.",
  },
  { id: "invisible", siteKey: "1x00000000000000000000BB", label: "Invisible — always passes", note: "Nothing is drawn; the token arrives anyway." },
];

/** What the page renders when the query string says nothing. @public */
export const TURNSTILE_DEMO_DEFAULTS: TurnstileDemoOptions = {
  key: "pass",
  size: "normal",
  load: "eager",
  challenge: "render",
  appearance: "always",
  action: "",
  cData: "",
  language: "auto",
  tabindex: null,
};

const ACTION_CHARS = /^[a-zA-Z0-9_-]{0,32}$/;
const CDATA_CHARS = /^[a-zA-Z0-9_-]{0,255}$/;

function pick<T extends string>(params: URLSearchParams, name: string, allowed: readonly T[], fallback: T): T {
  const raw = params.get(name);
  return allowed.find((value) => value === raw) ?? fallback;
}

/** Reads the playground's options off the query string, rejecting anything the controls cannot produce. @public */
export function loadTurnstileOptions(params: URLSearchParams): TurnstileDemoOptions {
  const key = TURNSTILE_TEST_KEYS.find((candidate) => candidate.id === params.get("key"));
  const action = params.get("action") ?? "";
  const cData = params.get("cData") ?? "";
  const rawTab = params.get("tabindex");
  const tab = rawTab === null || rawTab.trim() === "" ? Number.NaN : Number(rawTab);
  return {
    key: key?.id ?? TURNSTILE_DEMO_DEFAULTS.key,
    size: pick(params, "size", SIZES, TURNSTILE_DEMO_DEFAULTS.size),
    load: pick(params, "load", LOADS, TURNSTILE_DEMO_DEFAULTS.load),
    challenge: pick(params, "challenge", CHALLENGES, TURNSTILE_DEMO_DEFAULTS.challenge),
    appearance: pick(params, "appearance", TURNSTILE_APPEARANCES, TURNSTILE_DEMO_DEFAULTS.appearance),
    action: ACTION_CHARS.test(action) ? action : "",
    cData: CDATA_CHARS.test(cData) ? cData : "",
    language: pick(params, "language", LANGUAGES, TURNSTILE_DEMO_DEFAULTS.language),
    tabindex: Number.isInteger(tab) && tab >= -1 && tab <= 32_767 ? tab : null,
  };
}
