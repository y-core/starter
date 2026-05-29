// Minimal node: module stubs for build-time config files (e.g. src/assets/config.ts)
// that import from @y-core/forge/assets, which uses node: APIs internally.
// These declarations are not visible in the Worker runtime — module declarations
// don't pollute global scope.

declare module "node:path" {
  export function resolve(...paths: string[]): string;
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function basename(path: string, ext?: string): string;
  export function extname(path: string): string;
  export function relative(from: string, to: string): string;
  export function isAbsolute(path: string): boolean;
}
