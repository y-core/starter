/** The gate's step table, and the single source of truth for it. `forge-verify` loads it through
 *  the default export — there is no binding script between the two.
 *
 *  Deliberately near-pure `cloudflareWorkerSteps()`. Starter is the fleet's proof that the preset
 *  is sufficient for a Worker app, so a row added here that the preset does not emit is a bug
 *  report against the preset rather than a local convenience.
 *
 *  `sources` names `config/` because this file is inside the gate it defines; `tests` stays at its
 *  default, which is already the whole suite.
 *
 *  Deliberately outside `tsconfig.json`'s `include`: importing `@y-core/forge/pkg` pulls forge's
 *  build-time tree into the type program, which typechecks only with node's `process` and `Buffer`
 *  in global scope — exactly what `"types": []` withholds from the Worker.
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareWorkerSteps, type Step } from "@y-core/forge/pkg";

/** This repository's root, derived from this file rather than from `process.cwd()`. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Unused while `package.json` pins a released tarball, and kept for the swap to
// `"@y-core/forge": "file:../forge"` that verifies a cross-repo change before forge cuts a release.
// bun *links* a `file:` dependency and realpaths an imported module — though not the entry point —
// so forge's own `app-root.ts` sees its checkout with no `node_modules` above it, and
// `resolveAppRoot`'s derived branch refuses. The preset's `types:assets` row passes no `--root`, but
// it inherits this process's environment, and `FORGE_APP_ROOT` is the escape hatch `forge-assets`
// already publishes for exactly this. It belongs here and not in forge: a released library should
// carry no resolution branch for an install shape production never uses.
process.env.FORGE_APP_ROOT ??= ROOT;

export const STEPS: readonly Step[] = cloudflareWorkerSteps({
  sources: ["src/", "tests/", "config/"],
  assetConfig: "src/assets/config.ts",
  governance: true,
});

export default STEPS;
