import { CoreIcon } from "@assets";
import { ThemeToggle as ForgeThemeToggle } from "@y-core/forge/ui/chrome";
import { Select } from "@y-core/forge/ui/controls";
import { Spinner as ForgeSpinner } from "@y-core/forge/ui/core";

/**
 * App-bound forge UI components. Bind `CoreIcon` once so views render `Spinner`/`Select`/
 * `ThemeToggle` without threading an `icon` prop everywhere. The type-check enforces that the
 * sprite (src/assets/config.ts) contains every icon these components need.
 */
export const Spinner = (props: Omit<Parameters<typeof ForgeSpinner>[0], "icon">) =>
  ForgeSpinner({ ...props, icon: CoreIcon });

export const ThemeToggle = (props: Omit<Parameters<typeof ForgeThemeToggle>[0], "icon"> = {}) =>
  ForgeThemeToggle({ ...props, icon: CoreIcon });

export { Select };
