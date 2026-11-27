// ECLIPSE Launcher 2 — processus principal Electron
// Nouveautés : se met à jour tout seul, options de performance (images par seconde illimitées, carte graphique
// puissante), lancement au démarrage de l'ordinateur, fenêtre de jeu mémorisée, boutique du jour sur l'accueil.
const { app, BrowserWindow, ipcMain, shell, dialog, session, screen, powerSaveBlocker } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { DiscordPresence, buildActivity } = require('./discord.js');
const DISCORD_CLIENT_ID = '1575996797615350011';
const fs = require('node:fs');

const DEFAULT_SERVER = process.env.ECLIPSE_SERVER || 'https://eclipseee.online';
const OLD_SERVERS = ['https://eclipse.charlesvibe.xyz']; // anciennes adresses par défaut : remplacées automatiquement
const SITE = 'https://eclipseee.online';
const DEFAULTS = { server: DEFAULT_SERVER, fullscreen: true, size: '1600x900', afterLaunch: 'hide', fpsUnlock: false, highPerfGpu: true, perfMode: true, discord: true, autoStart: false, autoUpdate: true, gameBounds: null };
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
// Mode performance (2.1) : contre les saccades et la latence
//  - carte graphique utilisée même si Chrome la croit incompatible (sinon rendu logiciel, très lent)
//  - rendu et rastérisation sur la carte graphique
//  - pas de ralentissement quand la fenêtre est cachée, en arrière-plan ou recouverte (Windows le fait en plein écran)
if (settings.perfMode !== false) {
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
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
    webPreferences: { preload: path.join(__dirname, 'game-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
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
  // mode performance : le jeu (et la carte graphique) passent en priorité « au-dessus de la normale », l'écran ne se met pas en veille
  let blocker = null;
  if (settings.perfMode !== false) {
    try { blocker = powerSaveBlocker.start('prevent-display-sleep'); } catch { /* */ }
    wc.on('did-finish-load', () => boostPriority(wc));
  }
  gameWin.on('closed', () => { if (blocker != null) try { powerSaveBlocker.stop(blocker); } catch { /* */ } gameWin = null; gameState = null; updatePresence(); showLauncher(); });
  gameWin.loadURL(base + '/' + (hash ? '#' + hash : ''));
  if (launcherWin) {
    if (settings.afterLaunch === 'hide') launcherWin.hide();
    else if (settings.afterLaunch === 'minimize') launcherWin.minimize();
  }
  return { ok: true };
}

// ---------- présence Discord (2.2) ----------
let presence = null, gameState = null;
const launchedAt = Date.now();
function updatePresence() {
  if (!presence) return;
  presence.set(buildActivity(gameState || {}, { since: launchedAt }));
}
function applyDiscord() {
  if (settings.discord !== false) {
    if (!presence) presence = new DiscordPresence(DISCORD_CLIENT_ID, { log: (...a) => console.log(...a) });
    presence.start(); updatePresence();
  } else if (presence) presence.stop();
}
// état envoyé par le jeu : accepté seulement depuis la fenêtre de jeu, sur le site du serveur choisi
ipcMain.on('presence:set', (e, st) => {
  if (!gameWin || e.sender !== gameWin.webContents) return;
  try { if (new URL(e.senderFrame?.url || e.sender.getURL()).origin !== new URL(normalizeServer(settings.server)).origin) return; } catch { return; }
  if (!st || typeof st !== 'object') return;
  const pick = {};
  for (const [k, v] of Object.entries(st).slice(0, 30)) if (typeof v === 'string' ? v.length <= 80 : typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean') pick[k] = v;
  gameState = pick;
  updatePresence();
});

function boostPriority(wc) {
  const prio = os.constants?.priority?.PRIORITY_ABOVE_NORMAL ?? -7;
  const pids = new Set();
  try { pids.add(wc.getOSProcessId()); } catch { /* */ }
  try { for (const m of app.getAppMetrics()) if (m.type === 'GPU') pids.add(m.pid); } catch { /* */ }
  for (const pid of pids) { try { os.setPriority(pid, prio); } catch { /* droits insuffisants (Linux) : on garde la priorité normale */ } }
}

// test de connexion (2.1) : plusieurs allers-retours vers le serveur → ping moyen, minimum, maximum et variation (gigue)
async function netTest(server = settings.server) {
  const base = normalizeServer(server);
  if (!base) return { ok: false, error: 'Adresse invalide' };
  const times = [];
  for (let i = 0; i < 8; i++) {
    const t0 = performance.now();
    try { const r = await fetchJSON(base + '/healthz', 4000); if (r.status < 500) times.push(performance.now() - t0); } catch { /* perdu */ }
  }
  if (!times.length) return { ok: false, error: 'Serveur injoignable' };
  const sorted = times.slice(1).length ? times.slice(1) : times; // le premier inclut l'ouverture de la connexion
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const jitter = sorted.length > 1 ? sorted.slice(1).reduce((a, v, i) => a + Math.abs(v - sorted[i]), 0) / (sorted.length - 1) : 0;
  return { ok: true, avg: Math.round(avg), min: Math.round(Math.min(...sorted)), max: Math.round(Math.max(...sorted)), jitter: Math.round(jitter), lost: 8 - times.length };
}

function applyAutoStart() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return;
  try { app.setLoginItemSettings({ openAtLogin: !!settings.autoStart, args: ['--hidden'] }); } catch { /* non pris en charge */ }
}

// ---------- communication avec l'interface ----------
ipcMain.handle('settings:get', () => ({ ...settings, sizes: SIZES, version: app.getVersion(), defaultServer: DEFAULT_SERVER, platform: process.platform, packaged: app.isPackaged, site: SITE }));
ipcMain.handle('settings:set', (e, patch = {}) => {
  if ('server' in patch) { const s = normalizeServer(patch.server); if (!s) return { ok: false, error: 'Adresse du serveur invalide' }; settings.server = s; }
  for (const k of ['fullscreen', 'fpsUnlock', 'highPerfGpu', 'perfMode', 'discord', 'autoStart', 'autoUpdate']) if (k in patch) settings[k] = !!patch[k];
  if ('discord' in patch) applyDiscord();
  if ('size' in patch && SIZES.includes(patch.size)) { settings.size = patch.size; settings.gameBounds = null; }
  if ('afterLaunch' in patch && ['hide', 'minimize', 'keep'].includes(patch.afterLaunch)) settings.afterLaunch = patch.afterLaunch;
  if ('autoStart' in patch) applyAutoStart();
  saveSettings();
  return { ok: true, settings };
});
ipcMain.handle('settings:reset', () => { settings = { ...DEFAULTS }; saveSettings(); applyAutoStart(); return settings; });
ipcMain.handle('status:get', (e, server) => serverStatus(server));
ipcMain.handle('net:test', (e, server) => netTest(server));
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
    applyDiscord();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { try { presence?.stop(); } catch { /* */ } });
}
