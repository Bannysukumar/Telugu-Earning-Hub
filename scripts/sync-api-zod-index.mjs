/**
 * Keeps lib/api-zod/src/index.ts exporting only ./generated/api (avoids duplicate
 * type names also emitted under generated/types).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(__dirname, "..", "lib", "api-zod", "src", "index.ts");
const content = `export * from "./generated/api";\n`;
fs.writeFileSync(indexPath, content, "utf8");
console.log(`Wrote ${indexPath}`);
