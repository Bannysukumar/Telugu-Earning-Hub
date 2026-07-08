/**
 * Deploy Cloud Functions using the Firebase service account JSON (no interactive login).
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const saName = "telugu-earning-hub-2f74e-firebase-adminsdk-fbsvc-b79180c635.json";
const saPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH
  ? path.resolve(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)
  : path.join(repoRoot, saName);

if (!existsSync(saPath)) {
  console.error(`Service account not found: ${saPath}`);
  process.exit(1);
}

const env = {
  ...process.env,
  GOOGLE_APPLICATION_CREDENTIALS: saPath,
  FIREBASE_SERVICE_ACCOUNT_PATH: saPath,
};

console.log(`[firebase] Using credentials: ${saPath}`);
console.log("[firebase] Deploying functions to telugu-earning-hub-2f74e…\n");

const build = spawnSync("npm", ["run", "build"], {
  cwd: path.join(repoRoot, "firebase", "functions"),
  stdio: "inherit",
  shell: true,
  env,
});
if (build.status !== 0) process.exit(build.status ?? 1);

const deploy = spawnSync(
  "npx",
  [
    "--yes",
    "firebase-tools@latest",
    "deploy",
    "--only",
    "functions",
    "--project",
    "telugu-earning-hub-2f74e",
    "--force",
  ],
  { cwd: repoRoot, stdio: "inherit", shell: true, env },
);

process.exit(deploy.status ?? 1);
