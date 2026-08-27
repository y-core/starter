/** The gate's step table, and the single source of truth for it. `forge verify` loads it through
 *  the default export — there is no binding script between the two.
 *
 *  Deliberately near-pure `cloudflareWorkerSteps()`. Starter is the fleet's proof that the preset
 *  is sufficient for a Worker app, so a row added here that the preset does not emit is a bug
 *  report against the preset rather than a local convenience. The four warden rows are the standing
 *  exception, and not a bug report: the preset cannot import warden, so they have to be appended
 *  here. `workerdStep` is appended too, and *is* a bug report — see the comment on the row.
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

import { cloudflareWorkerSteps, type Step, workerdStep } from "@y-core/forge/tooling/gate";
import { CANON_ROOT } from "@y-core/forge/warden";
import { docsStep, duplicatesStep, wardenQueriesStep, wardenStep } from "@y-core/forge/warden/steps";

import pkg from "../package.json" with { type: "json" };
import { GOLDEN, NEGATIVE } from "./golden";

/** This repository's root, derived from this file rather than from `process.cwd()`. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Unused while `package.json` pins a released tarball, and kept for the swap to
// `"@y-core/forge": "file:../forge"` that verifies a cross-repo change before forge cuts a release.
// bun *links* a `file:` dependency and realpaths an imported module — though not the entry point —
// so forge's own `app-root.ts` sees its checkout with no `node_modules` above it, and
// `resolveAppRoot`'s derived branch refuses. The preset's `types:assets` row passes no `--root`, but
// it inherits this process's environment, and `FORGE_APP_ROOT` is the escape hatch `forge assets`
// already publishes for exactly this. It belongs here and not in forge: a released library should
// carry no resolution branch for an install shape production never uses.
process.env.FORGE_APP_ROOT ??= ROOT;

/** The installed canon, addressed relative to this repository so `citableDirs` can name its trees. */
const CANON = relative(ROOT, CANON_ROOT);

export const STEPS: readonly Step[] = [
  ...cloudflareWorkerSteps({
    sources: ["src/", "tests/", "config/", "playwright.config.ts"],
    // `tests/workerd/` is the `full`-tier `test:workerd` row's, and each of its specs starts a real
    // wrangler process — so the standard row must not sweep the directory too. Forge scopes its own
    // row to `src/` instead; starter cannot, because its tests live in `tests/`.
    tests: ["--path-ignore-patterns=**/workerd/**", "tests/"],
    assetConfig: "config/assets.ts",
    workerConfig: "wrangler.jsonc",
    warden: true,
    browser: true,
    // `design.sources` stays defaulted to `["src/"]`: the top-level `sources` above names `tests/`,
    // whose specs hold deliberately self-conflicting class literals `validate-class-order` would fail.
    design: { stylesheet: "src/assets/tailwind.css", cssDir: "src/assets" },
  }),
  // Temporary. `cloudflareWorkerSteps()` gates `test:browser` behind `browser?: boolean` and offers
  // no symmetric `workerd?: boolean`, so this row is a bug report against the preset rather than a
  // local convenience — delete it once the preset emits the row itself.
  workerdStep(),
  docsStep({
    root: ROOT,
    packageName: pkg.name,
    // Starter is a private app and publishes no subpaths, so the subpath-catalog half is inert.
    exports: {},
    decisionsDir: "docs",
    kind: "apps",
    citableDirs: [`${CANON}/shared`, `${CANON}/apps`],
  }),
  // `dependency: true` on all three: the installed forge's consumer-facing `docs/` are served into
  // this repository's index, so a gate that measured the index without them would be measuring
  // something no agent here queries. `.mcp.json` passes `--dependency` for the same reason.
  // No `catalogue`: the rendered one is canon-scoped and so the canon owner's to commit, and here
  // the live `knowledge://catalogue` resource is the copy.
  wardenStep({ root: ROOT, kind: "apps", dependency: true }, { tier: "standard" }),
  // Starter carries the fleet's worst filename collisions against the documents warden serves —
  // `CODE_REVIEW.md`, `ERROR_HANDLING.md`, `INPUT_VALIDATION.md`, `SOURCE_OF_TRUTH.md` and
  // `STRUCTURED_LOGGING.md` are spelled the same in more than one corpus — and until these rows
  // existed nothing here measured retrieval at all. `config/golden.ts` replaces forge's own set,
  // which is written for a library's vocabulary and expects `libs` documents this app never sees.
  wardenQueriesStep({ root: ROOT, kind: "apps", queries: GOLDEN, negative: NEGATIVE, dependency: true }, { tier: "standard" }),
  // Warnings only, deliberately: a specialisation legitimately restates the rule it narrows, so a
  // pair above the threshold is evidence to read rather than a build to stop.
  duplicatesStep({ root: ROOT, kind: "apps", dependency: true }, { tier: "standard" }),
];

export default STEPS;
