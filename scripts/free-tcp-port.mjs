/**
 * Stop processes listening on a TCP port (dev only).
 * Usage: node scripts/free-tcp-port.mjs 3001
 */
import { execFileSync } from "node:child_process";

const port = Number(process.argv[2]);
if (!Number.isFinite(port) || port <= 0) {
  console.error("Usage: node scripts/free-tcp-port.mjs <port>");
  process.exit(1);
}

function freePortWin(p) {
  let out = "";
  try {
    out = execFileSync("netstat", ["-ano"], { encoding: "utf8" });
  } catch {
    return 0;
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    if (!line.includes(`:${p}`) && !line.includes(`]:${p}`)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
  }
  for (const pid of pids) {
    try {
      execFileSync("taskkill", ["/F", "/PID", pid], { stdio: "ignore" });
      console.log(`[free-tcp-port] Stopped PID ${pid} on port ${p}`);
    } catch {
      /* already gone */
    }
  }
  return pids.size;
}

function freePortUnix(p) {
  try {
    const out = execFileSync("lsof", [`-ti:${p}`], { encoding: "utf8" }).trim();
    if (!out) return 0;
    const pids = out.split(/\s+/).filter(Boolean);
    for (const pid of pids) {
      try {
        execFileSync("kill", ["-9", pid], { stdio: "ignore" });
        console.log(`[free-tcp-port] Stopped PID ${pid} on port ${p}`);
      } catch {
        /* ignore */
      }
    }
    return pids.length;
  } catch {
    return 0;
  }
}

const n = process.platform === "win32" ? freePortWin(port) : freePortUnix(port);
if (n === 0) {
  console.log(`[free-tcp-port] No listener on port ${port}`);
}
