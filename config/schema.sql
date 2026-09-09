-- forge-starter — this app's own desired D1 schema.
--
-- This file is what the app's own schema *is*, not a migration. `config/db.ts` names it, and every
-- other file `forge db` reads, by path; `bun run db:compose` diffs them all against the migrations
-- already in `config/migrations/` and writes the difference as the next numbered file there.
--
-- The `auth_*` tables are not here: forge's own `schema.sql` declares them, and this app composes
-- them into its migrations without owning the declaration. The FOREIGN KEY below is the case a
-- library shipping its own migrations could not have expressed — the rebuild closure of an
-- `auth_users` change reaches this table, and both land in one migration this app owns.

CREATE TABLE IF NOT EXISTS preferences (
  -- One row per account, so the primary key is the foreign key.
  user_id BLOB PRIMARY KEY NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system',
  updated_at INTEGER NOT NULL,
  CHECK (theme IN ('system', 'light', 'dark'))
) STRICT;
