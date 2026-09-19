/** The host half of this app's database position, loaded by `forge db` through the default export. */

import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { DbHostConfig } from "@y-core/forge/tooling/db";

// Made relative again because the composed snapshot keys its digests on the text written here — an
// absolute path would be this machine's, and the committed artifact would differ per checkout.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FORGE_AUTH_SCHEMA = relative(ROOT, fileURLToPath(import.meta.resolve("@y-core/forge/auth/schema.sql")));

export default {
  // Load order into one empty database: `config/schema.sql`'s `preferences` carries a FOREIGN KEY
  // to forge's `auth_users`, so reordering these composes a schema that will not apply.
  schemas: [FORGE_AUTH_SCHEMA, "config/schema.sql"],
  seeds: ["config/seeds"],
  migrations: "config/migrations",
  snapshot: "config/schema.snapshot.json",
} satisfies DbHostConfig;
