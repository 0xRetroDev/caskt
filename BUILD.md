# Building Caskt from source

This document is the build path a developer follows to verify that the published installers match the source. Caskt has no hidden build steps: if you can produce a working build with the steps below, you can trust the releases, because they are produced by running these exact same commands. Releases are cut by hand on Windows rather than by CI, so building it yourself is how you confirm what is in them.

## Prerequisites

- **Node.js 20 or newer** and npm.
- **Visual Studio Build Tools** with the "Desktop development with C++" workload, because the server uses a native SQLite module (`better-sqlite3`) that is recompiled for Electron during every build.
- Enable **Developer Mode** (Settings → System → For developers → Developer Mode), or run your terminal as Administrator. electron-builder unpacks its toolkit using symbolic links, which Windows only permits with that privilege. Without it the package step fails with `A required privilege is not held by the client`. If you hit that error before enabling it, clear the half-written cache once: `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"`.

No global tooling is required beyond Node and the compiler; everything else is installed locally per package.

## Layout

Caskt is a small monorepo of three independent packages. They are installed separately rather than hoisted, so the server keeps a self-contained `node_modules`. This matters for packaging the native module (see below).

```
server/    the local Node server (TypeScript -> dist)
ui/        the React front end (Vite -> dist)
desktop/   the Electron shell and electron-builder config
```

## Install and build

From the repository root:

```bash
npm run setup    # installs server, ui and desktop dependencies
npm run build    # builds the server, the UI, then packages the desktop app
```

The finished Windows installer is written to `desktop/out`, along with the `latest.yml` and `.blockmap` files the auto-updater needs.

To produce an unpacked build (useful for debugging, no installer) use:

```bash
npm run build:dir
```

## Running in development

```bash
npm run dev
```

This builds the server and UI, prepares the native module for Electron (see below), and launches the Electron shell. The window loads the local server at `http://127.0.0.1:8765`. Closing the window keeps the app running in the tray so scheduled moves continue; quit from the tray menu to stop it.

You can also run the server and UI standalone without Electron, which is handy for backend work:

```bash
npm --prefix server run serve      # starts the server on :8765
npm --prefix ui run dev            # starts Vite with a proxy to the server
```

## The native module (the one delicate part)

`better-sqlite3` is a compiled native module. A given build matches exactly one runtime ABI, and Electron's bundled Node is a different ABI from your system Node.

- When you run `npm run setup`, `better-sqlite3` is built for your **system Node**. That is what the standalone server uses.
- When you build or run the desktop app, `desktop/scripts/rebuild-native.cjs` runs first. It rebuilds `better-sqlite3` for **Electron's ABI**, so it loads correctly inside the desktop shell. (The server's dev dependencies are left in place so repeated builds keep working; they are excluded from the packaged app by the electron-builder file filter, not by deleting them.)

Because both the standalone server and the desktop app share `server/node_modules`, rebuilding for one swaps the ABI away from the other. After packaging the desktop app, run `npm run setup` again (or `npm --prefix server rebuild better-sqlite3`) if you want to run the standalone server under plain Node afterward. This trade-off is intentional: it keeps the app to a single copy of the module and avoids shipping a second Node runtime.

If a desktop build fails to open the database, this rebuild step is almost always the cause. Re-run `npm run build` (which re-runs the prep) on a clean checkout.

## Tests and type checking

```bash
npm test         # server unit tests
npm run typecheck
```

## Code signing

Releases are unsigned for now, so Windows SmartScreen shows an "unknown
publisher" warning on first run (click **More info -> Run anyway**). Signing is
optional and off: the app builds and runs fine without it, and the installer
shows the MIT license as a wizard page (`build/license.txt`).

See **SIGNING.md** for the full picture: the Windows certificate options and
their real-world cost, how to enable Azure Trusted Signing, and how to test the
signed-install flow for free with a self-signed certificate
(`desktop/scripts/make-test-cert.ps1`).

## Reproducibility

There are no hidden build steps: `npm run setup` and `npm run build` are the entire build. A from-source build on Windows with the same Node major version produces a functionally identical app to the published installer. That is how you verify a release without trusting anyone: build it yourself and compare.

## Releases and auto-update

This section is for maintainers cutting a release; building from source (above)
needs none of it. The desktop app updates itself from GitHub Releases via
`electron-updater`.

- **Cutting a release.** Bump the `version` in both `desktop/package.json` and the root `package.json`, commit, then run `npm run setup && npm run build` on Windows. Create a GitHub release on the matching tag (e.g. `v0.1.1`) and upload the three files from `desktop/out` that belong together: `Caskt-Setup-*.exe`, `latest.yml`, and `Caskt-Setup-*.exe.blockmap`. All three must live on the same release for auto-update to work.
- **How clients update.** The installed app checks GitHub for a newer `latest.yml`, downloads in the background (when the user leaves auto-download on), and installs when the user clicks **Restart to update** in Settings. Installs are never silent or mid-session, so a running schedule is never interrupted.
- **Feed config.** `publish:` in `desktop/electron-builder.yml` points at the GitHub repo; this is what generates the bundled `app-update.yml` and the `latest.yml`. If the repo owner/name ever changes, update it there.

## Installer branding

The Windows installer is branded rather than generic. The art is generated from
`desktop/build/icon.png`:

- `icon.ico` — Windows app + installer/uninstaller icon.
- `installerSidebar.bmp` (164×314) — the NSIS welcome/finish panel (icon + wordmark + tagline).
- `installerHeader.bmp` (150×57) — the inner-page header, a centered "caskt" wordmark with no icon.

The wordmark is drawn in the app's brand face, Saira Condensed, vendored at
`desktop/build/fonts/` so the script reproduces the shipped art exactly; if that
font is missing it falls back to a condensed system font. These are wired up in
`desktop/electron-builder.yml` (the `nsis:` block). To regenerate
after changing the icon or brand, run from `desktop/`:

```bash
python3 scripts/make-installer-art.py   # needs Pillow
```

The NSIS bitmaps must keep their exact dimensions and stay 24-bit BMP, the script handles that.
