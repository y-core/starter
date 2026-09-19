import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";

import type { D1DatabaseLike, D1PreparedStatement, D1Result } from "@y-core/forge/storage/db";

/** A prepared statement that remembers what it was prepared from, so `batch` can run it. */
interface BoundStatement extends D1PreparedStatement {
  readonly text: string;
  readonly values: unknown[];
}

/** The composed migration this repository deploys, so a fixture database is the deployed schema. */
const MIGRATION = new URL("../config/migrations/0001_schema.sql", import.meta.url);

/** An in-memory SQLite database carrying this repository's own migration, behind the D1 shape the app binds. */
export function sqliteD1(): D1DatabaseLike & { rows: <Row = unknown>(sql: string) => Row[]; close: () => void } {
  const db = new Database(":memory:");
  db.exec(readFileSync(MIGRATION, "utf-8"));

  function statement(text: string, values: unknown[]): BoundStatement {
    const prepared = () => db.query(text);
    return {
      text,
      values,
      bind: (...next: unknown[]) => statement(text, next),
      all: async <T = unknown>(): Promise<D1Result<T>> => {
        const results = prepared().all(...values) as T[];
        return { results, success: true, meta: { duration: 0, rows_read: results.length } };
      },
      first: async <T = unknown>(column?: string): Promise<T | null> => {
        const row = prepared().get(...values) as Record<string, unknown> | null;
        if (row === null) return null;
        if (column === undefined) return row as T;
        if (!Object.hasOwn(row, column)) throw new Error(`D1_ERROR: no such column: ${column}`);
        return row[column] as T;
      },
      run: async (): Promise<D1Result<unknown>> => {
        const { changes, lastInsertRowid } = prepared().run(...values);
        return { results: [], success: true, meta: { rows_written: changes, changes, last_row_id: Number(lastInsertRowid), duration: 0 } };
      },
    } as unknown as BoundStatement;
  }

  return {
    prepare: (sql: string): D1PreparedStatement => statement(sql, []),
    batch: async <T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> => {
      const out: D1Result<T>[] = [];
      for (const one of statements as BoundStatement[]) out.push((await one.run()) as D1Result<T>);
      return out;
    },
    exec: async (sql: string): Promise<{ count: number; duration: number }> => {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
    rows: <Row = unknown>(sql: string): Row[] => db.query<Row>(sql).all(),
    close: () => {
      db.close();
    },
  };
}
