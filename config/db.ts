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

import type { DbHostConfig } from "@y-core/forge/tooling/db";

export default { schemas: ["node_modules/@y-core/forge/src/auth/schema.sql", "config/schema.sql"], seeds: ["config/seeds"] } satisfies DbHostConfig;
