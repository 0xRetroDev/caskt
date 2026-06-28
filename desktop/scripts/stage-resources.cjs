// Copies the sibling build outputs (server + UI) into desktop/staging so that
// electron-builder only ever resolves extraResources from inside the desktop
// package. This sidesteps electron-builder 25.x's asar path bug (#8345), which
// throws "<file> must be under <projectDir>" when resources are pulled from
// sibling folders one level up (../server, ../ui).
//
// It also fails loudly if a required resource is missing, so a build can never
// again silently ship without the server or UI bundled.

const fs = require("fs");
const path = require("path");

const desktopDir = path.resolve(__dirname, "..");
const repoDir = path.resolve(desktopDir, "..");
const stagingDir = path.join(desktopDir, "staging");

// from (relative to repo root) -> to (relative to staging dir)
const resources = [
  ["server/package.json", "server/package.json"],
  ["server/dist", "server/dist"],
  ["server/node_modules", "server/node_modules"],
  ["ui/dist", "ui/dist"],
];

// Always start from a clean staging dir so a stale copy never ships.
fs.rmSync(stagingDir, { recursive: true, force: true });

const missing = [];
for (const [from] of resources) {
  if (!fs.existsSync(path.join(repoDir, from))) missing.push(from);
}
if (missing.length) {
  console.error("[stage] required build outputs are missing:");
  for (const m of missing) console.error(`  - ${m}`);
  console.error("[stage] run the server and UI builds before packaging.");
  process.exit(1);
}

for (const [from, to] of resources) {
  const src = path.join(repoDir, from);
  const dest = path.join(stagingDir, to);
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[stage] ${from} -> staging/${to}`);
}

console.log("[stage] resources staged");
