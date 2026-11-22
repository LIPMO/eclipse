// ECLIPSE Launcher — processus principal Electron
const { app, BrowserWindow, ipcMain, shell, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_SERVER = process.env.ECLIPSE_SERVER || 'https://eclipse.charlesvibe.xyz';
const DEFAULTS = { server: DEFAULT_SERVER, fullscreen: true, size: '1600x900', afterLaunch: 'hide' };
const SIZES = ['1280x720', '1600x900', '1920x1080', '2560x1440'];
const ICON = path.join(__dirname, 'build', 'icon.png');

let launcherWin = null;
let gameWin = null;
let settings = { ...DEFAULTS };
const settingsFile = () => path.join(app.getPath('userData'), 'launcher-settings.json');

// ---------- paramètres ----------
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { settings = { ...DEFAULTS }; }
  if (process.env.ECLIPSE_SERVER) settings.server = process.env.ECLIPSE_SERVER;
}
function saveSettings() {
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch (e) { console.error(e); }
}
function normalizeServer(url) {
  let u = String(url || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const p = new URL(u); return p.protocol === 'https:' || p.protocol === 'http:' ? p.origin : null; } catch { return null; }
}

// ---------- état du serveur ----------
async function fetchJSON(url, ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'ECLIPSE-Launcher/' + app.getVersion() } });
    return { ok: r.ok, status: r.status, data: r.ok ? await r.json().catch(() => null) : null };
  } finally { clearTimeout(t); }
}
async function serverStatus(server = settings.server) {
  const base = normalizeServer(server);
  if (!base) return { online: false, error: 'Adresse invalide' };
  const t0 = Date.now();
  try {
    const r = await fetchJSON(base + '/api/status');
    if (r.ok && r.data) { const d = r.data; return { online: true, ping: Date.now() - t0, players: d.online, rooms: d.rooms, matches: d.matches, inGame: d.inGame, version: d.version }; }
    const h = await fetchJSON(base + '/healthz').catch(() => null);
    if (h && h.status === 200) return { online: true, ping: Date.now() - t0 };
    return { online: false, error: 'Réponse inattendue (' + r.status + ')' };
  } catch (e) {
    return { online: false, error: e.name === 'AbortError' ? 'Délai dépassé' : 'Serveur injoignable' };
  }
}
async function serverNews() {
  const base = normalizeServer(settings.server);
  try { const r = await fetchJSON(base + '/api/news'); if (r.ok && Array.isArray(r.data)) return r.data; } catch { /* hors ligne */ }
  return null;
}

// ---------- fenêtres ----------
function createLauncher() {
  launcherWin = new BrowserWindow({
    width: 1180, height: 700, minWidth: 980, minHeight: 600,
    frame: false, show: false, backgroundColor: '#090c15', title: 'ECLIPSE Launcher', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  launcherWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  launcherWin.once('ready-to-show', () => launcherWin.show());
  launcherWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  launcherWin.webContents.on('will-navigate', e => e.preventDefault());
  launcherWin.on('closed', () => { launcherWin = null; if (!gameWin) app.quit(); });
}

function showLauncher() {
  if (!launcherWin) return createLauncher();
  if (launcherWin.isMinimized()) launcherWin.restore();
  launcherWin.show(); launcherWin.focus();
}

function openGame() {
  const base = normalizeServer(settings.server);
  if (!base) return { ok: false, error: 'Adresse du serveur invalide' };
  if (gameWin) { gameWin.show(); gameWin.focus(); return { ok: true }; }
  const [w, h] = (SIZES.includes(settings.size) ? settings.size : DEFAULTS.size).split('x').map(Number);
  gameWin = new BrowserWindow({
    width: w, height: h, fullscreen: !!settings.fullscreen, autoHideMenuBar: true, show: false,
    backgroundColor: '#000000', title: 'ECLIPSE', icon: ICON,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  gameWin.setMenu(null);
  const origin = new URL(base).origin;
  const wc = gameWin.webContents;
  // le jeu reste sur son serveur ; les liens externes s'ouvrent dans le navigateur
  wc.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (new URL(url).origin !== origin) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  // le jeu demande confirmation avant de quitter une partie : on affiche une vraie boîte de dialogue
  wc.on('will-prevent-unload', e => {
    const choice = dialog.showMessageBoxSync(gameWin, { type: 'question', buttons: ['Quitter', 'Rester'], defaultId: 1, cancelId: 1, title: 'ECLIPSE', message: 'Quitter la partie en cours ?' });
    if (choice === 0) e.preventDefault();
  });
  wc.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { gameWin.setFullScreen(!gameWin.isFullScreen()); e.preventDefault(); }
  });
  wc.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3 = navigation annulée
    gameWin.loadFile(path.join(__dirname, 'renderer', 'offline.html'), { query: { server: base, error: desc } });
  });
  gameWin.once('ready-to-show', () => gameWin.show());
  gameWin.on('closed', () => { gameWin = null; showLauncher(); });
  gameWin.loadURL(base);
  if (launcherWin) {
    if (settings.afterLaunch === 'hide') launcherWin.hide();
    else if (settings.afterLaunch === 'minimize') launcherWin.minimize();
  }
  return { ok: true };
}

// ---------- communication avec l'interface ----------
ipcMain.handle('settings:get', () => ({ ...settings, sizes: SIZES, version: app.getVersion(), defaultServer: DEFAULT_SERVER }));
ipcMain.handle('settings:set', (e, patch = {}) => {
  if ('server' in patch) { const s = normalizeServer(patch.server); if (!s) return { ok: false, error: 'Adresse du serveur invalide' }; settings.server = s; }
  if ('fullscreen' in patch) settings.fullscreen = !!patch.fullscreen;
  if ('size' in patch && SIZES.includes(patch.size)) settings.size = patch.size;
  if ('afterLaunch' in patch && ['hide', 'minimize', 'keep'].includes(patch.afterLaunch)) settings.afterLaunch = patch.afterLaunch;
  saveSettings();
  return { ok: true, settings };
});
ipcMain.handle('settings:reset', () => { settings = { ...DEFAULTS }; saveSettings(); return settings; });
ipcMain.handle('status:get', (e, server) => serverStatus(server));
ipcMain.handle('news:get', () => serverNews());
ipcMain.handle('game:play', () => openGame());
ipcMain.handle('game:clearCache', async () => {
  await session.defaultSession.clearCache();
  return { ok: true };
});
ipcMain.on('window:minimize', () => launcherWin && launcherWin.minimize());
ipcMain.on('window:close', () => launcherWin && launcherWin.close());
ipcMain.on('link:open', (e, url) => { if (/^https:\/\//.test(String(url))) shell.openExternal(url); });

// ---------- démarrage ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (gameWin) { gameWin.show(); gameWin.focus(); } else showLauncher(); });
  app.whenReady().then(() => {
    loadSettings();
    // le jeu n'a besoin que du verrouillage de la souris, du plein écran et du presse-papiers
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(['pointerLock', 'fullscreen', 'clipboard-sanitized-write'].includes(permission)));
    createLauncher();
  });
  app.on('window-all-closed', () => app.quit());
}
