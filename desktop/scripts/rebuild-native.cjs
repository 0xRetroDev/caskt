// Prepare the server's native dependency for the desktop app.
//
// The server is loaded inside Electron's main process, so its native module
// (better-sqlite3) must be compiled for Electron's ABI, not the system Node ABI
// it was installed with. This rebuilds it in place.
//
// Note: this rebuilds the SAME server/node_modules the standalone server uses,
// so afterwards run `npm --prefix server rebuild better-sqlite3` if you want to
// run the bare server under plain Node again. Dev dependencies are NOT pruned
// here (that would break the next TypeScript build); they are simply excluded
// from the packaged app by the electron-builder file filter instead.

const path = require("node:path");
const { rebuild } = require("@electron/rebuild");
const electronVersion = require("electron/package.json").version;

const serverDir = path.join(__dirname, "..", "..", "server");

(async () => {
  console.log(`> Rebuilding native modules for Electron ${electronVersion}`);
  await rebuild({
    buildPath: serverDir,
    electronVersion,
    force: true,
    onlyModules: ["better-sqlite3"],
  });
  console.log("> Native preparation complete");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
