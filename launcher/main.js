// ECLIPSE Launcher 2 — processus principal Electron
// Nouveautés : se met à jour tout seul, options de performance (images par seconde illimitées, carte graphique
// puissante), lancement au démarrage de l'ordinateur, fenêtre de jeu mémorisée, boutique du jour sur l'accueil.
const { app, BrowserWindow, ipcMain, shell, dialog, session, screen } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_SERVER = process.env.ECLIPSE_SERVER || 'https://eclipseee.online';
const OLD_SERVERS = ['https://eclipse.charlesvibe.xyz']; // anciennes adresses par défaut : remplacées automatiquement
const SITE = 'https://eclipseee.online';
const DEFAULTS = { server: DEFAULT_SERVER, fullscreen: true, size: '1600x900', afterLaunch: 'hide', fpsUnlock: false, highPerfGpu: true, autoStart: false, autoUpdate: true, gameBounds: null };
const SIZES = ['1280x720', '1600x900', '1920x1080', '2560x1440'];
const ICON = path.join(__dirname, 'build', 'icon.png');

let launcherWin = null;
let gameWin = null;
let settings = { ...DEFAULTS };
const settingsFile = () => path.join(app.getPath('userData'), 'launcher-settings.json');

// ---------- paramètres ----------
function loadSettings() {
  try { settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { settings = { ...DEFAULTS }; }
  if (OLD_SERVERS.includes(settings.server)) settings.server = DEFAULT_SERVER;
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

// Options de performance : elles doivent être appliquées avant le démarrage d'Electron (d'où « redémarrer »)
loadSettings();
if (settings.fpsUnlock) { app.commandLine.appendSwitch('disable-frame-rate-limit'); app.commandLine.appendSwitch('disable-gpu-vsync'); }
if (settings.highPerfGpu) app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required'); // sons du jeu dès l'ouverture

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
async function getJSON(p) {
  const base = normalizeServer(settings.server);
  try { const r = await fetchJSON(base + p); if (r.ok && r.data) return r.data; } catch { /* hors ligne */ }
  return null;
}

// ---------- mise à jour automatique du launcher ----------
// Les nouvelles versions sont publiées sur GitHub (Releases) par le serveur de compilation ; electron-updater
// vérifie l'empreinte SHA-512 de chaque fichier téléchargé avant de l'installer.
const upd = { state: 'idle', version: null, percent: 0, error: null };
let updater = null;
function sendUpd() { if (launcherWin) launcherWin.webContents.send('update:state', { ...upd }); }
function setupUpdater() {
  if (!app.isPackaged) { upd.state = 'dev'; return; }
  if (process.env.PORTABLE_EXECUTABLE_DIR) { upd.state = 'portable'; return; } // la version portable ne peut pas se remplacer elle-même
  try { ({ autoUpdater: updater } = require('electron-updater')); } catch { upd.state = 'unavailable'; return; }
  // installation qui ne peut pas se mettre à jour toute seule (ex. dossier décompressé) : on le dit clairement
  if (typeof updater.isUpdaterActive === 'function' && !updater.isUpdaterActive()) { upd.state = 'inactive'; updater = null; return; }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.on('checking-for-update', () => { upd.state = 'checking'; sendUpd(); });
  updater.on('update-available', i => { upd.state = 'downloading'; upd.version = i.version; sendUpd(); });
  updater.on('update-not-available', () => { upd.state = 'latest'; sendUpd(); });
  updater.on('download-progress', p => { upd.state = 'downloading'; upd.percent = Math.round(p.percent || 0); sendUpd(); });
  updater.on('update-downloaded', i => { upd.state = 'ready'; upd.version = i.version; sendUpd(); });
  updater.on('error', e => { upd.state = 'error'; upd.error = String(e?.message || e).slice(0, 160); sendUpd(); });
  if (settings.autoUpdate) setTimeout(() => updater.checkForUpdates().catch(() => {}), 3000);
}

// ---------- fenêtres ----------
function createLauncher() {
  launcherWin = new BrowserWindow({
    width: 1200, height: 720, minWidth: 980, minHeight: 620,
    frame: false, show: false, backgroundColor: '#090c15', title: 'ECLIPSE Launcher', icon: ICON,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  launcherWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  launcherWin.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) launcherWin.show(); });
  launcherWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  launcherWin.webContents.on('will-navigate', e => e.preventDefault());
  launcherWin.on('closed', () => { launcherWin = null; if (!gameWin) app.quit(); });
}

function showLauncher() {
  if (!launcherWin) return createLauncher();
  if (launcherWin.isMinimized()) launcherWin.restore();
  launcherWin.show(); launcherWin.focus();
}

// position et taille de la fenêtre de jeu mémorisées (si elles tiennent encore sur un écran)
function validBounds(b) {
  if (!b || typeof b.x !== 'number') return null;
  return screen.getAllDisplays().some(d => b.x < d.workArea.x + d.workArea.width - 100 && b.x + b.width > d.workArea.x + 100 && b.y >= d.workArea.y - 20 && b.y < d.workArea.y + d.workArea.height - 100) ? b : null;
}

function openGame(hash = '') {
  const base = normalizeServer(settings.server);
  if (!base) return { ok: false, error: 'Adresse du serveur invalide' };
  if (gameWin) { gameWin.show(); gameWin.focus(); return { ok: true }; }
  const [w, h] = (SIZES.includes(settings.size) ? settings.size : DEFAULTS.size).split('x').map(Number);
  const b = validBounds(settings.gameBounds);
  gameWin = new BrowserWindow({
    width: b?.width || w, height: b?.height || h, x: b?.x, y: b?.y, fullscreen: !!settings.fullscreen, autoHideMenuBar: true, show: false,
    backgroundColor: '#000000', title: 'ECLIPSE', icon: ICON,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  gameWin.setMenu(null);
  const origin = new URL(base).origin;
  const wc = gameWin.webContents;
  wc.setUserAgent(wc.getUserAgent() + ' ECLIPSE-Launcher/' + app.getVersion());
  // le jeu reste sur son serveur ; les liens externes s'ouvrent dans le navigateur
  wc.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (new URL(url).origin !== origin) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  // le jeu demande confirmation avant de quitter une partie : on affiche une vraie boîte de dialogue
  wc.on('will-prevent-unload', e => {
    const choice = dialog.showMessageBoxSync(gameWin, { type: 'question', buttons: ['Quitter', 'Rester'], defaultId: 1, cancelId: 1, title: 'ECLIPSE', message: 'Quitter la partie en cours ?' });
    if (choice === 0) e.preventDefault();
  });
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { gameWin.setFullScreen(!gameWin.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F5' && !input.control) { wc.reload(); e.preventDefault(); }
  });
  wc.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain || code === -3) return; // -3 = navigation annulée
    gameWin.loadFile(path.join(__dirname, 'renderer', 'offline.html'), { query: { server: base, error: desc } });
  });
  const remember = () => { if (gameWin && !gameWin.isFullScreen() && !gameWin.isMinimized() && !gameWin.isMaximized()) { settings.gameBounds = gameWin.getBounds(); saveSettings(); } };
  gameWin.on('resized', remember); gameWin.on('moved', remember);
  gameWin.once('ready-to-show', () => gameWin.show());
  gameWin.on('closed', () => { gameWin = null; showLauncher(); });
  gameWin.loadURL(base + '/' + (hash ? '#' + hash : ''));
  if (launcherWin) {
    if (settings.afterLaunch === 'hide') launcherWin.hide();
    else if (settings.afterLaunch === 'minimize') launcherWin.minimize();
  }
  return { ok: true };
}

function applyAutoStart() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  try { app.setLoginItemSettings({ openAtLogin: !!settings.autoStart, args: ['--hidden'] }); } catch { /* non pris en charge */ }
}

// ---------- communication avec l'interface ----------
ipcMain.handle('settings:get', () => ({ ...settings, sizes: SIZES, version: app.getVersion(), defaultServer: DEFAULT_SERVER, platform: process.platform, packaged: app.isPackaged, site: SITE }));
ipcMain.handle('settings:set', (e, patch = {}) => {
  if ('server' in patch) { const s = normalizeServer(patch.server); if (!s) return { ok: false, error: 'Adresse du serveur invalide' }; settings.server = s; }
  for (const k of ['fullscreen', 'fpsUnlock', 'highPerfGpu', 'autoStart', 'autoUpdate']) if (k in patch) settings[k] = !!patch[k];
  if ('size' in patch && SIZES.includes(patch.size)) { settings.size = patch.size; settings.gameBounds = null; }
  if ('afterLaunch' in patch && ['hide', 'minimize', 'keep'].includes(patch.afterLaunch)) settings.afterLaunch = patch.afterLaunch;
  if ('autoStart' in patch) applyAutoStart();
  saveSettings();
  return { ok: true, settings };
});
ipcMain.handle('settings:reset', () => { settings = { ...DEFAULTS }; saveSettings(); applyAutoStart(); return settings; });
ipcMain.handle('status:get', (e, server) => serverStatus(server));
ipcMain.handle('news:get', () => getJSON('/api/news'));
ipcMain.handle('shop:get', () => getJSON('/api/shop'));
ipcMain.handle('game:play', (e, where) => openGame(where === 'boutique' ? 'boutique' : ''));
ipcMain.handle('game:clearCache', async () => { await session.defaultSession.clearCache(); return { ok: true }; });
ipcMain.handle('app:restart', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('update:get', () => ({ ...upd }));
ipcMain.handle('update:check', async () => { if (!updater) return { ...upd }; try { await updater.checkForUpdates(); } catch (e) { upd.state = 'error'; upd.error = String(e?.message || e).slice(0, 160); } return { ...upd }; });
ipcMain.handle('update:install', () => { if (updater && upd.state === 'ready') updater.quitAndInstall(false, true); });
ipcMain.on('window:minimize', () => launcherWin && launcherWin.minimize());
ipcMain.on('window:close', () => launcherWin && launcherWin.close());
ipcMain.on('link:open', (e, url) => { if (/^https:\/\//.test(String(url))) shell.openExternal(url); });

// ---------- démarrage ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (gameWin) { gameWin.show(); gameWin.focus(); } else showLauncher(); });
  app.whenReady().then(() => {
    // le jeu n'a besoin que du verrouillage de la souris, du plein écran et du presse-papiers
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(['pointerLock', 'fullscreen', 'clipboard-sanitized-write'].includes(permission)));
    createLauncher();
    setupUpdater();
  });
  app.on('window-all-closed', () => app.quit());
}
