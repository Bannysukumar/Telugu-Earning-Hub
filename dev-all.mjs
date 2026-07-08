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
const freePortScript = path.join(repoRoot, "scripts", "free-tcp-port.mjs");

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

const preferredApi = Number(process.env.API_PORT) || 3001;

// A stale API left on the default port causes 404 on new routes (e.g. sponsor-tree).
try {
  execFileSync(process.execPath, [freePortScript, String(preferredApi)], {
    cwd: repoRoot,
    stdio: "inherit",
  });
} catch {
  /* port may already be free */
}

const apiPort = await pickPort(preferredApi);
if (apiPort !== preferredApi) {
  console.warn(
    `[dev] Port ${preferredApi} is still busy after cleanup; API on ${apiPort}. ` +
      `Set VITE_API_PROXY_TARGET=http://127.0.0.1:${apiPort} if you run Vite alone.`,
  );
}

async function verifyApiRoutes(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/api/user/sponsor-tree`);
    if (res.status === 404) {
      console.error(
        "[dev] ERROR: GET /api/user/sponsor-tree returned 404. The API bundle is stale. " +
          "Stop all Node processes, run `pnpm dev` again from the repo root.",
      );
      return;
    }
    if (res.status === 401) {
      console.log("[dev] API routes OK (sponsor-tree requires auth, got 401 as expected).");
    } else {
      console.log(`[dev] API sponsor-tree probe: HTTP ${res.status}`);
    }
  } catch (e) {
    console.warn("[dev] Could not probe API routes:", e instanceof Error ? e.message : e);
  }
}

const apiChild = spawn(process.execPath, ["./dev-watch.mjs"], {
  cwd: apiRoot,
  stdio: "inherit",
  env: { ...process.env, PORT: String(apiPort), NODE_ENV: "development" },
});

await new Promise((resolve) => setTimeout(resolve, 2500));
await verifyApiRoutes(`http://127.0.0.1:${apiPort}`);
console.log(`[dev] API → http://127.0.0.1:${apiPort}  |  Web → http://127.0.0.1:5173  |  Proxy /api → API`);

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
