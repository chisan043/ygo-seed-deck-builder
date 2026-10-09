const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopDeckTransfer", {
  open: (recipe) => ipcRenderer.invoke("deck-transfer:open", recipe),
  onChange(callback) {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("deck-transfer:state", handler);
    return () => ipcRenderer.removeListener("deck-transfer:state", handler);
  },
});

contextBridge.exposeInMainWorld("desktopUpdates", {
  getState: () => ipcRenderer.invoke("updates:get-state"),
  check: () => ipcRenderer.invoke("updates:check"),
  install: () => ipcRenderer.invoke("updates:install"),
  onChange(callback) {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("updates:state", handler);
    return () => ipcRenderer.removeListener("updates:state", handler);
  },
});
