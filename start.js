#!/usr/bin/env node
// Divorce app dev launcher (Node). Usage: node start.js
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const run = (cmd, args) =>
  spawnSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32" });

const node = run("node", ["--version"]);
if (node.error || node.status !== 0) {
  console.error("node is not installed — get it from https://nodejs.org");
  process.exit(1);
}

if (!existsSync(join(root, "node_modules"))) {
  console.log("Installing dependencies…");
  run("npm", ["install"]);
}

console.log("Starting dev server…");
run("npm", ["run", "dev"]);
