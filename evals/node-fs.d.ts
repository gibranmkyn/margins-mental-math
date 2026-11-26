/**
 * The repo has no Node type definitions (the app runs in the browser, and tests read
 * content through `import.meta.glob`). The evals run under Vitest in Node and write
 * their report and judge inputs with these functions only, so only these are declared
 * (and the evals' config checks for the private booklet files with the first two).
 */
declare module 'node:fs' {
  export function existsSync(path: string | URL): boolean;
  export function readdirSync(path: string | URL): string[];
  export function mkdirSync(path: string | URL, options?: { recursive?: boolean }): string | undefined;
  export function writeFileSync(path: string | URL, data: string): void;
  export function rmSync(path: string | URL, options?: { recursive?: boolean; force?: boolean }): void;
}
