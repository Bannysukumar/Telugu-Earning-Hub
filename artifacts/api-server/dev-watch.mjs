/**
 * Rebuild dist and restart the API when src/ changes (local dev).
 */
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(apiRoot, "dist", "index.mjs");
const srcDir = path.join(apiRoot, "src");

const port = process.env.PORT;
if (!port) {
  console.error("[api-watch] PORT is required");
  process.exit(1);
}

/** @type {import('node:child_process').ChildProcess | null} */
let child = null;
let restartTimer = null;
let building = false;

function build() {
  console.log("[api-watch] Building API…");
  execFileSync(process.execPath, ["./build.mjs"], {
    cwd: apiRoot,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "development" },
  });
}

function stopChild() {
  if (!child) return;
  child.kill("SIGTERM");
  child = null;
}

function startChild() {
  stopChild();
  child = spawn(process.execPath, ["--enable-source-maps", entry], {
    cwd: apiRoot,
    stdio: "inherit",
    env: { ...process.env, PORT: port, NODE_ENV: "development" },
  });
  child.on("exit", (code, signal) => {
    if (signal === "SIGTERM" || signal === "SIGKILL") return;
    console.error(`[api-watch] API exited (code=${code ?? "?"}, signal=${signal ?? "?"})`);
    process.exit(code ?? 1);
  });
}

function scheduleRestart() {
  if (building) return;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    building = true;
    try {
      build();
      startChild();
      console.log(`[api-watch] API listening on http://127.0.0.1:${port}`);
    } catch (e) {
      console.error("[api-watch] Build failed:", e);
    } finally {
      building = false;
    }
  }, 400);
}

build();
startChild();
console.log(`[api-watch] API listening on http://127.0.0.1:${port}`);

watch(srcDir, { recursive: true }, (event, filename) => {
  if (!filename || !/\.(ts|tsx|js|mjs)$/.test(filename)) return;
  if (event !== "change" && event !== "rename") return;
  console.log(`[api-watch] ${filename} changed — rebuilding…`);
  scheduleRestart();
});

function shutdown() {
  if (restartTimer) clearTimeout(restartTimer);
  stopChild();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
