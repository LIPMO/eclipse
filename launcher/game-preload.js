// Pont minimal entre la fenêtre de jeu (le site ECLIPSE) et le launcher — 2.2
// Le jeu peut seulement transmettre son état pour la présence Discord ; aucun autre accès au système.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('eclipseLauncher', {
  presence: state => { try { ipcRenderer.send('presence:set', JSON.parse(JSON.stringify(state || {}))); } catch { /* */ } },
});
