// Caskt runs as an ordinary local web app inside the window and talks to the
// server over HTTP, so the renderer needs no privileged Node bridge for normal
// operation. The one exception is auto-update, which must live in the main
// process: we expose a tiny update-control surface here. contextIsolation stays
// on and nodeIntegration stays off.

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("caskt", {
  updates: {
    get: () => ipcRenderer.invoke("updates:getState"),
    check: () => ipcRenderer.invoke("updates:check"),
    download: () => ipcRenderer.invoke("updates:download"),
    install: () => ipcRenderer.invoke("updates:install"),
    setAuto: (enabled) => ipcRenderer.invoke("updates:setAuto", enabled),
    onState: (cb) => {
      const handler = (_e, state) => cb(state);
      ipcRenderer.on("updates:state", handler);
      return () => ipcRenderer.removeListener("updates:state", handler);
    },
  },
});
