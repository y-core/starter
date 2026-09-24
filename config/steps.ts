/** The gate's step table, loaded by `forge verify` through the default export. */

import { existsSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareWorkerSteps, type CloudflareWorkerStepOptions, commentBudgetStep, type Step } from "@y-core/forge/tooling/gate";
import { CONTRAST_PAIRS, CRITERION } from "@y-core/forge/ui/contracts/theme";
import { CANON_ROOT } from "@y-core/forge/warden";
import { wardenAppSteps } from "@y-core/forge/warden/steps";

import pkg from "../package.json" with { type: "json" };
import { ACCEPTED } from "./contrast";
import MARKDOWN from "./markdown";
import { GOLDEN, NEGATIVE } from "./warden";

/** This repository's root, derived from this file rather than from `process.cwd()`. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// `forge assets` reads the root from the environment rather than from the options bag below, so
// pinning it there is not enough. `??=` so an explicitly exported root still wins.
process.env.FORGE_APP_ROOT ??= ROOT;

/** The installed canon, addressed relative to this repository so `citableDirs` can name its trees. */
const CANON = relative(ROOT, CANON_ROOT);

/** The installed forge's stylesheet directory, addressed relative to this repository. */
const FORGE_CSS = relative(ROOT, fileURLToPath(import.meta.resolve("@y-core/forge/ui/assets/css/tailwind.css")).replace(/\/tailwind\.css$/, ""));

// Cascade order, matching what `src/assets/tailwind.css` composes: a token resolves to its last
// declaration, so `custom.css` is appended after these at the call site rather than listed here.
/** Forge's own token layer, in import order. */
const FORGE_THEME_FILES = [`${FORGE_CSS}/theme-neutral.css`, `${FORGE_CSS}/theme-colors.css`, `${FORGE_CSS}/theme-base.css`];

const CLIENT_DIRS: string[] = ["src/client"];
CLIENT_DIRS.push("src/showcase/client"); /* feature:showcase */
const CROSSINGS = ["src/worker.ts", "src/app/config.ts"];
CROSSINGS.push("src/client/main.ts"); /* feature:showcase */
const OPT_INS: Pick<CloudflareWorkerStepOptions, "importBoundary" | "features" | "db"> = {};
if (existsSync(resolve(ROOT, "config/features.ts"))) {
  OPT_INS.features = {};
  OPT_INS.importBoundary = { guarded: [], sources: ["src"], crossings: CROSSINGS };
}
OPT_INS.db = true; /* feature:db */

export const STEPS: readonly Step[] = [
  ...cloudflareWorkerSteps({
    // Pinned rather than left at `process.cwd()`, so every row addresses this repository whatever
    // directory the gate was started from.
    root: ROOT,
    sources: ["src/", "tests/", "config/", "playwright.config.ts"],
    // `tests/workerd/` and `tests/browser/` are absent by design: each of their specs starts a real
    // process, so they belong to the `full`-tier `test:workerd` and `test:browser` rows instead.
    testSets: [
      // A module in isolation, no app: the config store, the email service, a view rendered directly.
      { label: "test:unit", sources: ["tests/unit/"] },
      // Driven through the composition root, which is the only way a guard chain can be observed.
      { label: "test:seam", sources: ["tests/seam/"] },
    ],
    assetConfig: "config/assets.ts",
    workerConfig: "wrangler.jsonc",
    // `"unroutable"` demands the values that keep this Worker off the public internet, not merely
    // that they are stated. A fork opening a public route relaxes this in the same commit.
    exposure: { require: "unroutable" },
    // `main.ts` is the esbuild entry and so the only basename the Worker's tree may name inside a
    // client directory; everything else there is bundled for the browser and has no server build.
    ssrBoundary: { clientDirs: CLIENT_DIRS, sources: ["src"], entryPoints: ["main.ts"] },
    ...OPT_INS,
    // `custom.css` re-declares the ramps every forge semantic token resolves through, so the pairs
    // and floors are forge's but the colours audited against them are only ever this app's.
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
    browser: true,
    workerd: true,
    // `design.sources` stays defaulted to `["src/"]`: the top-level `sources` above names `tests/`,
    // whose specs hold deliberately self-conflicting class literals `validate-class-order` would fail.
    design: { stylesheet: "src/assets/tailwind.css", cssDir: "src/assets" },
    // `.oxfmtrc.json` ignores `**/*.md`, so this row is the only thing holding prose to a layout.
    markdown: MARKDOWN,
    // No `jsx`: the row demands a per-file pragma pair, which duplicates the `jsxImportSource` this
    // app's own `tsconfig.json` already states once for the whole tree.
  }),
  // Not a bug report against the preset: `FORGE_CONSUMPTION.md` §1d assigns this row to the
  // consuming app, because only the app knows which of its directories the budget is scanned over.
  commentBudgetStep({ root: ROOT, sources: ["src", "config", "tests"] }, { tier: "standard" }),
  // No `decisionsDir`: this app owns no governing prose, and naming a directory that does not exist
  // is itself a failure here. `CLAUDE.md` and the front page are what the check reads by default.
  ...wardenAppSteps({ root: ROOT, packageName: pkg.name, queries: GOLDEN, negative: NEGATIVE, citableDirs: [`${CANON}/shared`, `${CANON}/apps`] }),
];

export default STEPS;
