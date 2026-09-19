/** The contrast exemptions `validate-contrast` measures this app's palette against. */

import { ACCEPTED_CONTRAST, type AcceptedContrastRow } from "@y-core/forge/ui/contracts/theme";

// Re-derived with forge's own `contrastRatio` over each step's resolved sRGB, in both modes, against
// every surface `--border` is drawn on — the figures below are measured, never carried over.
/** `--border` at this app's own gray ramp, replacing forge's row for the same token. */
const BORDER: AcceptedContrastRow = {
  token: "--border",
  step: "--gray-6",
  value: { light: "oklch(88.53% 0.0425 205)", dark: "oklch(34.85% 0.0597 205)" },
  measured: "1.22 against --muted, 1.33 against --background and 1.35 against --card in light; 1.42, 1.70 and 1.57 in dark",
  reason:
    "decorative separation only — a hairline, a divider, a surface edge. It identifies no control and reports no state, so WCAG 1.4.11 does not bind. This app's ramp carries chroma where forge's is achromatic, which moves every figure and is why the row is re-measured here rather than inherited.",
};

/** Every pair no criterion binds, with this app's `--border` replacing the inherited one. @public */
export const ACCEPTED: readonly AcceptedContrastRow[] = [BORDER, ...ACCEPTED_CONTRAST.filter((row) => row.token !== BORDER.token)];
