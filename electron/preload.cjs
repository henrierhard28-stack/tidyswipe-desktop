const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  pickPreset: (preset) => ipcRenderer.invoke("pick-preset", preset),
  listFolder: (folderPath) => ipcRenderer.invoke("list-folder", folderPath),
  readFileBuffer: (filePath) => ipcRenderer.invoke("read-file-buffer", filePath),
  trashFile: (filePath) => ipcRenderer.invoke("trash-file", filePath),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  openPath: (filePath) => ipcRenderer.invoke("open-path", filePath),
  revealInFolder: (filePath) => ipcRenderer.invoke("reveal-in-folder", filePath),
  quickLook: (filePath) => ipcRenderer.invoke("quick-look", filePath),
  getFileIcon: (filePath) => ipcRenderer.invoke("get-file-icon", filePath),
  firstFileInDocuments: () => ipcRenderer.invoke("first-file-in-documents"),
  firstFileAcrossMac: () => ipcRenderer.invoke("first-file-in-documents"),
  smartCleanupScan: () => ipcRenderer.invoke("smart-cleanup-scan"),
  fullSweep: () => ipcRenderer.invoke("full-sweep"),
  getSessionState: () => ipcRenderer.invoke("session:get"),
  setSessionState: (snapshot) => ipcRenderer.invoke("session:set", snapshot),
  onScanProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on("scan-progress", listener);
    return () => ipcRenderer.removeListener("scan-progress", listener);
  },
});
