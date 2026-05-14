/**
 * Starts API + Vite together: picks a free API port (from API_PORT or 3001) and
 * sets VITE_API_PROXY_TARGET so /api on the web app reaches the running API.
 */
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(repoRoot, "artifacts", "api-server");
const webRoot = path.join(repoRoot, "artifacts", "roi-platform");

/** @param {number} start */
function pickPort(start) {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(pickPort(start + 1)));
    s.listen(start, "0.0.0.0", () => {
      const addr = s.address();
      const p = typeof addr === "object" && addr ? addr.port : start;
      s.close(() => resolve(p));
    });
  });
}

execFileSync(process.execPath, ["./build.mjs"], {
  cwd: apiRoot,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: "development" },
});

const preferredApi = Number(process.env.API_PORT) || 3001;
const apiPort = await pickPort(preferredApi);
if (apiPort !== preferredApi) {
  console.log(`[dev] API port ${preferredApi} is busy; using ${apiPort}. Proxy: http://127.0.0.1:${apiPort}`);
}

const apiEntry = path.join(apiRoot, "dist", "index.mjs");
const apiChild = spawn(process.execPath, ["--enable-source-maps", apiEntry], {
  cwd: apiRoot,
  stdio: "inherit",
  env: { ...process.env, PORT: String(apiPort), NODE_ENV: "development" },
});

const webChild = spawn("pnpm", ["exec", "vite", "--config", "vite.config.ts", "--host", "0.0.0.0"], {
  cwd: webRoot,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    PORT: "5173",
    BASE_PATH: "/",
    VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
    NODE_ENV: "development",
  },
});

function shutdown() {
  apiChild.kill("SIGTERM");
  webChild.kill("SIGTERM");
}
process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});
process.on("SIGTERM", shutdown);

apiChild.on("exit", (c) => {
  webChild.kill("SIGTERM");
  process.exit(c ?? 0);
});
webChild.on("exit", (c) => {
  apiChild.kill("SIGTERM");
  process.exit(c ?? 0);
});
