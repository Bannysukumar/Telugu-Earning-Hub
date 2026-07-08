/**
 * Regenerates `lib/api-client-react/src/generated-api-reexports.ts` with explicit
 * `export { … }` / `export type { … }` from `./generated/api` so Vite does not miss
 * names when re-exporting a very large Orval module via `export *`.
 *
 * Run after OpenAPI / Orval codegen:
 *   node scripts/sync-api-client-react-barrel.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const apiPath = path.join(
  root,
  "lib",
  "api-client-react",
  "src",
  "generated",
  "api.ts",
);
const outPath = path.join(
  root,
  "lib",
  "api-client-react",
  "src",
  "generated-api-reexports.ts",
);

const s = fs.readFileSync(apiPath, "utf8");

const valueNames = new Set();
const typeNames = new Set();

const walk = (re, bucket) => {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(s))) bucket.add(m[1]);
};

walk(/^export const ([A-Za-z0-9_]+)/gm, valueNames);
walk(/^export function ([A-Za-z0-9_]+)/gm, valueNames);
walk(/^export async function ([A-Za-z0-9_]+)/gm, valueNames);
walk(/^export type ([A-Za-z0-9_]+)/gm, typeNames);
walk(/^export interface ([A-Za-z0-9_]+)/gm, typeNames);

const values = [...valueNames].sort();
const types = [...typeNames].sort();

const header = `/* eslint-disable prettier/prettier */
/**
 * AUTO-GENERATED — do not edit by hand.
 * Source: scripts/sync-api-client-react-barrel.mjs (run after Orval codegen).
 */
`;

const fmt = (names) =>
  names.length === 0
    ? ""
    : `\n${names.map((n) => `  ${n},`).join("\n")}\n`;

const body = `${header}export {${fmt(values)}} from "./generated/api";
export type {${fmt(types)}} from "./generated/api";
`;

fs.writeFileSync(outPath, body, "utf8");
console.log(
  `Wrote ${outPath} (${values.length} values, ${types.length} types).`,
);
