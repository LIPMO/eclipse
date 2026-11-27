// Présence Discord (Rich Presence) du launcher — 2.2
// Parle directement au Discord installé sur l'ordinateur par son canal local (tube nommé sous Windows,
// socket Unix sous Linux/macOS) : aucune bibliothèque externe, aucune connexion à Internet.
// Protocole : trames [opcode uint32][longueur uint32][JSON], opcode 0 = poignée de main, 1 = message, 2 = fermeture.
const net = require('node:net');
const path = require('node:path');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

function ipcPaths() {
  if (process.platform === 'win32') return Array.from({ length: 10 }, (_, i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp';
  const dirs = [base, path.join(base, 'app', 'com.discordapp.Discord'), path.join(base, 'snap.discord'), path.join(base, '.flatpak', 'com.discordapp.Discord', 'xdg-run')];
  const out = [];
  for (const d of dirs) for (let i = 0; i < 10; i++) out.push(path.join(d, `discord-ipc-${i}`));
  return out;
}

function encode(op, data) {
  const json = Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeUInt32LE(op, 0); head.writeUInt32LE(json.length, 4);
  return Buffer.concat([head, json]);
}

class DiscordPresence {
  constructor(clientId, { log = () => {} } = {}) {
    this.clientId = String(clientId);
    this.log = log;
    this.sock = null; this.ready = false; this.enabled = false;
    this.activity = null; this.lastSent = 0; this.timer = null; this.retry = null; this.buf = Buffer.alloc(0);
    this.user = null;
  }
  start() { if (this.enabled) return; this.enabled = true; this.connect(); }
  stop() {
    this.enabled = false; clearTimeout(this.retry); clearTimeout(this.timer);
    if (this.sock) { try { if (this.ready) this.sock.write(encode(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: null }, nonce: String(Date.now()) })); } catch { /* */ } try { this.sock.end(); } catch { /* */ } }
    this.sock = null; this.ready = false;
  }
  // essaie chaque canal possible ; Discord fermé : nouvel essai toutes les 20 s
  connect(list = ipcPaths(), i = 0) {
    if (!this.enabled || this.sock) return;
    if (i >= list.length) { this.retry = setTimeout(() => this.connect(), 20000); return; }
    const s = net.createConnection(list[i]);
    let opened = false;
    s.once('connect', () => {
      opened = true; this.sock = s; this.buf = Buffer.alloc(0);
      s.write(encode(OP.HANDSHAKE, { v: 1, client_id: this.clientId }));
    });
    s.on('data', d => this.onData(d));
    s.once('error', () => { if (!opened) { s.destroy(); this.connect(list, i + 1); } });
    s.once('close', () => {
      if (!opened) return;
      if (this.sock === s) { this.sock = null; this.ready = false; }
      if (this.enabled) this.retry = setTimeout(() => this.connect(), 15000);
    });
  }
  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 8) {
      const op = this.buf.readUInt32LE(0), len = this.buf.readUInt32LE(4);
      if (this.buf.length < 8 + len) return;
      let msg = null; try { msg = JSON.parse(this.buf.subarray(8, 8 + len).toString('utf8')); } catch { /* */ }
      this.buf = this.buf.subarray(8 + len);
      if (op === OP.PING) { try { this.sock.write(encode(OP.PONG, msg)); } catch { /* */ } continue; }
      if (op === OP.CLOSE) { this.log('discord: fermé', msg?.message); try { this.sock.destroy(); } catch { /* */ } return; }
      if (msg?.evt === 'READY') { this.ready = true; this.user = msg.data?.user?.username || null; this.log('discord: connecté'); this.lastSent = 0; if (this.activity) this.flush(true); }
      else if (msg?.evt === 'ERROR') this.log('discord: erreur', msg.data?.message);
    }
  }
  // Discord limite les mises à jour (≈ 5 toutes les 20 s) : au plus une toutes les 4 s, la dernière demande gagne
  set(activity) {
    this.activity = activity;
    this.flush(false);
  }
  flush(now) {
    if (!this.ready || !this.sock) return;
    const wait = now ? 0 : Math.max(0, 4000 - (Date.now() - this.lastSent));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.ready || !this.sock) return;
      this.lastSent = Date.now();
      try { this.sock.write(encode(OP.FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: this.activity }, nonce: String(this.lastSent) })); } catch { /* */ }
    }, wait);
  }
}

// ---------- contenu de la présence ----------
const SITE = 'https://eclipseee.online';
const clip = (s, n = 128) => { s = String(s ?? '').replace(/[\u0000-\u001f]/g, '').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const MODE_NAMES = { assault: 'Assaut 5v5', duel: 'Duel 1v1', ffa: 'Mêlée', gungame: 'Gun Game', lives: 'Dernier debout', range: 'Champ de tir' };
// état envoyé par le jeu (fenêtre de jeu) → activité Discord ; tout est vérifié et coupé à la bonne longueur
function buildActivity(st = {}, opts = {}) {
  const a = { instance: false, assets: { large_image: `${SITE}/img/logo-512.png`, large_text: 'ECLIPSE — shooter tactique gratuit' } };
  const where = st.where;
  if (where === 'match' || where === 'range' || where === 'spectate') {
    const mode = where === 'range' ? 'Champ de tir' : MODE_NAMES[st.mode] || clip(st.mode, 32) || 'En partie';
    const map = clip(st.map, 32);
    a.details = clip(where === 'spectate' ? `Regarde une partie · ${mode}` : map ? `${mode} · ${map}` : mode);
    const bits = [];
    if (where !== 'range' && Number.isFinite(st.scoreA) && Number.isFinite(st.scoreB)) bits.push(`${st.scoreA} – ${st.scoreB}`);
    if (Number.isFinite(st.round) && st.round > 0 && st.mode !== 'ffa' && st.mode !== 'gungame' && st.mode !== 'lives') bits.push(`Manche ${st.round}`);
    if (Number.isFinite(st.kills)) bits.push(`${st.kills}/${Number.isFinite(st.deaths) ? st.deaths : 0}${Number.isFinite(st.assists) ? '/' + st.assists : ''}`);
    if (st.phase === 'buy') bits.push('Phase d\'achat');
    a.state = clip(bits.join(' · ') || (where === 'range' ? 'S\'entraîne' : 'En jeu'));
    if (st.agent) { a.assets.small_image = `${SITE}/img/logo-180.png`; a.assets.small_text = clip(`Agent : ${st.agent}`, 64); }
    if (Number.isFinite(st.startedAt)) a.timestamps = { start: Math.round(st.startedAt) };
    if (Number.isFinite(st.teamSize) && Number.isFinite(st.teamMax) && st.teamMax > 1) a.party = { id: clip(st.partyId || 'eclipse-match', 64), size: [Math.max(1, st.teamSize), Math.max(st.teamSize, st.teamMax)] };
  } else if (where === 'room') {
    a.details = clip(`Dans un salon · ${MODE_NAMES[st.mode] || 'Partie'}`);
    a.state = clip(st.private ? 'Salon privé' : 'Salon public');
    if (Number.isFinite(st.players) && Number.isFinite(st.max)) a.party = { id: clip(st.partyId || 'eclipse-room', 64), size: [Math.max(1, st.players), Math.max(st.players, st.max)] };
    if (Number.isFinite(st.since)) a.timestamps = { start: Math.round(st.since) };
  } else if (where === 'menu') {
    a.details = 'Dans le menu';
    a.state = clip(st.tab ? `Onglet ${st.tab}` : 'Prépare sa prochaine partie');
    if (Number.isFinite(st.since)) a.timestamps = { start: Math.round(st.since) };
  } else {
    a.details = 'Dans le launcher';
    a.state = 'Prêt à jouer';
    if (Number.isFinite(opts.since)) a.timestamps = { start: Math.round(opts.since) };
  }
  if (st.level && Number.isFinite(st.level) && !a.assets.small_image) { a.assets.small_image = `${SITE}/img/logo-180.png`; a.assets.small_text = `Niveau ${st.level}`; }
  a.buttons = [{ label: 'Jouer gratuitement', url: SITE }, { label: 'Télécharger le launcher', url: `${SITE}/telecharger` }];
  return a;
}

module.exports = { DiscordPresence, buildActivity, encode, ipcPaths };
