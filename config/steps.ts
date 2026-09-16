/** The gate's step table, and the single source of truth for it. `forge verify` loads it through
 *  the default export — there is no binding script between the two.
 *
 *  Deliberately near-pure `cloudflareWorkerSteps()`. Starter is the fleet's proof that the preset
 *  is sufficient for a Worker app, so a row added here that the preset does not emit is a bug
 *  report against the preset rather than a local convenience. The four warden rows are the standing
 *  exception, and not a bug report: the preset cannot import warden, so they have to be appended
 *  here.
 *
 *  `sources` names `config/` because this file is inside the gate it defines; `tests` stays at its
 *  default, which is already the whole suite.
 *
 *  Deliberately outside `tsconfig.json`'s `include`: importing `@y-core/forge/tooling/gate` pulls forge's
 *  build-time tree into the type program, which typechecks only with node's `process` and `Buffer`
 *  in global scope — exactly what `"types": []` withholds from the Worker.
 */

import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareWorkerSteps, type Step } from "@y-core/forge/tooling/gate";
import { CONTRAST_PAIRS, CRITERION } from "@y-core/forge/ui/contracts/theme";
import { CANON_ROOT } from "@y-core/forge/warden";
import { wardenAppSteps } from "@y-core/forge/warden/steps";

import pkg from "../package.json" with { type: "json" };
import { ACCEPTED } from "./contrast";
import { GOLDEN, NEGATIVE } from "./warden";

/** This repository's root, derived from this file rather than from `process.cwd()`. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// `cloudflareWorkerSteps` defaults `root` to `process.cwd()`, which is whatever directory the gate
// was invoked from. Pinning it to this file's repository makes every row address the same tree no
// matter where it was started, and `FORGE_APP_ROOT` is the escape hatch `forge assets` publishes
// for exactly that. `??=` so an explicitly exported root still wins.
process.env.FORGE_APP_ROOT ??= ROOT;

/** The installed canon, addressed relative to this repository so `citableDirs` can name its trees. */
const CANON = relative(ROOT, CANON_ROOT);

/** The installed forge's stylesheet directory, addressed relative to this repository. */
const FORGE_CSS = relative(ROOT, fileURLToPath(import.meta.resolve("@y-core/forge/ui/assets/css/tailwind.css")).replace(/\/tailwind\.css$/, ""));

// The order `src/assets/tailwind.css` composes them in, which is the order the cascade resolves a
// token in: forge's scheme, then its status hues and elevation families, then the semantic mapping.
// `custom.css` follows and replaces the first file's twelve steps, so it is appended at the call site.
/** Forge's own token layer, in import order. */
const FORGE_THEME_FILES = [`${FORGE_CSS}/theme-neutral.css`, `${FORGE_CSS}/theme-colors.css`, `${FORGE_CSS}/theme-base.css`];

export const STEPS: readonly Step[] = [
  ...cloudflareWorkerSteps({
    // Pinned rather than left at `process.cwd()`, so every row addresses this repository whatever
    // directory the gate was started from.
    root: ROOT,
    sources: ["src/", "tests/", "config/", "playwright.config.ts"],
    // One row per question the suite answers, which is also what keeps `tests/workerd/` out of the
    // sub-second rows: its specs each start a real wrangler process and belong to the `full`-tier
    // `test:workerd` row, as `tests/browser/` belongs to `test:browser`. A directory is the unit
    // because a label has to keep meaning as specs are added to it.
    testSets: [
      // A module in isolation, no app: the config store, the email service, a view rendered directly.
      { label: "test:unit", sources: ["tests/unit/"] },
      // Driven through the composition root, which is the only way a guard chain can be observed.
      { label: "test:seam", sources: ["tests/seam/"] },
    ],
    assetConfig: "config/assets.ts",
    workerConfig: "wrangler.jsonc",
    // This app is a template nobody routes publicly, and `wrangler.jsonc` says so in prose. Here it
    // is said in the form a gate can fail: the three keys must hold the values that keep the Worker
    // off the public internet, not merely be stated. A fork that means to serve traffic relaxes this
    // to `"stated"` in the same commit it opens the route.
    exposure: { require: "unroutable" },
    // `src/client/` runs in the browser and bundles separately, so nothing the Worker renders may
    // reach into it — `main.ts` is the esbuild entry, and the only basename allowed to cross.
    ssrBoundary: { clientDirs: ["src/client"], sources: ["src"], entryPoints: ["main.ts"] },
    // `custom.css` re-declares the twelve gray and twelve accent steps every forge semantic token
    // resolves through, so this app draws colours forge never measured. The pairs and floors are
    // forge's — the audit is over this repository's palette, not over a second list of pairs.
    contrast: {
      cssDir: "src/assets/css",
      tokenFiles: [...FORGE_THEME_FILES, "src/assets/css/custom.css"],
      mappingFile: `${FORGE_CSS}/theme-base.css`,
      pairs: CONTRAST_PAIRS,
      criteria: CRITERION,
      // Deferred: resolving at import time would throw before the runner exists to report the skip.
      palettePath: () => fileURLToPath(import.meta.resolve("tailwindcss/theme.css")),
      // `config/contrast.ts`, not forge's table: this app's `--border` resolves through a gray ramp
      // it re-declares, so the inherited row records a value the check no longer finds.
      accepted: ACCEPTED,
    },
    warden: true,
    db: true,
    browser: true,
    workerd: true,
    // `design.sources` stays defaulted to `["src/"]`: the top-level `sources` above names `tests/`,
    // whose specs hold deliberately self-conflicting class literals `validate-class-order` would fail.
    design: { stylesheet: "src/assets/tailwind.css", cssDir: "src/assets" },
    // No `jsx`: the row holds every `.tsx` to a per-file pragma pair, which is a library's problem —
    // its files compile under each consumer's tsconfig. This app's compile under its own, which
    // states `jsxImportSource` once (`tsconfig.json`), so the row would demand a second copy of a
    // fact that already has a single home.
  }),
  // No `decisionsDir`: this app owns no governing prose. Every rule binding it is either the
  // canon's, forge's own advisory `docs/`, or a budgeted comment at the code it governs — so the
  // only documents left to hold to the format are `CLAUDE.md` and the front page, which the check
  // reads by default. Naming a directory that does not exist is itself a failure here.
  //
  // `config/warden.ts` replaces forge's own set, which is written for a library's vocabulary and
  // expects `libs` documents this app never sees. Every entry names the canon or the installed
  // library, because this app has no documents of its own for a query to reach.
  ...wardenAppSteps({ root: ROOT, packageName: pkg.name, queries: GOLDEN, negative: NEGATIVE, citableDirs: [`${CANON}/shared`, `${CANON}/apps`] }),
];

export default STEPS;
