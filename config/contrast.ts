/** The contrast exemptions `validate-contrast` measures this app's palette against.
 *
 *  `src/assets/css/custom.css` re-declares the twelve gray steps, so every exemption forge records
 *  against its own neutral ramp names a value this app no longer has — and the check refuses an
 *  exemption whose recorded value has moved, which is the whole point of recording it. `--border`
 *  is the one such row: it resolves through `--gray-6`, and it is re-measured here.
 *
 *  The four status borders are **not** re-recorded. They resolve through `theme-colors.css`, which
 *  this app does not re-declare, so forge's values and ratios still hold and its rows are taken
 *  verbatim below.
 *
 *  Deliberately outside `tsconfig.json`'s `include`, as every `config/` module is: it is read only
 *  by the step table and ships to no runtime.
 */

import { ACCEPTED_CONTRAST, type AcceptedContrastRow } from "@y-core/forge/ui/contracts/theme";

// Measured with forge's own `contrastRatio` over the resolved sRGB of each step, both modes, against
// all three surfaces `--border` is drawn on. Light is worst on `--muted`, dark likewise. Neither
// figure is assumed: a hairline reading as a hairline is a choice someone made, and the number is
// what keeps it one.
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
