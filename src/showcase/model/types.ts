import type { TurnstileFailure } from "@y-core/forge/form";
import type { DialValues } from "@y-core/forge/ui/contracts/theme";

import type { CHALLENGES, LANGUAGES, LOADS, SIZES, TURNSTILE_APPEARANCES } from "./turnstile";

/** The signal fields the bound-control band renders and resumes. @internal */
export interface ControlsDemoState {
  text: string;
  email: string;
  unit: string;
  precision: string;
  level: number;
  zoom: number;
  enabled: boolean;
  notifications: boolean;
  notes: string;
  summary: string;
  align: string;
  weight: string;
  mirror: string;
  count: number;
  bold: boolean;
  plan: string;
  toppings: string[];
  avatar: string;
  code: string;
  pin: string;
}

/** What a catalog page renders from. @public */
export interface ShowcaseData {
  turnstile: TurnstileDemoOptions;
}

/** What the theme customiser renders from — the URL's dials, and nothing else. @public */
export interface CustomiseData {
  dials: DialValues;
}

/** @public */
export interface PreviewData {
  tone: string;
  appearance: string;
  size: string;
}

/** @public */
export interface ValidateData {
  email: string;
}

/** @public */
export interface SearchData {
  q: string;
}

/** @public */
export interface PaginateData {
  page: number;
}

/** @public */
export interface DependentData {
  category: string;
}

/** @public */
export interface ToastData {
  type: string;
}

/** One of Cloudflare's published dummy sitekeys, which is all this page ever renders. @public */
export interface TurnstileTestKey {
  id: string;
  siteKey: string;
  label: string;
  note: string;
}

/** Every prop the playground drives, read from the query string. @public */
export interface TurnstileDemoOptions {
  key: string;
  size: (typeof SIZES)[number];
  load: (typeof LOADS)[number];
  challenge: (typeof CHALLENGES)[number];
  appearance: (typeof TURNSTILE_APPEARANCES)[number];
  action: string;
  cData: string;
  language: (typeof LANGUAGES)[number];
  tabindex: number | null;
}

/** How the verify round trip ended: the pipeline's own verdict, not the widget's. @public */
export type TurnstileVerdict = { kind: "verified" } | { kind: "rejected"; guard: string; reason: TurnstileFailure } | { kind: "unconfigured" };
