// Pont minimal entre la fenêtre de jeu (le site ECLIPSE) et le launcher — 2.2
// Le jeu peut seulement transmettre son état (présence Discord) et ses moments forts (clips Medal) ; aucun autre accès au système.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('eclipseLauncher', {
  medal: id => { try { if (typeof id === 'string') ipcRenderer.send('medal:event', id.slice(0, 20)); } catch { /* */ } }, // clips Medal (2.3)
  presence: state => { try { ipcRenderer.send('presence:set', JSON.parse(JSON.stringify(state || {}))); } catch { /* */ } },
});
