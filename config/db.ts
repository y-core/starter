/** The host half of this app's database position, loaded by `forge db` through the default export. */
// feature:auth:begin
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// feature:auth:end

import type { DbHostConfig } from "@y-core/forge/tooling/db";

const SCHEMAS: string[] = [];
// feature:auth:begin
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Made relative again because the composed snapshot keys its digests on the text written here — an
// absolute path would be this machine's, and the committed artifact would differ per checkout.
SCHEMAS.push(relative(ROOT, fileURLToPath(import.meta.resolve("@y-core/forge/auth/schema.sql"))));
// feature:auth:end

export default {
  schemas: SCHEMAS,
  seeds: ["config/db/seeds"],
  migrations: "config/db/migrations",
  snapshot: "config/db/schema.snapshot.json",
} satisfies DbHostConfig;
