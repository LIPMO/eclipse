// Pont sécurisé entre l'interface du launcher et le processus principal
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: patch => ipcRenderer.invoke('settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  status: server => ipcRenderer.invoke('status:get', server),
  news: () => ipcRenderer.invoke('news:get'),
  play: () => ipcRenderer.invoke('game:play'),
  clearCache: () => ipcRenderer.invoke('game:clearCache'),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  openLink: url => ipcRenderer.send('link:open', url),
});
