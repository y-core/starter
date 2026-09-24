/** The features a copy of this repository may leave out: each one's directories, and the files holding its marked lines. */

import { defineFeatures } from "@y-core/forge/tooling/curate";

export default defineFeatures({
  // feature:showcase:begin
  showcase: {
    directories: ["src/showcase/", "tests/unit/showcase/", "tests/seam/showcase/", "tests/browser/showcase/"],
    seams: ["src/worker.ts", "src/client/main.ts", "config/steps.ts", ".oxlintrc.json", "CLAUDE.md"],
    requires: ["turnstile"],
  },
  // feature:showcase:end
  // feature:contact:begin
  contact: {
    directories: ["src/contact/", "tests/unit/contact/", "tests/seam/contact/", "tests/browser/contact/", "tests/workerd/contact/"],
    seams: ["src/worker.ts", "config/assets.ts", "CLAUDE.md"],
    requires: ["email", "turnstile", "rate-limit"],
  },
  // feature:contact:end
  // feature:email:begin
  email: {
    directories: ["src/email/", "tests/unit/email/"],
    seams: ["src/app/config.ts", "wrangler.jsonc", ".dev.vars.example", "tests/env.ts", "CLAUDE.md"],
  },
  // feature:email:end
  // feature:turnstile:begin
  turnstile: {
    directories: ["src/turnstile/", "tests/seam/turnstile/"],
    seams: ["src/app/config.ts", "src/worker.dev.ts", "wrangler.jsonc", ".dev.vars.example", "tests/env.ts", "README.md", "CLAUDE.md"],
  },
  // feature:turnstile:end
  // feature:auth:begin
  auth: {
    directories: ["src/auth/", "tests/unit/auth/", "tests/seam/auth/", "tests/workerd/auth/"],
    seams: [
      "src/worker.ts",
      "src/app/config.ts",
      "src/client/main.ts",
      "config/db.ts",
      "wrangler.jsonc",
      ".dev.vars.example",
      "tests/env.ts",
      "CLAUDE.md",
    ],
    requires: ["db", "rate-limit"],
  },
  // feature:auth:end
  // feature:db:begin
  db: {
    directories: ["src/db/", "config/db/", "tests/seam/db/"],
    seams: ["src/worker.ts", "config/steps.ts", "wrangler.jsonc", "tests/env.ts", "CLAUDE.md"],
    regenerate: { remove: ["config/db/migrations/", "config/db/schema.snapshot.json"], run: ["forge", "db", "migrate", "compose"] },
  },
  // feature:db:end
  // feature:rate-limit:begin
  "rate-limit": {
    directories: ["src/rate-limit/", "tests/seam/rate-limit/"],
    seams: ["src/worker.ts", "src/worker.dev.ts", "wrangler.jsonc", "CLAUDE.md"],
  },
  // feature:rate-limit:end
});
