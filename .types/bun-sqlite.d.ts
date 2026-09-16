// Minimal ambient declarations for `bun:sqlite`, restricted to what the test fixtures use.
// Avoids bun-types, which overrides the DOM and Workers globals this app's runtime depends on.

declare module "bun:sqlite" {
  interface Statement<Row = unknown> {
    all(...params: unknown[]): Row[];
    get(...params: unknown[]): Row | null;
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
    finalize(): void;
  }

  export class Database {
    constructor(path?: string, options?: { create?: boolean; readonly?: boolean; strict?: boolean });
    exec(sql: string): void;
    query<Row = unknown>(sql: string): Statement<Row>;
    close(): void;
  }
}
