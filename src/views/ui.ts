import { CoreIcon } from "@assets";
import { createUI } from "@y-core/forge/ui";

/**
 * App-bound forge UI components. Mirrors the `createIcon` pattern: bind once to the generated
 * `CoreIcon` so views render `Spinner`/`Select`/`ThemeToggle` without threading an icon prop.
 * The bind type-checks only while the sprite (src/assets/config.ts) contains every icon these
 * components need — drop one and this line fails to compile.
 */
export const { Spinner, Select, ThemeToggle } = createUI(CoreIcon);
