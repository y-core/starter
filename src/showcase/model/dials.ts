import { type Dial, DIALS, type DialValues, PRESET_PARAM, SCHEME_PRESETS } from "@y-core/forge/ui/contracts/theme";

/** Reads one dial off the query string, clamped to its range and rounded to its step. */
function readDial(params: URLSearchParams, dial: Dial): number {
  const raw = params.get(dial.param);
  if (raw === null) return dial.fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return dial.fallback;
  const clamped = Math.min(Math.max(parsed, dial.min), dial.max);
  return Math.round(clamped / dial.step) * dial.step;
}

/** Resolves `?p=slate` into the two gray dials that reproduce it; an explicit dial wins over the alias. */
function applyPreset(params: URLSearchParams, dials: DialValues): void {
  const preset = SCHEME_PRESETS.find((candidate) => candidate.id === params.get(PRESET_PARAM));
  if (preset === undefined) return;
  for (const field of ["grayHue", "grayChroma"] as const) {
    const dial = DIALS.find((candidate) => candidate.field === field);
    if (dial !== undefined && !params.has(dial.param)) dials[field] = preset[field];
  }
}

/** Reads every customiser dial off the query string — the URL is the whole of the page's state. @public */
export function readDials(params: URLSearchParams): DialValues {
  const dials: DialValues = {};
  for (const dial of DIALS) dials[dial.field] = readDial(params, dial);
  applyPreset(params, dials);
  return dials;
}
