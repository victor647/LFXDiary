const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  readFile: (filename) => ipcRenderer.invoke('diary:readFile', filename),
  writeFile: (filename, data) => ipcRenderer.invoke('diary:writeFile', filename, data),
  getDataFolder: () => ipcRenderer.invoke('diary:getDataFolder'),
  pickDataFolder: () => ipcRenderer.invoke('diary:pickDataFolder'),
})
