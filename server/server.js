// Serveur HTTP (fichiers statiques) + WebSocket (lobby et parties)
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Match } from './match.js';
import { Accounts } from './accounts.js';
import { Admin } from './admin.js';
import { Bucket, Strikes, baseHeaders, gameCsp, originAllowed } from './security.js';
import crypto from 'node:crypto';
import { TICK_RATE, AGENTS, AGENT_ORDER, SKINS, SKINNABLE, isFfa, GUN_LADDER } from '../shared/data.js';
import { Social } from './social.js';
import { Clans } from './clans.js';
import { Tournaments } from './tournaments.js';
import { DIFFICULTIES } from './bot.js';
import { dailyLogin, eloUpdate } from './progression.js';
import { levelOf, TITLES, RADIO, REPORT_REASONS } from '../shared/progress.js';
import { MAP_ORDER, mapsForMode } from '../shared/maps.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '0.0.0'; } })();
// Port : --port 8080, --port=8080, ou variable d'environnement PORT (3000 par défaut)
function argPort() {
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--port' || a[i] === '-p') return a[i + 1];
    if (a[i].startsWith('--port=')) return a[i].slice(7);
  }
  return null;
}
const PORT = parseInt(argPort() || process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0'; // 127.0.0.1 derrière un tunnel ou un reverse proxy
if (!(PORT > 0 && PORT < 65536)) { console.error('Port invalide. Exemple : npm start -- --port 8080'); process.exit(1); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json', '.webp': 'image/webp' };
// page 404 personnalisée (public/404.html) : même contrôle d'intégrité que le reste du site
function notFound(req, res) {
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'" };
  const send = buf => { res.writeHead(404, headers); res.end(req.method === 'HEAD' ? undefined : buf); };
  if (VERIFIED) { const d = VERIFIED.get('public/404.html'); return d ? send(d) : (res.writeHead(404), res.end('Introuvable')); }
  fs.readFile(path.join(ROOT, 'public', '404.html'), (err, buf) => (err ? (res.writeHead(404), res.end('Introuvable')) : send(buf)));
}
const MOUNTS = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/vendor/three/', path.join(ROOT, 'node_modules', 'three')],
  ['/', path.join(ROOT, 'public')],
];

// Hash de l'importmap intégrée à index.html (seul script en ligne autorisé par la CSP)
const IMPORTMAP_HASH = (() => {
  try {
    const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
    const m = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    return m ? crypto.createHash('sha256').update(m[1]).digest('base64') : null;
  } catch { return null; }
})();
const GAME_CSP = gameCsp(IMPORTMAP_HASH);

// ---------- intégrité des fichiers ----------
// Si integrity.json est présent, chaque fichier est vérifié au démarrage : un fichier modifié ou ajouté sur le disque
// (ex. script malveillant injecté) n'est jamais servi aux joueurs, et une alerte est levée.
let VERIFIED = null;
const integrityAlerts = [];
function loadIntegrity() {
  let man;
  try { man = JSON.parse(fs.readFileSync(path.join(ROOT, 'integrity.json'), 'utf8')).files; } catch { return; }
  VERIFIED = new Map();
  for (const [rel, hash] of Object.entries(man)) {
    try {
      const data = fs.readFileSync(path.join(ROOT, rel));
      if (crypto.createHash('sha256').update(data).digest('hex') === hash) VERIFIED.set(rel, data);
      else integrityAlerts.push(`FICHIER MODIFIÉ (non servi) : ${rel}`);
    } catch { integrityAlerts.push(`Fichier manquant : ${rel}`); }
  }
  const scan = d => { try { return fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? scan(d + '/' + e.name) : [d + '/' + e.name]); } catch { return []; } };
  for (const rel of [...scan('public'), ...scan('shared')]) if (!man[rel]) integrityAlerts.push(`FICHIER INCONNU (non servi) : ${rel}`);
  for (const a of integrityAlerts) console.warn('[SÉCURITÉ]', a);
}
loadIntegrity();

const ALLOWED_ORIGINS = String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

const server = http.createServer((req, res) => {
  for (const [k, v] of Object.entries(baseHeaders(req))) res.setHeader(k, v);
  if (req.url.length > 2048) { res.writeHead(414); res.end(); return; }
  const isApi = req.url === '/api/status' || req.url === '/api/news';
  if (req.method === 'OPTIONS' && isApi) { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' }); res.end(); return; }
  const isAdminApi = req.url.startsWith('/admin/api/');
  if (!(req.method === 'GET' || req.method === 'HEAD' || (req.method === 'POST' && isAdminApi))) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  if (!isAdminApi && !httpLimit.take(Admin.ipOf(req))) { res.writeHead(429, { 'Retry-After': '10' }); res.end('Trop de requêtes'); return; }
  if (req.url.startsWith('/admin/api/')) { admin.handle(req, res).catch(e => { console.error('Erreur admin', e); if (!res.headersSent) { res.writeHead(500); res.end('{}'); } }); return; }
  if (req.url === '/healthz') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
  if (req.url === '/api/status' || req.url === '/api/news') {
    // lu par le launcher : CORS ouvert, aucune donnée personnelle
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-cache' };
    if (req.url === '/api/news') {
      fs.readFile(admin.newsPath(), (err, data) => { res.writeHead(err ? 404 : 200, headers); res.end(err ? '[]' : data); });
      return;
    }
    const all = [...rooms.values()];
    res.writeHead(200, headers);
    res.end(JSON.stringify({
      name: 'ECLIPSE', version: PKG_VERSION, online: [...clients.values()].filter(c => c.name).length,
      rooms: all.length, matches: all.filter(r => r.match).length,
      inGame: all.reduce((n, r) => n + (r.match ? [...r.members.values()].filter(m => !m.isBot).length : 0), 0),
      uptime: Math.round(process.uptime()),
    }));
    return;
  }
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); res.end(); return; }
  if (url === '/') url = '/index.html';
  if (url === '/admin' || url === '/admin/') url = '/admin.html';
  if (url.includes('\0') || /(^|\/)\./.test(url)) { res.writeHead(404); res.end('Introuvable'); return; }
  for (const [prefix, dir] of MOUNTS) {
    if (!url.startsWith(prefix)) continue;
    const file = path.normalize(path.join(dir, url.slice(prefix.length)));
    if (file !== dir && !file.startsWith(dir + path.sep)) break; // empêche de sortir du dossier (y compris vers un dossier voisin)
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
    if (url === '/index.html') headers['Content-Security-Policy'] = GAME_CSP;
    if (VERIFIED) {
      // mode protégé : seuls les fichiers vérifiés au démarrage (empreinte conforme au manifeste) sont servis, depuis la mémoire
      const data = VERIFIED.get(path.relative(ROOT, file).split(path.sep).join('/'));
      if (!data) { notFound(req, res); return; }
      res.writeHead(200, headers); res.end(req.method === 'HEAD' ? undefined : data);
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) { notFound(req, res); return; }
      res.writeHead(200, headers);
      res.end(data);
    });
    return;
  }
  notFound(req, res);
});

// Limites anti-abus
const httpLimit = new Bucket(40, 200);            // requêtes HTTP par IP
const env = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };
// plusieurs amis derrière la même box partagent une IP publique : limites réglables par variables d'environnement
const connRate = new Bucket(1, env('CONN_BURST_PER_IP', 40)); // nouvelles connexions WebSocket par IP
const authFails = new Strikes(8, 10 * 60000, 15 * 60000); // échecs de connexion par IP
const REG_PER_HOUR = env('REGISTRATIONS_PER_HOUR', 6);
const regLimit = new Bucket(REG_PER_HOUR / 3600, REG_PER_HOUR); // inscriptions réussies par IP et par heure
const chatLimit = new Bucket(1.2, 5);             // messages de chat par joueur
const reportLimit = new Bucket(5 / 600, 5);       // signalements par joueur (5 puis 1 toutes les 2 min)
const roomLimit = new Bucket(0.3, 3);             // créations de salon par joueur
const socialLimit = new Bucket(1.5, 12);         // actions de profil, clan, tournoi, cadeaux par joueur
const MAX_CONN_PER_IP = env('MAX_CONN_PER_IP', 16);
const connPerIp = new Map();
const wss = new WebSocketServer({
  server, path: '/ws',
  maxPayload: 16 * 1024, // la bibliothèque accepte 100 Mo par défaut : déni de service possible
  verifyClient: (info, cb) => {
    const ip = Admin.ipOf(info.req);
    if (!originAllowed(info.req, ALLOWED_ORIGINS)) { admin.log('securite', `Connexion refusée (origine ${info.origin}) depuis ${ip}`); return cb(false, 403, 'Origine refusée'); }
    if (admin.activeBan('ip', ip)) return cb(false, 403, 'Banni');
    if ((connPerIp.get(ip) || 0) >= MAX_CONN_PER_IP) { admin.log('securite', `Trop de connexions simultanées depuis ${ip}`); return cb(false, 429, 'Trop de connexions'); }
    if (!connRate.take(ip)) { admin.log('securite', `Connexions trop rapides depuis ${ip}`); return cb(false, 429, 'Trop de connexions'); }
    cb(true);
  },
});
wss.on('error', () => { /* déjà géré par server.on('error') */ });
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const accounts = new Accounts(DATA_DIR);
const clients = new Map();
const rooms = new Map();
let nextId = 1;
const BOT_NAMES = ['Rogue', 'Vector', 'Kestrel', 'Nova', 'Cipher', 'Echo', 'Talon', 'Onyx', 'Raven', 'Jinx', 'Zephyr', 'Atlas', 'Ember', 'Quartz'];

const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
function send(id, obj) { sendRaw(id, JSON.stringify(obj)); }
function sendRaw(id, str) { const c = clients.get(id); if (c && c.ws.readyState === 1) { c.ws.send(str); admin.countOut(str.length); } }
// les skins de niveau ne s'équipent que s'ils sont possédés (jamais pour un invité)
function cleanSkins(sk, owned = []) {
  const out = {};
  if (sk && typeof sk === 'object') for (const w of SKINNABLE) {
    const skin = SKINS.find(s => s.id === sk[w]);
    if (skin && (!skin.level || owned.includes(skin.id))) out[w] = skin.id;
  }
  return out;
}
const validDiff = d => DIFFICULTIES.includes(d);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode() {
  for (;;) { let s = ''; for (let i = 0; i < 5; i++) s += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]; if (![...rooms.values()].some(r => r.code === s)) return s; }
}
function memberInfo(c) {
  const u = c.account && accounts.get(c.account);
  return { level: u ? levelOf(u.xp) : 1, title: u?.title ? TITLES[u.title] : null, clan: c.account ? clans.tagOf(c.account) : null };
}

function roomSummary(r) {
  return { id: r.id, name: r.name, mapId: r.mapId, mode: r.mode, players: r.members.size, humans: [...r.members.values()].filter(m => !m.isBot).length, max: r.maxPlayers, state: r.state, quick: !!r.quick, official: !!r.official };
}
function roomState(r) {
  return { ...roomSummary(r), hostId: r.hostId, target: r.target, difficulty: r.difficulty, private: !!r.private, code: r.code || null, opts: r.opts || {}, tournament: !!r.tournament,
    members: [...r.members.values()].map(m => ({ id: m.id, name: m.name, team: m.team, agent: m.agent, isBot: m.isBot, ready: m.ready, level: m.isBot ? null : m.level, title: m.title || null, clan: m.clan || null, account: !!m.account })) };
}
// les salons privés n'apparaissent pas dans la liste publique
const publicRooms = () => [...rooms.values()].filter(r => !r.private).map(roomSummary);
function broadcastRooms() {
  const list = publicRooms();
  for (const c of clients.values()) if (!c.roomId && c.name) send(c.id, { type: 'rooms', rooms: list });
}
function pushRoom(r) {
  const st = roomState(r);
  for (const m of r.members.values()) if (!m.isBot) send(m.id, { type: 'room', room: st });
  broadcastRooms();
}
const MODE_CFG = {
  assault: { max: 10, target: 7, tmin: 2, tmax: 13 },
  duel: { max: 2, target: 5, tmin: 2, tmax: 13 },
  ffa: { max: 8, target: 25, tmin: 5, tmax: 60 },
  gungame: { max: 8, target: GUN_LADDER.length, tmin: GUN_LADDER.length, tmax: GUN_LADDER.length },
  lives: { max: 8, target: 3, tmin: 1, tmax: 10 },
};
function teamCounts(r) {
  const c = { alpha: 0, beta: 0, ffa: 0 };
  for (const m of r.members.values()) c[m.team]++;
  return c;
}
function pickTeam(r) {
  if (isFfa(r.mode)) return 'ffa';
  const c = teamCounts(r);
  return c.alpha <= c.beta ? 'alpha' : 'beta';
}
function freeAgent(r, team, prefer) {
  const taken = new Set([...r.members.values()].filter(m => m.team === team && !isFfa(r.mode)).map(m => m.agent));
  if (prefer && AGENTS[prefer] && !taken.has(prefer)) return prefer;
  const free = AGENT_ORDER.filter(a => !taken.has(a));
  return free.length ? free[(Math.random() * free.length) | 0] : AGENT_ORDER[(Math.random() * AGENT_ORDER.length) | 0];
}

function addBot(r, team) {
  if (r.members.size >= r.maxPlayers) return;
  if (!isFfa(r.mode) && teamCounts(r)[team] >= r.maxPlayers / 2) return;
  const used = new Set([...r.members.values()].map(m => m.name));
  const name = (BOT_NAMES.find(n => !used.has('BOT ' + n)) || ('X' + nextId));
  const bot = { id: 'b' + (nextId++), name: 'BOT ' + name, team: isFfa(r.mode) ? 'ffa' : team, agent: null, isBot: true, ready: true, skins: randomSkins() };
  bot.agent = freeAgent(r, bot.team);
  r.members.set(bot.id, bot);
  if (r.match) r.match.addPlayer(bot);
}
function randomSkins() {
  const out = {};
  for (const w of SKINNABLE) out[w] = SKINS[(Math.random() * SKINS.length) | 0].id;
  return out;
}

function leaveRoom(c) {
  const r = rooms.get(c.roomId);
  c.roomId = null;
  if (!r) return;
  social.pushFriendsOf(c.account);
  const leaver = r.members.get(c.id);
  r.members.delete(c.id);
  if (r.match) r.match.removePlayer(c.id);
  if (r.tournament && tournaments.onLeave(r, c)) return;
  // Assaut : un bot remplace le joueur parti pour garder les équipes équilibrées
  if (r.match && r.mode === 'assault' && leaver && !leaver.isBot && r.match.phase !== 'over' && [...r.members.values()].some(m => !m.isBot)) { addBot(r, leaver.team); r.match.broadcast({ type: 'notice', text: `${leaver.name.toUpperCase()} EST PARTI : UN BOT LE REMPLACE` }); }
  const humans = [...r.members.values()].filter(m => !m.isBot);
  if (!humans.length) { r.match?.endSpectators('Plus aucun joueur dans la partie.'); for (const cl of clients.values()) if (cl.spectating === r.id) cl.spectating = null; }
  if (!humans.length && r.official) { r.hostId = null; if (r.match) { r.match = null; r.state = 'lobby'; } broadcastRooms(); return; }
  if (!humans.length) { rooms.delete(r.id); broadcastRooms(); return; }
  if (r.hostId === c.id) r.hostId = humans[0].id;
  pushRoom(r);
}

function stopSpectating(c) {
  if (!c.spectating) return;
  const room = rooms.get(c.spectating);
  room?.match?.removeSpectator(c.id);
  c.spectating = null;
}
function joinRoom(c, r) {
  stopSpectating(c);
  if (r.tournament && !r.tournament.players.includes(c.account)) { send(c.id, { type: 'error', text: 'Ce salon de tournoi est réservé aux deux joueurs du match.' }); return; }
  if (c.roomId === r.id) { pushRoom(r); return; }
  if (c.roomId) leaveRoom(c);
  if (r.members.size >= r.maxPlayers) {
    const bot = [...r.members.values()].reverse().find(m => m.isBot);
    if (!bot) { send(c.id, { type: 'error', text: 'Salon complet.' }); return; }
    r.members.delete(bot.id);
    if (r.match) r.match.removePlayer(bot.id);
  }
  const team = pickTeam(r);
  const m = { id: c.id, name: c.name, team, agent: freeAgent(r, team, c.prefAgent), isBot: false, ready: false, skins: c.skins, account: c.account, ...memberInfo(c) };
  r.members.set(c.id, m);
  c.roomId = r.id;
  social.pushFriendsOf(c.account);
  if (!r.members.get(r.hostId) || r.members.get(r.hostId).isBot) r.hostId = c.id;
  pushRoom(r);
  if (r.match) r.match.addPlayer(m);
  if (r.tournament) tournaments.onJoin(r);
  // duel rapide : lancement automatique quand deux joueurs sont présents
  if (r.quick && r.state === 'lobby' && [...r.members.values()].filter(x => !x.isBot).length >= 2) {
    for (const o of r.members.values()) if (!o.isBot) send(o.id, { type: 'chat', from: 'SYSTÈME', text: 'Adversaire trouvé ! Lancement dans 3 secondes…' });
    setTimeout(() => { if (rooms.has(r.id) && r.state === 'lobby' && r.members.size >= 2) startMatch(r); }, 3000);
  }
}

function startMatch(r) {
  r.state = 'playing';
  for (const m of r.members.values()) if (m.team !== 'ffa' && isFfa(r.mode)) m.team = 'ffa';
  const match = new Match(r, {
    send, sendRaw,
    onEvent: (type, data) => admin.matchEvent(type, { room: r, ...data }),
    rewardMul: () => admin.mul().eclats,
    weaponUnlocks: () => admin.state.config.weaponUnlocks,
    onOver: () => {
      if (r.tournament) return;
      const pool = mapsForMode(r.mode).filter(id => id !== r.mapId);
      const options = shuffle(pool.slice()).slice(0, 3);
      r.vote = { options, maps: new Map(), rematch: new Set() };
      for (const m of r.members.values()) if (!m.isBot) send(m.id, { type: 'voteOpen', options });
    },
    anticheat: () => ({ on: admin.state.config.anticheat !== false, strikes: admin.state.config.acStrikes || 5 }),
    onResults: results => {
      const mul = admin.mul();
      // classement Elo : uniquement les duels entre deux comptes différents
      const eloDeltas = {};
      if (r.mode === 'duel') {
        const acc = results.filter(x => x.account);
        if (acc.length === 2 && acc[0].account !== acc[1].account) {
          const a = accounts.get(acc[0].account), b = accounts.get(acc[1].account);
          if (a && b) { const d = eloUpdate(a, b, acc[0].won); eloDeltas[acc[0].id] = d; eloDeltas[acc[1].id] = -d; }
        }
      }
      for (const res of results) {
        const c = clients.get(res.id);
        const u = res.account && accounts.get(res.account);
        if (!u) { if (c) send(c.id, { type: 'matchSummary', guest: true }); continue; }
        const sum = accounts.applyResult(u, res, { mul, eloDelta: eloDeltas[res.id] ?? null });
        clans.onMatch(u, (sum.xp || 0) + (sum.questXp || 0), res.won, res.kills);
        if (c) c.lastMatch = { t: Date.now(), accounts: new Set(res.others || []), done: new Set() };
        admin.economy('earn', sum.eclatsTotal);
        const mem = r.members.get(res.id); if (mem) mem.level = sum.level;
        if (sum.achievements.length) admin.log('partie', `${u.name} débloque : ${sum.achievements.map(a => a.label).join(', ')}`);
        if (c) { send(c.id, { type: 'profile', profile: accounts.publicProfile(u) }); send(c.id, { type: 'matchSummary', summary: sum }); }
      }
      if (r.tournament) tournaments.onResults(r, results);
    },
    onEnd: () => {
      r.match?.endSpectators('La partie est terminée.');
      // résultat du vote : carte la plus demandée (sinon carte aléatoire si l'option est active) et revanche
      if (r.vote) {
        const tally = {}; for (const v of r.vote.maps.values()) tally[v] = (tally[v] || 0) + 1;
        const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
        if (best) r.mapId = best[0];
        else if (r.opts?.randomMap) { const pool = mapsForMode(r.mode); r.mapId = pool[(Math.random() * pool.length) | 0]; }
        const humans = [...r.members.values()].filter(m => !m.isBot);
        r.rematchNow = humans.length > 0 && humans.every(h => r.vote.rematch.has(h.id));
        r.vote = null;
      } else if (r.opts?.randomMap && !r.tournament) { const pool = mapsForMode(r.mode); r.mapId = pool[(Math.random() * pool.length) | 0]; }
      r.tacPauseUsed = false;
      for (const cl of clients.values()) if (cl.spectating === r.id) cl.spectating = null;
      r.match = null; r.state = 'lobby';
      for (const m of r.members.values()) m.ready = m.isBot;
      for (const m of r.members.values()) if (!m.isBot) send(m.id, { type: 'backToRoom' });
      pushRoom(r);
      if (r.tournament) tournaments.afterMatchEnd(r);
      if (r.rematchNow) { r.rematchNow = false; setTimeout(() => { if (rooms.has(r.id) && r.state === 'lobby' && [...r.members.values()].some(m => !m.isBot)) { for (const m of r.members.values()) if (!m.isBot) send(m.id, { type: 'chat', from: 'SYSTÈME', text: 'Revanche ! La partie recommence.' }); startMatch(r); } }, 1500); }
    },
  });
  r.match = match;
  match.start([...r.members.values()]);
  pushRoom(r);
  for (const m of r.members.values()) if (m.account) social.pushFriendsOf(m.account);
}

function newRoom(c, { name, mode, mapId, difficulty, priv = false, quick = false }) {
  mode = MODE_CFG[mode] ? mode : 'assault';
  const allowed = mapsForMode(mode);
  const room = {
    id: 'r' + (nextId++), name: name || `Salon de ${c.name}`, hostId: c.id, mapId: allowed.includes(mapId) ? mapId : allowed[(Math.random() * allowed.length) | 0], mode, quick,
    target: MODE_CFG[mode].target, difficulty: validDiff(difficulty) ? difficulty : 'normal', maxPlayers: MODE_CFG[mode].max, state: 'lobby', members: new Map(), match: null,
    private: !!priv, code: priv ? roomCode() : null,
  };
  rooms.set(room.id, room);
  return room;
}
function fillRoom(room) { while (room.members.size < room.maxPlayers) { const before = room.members.size; addBot(room, pickTeam(room)); if (room.members.size === before) break; } }

function handleLobby(c, msg) {
  const r = c.roomId ? rooms.get(c.roomId) : null;
  const isHost = r && r.hostId === c.id;
  switch (msg.type) {
    case 'hello': {
      // connexion invité
      let name = String(msg.name || '').normalize('NFKC').replace(/\s+/g, '_').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 16);
      if (name.length < 3 || accounts.validName(name)) name = 'Invite' + c.id.slice(1);
      if (accounts.exists(name) || [...clients.values()].some(o => o !== c && o.name === name)) name = name.slice(0, 11) + '#' + Math.floor(1000 + Math.random() * 9000);
      const deny = admin.checkGuest(c);
      if (deny) { send(c.id, { type: 'authError', text: deny }); break; }
      c.name = name; c.account = null;
      c.skins = cleanSkins(msg.skins);
      c.prefAgent = msg.agent;
      send(c.id, { type: 'welcome', id: c.id, name, guest: true, motd: admin.state.config.motd, event: admin.eventInfo() });
      admin.log('auth', `Invité connecté : ${name} (${c.ip})`);
      broadcastRooms();
      break;
    }
    case 'register': case 'login': case 'resume': {
      if (c.name) break;
      const wait = authFails.blocked(c.ip);
      if (wait) { send(c.id, { type: 'authError', text: `Trop de tentatives depuis ta connexion. Réessaie dans ${Math.ceil(wait / 60000)} min.` }); break; }
      let res;
      if (msg.type === 'register') {
        const deny = admin.checkRegister(c); if (deny) { send(c.id, { type: 'authError', text: deny }); break; }
        if (!regLimit.peek(c.ip)) { send(c.id, { type: 'authError', text: 'Trop de comptes créés depuis ta connexion, réessaie plus tard.' }); admin.log('securite', `Limite d'inscriptions atteinte pour ${c.ip}`); break; }
        res = accounts.register(msg.name, msg.password);
        if (res.user) { regLimit.take(c.ip); admin.onRegister(res.user, c); }
      }
      else if (msg.type === 'login') res = accounts.login(msg.name, msg.password);
      else { const u = accounts.resume(msg.token); res = u ? { user: u, token: msg.token } : { error: 'Session expirée, reconnecte-toi.', expired: true }; }
      if (res.error) {
        if (msg.type === 'login') { const n = authFails.fail(c.ip); if (n >= 5) admin.log('securite', `${n} échecs de connexion depuis ${c.ip} (dernier pseudo : ${clean(msg.name, 16)})`); }
        send(c.id, { type: 'authError', text: res.error, expired: !!res.expired }); break;
      }
      if (msg.type === 'login') authFails.reset(c.ip);
      const denied = admin.checkAccount(c, res.user);
      if (denied) { send(c.id, { type: 'authError', text: denied }); break; }
      // une seule connexion active par compte
      for (const o of clients.values()) if (o !== c && o.account === accounts.key(res.user.name)) { send(o.id, { type: 'kicked', text: 'Compte connecté depuis un autre appareil.' }); o.ws.close(); }
      c.account = accounts.key(res.user.name);
      c.token = res.token;
      c.name = res.user.name;
      c.skins = cleanSkins(res.user.equipped, res.user.owned);
      c.prefAgent = res.user.agent;
      accounts.touch(res.user, c.ip);
      const bonus = admin.state.config.dailyBonus ? dailyLogin(res.user, admin.mul().eclats) : null;
      if (bonus) { accounts.save(); admin.economy('earn', bonus.eclats); }
      send(c.id, { type: 'welcome', id: c.id, name: c.name, guest: false, token: res.token, profile: accounts.publicProfile(res.user), motd: admin.state.config.motd, event: admin.eventInfo() });
      if (bonus) send(c.id, { type: 'dailyBonus', ...bonus });
      admin.log('auth', `Connexion : ${c.name} (${c.ip})`);
      admin.onLogin(c, res.user);
      broadcastRooms();
      social.sendFriends(c);
      social.pushFriendsOf(c.account);
      c.clanTag = clans.tagOf(c.account);
      send(c.id, clans.payload(res.user));
      send(c.id, tournaments.payloadFor(c));
      clans.onLogin(c, res.user);
      // prévient les amis connectés
      for (const fk of res.user.friends || []) { const fc = social.clientOfKey(fk); if (fc && fc !== c) send(fc.id, { type: 'friendOnline', name: c.name }); }
      if (res.user.settings) send(c.id, { type: 'settingsSync', settings: res.user.settings, at: res.user.settingsAt || 0 });
      break;
    }
    case 'logout': if (c.token) accounts.logout(c.token); break;
    case 'ping': {
      if (Number.isFinite(msg.rtt)) c.ping = Math.max(0, Math.min(9999, Math.round(msg.rtt)));
      if (r && r.match) { const p = r.match.players.get(c.id); if (p) p.ping = c.ping; }
      send(c.id, { type: 'pong', t: msg.t });
      break;
    }
    case 'buySkin': case 'equipSkin': {
      const u = c.account && accounts.get(c.account);
      if (!u) break;
      const err = msg.type === 'buySkin' ? accounts.buySkin(u, msg.skin) : accounts.equip(u, msg.weapon, msg.skin);
      if (err) send(c.id, { type: 'error', text: err });
      send(c.id, { type: 'profile', profile: accounts.publicProfile(u) });
      if (msg.type === 'equipSkin') handleLobby(c, { type: 'setSkins', skins: u.equipped });
      break;
    }
    case 'quickDuel': {
      if (!roomLimit.take(c.id)) { send(c.id, { type: 'error', text: 'Doucement : attends quelques secondes.' }); break; }
      if (c.roomId) leaveRoom(c);
      if (![...rooms.values()].some(r => r.quick && r.state === 'lobby' && r.members.size < 2)) { const deny = admin.canCreateRoom(c); if (deny) { send(c.id, { type: 'error', text: deny }); break; } }
      const open = [...rooms.values()].find(r => r.quick && r.state === 'lobby' && r.members.size < 2);
      if (open) { joinRoom(c, open); break; }
      const room = newRoom(c, { name: `Duel rapide — ${c.name}`, mode: 'duel', quick: true });
      joinRoom(c, room);
      send(c.id, { type: 'chat', from: 'SYSTÈME', text: 'Recherche d\'un adversaire… (tu peux aussi ajouter un bot pour t\'entraîner)' });
      break;
    }
    // partie immédiate contre des bots (salon privé, lancement direct)
    case 'quickBots': {
      if (!roomLimit.take(c.id)) { send(c.id, { type: 'error', text: 'Doucement : attends quelques secondes.' }); break; }
      const deny = admin.canCreateRoom(c); if (deny) { send(c.id, { type: 'error', text: deny }); break; }
      if (c.roomId) leaveRoom(c);
      const mode = MODE_CFG[msg.mode] ? msg.mode : 'assault';
      const room = newRoom(c, { name: `Entraînement — ${c.name}`, mode, difficulty: msg.difficulty, priv: true });
      joinRoom(c, room); fillRoom(room); startMatch(room);
      break;
    }
    // mêlée rapide : rejoint une mêlée publique, ou en crée une avec des bots
    case 'quickFfa': case 'quickGun': {
      if (!roomLimit.take(c.id)) { send(c.id, { type: 'error', text: 'Doucement : attends quelques secondes.' }); break; }
      if (c.roomId) leaveRoom(c);
      const qmode = msg.type === 'quickGun' ? 'gungame' : 'ffa';
      const open = [...rooms.values()].find(x => x.mode === qmode && !x.private && !x.tournament && [...x.members.values()].filter(m => !m.isBot).length < x.maxPlayers);
      if (open) { joinRoom(c, open); if (open.state === 'lobby' && !open.official && open.hostId === c.id) startMatch(open); break; }
      const deny = admin.canCreateRoom(c); if (deny) { send(c.id, { type: 'error', text: deny }); break; }
      const room = newRoom(c, { name: qmode === 'gungame' ? 'Gun Game rapide' : 'Mêlée rapide', mode: qmode });
      joinRoom(c, room);
      for (let i = 0; i < 5; i++) addBot(room, 'ffa');
      startMatch(room);
      break;
    }
    case 'joinCode': {
      const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const rr = [...rooms.values()].find(x => x.code && x.code === code);
      if (!rr) { send(c.id, { type: 'error', text: 'Aucun salon avec ce code.' }); break; }
      c.invites = c.invites || new Set(); c.invites.add(rr.id);
      joinRoom(c, rr);
      break;
    }
    case 'listRooms': send(c.id, { type: 'rooms', rooms: publicRooms() }); break;
    case 'createRoom': {
      if (!roomLimit.take(c.id)) { send(c.id, { type: 'error', text: 'Doucement : attends quelques secondes avant de recréer un salon.' }); break; }
      const deny = admin.canCreateRoom(c);
      if (deny) { send(c.id, { type: 'error', text: deny }); break; }
      const room = newRoom(c, { name: clean(msg.name, 28), mode: msg.mode, mapId: msg.mapId, difficulty: msg.difficulty, priv: !!msg.private });
      if (!mapsForMode(room.mode).includes(msg.mapId)) room.mapId = mapsForMode(room.mode)[0];
      joinRoom(c, room);
      if (msg.fillBots) { for (let i = 0; i < room.maxPlayers - 1; i++) addBot(room, pickTeam(room)); pushRoom(room); }
      break;
    }
    case 'joinRoom': {
      const rr = rooms.get(msg.id);
      if (!rr) { send(c.id, { type: 'error', text: 'Salon introuvable.' }); break; }
      if (rr.private && !c.invites?.has(rr.id) && admin.levelOf(c) < 1) { send(c.id, { type: 'error', text: 'Ce salon est privé : demande son code ou une invitation.' }); break; }
      joinRoom(c, rr);
      break;
    }
    case 'leaveRoom': if (r) leaveRoom(c); send(c.id, { type: 'left' }); break;
    case 'setTeam': {
      if (!r || r.state !== 'lobby' || isFfa(r.mode) || !['alpha', 'beta'].includes(msg.team)) break;
      const m = r.members.get(c.id);
      if (m.team === msg.team || teamCounts(r)[msg.team] >= r.maxPlayers / 2) break;
      m.team = msg.team; m.agent = freeAgent(r, m.team, m.agent);
      pushRoom(r); break;
    }
    case 'setAgent': {
      if (!r || !AGENTS[msg.agent]) break;
      c.prefAgent = msg.agent;
      if (c.account) { const u = accounts.get(c.account); if (u) accounts.setAgent(u, msg.agent); }
      if (r.state !== 'lobby') break;
      const m = r.members.get(c.id);
      const taken = !isFfa(r.mode) && [...r.members.values()].some(o => o !== m && o.team === m.team && o.agent === msg.agent);
      if (taken) { const bot = [...r.members.values()].find(o => o.isBot && o.team === m.team && o.agent === msg.agent); if (bot) { bot.agent = m.agent; } else break; }
      m.agent = msg.agent; pushRoom(r); break;
    }
    case 'setSkins': {
      if (!c.account) c.skins = cleanSkins(msg.skins);
      else { const u = accounts.get(c.account); c.skins = cleanSkins(u?.equipped, u?.owned); }
      if (r) { const m = r.members.get(c.id); if (m) { m.skins = c.skins; if (r.match) r.match.updateMember(m); } }
      break;
    }
    case 'setReady': if (r) { const m = r.members.get(c.id); m.ready = !!msg.ready; pushRoom(r); } break;
    case 'roomSettings': {
      if (!isHost || r.state !== 'lobby' || r.tournament) break;
      if (validDiff(msg.difficulty)) r.difficulty = msg.difficulty;
      if (typeof msg.private === 'boolean' && msg.private !== !!r.private) { r.private = msg.private; r.code = r.private ? roomCode() : null; }
      if (msg.mode && msg.mode !== r.mode && MODE_CFG[msg.mode]) {
        const humans = [...r.members.values()].filter(m => !m.isBot);
        if (humans.length > MODE_CFG[msg.mode].max) { send(c.id, { type: 'error', text: 'Trop de joueurs pour ce mode.' }); break; }
        r.mode = msg.mode; r.maxPlayers = MODE_CFG[r.mode].max; r.target = MODE_CFG[r.mode].target;
        for (const m of [...r.members.values()]) if (m.isBot) r.members.delete(m.id);
        let k = 0;
        for (const m of r.members.values()) m.team = isFfa(r.mode) ? 'ffa' : (k++ % 2 ? 'beta' : 'alpha');
        if (!mapsForMode(r.mode).includes(r.mapId)) r.mapId = mapsForMode(r.mode)[0];
      }
      if (mapsForMode(r.mode).includes(msg.mapId)) r.mapId = msg.mapId;
      const t = parseInt(msg.target, 10);
      if (t) r.target = Math.max(MODE_CFG[r.mode].tmin, Math.min(MODE_CFG[r.mode].tmax, t));
      // options de partie (salon personnalisé)
      if (msg.opts && typeof msg.opts === 'object') { r.opts = r.opts || {}; for (const k of ['infAmmo', 'noAbilities', 'headOnly', 'lowGrav', 'randomMap']) if (k in msg.opts) r.opts[k] = !!msg.opts[k]; }
      pushRoom(r); break;
    }
    // vote de la prochaine carte / revanche (écran de fin)
    case 'mapVote': case 'rematch': {
      if (!r || !r.vote || r.tournament) break;
      if (msg.type === 'mapVote') { if (r.vote.options.includes(msg.map)) r.vote.maps.set(c.id, msg.map); }
      else r.vote.rematch.add(c.id);
      const tally = {}; for (const v of r.vote.maps.values()) tally[v] = (tally[v] || 0) + 1;
      for (const m of r.members.values()) if (!m.isBot) send(m.id, { type: 'voteState', tally, rematch: r.vote.rematch.size, humans: [...r.members.values()].filter(x => !x.isBot).length });
      break;
    }
    // pause tactique : l'hôte d'un salon privé, une fois par partie, 30 secondes
    case 'tacPause': {
      if (!isHost || !r.match || !r.private || r.tournament || r.match.phase === 'over' || r.tacPauseUsed) break;
      r.tacPauseUsed = true; r.match.broadcast({ type: 'notice', text: `PAUSE TACTIQUE DEMANDÉE PAR ${c.name.toUpperCase()} (30 s)` });
      r.match.paused = true;
      setTimeout(() => { if (r.match) { r.match.paused = false; r.match.broadcast({ type: 'notice', text: 'REPRISE !' }); } }, 30000);
      break;
    }
    case 'addBot': if (isHost && !r.tournament) { addBot(r, msg.team === 'beta' ? 'beta' : 'alpha'); pushRoom(r); } break;
    case 'fillBots': if (isHost && r.state === 'lobby' && !r.tournament) { while (r.members.size < r.maxPlayers) { const before = r.members.size; addBot(r, pickTeam(r)); if (r.members.size === before) break; } pushRoom(r); } break;
    case 'removeBot': if (isHost) { const m = r.members.get(msg.id); if (m && m.isBot) { r.members.delete(m.id); if (r.match) r.match.removePlayer(m.id); pushRoom(r); } } break;
    case 'start': if (isHost && r.state === 'lobby' && !r.tournament) startMatch(r); break;
    case 'chat': {
      if (!r) break;
      const raw = clean(msg.text, 140);
      if (!raw) break;
      if (!chatLimit.take(c.id)) { send(c.id, { type: 'chat', from: 'SYSTÈME', text: 'Doucement, tu envoies trop de messages.' }); break; }
      if (raw === c.lastChat && Date.now() - c.lastChatAt < 4000) break;
      c.lastChat = raw; c.lastChatAt = Date.now();
      if (raw.startsWith('/') && social.command(c, r, raw)) break;
      const verdict = admin.chatMessage(c, r, raw, { teamOnly: !!msg.teamOnly });
      if (verdict.reply) { send(c.id, { type: 'chat', from: 'SYSTÈME', text: verdict.reply }); break; }
      const text = verdict.deliver;
      const m = r.members.get(c.id);
      // chat d'équipe : seuls les coéquipiers le reçoivent ; un joueur qui a bloqué l'auteur ne reçoit rien
      const teamOnly = !!msg.teamOnly && !isFfa(r.mode);
      for (const o of r.members.values()) {
        if (o.isBot || (teamOnly && o.team !== m?.team)) continue;
        if (o.account && social.blocks(o.account, c.account)) continue;
        send(o.id, { type: 'chat', from: c.name, team: m?.team, text, teamOnly, title: m?.title || null });
      }
      break;
    }
    case 'radio': {
      if (!r || !r.match || isFfa(r.mode)) break;
      const text = RADIO[Math.round(Number(msg.id))];
      if (!text || !chatLimit.take(c.id)) break;
      if (admin.activeMute(c)) break;
      const m = r.members.get(c.id);
      for (const o of r.members.values()) if (!o.isBot && o.team === m?.team && !(o.account && social.blocks(o.account, c.account))) send(o.id, { type: 'chat', from: c.name, team: m.team, text, teamOnly: true, radio: true });
      break;
    }
    case 'report': {
      if (!reportLimit.take(c.id)) { send(c.id, { type: 'reportResult', ok: false, text: 'Tu as envoyé beaucoup de signalements : réessaie dans quelques minutes.' }); break; }
      const tm = r && r.members.get(msg.id);
      const name = tm && !tm.isBot ? tm.name : clean(msg.name, 16);
      if (!name || name === c.name || (tm && tm.isBot)) { send(c.id, { type: 'reportResult', ok: false, text: 'Joueur invalide.' }); break; }
      const p = r?.match?.players.get(tm?.id);
      const evidence = p ? { kills: p.kills, deaths: p.deaths, hs: p.hsKills, shots: p.shots, hits: p.hits, dmg: Math.round(p.dmg), strikes: p.cheatStrikes || 0, mode: r.mode, map: r.mapId } : null;
      admin.addReport({ from: c.name, fromAccount: c.account, target: name, targetAccount: tm?.account || (accounts.exists(name) ? accounts.key(name) : null),
        category: REPORT_REASONS[msg.reason] ? msg.reason : 'other', reason: clean(msg.text, 200), room: r?.name || '', evidence });
      send(c.id, { type: 'reportResult', ok: true, text: `Signalement contre ${name} envoyé à l'équipe de modération. Merci !` });
      break;
    }
    case 'leaveMatch': if (r) leaveRoom(c); stopSpectating(c); send(c.id, { type: 'left' }); break;
    // ---------- spectateur staff (invisible) ----------
    case 'spectateList': {
      if (admin.levelOf(c) < 1) break;
      send(c.id, { type: 'spectateList', matches: [...rooms.values()].filter(x => x.match).map(x => ({ roomId: x.id, name: x.name, mode: x.mode, map: x.mapId,
        players: [...x.members.values()].map(m => ({ id: m.id, name: m.name, team: m.team, bot: !!m.isBot })) })) });
      break;
    }
    case 'spectate': {
      if (admin.levelOf(c) < 1) { send(c.id, { type: 'error', text: 'Réservé à l\'équipe de modération.' }); break; }
      if (r) { send(c.id, { type: 'error', text: 'Quitte ton salon avant d\'observer une partie.' }); break; }
      const id = String(msg.id || '');
      const room = [...rooms.values()].find(x => x.match && (x.members.has(id) || x.id === id));
      if (!room) { send(c.id, { type: 'error', text: 'Ce joueur n\'est pas en partie.' }); break; }
      stopSpectating(c);
      if (room.match.addSpectator(c.id, room.members.has(id) ? id : null)) {
        c.spectating = room.id;
        const tm = room.members.get(id);
        admin.log('moderation', `${c.name} observe ${tm ? tm.name : 'la partie'} dans « ${room.name} »`);
      }
      break;
    }
    case 'spectateSwitch': { const room = c.spectating && rooms.get(c.spectating); if (room?.match) room.match.switchSpectator(c.id, String(msg.id || '')); break; }
    case 'spectateStop': stopSpectating(c); break;
    case 'staffAction': {
      if (admin.levelOf(c) < 1 || !c.spectating) break;
      const room = rooms.get(c.spectating); const tm = room && room.members.get(String(msg.id || ''));
      if (!tm || tm.isBot) { send(c.id, { type: 'specNotice', text: 'Joueur introuvable (ou bot).' }); break; }
      const reason = clean(msg.reason, 200) || 'Décision de la modération (observation en direct)';
      const map = { warn: ['warn', { name: tm.name, reason }], mute: ['mute', { id: tm.id, minutes: 10, reason }], kick: ['kick', { id: tm.id, reason }], ban: ['ban', { id: tm.id, minutes: 1440, reason }] };
      const a = map[msg.action];
      if (!a || (msg.action === 'warn' && !tm.account)) { send(c.id, { type: 'specNotice', text: 'Action impossible sur ce joueur.' }); break; }
      try { admin.staffRun(c, a[0], a[1]); send(c.id, { type: 'specNotice', text: `${{ warn: 'Avertissement envoyé à', mute: 'Silence de 10 min pour', kick: 'Expulsion de', ban: 'Ban de 24 h pour' }[msg.action]} ${tm.name}.` }); }
      catch (e) { send(c.id, { type: 'specNotice', text: e.message || 'Action refusée.' }); }
      break;
    }
    default:
      if (typeof msg.type === 'string' && /^(clan|tour|gift$|endorse$|setProfile$|buyShop$|pinFriend$|recent$|shop$)/.test(msg.type) && !/^(clanChat|clanGet|tourList)$/.test(msg.type) && !socialLimit.take(c.id)) { send(c.id, { type: 'error', text: 'Doucement : attends un instant.' }); break; }
      if (social.handle(c, msg)) break;
      if (clans.handle(c, msg) || tournaments.handle(c, msg)) break;
      if (r && r.match) r.match.handle(c.id, msg);
  }
}

// ---------- administration ----------
function kick(c, text) {
  send(c.id, { type: 'system', kind: 'kick', text });
  admin.log('moderation', `Expulsion de ${c.name || c.id} : ${text}`);
  setTimeout(() => { try { c.ws.close(4000, 'kick'); } catch { /* déjà fermé */ } }, 300);
}
function closeRoom(r, text) {
  for (const m of [...r.members.values()]) {
    if (m.isBot) continue;
    const c = clients.get(m.id);
    if (!c) continue;
    c.roomId = null;
    if (r.match) send(c.id, { type: 'backToRoom' });
    send(c.id, { type: 'left' });
    send(c.id, { type: 'system', kind: 'notice', text });
  }
  r.match?.endSpectators('Le salon a été fermé.');
  for (const cl of clients.values()) if (cl.spectating === r.id) cl.spectating = null;
  r.match = null;
  rooms.delete(r.id);
  broadcastRooms();
}
function createOfficialRoom({ name, mode, mapId, difficulty, bots }) {
  mode = MODE_CFG[mode] ? mode : 'assault';
  const allowed = mapsForMode(mode);
  const room = {
    id: 'r' + (nextId++), name: name || 'Salon officiel', hostId: null, official: true,
    mapId: allowed.includes(mapId) ? mapId : allowed[0], mode, target: MODE_CFG[mode].target,
    difficulty: validDiff(difficulty) ? difficulty : 'normal',
    maxPlayers: MODE_CFG[mode].max, state: 'lobby', members: new Map(), match: null,
  };
  rooms.set(room.id, room);
  for (let i = 0; i < Math.min(bots || 0, room.maxPlayers - 1); i++) addBot(room, pickTeam(room));
  broadcastRooms();
  return room;
}
const admin = new Admin({
  accounts, clients, rooms, dataDir: DATA_DIR, root: ROOT, version: PKG_VERSION, MODE_CFG, DIFFICULTIES,
  send, kick, closeRoom, createRoom: createOfficialRoom, addBot, pickTeam, pushRoom, broadcastRooms, startMatch,
});
const social = new Social({ accounts, clients, rooms, send, joinRoom, admin, chatLimit });
admin.ctx.social = social;
const clans = new Clans({ accounts, clients, send, admin, chatLimit, social, onTagChange: c => { const r = c.roomId && rooms.get(c.roomId); const m = r && r.members.get(c.id); if (m) { m.clan = c.clanTag || null; pushRoom(r); r.match?.updateMember(m); } } });
admin.ctx.clans = clans; social.clans = clans;
// salon d'un match de tournoi : privé, sans bots, réservé aux deux joueurs du match
function createTourRoom(t, m, name) {
  const maps = mapsForMode('duel');
  const room = {
    id: 'r' + (nextId++), name: name.slice(0, 60), hostId: null, mapId: maps[(Math.random() * maps.length) | 0], mode: 'duel', quick: false,
    target: t.target, difficulty: 'normal', maxPlayers: 2, state: 'lobby', members: new Map(), match: null, private: true, code: null,
    tournament: { tid: t.id, match: m.id, players: [m.p1, m.p2] },
  };
  rooms.set(room.id, room);
  return room;
}
const tournaments = new Tournaments({ accounts, clients, rooms, send, admin, dataDir: DATA_DIR, createRoom: createTourRoom, joinRoom, startMatch, closeRoom });
admin.ctx.tournaments = tournaments;
accounts.onPurchase = skin => { admin.economy('spend', skin.price); admin.economy('skin', skin.id); };
for (const a of integrityAlerts) admin.log('securite', a);
if (VERIFIED) admin.log('systeme', `Mode protégé : ${VERIFIED.size} fichiers vérifiés servis depuis la mémoire`);
setInterval(() => {
  if (!VERIFIED) return;
  let man; try { man = JSON.parse(fs.readFileSync(path.join(ROOT, 'integrity.json'), 'utf8')).files; } catch { return; }
  for (const rel of Object.keys(man)) {
    try { if (crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex') !== man[rel]) admin.log('securite', `Fichier modifié sur le disque depuis le démarrage : ${rel} (la version vérifiée continue d'être servie)`); } catch { /* */ }
  }
}, 5 * 60000).unref();


wss.on('connection', (ws, req) => {
  const id = 'p' + (nextId++);
  const c = { id, ws, name: null, roomId: null, skins: {}, alive: true, missed: 0, account: null, ip: Admin.ipOf(req), since: Date.now(), ping: 0 };
  clients.set(id, c);
  connPerIp.set(c.ip, (connPerIp.get(c.ip) || 0) + 1);
  const msgLimit = new Bucket(90, 180); // ~30 entrées/s + tirs + actions
  let dropped = 0;
  // une trame malformée ou trop grosse déclenche une erreur : sans ce gestionnaire, tout le serveur plantait
  ws.on('error', err => { admin.log('securite', `Trame WebSocket invalide de ${c.name || c.ip} : ${err.message}`); try { ws.terminate(); } catch { /* déjà fermé */ } });
  ws.on('pong', () => { c.alive = true; c.missed = 0; });
  ws.on('message', data => {
    if (data.length > 8192) return;
    admin.countIn();
    if (!msgLimit.take(id)) {
      if (++dropped === 300) { admin.log('securite', `Inondation de messages par ${c.name || c.ip} : connexion fermée`); ws.close(1008, 'Trop de messages'); }
      return;
    }
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;
    if (!c.name && !['hello', 'register', 'login', 'resume', 'ping'].includes(msg.type)) return;
    try { handleLobby(c, msg); } catch (e) { console.error('Erreur message', msg.type, e); admin.error(`Erreur sur le message « ${String(msg.type).slice(0, 20)} » : ${e.message}`); }
  });
  ws.on('close', () => {
    const n = (connPerIp.get(c.ip) || 1) - 1; if (n > 0) connPerIp.set(c.ip, n); else connPerIp.delete(c.ip);
    if (c.roomId) leaveRoom(c);
    stopSpectating(c);
    clients.delete(id);
    if (c.name) admin.log('connexion', `Déconnexion : ${c.name}`);
    if (c.account) { const u = accounts.get(c.account); if (u) { u.stats.online = (u.stats.online || 0) + Math.round((Date.now() - c.since) / 1000); accounts.touch(u); } social.pushFriendsOf(c.account); }
  });
});

setInterval(() => {
  // tolérance : un PC lent qui fige quelques secondes (chargement des graphismes) n'est coupé qu'après 2 pings sans réponse
  for (const c of clients.values()) {
    if (!c.alive && ++c.missed >= 2) { admin.log('connexion', `Connexion de ${c.name || c.ip} coupée : plus de réponse depuis 30 s`); c.ws.terminate(); continue; }
    if (c.alive) c.missed = 0;
    c.alive = false; c.ws.ping();
  }
}, 15000);

const DT = 1 / TICK_RATE;
setInterval(() => {
  const t0 = performance.now();
  for (const r of rooms.values()) if (r.match && !r.match.paused) {
    try { r.match.tick(DT); } catch (e) { console.error('Erreur tick', e); admin.error('Erreur pendant une partie : ' + e.message); }
  }
  admin.tickTime(performance.now() - t0);
}, 1000 / TICK_RATE);

// filet de sécurité : une erreur imprévue est journalisée au lieu d'arrêter le serveur pour tout le monde
process.on('uncaughtException', err => { console.error('Erreur non gérée', err); try { admin.error('Erreur non gérée : ' + err.message); } catch { /* */ } });
process.on('unhandledRejection', err => { console.error('Promesse rejetée', err); });
// Requête malformée : réponse 400. Pour une connexion keep-alive expirée ou réinitialisée, on ferme sans rien écrire :
// sinon le navigateur (ou le tunnel Cloudflare, qui réutilise ses connexions) prendrait ce « 400 » pour la réponse
// à sa requête suivante, ce qui provoquait des erreurs aléatoires.
server.on('clientError', (err, socket) => {
  try {
    if (err.code === 'ECONNRESET' || err.code === 'ERR_HTTP_REQUEST_TIMEOUT' || err.code === 'HPE_INVALID_EOF_STATE' || !socket.writable) { socket.destroy(); return; }
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  } catch { /* déjà fermé */ }
});

server.headersTimeout = 15000;  // protège contre les connexions lentes (slowloris)
server.requestTimeout = 60000;
server.keepAliveTimeout = 95000; // plus long que celui de cloudflared (90 s) : le tunnel ne réutilise jamais une connexion que le serveur vient de fermer
server.maxHeadersCount = 60;

server.on('error', err => {
  if (err.code === 'EADDRINUSE') console.error(`Le port ${PORT} est déjà utilisé. Choisis-en un autre : npm start -- --port 8080`);
  else console.error(err);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`ECLIPSE — serveur prêt sur http://localhost:${PORT}` + (HOST === '0.0.0.0' ? '' : ` (écoute sur ${HOST} uniquement)`));
  const lan = Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => `http://${i.address}:${PORT}`);
  if (lan.length && HOST === '0.0.0.0' && !process.env.DATA_DIR?.startsWith('/data')) console.log(`Pour tes amis sur le même réseau : ${lan.join('  ')}`);
});

// arrêt propre (docker stop envoie SIGTERM) : on écrit les comptes avant de quitter
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
  console.log(`${sig} reçu, arrêt du serveur…`);
  accounts.flush();
  admin.flush();
  for (const c of clients.values()) c.ws.close(1001, 'Serveur arrêté');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
});
