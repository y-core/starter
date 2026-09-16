/** The host half of the database's definable position. `forge db` loads it through the default
 *  export; `wrangler.jsonc` owns the other half, `migrations_dir`.
 *
 *  `schemas` names every desired-state file this app composes from, by path, and nothing else is
 *  read: an installed package contributes no DDL because it happens to ship some, only because it
 *  is named here. Order is load order into one empty database, so forge's `auth_users` is declared
 *  before `config/schema.sql`, whose `preferences` carries a FOREIGN KEY to it.
 *
 *  Deliberately outside `tsconfig.json`'s `include`: importing `@y-core/forge/tooling/db` pulls
 *  forge's build-time tree into the type program, which typechecks only with node's `process` and
 *  `Buffer` in global scope — exactly what `"types": []` withholds from the Worker.
 */

import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DbHostConfig } from "@y-core/forge/tooling/db";

// Resolved through the exports map rather than written as a literal `node_modules/@y-core/forge/…`
// path: the subpath is the facade, and a literal survives no rename inside forge. Made relative
// again because the composed snapshot keys its digests on the text written here — an absolute path
// would be this machine's, and the committed artifact would differ per checkout.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORGE_AUTH_SCHEMA = relative(ROOT, fileURLToPath(import.meta.resolve("@y-core/forge/auth/schema.sql")));

// `migrations` and `snapshot` are stated rather than defaulted: the defaults sit at the repository
// root, these files do not, and a position nobody wrote down is one a later reader has to find by
// running the command and watching where it looks.
export default {
  schemas: [FORGE_AUTH_SCHEMA, "config/schema.sql"],
  seeds: ["config/seeds"],
  migrations: "config/migrations",
  snapshot: "config/schema.snapshot.json",
} satisfies DbHostConfig;
