// Caskt desktop shell.
//
// Responsibilities, kept deliberately small and auditable:
//   1. Start the local Caskt server in this process (no separate runtime).
//   2. Point the server at a per-user data directory and the bundled UI.
//   3. Show a window that loads the local server, and a tray so the app can
//      keep running in the background to execute scheduled moves.
//
// There is no telemetry, no auto-update phone-home, and no network access
// beyond what the server itself makes to Steam and the public price feeds.

const { app, BrowserWindow, Tray, Menu, shell, nativeImage, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const http = require("node:http");
const { pathToFileURL } = require("node:url");
const { autoUpdater } = require("electron-updater");

const PORT = Number(process.env.CASKT_PORT || 8765);
const BASE_URL = `http://127.0.0.1:${PORT}`;

let mainWindow = null;
let tray = null;
let server = null;
let isQuitting = false;
let isInstalling = false;

// Only one instance may run, otherwise two servers would fight over the port
// and the Steam session.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => showWindow());
  app.whenReady().then(bootstrap).catch(fatal);
}

// Resolve a path that works both in development (running from the repo) and in
// the packaged app (resources live next to the executable).
function resourcePath(...parts) {
  const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
  return path.join(root, ...parts);
}

async function bootstrap() {
  setupFileLogging();
  try {
    await startServer();
  } catch (err) {
    fatal(err);
    return;
  }
  createTray();
  createWindow();
  setupUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
}

// The server runs in this process, so its console output has nowhere to go in a
// packaged app. Tee console.log/warn/error to a rolling file the user can open
// from the tray, so diagnostics (e.g. the def-4001 ghost dump) are accessible.
const LOG_MAX_BYTES = 5 * 1024 * 1024;
let logFilePath = null;
function setupFileLogging() {
  try {
    const dir = path.join(app.getPath("userData"), "data", "logs");
    fs.mkdirSync(dir, { recursive: true });
    logFilePath = path.join(dir, "caskt.log");
    try {
      if (fs.statSync(logFilePath).size > LOG_MAX_BYTES) {
        fs.renameSync(logFilePath, path.join(dir, "caskt.prev.log"));
      }
    } catch {
      /* no existing log yet */
    }
    const stream = fs.createWriteStream(logFilePath, { flags: "a" });
    const util = require("node:util");
    const tee = (orig, level) => (...args) => {
      try {
        const line = args.map((a) => (typeof a === "string" ? a : util.inspect(a))).join(" ");
        stream.write(`${new Date().toISOString()} [${level}] ${line}\n`);
      } catch {
        /* never let logging break the app */
      }
      orig(...args);
    };
    console.log = tee(console.log.bind(console), "info");
    console.warn = tee(console.warn.bind(console), "warn");
    console.error = tee(console.error.bind(console), "error");
    console.log(`[caskt] logging to ${logFilePath}`);
  } catch {
    /* logging is best-effort; never block startup */
  }
}

async function startServer() {
  // Per-user, OS-appropriate data location (Roaming on Windows, Application
  // Support on macOS, ~/.config on Linux). Keeps DB, token and cached data.
  process.env.CS2_STASH_DIR = path.join(app.getPath("userData"), "data");
  process.env.PORT = String(PORT);
  process.env.UI_DIR = resourcePath("ui", "dist");
  process.env.CASKT_VERSION = app.getVersion();

  const entry = resourcePath("server", "dist", "server", "index.js");
  const mod = await import(pathToFileURL(entry).href);
  server = mod.createServer({ port: PORT, uiDir: process.env.UI_DIR });

  await waitForServer(20000);
}

// Wait until the server answers, so we never load a blank window.
function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const ping = () => {
      const req = http.get(`${BASE_URL}/api/status`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("Server did not start in time"));
        else setTimeout(ping, 250);
      });
    };
    ping();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0c0f14",
    title: "Caskt",
    icon: resourcePath("desktop", "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(BASE_URL);

  // Open external links (e.g. the builder's site) in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://127.0.0.1") || url.startsWith(BASE_URL)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Closing the window hides to tray so scheduled moves keep running.
  mainWindow.on("close", (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
  });
}

function showWindow() {
  if (!mainWindow) return createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(resourcePath("desktop", "build", "icon.png"));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("Caskt");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Caskt", click: () => showWindow() },
      { type: "separator" },
      {
        label: "Open log file",
        click: () => {
          if (logFilePath) shell.openPath(logFilePath);
        },
      },
      {
        label: "Open data folder",
        click: () => shell.openPath(path.join(app.getPath("userData"), "data")),
      },
      { type: "separator" },
      { label: "Quit", click: () => quit() },
    ]),
  );
  tray.on("click", () => showWindow());
  tray.on("double-click", () => showWindow());
}

function quit() {
  isQuitting = true;
  app.quit();
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", async (e) => {
  if (isInstalling) return; // the updater is handling quit + relaunch
  if (server && typeof server.close === "function") {
    e.preventDefault();
    try {
      await server.close();
    } catch {
      /* ignore */
    }
    server = null;
    app.exit(0);
  }
});

// Keep running in the tray when all windows are closed.
app.on("window-all-closed", () => {});

// --- Auto-update ---------------------------------------------------------
//
// Updates come from GitHub Releases via electron-updater. We auto-DOWNLOAD in
// the background (when enabled) but never auto-INSTALL: the user clicks
// "Restart to update", so an update can never interrupt a running schedule.
// Windows and Linux AppImage support the full flow. macOS and .deb builds are
// unsigned here, so we only check and notify, linking to the download.

const CAN_AUTO_UPDATE = app.isPackaged && (process.platform === "win32" || process.platform === "linux");
const NOTIFY_ONLY = app.isPackaged && !CAN_AUTO_UPDATE;

const updateState = {
  supported: CAN_AUTO_UPDATE, // can download + install in place
  notifyOnly: NOTIFY_ONLY, // can only check + link out (mac / .deb)
  auto: true, // user preference: auto-download
  currentVersion: app.getVersion(),
  status: "idle", // idle | checking | available | downloading | downloaded | uptodate | error
  version: null,
  percent: 0,
  error: null,
};

function updatePrefPath() {
  return path.join(app.getPath("userData"), "update-config.json");
}
function loadUpdatePref() {
  try {
    const j = JSON.parse(fs.readFileSync(updatePrefPath(), "utf8"));
    if (typeof j.auto === "boolean") updateState.auto = j.auto;
  } catch {
    /* default: auto on */
  }
}
function saveUpdatePref() {
  try {
    fs.writeFileSync(updatePrefPath(), JSON.stringify({ auto: updateState.auto }));
  } catch {
    /* ignore */
  }
}

function pushUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("updates:state", updateState);
}
function setStatus(patch) {
  Object.assign(updateState, patch);
  pushUpdateState();
}
function errMsg(err) {
  return err && err.message ? String(err.message) : String(err);
}

async function checkForUpdates() {
  if (!CAN_AUTO_UPDATE && !NOTIFY_ONLY) return; // dev: nothing to check
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    setStatus({ status: "error", error: errMsg(err) });
  }
}

function setupUpdater() {
  loadUpdatePref();

  // electron-updater logs full HTTP error stacks (e.g. a 404 when no releases are
  // published yet) to the console by default, which now clutters the log file.
  // Route it through a concise logger so update checks leave a one-line trace.
  autoUpdater.autoDownload = false;
  autoUpdater.logger = {
    info: (m) => console.log(`[updater] ${typeof m === "string" ? m : errMsg(m)}`),
    warn: (m) => console.warn(`[updater] ${typeof m === "string" ? m : errMsg(m)}`),
    error: (m) => console.warn(`[updater] check failed: ${typeof m === "string" ? m : errMsg(m)}`),
    debug: () => {},
  };

  // IPC is always wired so the renderer can show the current version and a
  // sensible message even on unsupported platforms or in dev.
  ipcMain.handle("updates:getState", () => updateState);
  ipcMain.handle("updates:check", async () => {
    await checkForUpdates();
    return updateState;
  });
  ipcMain.handle("updates:download", async () => {
    if (!CAN_AUTO_UPDATE) return;
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      setStatus({ status: "error", error: errMsg(err) });
    }
  });
  ipcMain.handle("updates:install", async () => {
    if (!CAN_AUTO_UPDATE || updateState.status !== "downloaded") return;
    isQuitting = true;
    isInstalling = true;
    try {
      if (server && typeof server.close === "function") {
        await server.close();
        server = null;
      }
    } catch {
      /* ignore */
    }
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle("updates:setAuto", (_e, enabled) => {
    updateState.auto = !!enabled;
    saveUpdatePref();
    autoUpdater.autoDownload = updateState.auto && CAN_AUTO_UPDATE;
    if (updateState.auto && CAN_AUTO_UPDATE && updateState.status === "available") {
      autoUpdater.downloadUpdate().catch((err) => setStatus({ status: "error", error: errMsg(err) }));
    }
    pushUpdateState();
    return updateState;
  });

  if (!CAN_AUTO_UPDATE && !NOTIFY_ONLY) return; // dev build: no real updater

  autoUpdater.autoDownload = updateState.auto && CAN_AUTO_UPDATE;
  autoUpdater.autoInstallOnAppQuit = false; // install only on explicit request

  autoUpdater.on("checking-for-update", () => setStatus({ status: "checking", error: null }));
  autoUpdater.on("update-available", (info) => setStatus({ status: "available", version: info?.version ?? null }));
  autoUpdater.on("update-not-available", () => setStatus({ status: "uptodate", version: null }));
  autoUpdater.on("download-progress", (p) => setStatus({ status: "downloading", percent: Math.round(p?.percent ?? 0) }));
  autoUpdater.on("update-downloaded", (info) =>
    setStatus({ status: "downloaded", version: info?.version ?? null, percent: 100 }),
  );
  autoUpdater.on("error", (err) => setStatus({ status: "error", error: errMsg(err) }));

  setTimeout(() => void checkForUpdates(), 8000);
  setInterval(() => void checkForUpdates(), 6 * 60 * 60 * 1000).unref?.();
}

function fatal(err) {
  const message = err && err.message ? err.message : String(err);
  dialog.showErrorBox("Caskt failed to start", message);
  app.exit(1);
}
