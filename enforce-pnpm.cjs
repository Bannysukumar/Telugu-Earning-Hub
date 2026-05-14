/**
 * Root preinstall: remove accidental npm/yarn lockfiles; require pnpm.
 * Cross-platform (Windows/macOS/Linux) — avoids relying on `sh`.
 */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
for (const name of ["package-lock.json", "yarn.lock"]) {
  try {
    fs.unlinkSync(path.join(root, name));
  } catch {
    /* ignore */
  }
}

const ua = process.env.npm_config_user_agent || "";
if (!ua.startsWith("pnpm/")) {
  console.error(
    "This monorepo uses pnpm. Do not use npm install or yarn.\n" +
      "Install pnpm: https://pnpm.io/installation\n" +
      "Then run: pnpm install",
  );
  process.exit(1);
}
