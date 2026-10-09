const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("deckTransferWindow", {
  getState: () => ipcRenderer.invoke("deck-transfer:window-state"),
  retry: () => ipcRenderer.invoke("deck-transfer:retry"),
  resizeHeader: (height) => ipcRenderer.invoke("deck-transfer:resize-header", height),
  onChange(callback) {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on("deck-transfer:state", handler);
    return () => ipcRenderer.removeListener("deck-transfer:state", handler);
  },
});
