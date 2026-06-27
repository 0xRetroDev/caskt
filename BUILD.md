# Building Caskt from source

This document is the build path a developer follows to verify that the published installers match the source. If you can produce a working build with these steps, you can trust the releases, because the [release workflow](.github/workflows/release.yml) runs these same steps on clean CI runners.

## Prerequisites

- **Node.js 20 or newer** and npm.
- A C/C++ toolchain, because the server uses a native SQLite module (`better-sqlite3`) that is recompiled for Electron during every build:
  - **Windows:** Visual Studio Build Tools with the "Desktop development with C++" workload.
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`).
  - **Linux:** `build-essential` and `python3`.
- **Windows only:** enable Developer Mode (Settings → System → For developers → Developer Mode), or run your terminal as Administrator. electron-builder unpacks its signing toolkit using symbolic links, which Windows only permits with that privilege. Without it the package step fails with `A required privilege is not held by the client`. If you hit that error before enabling it, clear the half-written cache once: `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"`. (GitHub's Windows CI runners already hold this privilege, so the published release builds are unaffected.)

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

The finished installer for your platform is written to `desktop/out`.

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

Local builds are unsigned and trigger a one-time OS prompt. Signing and
notarization are driven entirely by environment variables consumed by
`electron-builder` in CI, so unsigned builds need no secrets and anyone can build
from source. The installer also shows the MIT license as a wizard page
(`build/license.txt`).

See **SIGNING.md** for the full picture: the Windows certificate options and
their real-world cost, how to enable Azure Trusted Signing, and how to test the
signed-install flow for free with a self-signed certificate
(`desktop/scripts/make-test-cert.ps1`).

## Reproducibility

The release workflow checks out the tag, runs `npm run setup` and `npm run build` on stock GitHub-hosted runners for Windows, macOS and Linux, and uploads the resulting installers. There are no hidden build steps. A from-source build on the same OS and Node major version produces a functionally identical app.

## Releases and auto-update

This section is for maintainers cutting a release; building from source (above)
needs none of it. The desktop app updates itself from GitHub Releases via
`electron-updater`.

- **Cutting a release.** Push a tag like `v0.1.1` (matching `desktop/package.json`'s `version`). The `release` workflow builds on all three runners and attaches the installers **plus** the update metadata electron-updater needs: `latest.yml` (Windows), `latest-linux.yml` (Linux), and the `.blockmap` files. All of these must live on the same release for updates to work, which the workflow handles.
- **How clients update.** Windows and Linux AppImage builds download new versions in the background (when the user leaves auto-download on) and install when the user clicks **Restart to update** in Settings. Installs are never silent or mid-session, so a running schedule is never interrupted.
- **macOS and `.deb`.** These are unsigned, so they only *check* and notify; the Settings panel links the user to the GitHub release to install manually. To enable full macOS auto-update later, add Apple Developer ID signing + notarization (the env vars already referenced in CI) and ship a `zip` target alongside the `dmg`.
- **Feed config.** `publish:` in `desktop/electron-builder.yml` points at the GitHub repo; this is what generates the bundled `app-update.yml`. If the repo owner/name ever changes, update it there.

## Installer branding

The Windows installer and macOS DMG are branded rather than generic. The art is
generated from `desktop/build/icon.png`:

- `icon.ico` — Windows app + installer/uninstaller icon.
- `installerSidebar.bmp` (164×314) — the NSIS welcome/finish panel (icon + wordmark + tagline).
- `installerHeader.bmp` (150×57) — the inner-page header, a centered "caskt" wordmark with no icon.
- `dmg-background.png` (+ `@2x`) — the macOS DMG window background with a drag-to-Applications layout.

The wordmark is drawn in the app's brand face, Saira Condensed, vendored at
`desktop/build/fonts/` so the script reproduces the shipped art exactly; if that
font is missing it falls back to a condensed system font. These are wired up in
`desktop/electron-builder.yml` (the `nsis:` and `dmg:` blocks). To regenerate
after changing the icon or brand, run from `desktop/`:

```bash
python3 scripts/make-installer-art.py   # needs Pillow
```

The NSIS bitmaps must keep their exact dimensions and stay 24-bit BMP, the script handles that.
