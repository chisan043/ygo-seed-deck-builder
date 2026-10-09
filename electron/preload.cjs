const { contextBridge, ipcRenderer } = require("electron");

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

contextBridge.exposeInMainWorld("desktopAI", {
  getConfig: () => ipcRenderer.invoke("ai:config"),
  saveConfig: config => ipcRenderer.invoke("ai:save", config),
  forgetKey: () => ipcRenderer.invoke("ai:forget-key"),
  request: payload => ipcRenderer.invoke("ai:request", payload),
  cancel: () => ipcRenderer.invoke("ai:cancel"),
});
