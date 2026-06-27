// Writes a release version into the root and desktop package.json files so the
// shipped app version always matches the git tag that triggered the release.
// The release workflow calls this with the pushed tag, making the tag the single
// source of truth, so the version can never drift from the GitHub release.
//
// Usage: node scripts/set-version.cjs v0.2.0   (a leading "v" is optional)
const { readFileSync, writeFileSync } = require("node:fs");
const path = require("node:path");

const input = process.argv[2];
if (!input) {
  console.error("set-version: a version argument is required (e.g. v0.2.0)");
  process.exit(1);
}

// Accept "v0.2.0" or "0.2.0"; electron-builder wants a bare semver string.
const version = input.replace(/^v/, "").trim();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`set-version: "${input}" is not a valid semver version`);
  process.exit(1);
}

for (const file of ["package.json", path.join("desktop", "package.json")]) {
  const abs = path.resolve(file);
  const pkg = JSON.parse(readFileSync(abs, "utf8"));
  pkg.version = version;
  writeFileSync(abs, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`set ${file} -> ${version}`);
}
