// Pont sécurisé entre l'interface du launcher et le processus principal (aucun accès direct au système)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: patch => ipcRenderer.invoke('settings:set', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  status: server => ipcRenderer.invoke('status:get', server),
  netTest: server => ipcRenderer.invoke('net:test', server),
  news: () => ipcRenderer.invoke('news:get'),
  shop: () => ipcRenderer.invoke('shop:get'),
  play: where => ipcRenderer.invoke('game:play', where),
  clearCache: () => ipcRenderer.invoke('game:clearCache'),
  restart: () => ipcRenderer.invoke('app:restart'),
  update: () => ipcRenderer.invoke('update:get'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdate: fn => ipcRenderer.on('update:state', (e, s) => fn(s)),
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
  openLink: url => ipcRenderer.send('link:open', url),
});
