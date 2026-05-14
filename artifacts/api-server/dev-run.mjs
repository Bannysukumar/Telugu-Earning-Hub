import { createServer } from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
const entry = path.join(apiRoot, "dist", "index.mjs");

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

const preferred = Number(process.env.PORT) || 3001;
const port = await pickPort(preferred);
if (port !== preferred) {
  console.warn(`[api] Port ${preferred} is in use; listening on ${port} instead.`);
}

const child = spawn(process.execPath, ["--enable-source-maps", entry], {
  cwd: apiRoot,
  stdio: "inherit",
  env: { ...process.env, PORT: String(port), NODE_ENV: process.env.NODE_ENV || "development" },
});
child.on("exit", (code) => process.exit(code ?? 0));
