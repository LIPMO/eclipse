// Administration : API HTTP sous /admin/api/*, modération, statistiques, configuration, journaux.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { SKINS, WEAPONS, ROUND, DUEL, AGENTS, SKINNABLE } from '../shared/data.js';
import { MAP_INFO, mapsForMode } from '../shared/maps.js';
import { QUESTS, QUEST_REWARD, TITLES, STAFF_TITLES, RANKS, rankOf, levelOf, levelInfo, ELO_START, REPORT_REASONS, ACHIEVEMENTS } from '../shared/progress.js';
import { addXp, setLevel, ensureUser, titlesOf, rankFor } from './progression.js';

export const LEVEL = { player: 0, mod: 1, admin: 2, owner: 3 };
const RAW = Symbol('raw');
const NAME_RE = /^[A-Za-z0-9_\-]{3,16}$/;
const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT_CONFIG = {
  maintenance: false, maintenanceMsg: 'Le serveur est en maintenance. Reviens dans quelques minutes !',
  motd: '', registrationOpen: true, guestsAllowed: true, guestRooms: true, chatEnabled: true,
  maxRooms: 50, maxPlayers: 200, rewardMul: 1, startEclats: 600,
  buyTime: 20, roundTime: 100, fuseTime: 40, duelBuyTime: 10, duelRoundTime: 60,
  weapons: {},
  // progression
  xpMul: 1, weaponUnlocks: true, dailyBonus: true, questOverrides: {},
  // événement temporaire (XP / Éclats multipliés jusqu'à une date)
  eventName: '', eventXpMul: 2, eventEclatsMul: 1, eventUntil: 0,
  // chat
  slowMode: 0, blockLinks: true, autoMute: true, autoMuteThreshold: 3, autoMuteMinutes: 10,
  // avertissements : ban automatique de 24 h au seuil (0 = désactivé)
  warnBanAt: 3,
};
// filtre proposé au premier lancement (modifiable dans Modération → Filtre de mots)
const DEFAULT_FILTER = ['connard', 'connasse', 'salope', 'pute', 'enculé', 'encule', 'fdp', 'ntm', 'nique ta mère', 'niquetamere', 'batard', 'bâtard', 'pédé', 'tg', 'ta gueule'];
// bornes de validation de la configuration
const CONFIG_RULES = {
  maintenance: 'bool', registrationOpen: 'bool', guestsAllowed: 'bool', guestRooms: 'bool', chatEnabled: 'bool',
  maintenanceMsg: ['str', 200], motd: ['str', 300],
  maxRooms: [1, 500], maxPlayers: [1, 5000], rewardMul: [0, 10], startEclats: [0, 100000],
  buyTime: [5, 120], roundTime: [20, 600], fuseTime: [10, 180], duelBuyTime: [3, 60], duelRoundTime: [15, 600],
  xpMul: [0, 10], weaponUnlocks: 'bool', dailyBonus: 'bool',
  eventName: ['str', 60], eventXpMul: [0, 10], eventEclatsMul: [0, 10], eventUntil: [0, 4102444800000],
  slowMode: [0, 120], blockLinks: 'bool', autoMute: 'bool', autoMuteThreshold: [1, 20], autoMuteMinutes: [1, 1440], warnBanAt: [0, 20],
};
const DECIMAL = new Set(['rewardMul', 'xpMul', 'eventXpMul', 'eventEclatsMul']);
const LINK_RE = /(https?:\/\/|www\.|discord\.gg|\b[a-z0-9-]{2,}\.(com|net|org|fr|io|gg|xyz|ru|info|me|be|co)\b)/i;
const WEAPON_DEFAULTS = Object.fromEntries(Object.entries(WEAPONS).map(([id, w]) => [id, { damage: w.damage, headMul: w.headMul }]));
const DEFAULT_STATS = () => ({ matches: 0, kills: 0, headshots: 0, modes: {}, maps: {}, agents: {}, weapons: {}, regsByDay: {}, matchesByDay: {}, peak: 0, peakAt: 0, agentWins: {}, earnByDay: {}, spendByDay: {}, skinSales: {} });

function fail(msg, status = 400) { const e = new Error(msg); e.status = status; throw e; }
const str = (v, n) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, n);
const int = (v, a, b) => { const n = Math.round(Number(v)); if (!Number.isFinite(n)) fail('Nombre invalide'); return Math.max(a, Math.min(b, n)); };
const maskIp = ip => { const p = String(ip || '').split('.'); return p.length === 4 ? `${p[0]}.${p[1]}.x.x` : String(ip || '').replace(/:[^:]+:[^:]+$/, ':x:x'); };
const csvCell = v => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export class Admin {
  static ipOf(req) {
    const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    const local = remote === '127.0.0.1' || remote === '::1';
    // derrière le tunnel Cloudflare (connexion locale), la vraie IP est dans l'en-tête
    const fwd = local && (req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim());
    return fwd || remote;
  }

  constructor(ctx) {
    this.ctx = ctx; // { accounts, clients, rooms, dataDir, root, version, send, kick, closeRoom, createRoom, addBot, pickTeam, pushRoom, broadcastRooms, startMatch, MODE_CFG }
    this.file = path.join(ctx.dataDir, 'admin.json');
    this.codeFile = path.join(ctx.dataDir, 'admin-setup-code.txt');
    let saved = {};
    try { saved = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* premier lancement */ }
    this.state = {
      config: { ...DEFAULT_CONFIG, ...(saved.config || {}) },
      bans: saved.bans || [], mutes: saved.mutes || [], filter: saved.filter || DEFAULT_FILTER.slice(), reports: saved.reports || [],
      audit: saved.audit || [], stats: { ...DEFAULT_STATS(), ...(saved.stats || {}) },
      season: saved.season || { n: 1, name: 'Saison 1', started: Date.now() }, seasonsHistory: saved.seasonsHistory || [],
      matches: saved.matches || [], suspects: saved.suspects || {}, schedule: saved.schedule || [], nameWords: saved.nameWords || [],
    };
    this.logs = []; this.chat = []; this.seq = 1; this.errors = []; this.errCount = 0; this.chatStrikes = new Map();
    this.history = []; this.started = Date.now();
    this.net = { out: 0, outMsgs: 0, inMsgs: 0 };
    this.rates = { outKBs: 0, outMsgs: 0, inMsgs: 0, cpu: 0 };
    this.ticks = [];
    this.loginTries = new Map();
    this.lastCpu = process.cpuUsage(); this.lastSample = Date.now(); this.lastHistory = 0;
    this.applyConfig();
    this.ensureSetupCode();
    this.log('systeme', `Serveur démarré (version ${ctx.version}, Node ${process.version})`);
    this.sample();
    setInterval(() => this.sample(), 5000).unref();
  }

  // ---------- persistance ----------
  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 500);
  }
  flush() {
    clearTimeout(this.saveTimer);
    try { fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.state)); fs.renameSync(this.file + '.tmp', this.file); } catch (e) { console.error('Sauvegarde admin impossible', e); }
  }
  newsPath() {
    const own = path.join(this.ctx.dataDir, 'news.json');
    return fs.existsSync(own) ? own : path.join(this.ctx.root, 'server', 'news.json');
  }

  // ---------- propriétaire / code d'installation ----------
  users() { return this.ctx.accounts.data.users; }
  hasOwner() { return Object.values(this.users()).some(u => u.role === 'owner'); }
  ensureSetupCode() {
    if (this.hasOwner()) { this.setupCode = null; try { fs.unlinkSync(this.codeFile); } catch { /* absent */ } return; }
    let code = null;
    try { code = fs.readFileSync(this.codeFile, 'utf8').trim(); } catch { /* nouveau code */ }
    if (!/^\d{4}-\d{4}$/.test(code || '')) {
      code = `${crypto.randomInt(1000, 10000)}-${crypto.randomInt(1000, 10000)}`;
      try { fs.writeFileSync(this.codeFile, code + '\n', { mode: 0o600 }); } catch { /* lecture seule */ }
    }
    this.setupCode = code;
    console.log(`\n[ADMIN] Aucun propriétaire n'est encore défini.\n[ADMIN] Code d'installation : ${code}\n[ADMIN] Connecte-toi sur /admin avec ton compte et saisis ce code.\n`);
  }

  // ---------- configuration ----------
  applyConfig() {
    const c = this.state.config;
    ROUND.buyTime = c.buyTime; ROUND.roundTime = c.roundTime; ROUND.fuseTime = c.fuseTime;
    this.ctx.accounts.questOverrides = c.questOverrides || {};
    this.ctx.accounts.bannedNameWords = this.state.nameWords;
    DUEL.buyTime = c.duelBuyTime; DUEL.roundTime = c.duelRoundTime;
    for (const [id, def] of Object.entries(WEAPON_DEFAULTS)) {
      const o = c.weapons[id] || {};
      WEAPONS[id].damage = o.damage ?? def.damage;
      WEAPONS[id].headMul = o.headMul ?? def.headMul;
    }
    this.ctx.accounts.startEclats = c.startEclats;
  }

  // ---------- journaux ----------
  log(type, text) {
    this.logs.push({ id: this.seq++, t: Date.now(), type, text: String(text).slice(0, 300) });
    if (this.logs.length > 3000) this.logs.splice(0, this.logs.length - 3000);
  }
  audit(by, action, detail = '') {
    this.state.audit.push({ t: Date.now(), by, action, detail: String(detail).slice(0, 300) });
    if (this.state.audit.length > 1000) this.state.audit.splice(0, this.state.audit.length - 1000);
    this.log('admin', `${by} — ${action}${detail ? ' : ' + detail : ''}`);
    this.save();
  }

  // erreurs : journalisées et comptées pour les métriques
  error(text) {
    this.errCount++;
    this.errors.push({ t: Date.now(), text: String(text).slice(0, 300) });
    if (this.errors.length > 200) this.errors.shift();
    this.log('systeme', text);
  }

  // ---------- progression : multiplicateurs, événement, économie ----------
  eventActive() { const c = this.state.config; return c.eventUntil > Date.now(); }
  eventInfo() { const c = this.state.config; return this.eventActive() ? { name: c.eventName || 'Événement', xp: c.eventXpMul, eclats: c.eventEclatsMul, until: c.eventUntil } : null; }
  mul() {
    const c = this.state.config, ev = this.eventActive();
    return { xp: c.xpMul * (ev ? c.eventXpMul : 1), eclats: c.rewardMul * (ev ? c.eventEclatsMul : 1) };
  }
  economy(kind, v) {
    const st = this.state.stats, d = today();
    if (kind === 'earn' && v > 0) st.earnByDay[d] = (st.earnByDay[d] || 0) + v;
    if (kind === 'spend' && v > 0) st.spendByDay[d] = (st.spendByDay[d] || 0) + v;
    if (kind === 'skin') st.skinSales[v] = (st.skinSales[v] || 0) + 1;
    for (const k of ['earnByDay', 'spendByDay']) { const keys = Object.keys(st[k]); if (keys.length > 60) delete st[k][keys.sort()[0]]; }
    this.save();
  }

  // ---------- signalements ----------
  addReport(r) {
    const report = { id: crypto.randomUUID(), t: Date.now(), resolved: false, ...r };
    // preuves : derniers messages de la personne signalée et alertes anti-triche
    report.chat = this.chat.filter(m => m.from === r.target).slice(-8).map(m => ({ t: m.t, text: m.original || m.text, room: m.roomName }));
    const sk = r.targetAccount || 'guest:' + r.target;
    report.suspect = this.state.suspects[sk]?.count || 0;
    this.state.reports.unshift(report);
    if (this.state.reports.length > 500) this.state.reports.length = 500;
    this.log('moderation', `Signalement (${REPORT_REASONS[r.category] || r.category}) de ${r.from} contre ${r.target}${r.reason ? ' : ' + r.reason : ''}`);
    this.save();
    // prévient le staff connecté
    for (const c of this.onlineClients()) if (this.levelOf(c) >= 1) this.ctx.send(c.id, { type: 'system', kind: 'staff', text: `Nouveau signalement contre ${r.target} (${REPORT_REASONS[r.category] || r.category}).` });
  }

  // ---------- mesures ----------
  countOut(bytes) { this.net.out += bytes; this.net.outMsgs++; }
  countIn() { this.net.inMsgs++; }
  tickTime(ms) { this.ticks.push(ms); if (this.ticks.length > 300) this.ticks.shift(); }
  onlineClients() { return [...this.ctx.clients.values()].filter(c => c.name); }
  inGameCount() { let n = 0; for (const r of this.ctx.rooms.values()) if (r.match) for (const m of r.members.values()) if (!m.isBot) n++; return n; }
  sample() {
    const now = Date.now(), dt = Math.max(0.001, (now - this.lastSample) / 1000);
    const cpu = process.cpuUsage(this.lastCpu);
    this.rates = {
      outKBs: Math.round(this.net.out / 1024 / dt * 10) / 10, outMsgs: Math.round(this.net.outMsgs / dt), inMsgs: Math.round(this.net.inMsgs / dt),
      cpu: Math.round((cpu.user + cpu.system) / 1000 / (dt * 1000) * 1000) / 10,
    };
    this.net = { out: 0, outMsgs: 0, inMsgs: 0 };
    this.lastCpu = process.cpuUsage(); this.lastSample = now;
    const online = this.onlineClients().length;
    const st = this.state.stats;
    if (online > st.peak) { st.peak = online; st.peakAt = now; this.save(); }
    if (now - this.lastHistory >= 60000) {
      this.lastHistory = now;
      const pings = this.onlineClients().map(c => c.ping).filter(p => p > 0);
      const t = this.ticks.length ? this.ticks : [0];
      this.history.push({ t: now, online, inGame: this.inGameCount(), rooms: this.ctx.rooms.size,
        ping: pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : 0, errors: this.errCount,
        tick: Math.round(t.reduce((a, b) => a + b, 0) / t.length * 100) / 100, cpu: this.rates.cpu, mem: Math.round(process.memoryUsage().rss / 1048576) });
      this.errCount = 0;
      if (this.history.length > 1440) this.history.shift();
    }
    // annonces programmées
    let schedChanged = false;
    for (const a of this.state.schedule) {
      if (a.at > now) continue;
      for (const c of this.onlineClients()) this.ctx.send(c.id, { type: 'system', kind: 'broadcast', from: a.by, text: a.text });
      this.log('admin', `Annonce programmée envoyée : ${a.text}`);
      if (a.repeat) { while (a.at <= now) a.at += a.repeat * 60000; } else a.done = true;
      schedChanged = true;
    }
    if (schedChanged) { this.state.schedule = this.state.schedule.filter(a => !a.done); this.save(); }
    // nettoyage des sanctions expirées
    const keep = x => !x.until || x.until > now;
    const nb = this.state.bans.length, nm = this.state.mutes.length;
    this.state.bans = this.state.bans.filter(keep); this.state.mutes = this.state.mutes.filter(keep);
    if (nb !== this.state.bans.length || nm !== this.state.mutes.length) this.save();
  }

  // ---------- contrôles d'accès des joueurs ----------
  levelOf(c) { const u = c.account && this.ctx.accounts.get(c.account); return LEVEL[u?.role || 'player'] || 0; }
  activeBan(type, value) { const now = Date.now(); return this.state.bans.find(b => b.type === type && b.value === value && (!b.until || b.until > now)); }
  banText(b) {
    return `Tu es banni ${b.until ? `jusqu'au ${new Date(b.until).toLocaleString('fr-FR')}` : 'définitivement'}. Raison : ${b.reason || 'non précisée'}.`;
  }
  checkGuest(c) {
    const cfg = this.state.config;
    const b = this.activeBan('ip', c.ip); if (b) return this.banText(b);
    if (cfg.maintenance) return cfg.maintenanceMsg;
    if (!cfg.guestsAllowed) return 'Les invités ne sont pas acceptés sur ce serveur : crée un compte ou connecte-toi.';
    if (this.onlineClients().length >= cfg.maxPlayers) return 'Le serveur est plein, réessaie dans un instant.';
    return null;
  }
  checkAccount(c, user) {
    const cfg = this.state.config, lvl = LEVEL[user.role || 'player'] || 0;
    const b = this.activeBan('account', this.ctx.accounts.key(user.name)) || (lvl < 3 && this.activeBan('ip', c.ip));
    if (b) return this.banText(b);
    if (cfg.maintenance && lvl < 1) return cfg.maintenanceMsg;
    if (lvl < 1 && this.onlineClients().length >= cfg.maxPlayers) return 'Le serveur est plein, réessaie dans un instant.';
    return null;
  }
  checkRegister(c) {
    const cfg = this.state.config;
    const b = this.activeBan('ip', c.ip); if (b) return this.banText(b);
    if (cfg.maintenance) return cfg.maintenanceMsg;
    if (!cfg.registrationOpen) return 'Les inscriptions sont fermées pour le moment.';
    return null;
  }
  onRegister(user) {
    const d = today(); this.state.stats.regsByDay[d] = (this.state.stats.regsByDay[d] || 0) + 1;
    this.log('auth', `Nouveau compte : ${user.name}`); this.save();
  }
  canCreateRoom(c) {
    const cfg = this.state.config;
    if (this.levelOf(c) >= 1) return null;
    if (!c.account && !cfg.guestRooms) return 'Les invités ne peuvent pas créer de salon : connecte-toi avec un compte.';
    if (this.ctx.rooms.size >= cfg.maxRooms) return 'Nombre maximum de salons atteint, rejoins un salon existant.';
    return null;
  }
  activeMute(c) {
    const key = c.account || 'guest:' + c.name, now = Date.now();
    return this.state.mutes.find(m => m.key === key && (!m.until || m.until > now));
  }

  // Chat : silence, mode lent, liens, filtre de mots, silence automatique, signalements. Renvoie { deliver } ou { reply }.
  chatMessage(c, room, text, opts = {}) {
    const cfg = this.state.config, staff = this.levelOf(c) >= 1, now = Date.now();
    if (!cfg.chatEnabled && !staff) return { reply: 'Le chat est désactivé sur ce serveur.' };
    const mute = this.activeMute(c);
    if (mute) return { reply: `Tu ne peux pas écrire ${mute.until ? `jusqu'au ${new Date(mute.until).toLocaleString('fr-FR')}` : 'pour le moment'}. Raison : ${mute.reason || 'non précisée'}.` };
    const rep = !opts.whisper && text.match(/^\/(signaler|report)\s+(\S+)\s*(.*)$/i);
    if (rep) {
      const name = rep[2].slice(0, 20);
      this.addReport({ from: c.name, fromAccount: c.account, target: name, targetAccount: this.ctx.accounts.exists(name) ? this.ctx.accounts.key(name) : null, category: 'other', reason: rep[3].slice(0, 200) || 'Sans précision', room: room?.name || '' });
      return { reply: 'Signalement envoyé à l\'équipe de modération. Merci !' };
    }
    if (text.startsWith('/')) return { reply: 'Commande inconnue. Tape /aide pour la liste des commandes.' };
    if (cfg.slowMode && !staff && !opts.whisper) {
      const wait = (c.lastSlow || 0) + cfg.slowMode * 1000 - now;
      if (wait > 0) return { reply: `Mode lent : attends encore ${Math.ceil(wait / 1000)} s avant d'écrire.` };
      c.lastSlow = now;
    }
    if (cfg.blockLinks && !staff && LINK_RE.test(text)) { this.strike(c, 'lien'); return { reply: 'Les liens ne sont pas autorisés dans le chat.' }; }
    let out = text, filtered = false;
    for (const w of this.state.filter) {
      if (!w) continue;
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // mots courts : uniquement le mot entier (évite de censurer « tgv », « fdp » dans un autre mot…)
      const re = new RegExp(w.length <= 3 ? `(^|[^\\p{L}\\p{N}])(${esc})(?=$|[^\\p{L}\\p{N}])` : esc, w.length <= 3 ? 'giu' : 'gi');
      if (re.test(out)) { filtered = true; out = w.length <= 3 ? out.replace(re, (m, pre, word) => pre + '*'.repeat(word.length)) : out.replace(re, m => '*'.repeat(m.length)); }
    }
    if (filtered && !staff) this.strike(c, 'mot filtré');
    this.chat.push({ id: this.seq++, t: now, room: room?.id, roomName: room?.name || '', from: c.name, account: c.account, text: out, original: filtered ? text : undefined, team: opts.teamOnly || undefined });
    if (this.chat.length > 2000) this.chat.splice(0, this.chat.length - 2000);
    return { deliver: out };
  }

  // silence automatique : au-delà du seuil d'infractions en 10 minutes
  strike(c, why) {
    const cfg = this.state.config;
    if (!cfg.autoMute) return;
    const key = c.account || 'guest:' + c.name, now = Date.now();
    const list = (this.chatStrikes.get(key) || []).filter(t => now - t < 600000);
    list.push(now); this.chatStrikes.set(key, list);
    if (list.length < cfg.autoMuteThreshold) return;
    this.chatStrikes.delete(key);
    this.state.mutes = this.state.mutes.filter(m => m.key !== key);
    this.state.mutes.push({ id: crypto.randomUUID(), key, label: c.name, reason: `Silence automatique (${why})`, by: 'Automatique', at: now, until: now + cfg.autoMuteMinutes * 60000 });
    this.save();
    this.log('moderation', `Silence automatique de ${cfg.autoMuteMinutes} min pour ${c.name} (${why})`);
    this.ctx.send(c.id, { type: 'system', kind: 'notice', text: `Tu es réduit au silence pendant ${cfg.autoMuteMinutes} min (messages inappropriés répétés).` });
  }

  // Événements de partie (statistiques)
  matchEvent(type, d) {
    const st = this.state.stats;
    if (type === 'start') {
      const r = d.room;
      st.matches++; st.modes[r.mode] = (st.modes[r.mode] || 0) + 1; st.maps[r.mapId] = (st.maps[r.mapId] || 0) + 1;
      const day = today(); st.matchesByDay[day] = (st.matchesByDay[day] || 0) + 1;
      for (const p of d.players || []) if (!p.isBot) st.agents[p.agent] = (st.agents[p.agent] || 0) + 1;
      d.room.startedAt = Date.now();
      this.log('partie', `Partie lancée : « ${r.name} » (${r.mode}, ${MAP_INFO[r.mapId]?.name || r.mapId})`);
    } else if (type === 'kill') {
      st.kills++; if (d.head) st.headshots++;
      st.weapons[d.weapon] = (st.weapons[d.weapon] || 0) + 1;
      this.log('kill', `${d.killer || '—'} a éliminé ${d.victim}${d.head ? ' (tête)' : ''} — ${WEAPONS[d.weapon]?.name || d.weapon}`);
    } else if (type === 'end') {
      const r = d.room, m = r.match;
      this.log('partie', `Partie terminée : « ${r.name} »`);
      // historique global des parties
      const winner = d.winner === 'alpha' ? 'Alpha' : d.winner === 'beta' ? 'Oméga' : (m?.players.get(d.winner)?.name || '—');
      this.state.matches.unshift({ id: crypto.randomUUID(), t: Date.now(), room: r.name, mode: r.mode, map: r.mapId, duration: Math.round(d.duration || 0),
        score: r.mode === 'ffa' ? '' : `${m?.score.alpha ?? 0}-${m?.score.beta ?? 0}`, winner, mvp: d.mvp || '', players: d.players || [] });
      if (this.state.matches.length > 300) this.state.matches.length = 300;
      // victoires par agent (équilibrage)
      if (m) for (const p of m.players.values()) {
        if (p.isBot) continue;
        const won = r.mode === 'ffa' ? d.winner === p.id : d.winner === p.team;
        const a = st.agentWins[p.agent] || (st.agentWins[p.agent] = { played: 0, won: 0, kills: 0, deaths: 0 });
        a.played++; if (won) a.won++; a.kills += p.kills; a.deaths += p.deaths;
      }
    } else if (type === 'cheat') {
      this.log('securite', `${d.stat ? 'Statistiques suspectes' : `Mouvement suspect (${d.strikes} alertes)`} : ${d.name} dans « ${d.room.name} » — ${d.reason}`);
      const key = d.account || 'guest:' + d.name;
      const sus = this.state.suspects[key] || (this.state.suspects[key] = { name: d.name, account: d.account || null, count: 0, alerts: [] });
      sus.count++; sus.last = Date.now(); sus.name = d.name;
      sus.alerts.unshift({ t: Date.now(), reason: d.reason, room: d.room.name });
      if (sus.alerts.length > 20) sus.alerts.length = 20;
      const keys = Object.keys(this.state.suspects);
      if (keys.length > 300) delete this.state.suspects[keys.sort((a, b) => this.state.suspects[a].last - this.state.suspects[b].last)[0]];
      if (sus.count === 3 || sus.count % 10 === 0) for (const c of this.onlineClients()) if (this.levelOf(c) >= 1) this.ctx.send(c.id, { type: 'system', kind: 'staff', text: `Anti-triche : ${d.name} cumule ${sus.count} alertes.` });
    }
    this.save();
  }

  // ---------- HTTP ----------
  async handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const action = url.pathname.replace(/^\/admin\/api\//, '');
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
    let body = {};
    if (req.method === 'POST') {
      try { body = await new Promise((resolve, reject) => {
        let size = 0; const chunks = [];
        req.on('data', ch => { size += ch.length; if (size > 300000) { reject(new Error('Requête trop volumineuse')); req.destroy(); } else chunks.push(ch); });
        req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('JSON invalide')); } });
        req.on('error', reject);
      }); } catch (e) { return json(400, { error: e.message }); }
    }
    const ip = Admin.ipOf(req);
    // restriction optionnelle du panneau à certaines adresses IP (ex. ADMIN_ALLOWED_IPS=<IP-AUTORISEE>,203.0.113.7)
    const allow = String(process.env.ADMIN_ALLOWED_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (allow.length && !allow.includes(ip) && ip !== '127.0.0.1' && ip !== '::1') { this.log('securite', `Accès admin refusé à ${ip} (IP non autorisée)`); return json(403, { error: 'Accès refusé depuis cette adresse.' }); }
    if (action === 'login') return json(...this.login(body, ip));
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const user = token ? this.ctx.accounts.resume(token) : null;
    if (!user) return json(401, { error: 'Non connecté' });
    const lvl = LEVEL[user.role || 'player'] || 0;
    const ctx = { body, q: url.searchParams, user, lvl, ip, res, token };
    try {
      if (action === 'me') return json(200, { name: user.name, role: user.role || 'player', level: lvl, setupPending: !!this.setupCode });
      if (action === 'claim') return json(200, this.claim(ctx));
      const def = ACTIONS[action];
      if (!def || (req.method === 'POST') !== !!def.post) return json(404, { error: 'Action inconnue' });
      if (lvl < def.level) return json(403, { error: 'Droits insuffisants pour cette action' });
      const out = await def.fn.call(this, ctx);
      if (out === RAW) return;
      if (def.post && def.audit !== false) this.audit(user.name, def.label || action, out && out._detail ? out._detail : '');
      if (out && out._detail) delete out._detail;
      json(200, out ?? { ok: true });
    } catch (e) {
      json(e.status || 400, { error: e.message || 'Erreur' });
    }
  }

  login(body, ip) {
    const now = Date.now();
    const t = this.loginTries.get(ip) || { n: 0, reset: now + 600000 };
    if (now > t.reset) { t.n = 0; t.reset = now + 600000; }
    if (++t.n > 10) { this.loginTries.set(ip, t); return [429, { error: 'Trop de tentatives, réessaie dans quelques minutes.' }]; }
    this.loginTries.set(ip, t);
    const r = this.ctx.accounts.login(body.name, body.password);
    if (r.error) { this.log('securite', `Échec de connexion admin (${str(body.name, 16)}) depuis ${ip}`); return [401, { error: r.error }]; }
    const lvl = LEVEL[r.user.role || 'player'] || 0;
    if (lvl < 1 && !this.setupCode) { this.ctx.accounts.logout(r.token); return [403, { error: 'Ce compte n\'a pas accès à l\'administration.' }]; }
    this.log('admin', `Connexion au panneau : ${r.user.name}`);
    return [200, { token: r.token, name: r.user.name, role: r.user.role || 'player', level: lvl, setupPending: !!this.setupCode }];
  }

  claim({ body, user }) {
    if (!this.setupCode) fail('Un propriétaire existe déjà.', 409);
    const a = Buffer.from(String(body.code || '').trim()), b = Buffer.from(this.setupCode);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) fail('Code incorrect.', 403);
    user.role = 'owner';
    this.ctx.accounts.save();
    this.setupCode = null;
    try { fs.unlinkSync(this.codeFile); } catch { /* déjà supprimé */ }
    this.audit(user.name, 'Devient propriétaire du serveur');
    return { ok: true, role: 'owner', level: 3 };
  }

  // ---------- utilitaires internes ----------
  findUser(name) { const u = this.ctx.accounts.get(name); if (!u) fail('Compte introuvable', 404); return u; }
  guard(lvl, target, self) {
    const tl = LEVEL[target.role || 'player'] || 0;
    if (self && target.name === self.name) return;
    if (tl >= lvl && lvl < 3) fail('Tu ne peux pas agir sur un membre du staff de rang égal ou supérieur.', 403);
    if (target.role === 'owner' && lvl >= 3 && target.name !== self?.name) return;
  }
  clientsOf(key) { return [...this.ctx.clients.values()].filter(c => c.account === key); }
  findClient(id) { const c = this.ctx.clients.get(id); if (!c || !c.name) fail('Joueur introuvable (déconnecté ?)', 404); return c; }
  revokeSessions(key) {
    const s = this.ctx.accounts.data.sessions;
    let n = 0; for (const [t, v] of Object.entries(s)) if (v.user === key) { delete s[t]; n++; }
    this.ctx.accounts.save(); return n;
  }
  notifyProfile(u) {
    const key = this.ctx.accounts.key(u.name);
    for (const c of this.clientsOf(key)) this.ctx.send(c.id, { type: 'profile', profile: this.ctx.accounts.publicProfile(u) });
  }
  matchPlayer(c) {
    const r = c.roomId && this.ctx.rooms.get(c.roomId);
    const p = r?.match?.players.get(c.id);
    return p ? { kills: p.kills, deaths: p.deaths, assists: p.assists, alive: p.alive, hp: Math.ceil(p.hp), agent: p.agent, team: p.team } : null;
  }
  roomInfo(r, full = false) {
    const humans = [...r.members.values()].filter(m => !m.isBot);
    const m = r.match;
    const info = {
      id: r.id, name: r.name, mode: r.mode, mapId: r.mapId, map: MAP_INFO[r.mapId]?.name || r.mapId, state: r.state, quick: !!r.quick, official: !!r.official,
      host: this.ctx.clients.get(r.hostId)?.name || '—', humans: humans.length, bots: r.members.size - humans.length, max: r.maxPlayers, private: !!r.private, code: r.code || null,
      target: r.target, difficulty: r.difficulty,
      match: m ? { phase: m.phase, round: m.round, score: m.score, timer: Math.max(0, Math.round(m.phaseEnd - m.time)), paused: !!m.paused, half: m.half } : null,
    };
    if (full) info.members = [...r.members.values()].map(x => {
      const p = m?.players.get(x.id);
      return { id: x.id, name: x.name, team: x.team, agent: x.agent, isBot: x.isBot, account: x.account || null,
        stats: p ? { kills: p.kills, deaths: p.deaths, assists: p.assists, alive: p.alive, hp: Math.ceil(p.hp), money: p.money } : null };
    });
    return info;
  }
  room(id) { const r = this.ctx.rooms.get(id); if (!r) fail('Salon introuvable', 404); return r; }
  accountRow(u) {
    const key = this.ctx.accounts.key(u.name);
    ensureUser(u);
    return { name: u.name, role: u.role || 'player', created: u.created, eclats: u.eclats, matches: u.stats.matches, wins: u.stats.wins, kills: u.stats.kills, deaths: u.stats.deaths,
      banned: !!this.activeBan('account', key), online: this.clientsOf(key).length > 0, skins: u.owned.length,
      level: levelOf(u.xp), xp: u.xp, elo: u.elo, lastSeen: u.lastSeen || u.created, warnings: u.warnings || 0 };
  }
}

// ---------- table des actions : niveau requis, méthode, libellé d'audit ----------
const ACTIONS = {
  // lecture
  overview: { level: 1, fn() {
    const { accounts, clients, rooms } = this.ctx;
    const users = Object.values(accounts.data.users);
    const online = this.onlineClients();
    const mem = process.memoryUsage();
    const t = this.ticks.length ? this.ticks : [0];
    const st = this.state.stats;
    const top = (o, map = k => k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ key: k, label: map(k), value: v }));
    return {
      online: online.length, guests: online.filter(c => !c.account).length, inGame: this.inGameCount(), connections: clients.size,
      rooms: rooms.size, matches: [...rooms.values()].filter(r => r.match).length,
      accounts: users.length, newToday: users.filter(u => new Date(u.created).toISOString().slice(0, 10) === today()).length,
      staff: users.filter(u => (LEVEL[u.role] || 0) > 0).length,
      peak: st.peak, peakAt: st.peakAt, uptime: Math.round(process.uptime()),
      memory: { rss: mem.rss, heap: mem.heapUsed, total: os.totalmem(), free: os.freemem() },
      cpu: this.rates.cpu, load: os.loadavg().map(x => Math.round(x * 100) / 100), cores: os.cpus().length,
      tick: { avg: Math.round(t.reduce((a, b) => a + b, 0) / t.length * 100) / 100, max: Math.round(Math.max(...t) * 100) / 100 },
      net: this.rates,
      version: this.ctx.version, node: process.version, platform: `${os.type()} ${os.release()} (${os.arch()})`, hostname: os.hostname(),
      totals: { matches: st.matches, kills: st.kills, headshots: st.headshots, matchesToday: st.matchesByDay[today()] || 0 },
      topModes: top(st.modes, k => ({ assault: 'Assaut', duel: 'Duel', ffa: 'Mêlée' }[k] || k)),
      topMaps: top(st.maps, k => MAP_INFO[k]?.name || k),
      topAgents: top(st.agents, k => AGENTS[k]?.name || k),
      topWeapons: top(st.weapons, k => WEAPONS[k]?.name || ({ fire: 'Feu', shock: 'Électricité', core: 'Noyau', admin: 'Admin' }[k] || k)),
      regsByDay: Object.entries(st.regsByDay).slice(-14), matchesByDay: Object.entries(st.matchesByDay).slice(-14),
      maintenance: this.state.config.maintenance, openReports: this.state.reports.filter(r => !r.resolved).length,
      activeBans: this.state.bans.length, activeMutes: this.state.mutes.length,
      suspects: Object.values(this.state.suspects).filter(x => Date.now() - x.last < 7 * 86400000).length,
      season: this.state.season.name, event: this.eventInfo(),
    };
  } },
  history: { level: 1, fn() { return { points: this.history }; } },
  players: { level: 1, fn({ lvl }) {
    return this.onlineClients().map(c => {
      const r = c.roomId && this.ctx.rooms.get(c.roomId);
      const u = c.account && this.ctx.accounts.get(c.account);
      return { id: c.id, name: c.name, account: c.account, guest: !c.account, role: u?.role || 'player', ip: lvl >= 2 ? c.ip : maskIp(c.ip),
        since: c.since, room: r ? { id: r.id, name: r.name, state: r.state } : null, match: this.matchPlayer(c), muted: !!this.activeMute(c), eclats: u?.eclats ?? null };
    });
  } },
  accounts: { level: 1, fn({ q }) {
    const search = (q.get('q') || '').toLowerCase(), sort = q.get('sort') || 'created', dir = q.get('dir') === 'asc' ? 1 : -1;
    const filter = q.get('filter') || 'all';
    let rows = Object.values(this.users()).map(u => this.accountRow(u));
    if (search) rows = rows.filter(r => r.name.toLowerCase().includes(search));
    if (filter === 'staff') rows = rows.filter(r => r.role !== 'player');
    if (filter === 'banned') rows = rows.filter(r => r.banned);
    if (filter === 'online') rows = rows.filter(r => r.online);
    rows.sort((a, b) => (a[sort] > b[sort] ? 1 : a[sort] < b[sort] ? -1 : 0) * dir);
    const per = 25, page = Math.max(1, parseInt(q.get('page') || '1', 10));
    return { total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / per)), rows: rows.slice((page - 1) * per, page * per) };
  } },
  account: { level: 1, fn({ q, lvl }) {
    const u = this.findUser(q.get('name'));
    const key = this.ctx.accounts.key(u.name);
    const A = this.ctx.accounts;
    const li = levelInfo(u.xp);
    // comptes liés : autres comptes vus sur les mêmes adresses IP
    const myIps = new Set((u.ips || []).map(x => x.ip));
    const linked = lvl >= 2 ? Object.values(this.users()).filter(o => o !== u && (o.ips || []).some(x => myIps.has(x.ip))).map(o => ({ name: o.name, banned: !!this.activeBan('account', A.key(o.name)) })).slice(0, 20) : [];
    const sus = this.state.suspects[key];
    return { ...this.accountRow(u), stats: u.stats, owned: u.owned, equipped: u.equipped, agent: u.agent,
      sessions: Object.values(A.data.sessions).filter(s => s.user === key).length,
      bans: this.state.bans.filter(b => b.type === 'account' && b.value === key),
      ips: this.clientsOf(key).map(c => c.ip),
      ipHistory: lvl >= 2 ? u.ips || [] : [], linked,
      lvlCur: li.cur, lvlNeed: li.need, eloPeak: u.eloPeak, rank: rankFor(u).name, seasonDuels: u.seasonDuels,
      topAgent: Object.entries(u.agentStats || {}).sort((a, b) => b[1].matches - a[1].matches)[0]?.[0] || u.agent, title: u.title ? TITLES[u.title] : null, titles: titlesOf(u),
      achievements: u.achievements.map(id => ACHIEVEMENTS.find(a => a.id === id)?.label || id), history: u.history,
      friends: u.friends.map(k => A.get(k)?.name).filter(Boolean), notes: u.notes || [], seasons: u.seasons || [],
      agentStats: u.agentStats, mapStats: u.mapStats, daily: u.daily, suspect: sus ? { count: sus.count, alerts: sus.alerts.slice(0, 8) } : null,
      reports: this.state.reports.filter(r => r.targetAccount === key || r.target?.toLowerCase() === key).length };
  } },
  rooms: { level: 1, fn() { return [...this.ctx.rooms.values()].map(r => this.roomInfo(r)); } },
  room: { level: 1, fn({ q }) { return this.roomInfo(this.room(q.get('id')), true); } },
  bans: { level: 1, fn() { return this.state.bans; } },
  mutes: { level: 1, fn() { return this.state.mutes; } },
  reports: { level: 1, fn() { return this.state.reports; } },
  filter: { level: 1, fn() { return { words: this.state.filter }; } },
  chat: { level: 1, fn({ q }) {
    const since = parseInt(q.get('since') || '0', 10), s = (q.get('q') || '').toLowerCase(), room = q.get('room');
    let rows = this.chat.filter(m => m.id > since);
    if (s) rows = rows.filter(m => m.text.toLowerCase().includes(s) || m.from.toLowerCase().includes(s));
    if (room) rows = rows.filter(m => m.room === room);
    return rows.slice(-500);
  } },
  logs: { level: 1, fn({ q }) {
    const since = parseInt(q.get('since') || '0', 10), type = q.get('type'), s = (q.get('q') || '').toLowerCase();
    let rows = this.logs.filter(l => l.id > since);
    if (type) rows = rows.filter(l => l.type === type);
    if (s) rows = rows.filter(l => l.text.toLowerCase().includes(s));
    return rows.slice(-500);
  } },
  audit: { level: 2, fn() { return this.state.audit.slice(-300).reverse(); } },
  config: { level: 2, fn() {
    return { config: this.state.config, weaponDefaults: WEAPON_DEFAULTS, weapons: Object.fromEntries(Object.entries(WEAPONS).map(([id, w]) => [id, { name: w.name, damage: w.damage, headMul: w.headMul, type: w.type }])) };
  } },
  news: { level: 2, fn() { try { return JSON.parse(fs.readFileSync(this.newsPath(), 'utf8')); } catch { return []; } } },

  // modération
  kick: { level: 1, post: true, label: 'Expulsion', fn({ body, lvl, user }) {
    const c = this.findClient(body.id);
    if (c.account) this.guard(lvl, this.findUser(c.account), null);
    const reason = str(body.reason, 200);
    this.ctx.kick(c, `Tu as été expulsé par l'équipe de modération.${reason ? ' Raison : ' + reason : ''}`);
    return { _detail: `${c.name}${reason ? ' — ' + reason : ''}` };
  } },
  ban: { level: 1, post: true, label: 'Bannissement', fn({ body, lvl, user }) {
    let minutes = int(body.minutes ?? 0, 0, 5256000);
    if (lvl < 2 && (minutes === 0 || minutes > 10080)) fail('Un modérateur peut bannir 7 jours au maximum.', 403);
    const reason = str(body.reason, 200) || 'Non précisée';
    const until = minutes ? Date.now() + minutes * 60000 : 0;
    const targets = [];
    let label = '';
    if (body.id) { // joueur connecté
      const c = this.findClient(body.id);
      label = c.name;
      if (c.account) { this.guard(lvl, this.findUser(c.account), null); targets.push(['account', c.account]); }
      if (!c.account || body.withIp) targets.push(['ip', c.ip]);
    } else if (body.name) {
      const u = this.findUser(body.name); this.guard(lvl, u, null);
      label = u.name; targets.push(['account', this.ctx.accounts.key(u.name)]);
    } else if (body.ip) {
      if (!/^[0-9a-fA-F:.]{3,45}$/.test(String(body.ip))) fail('Adresse IP invalide');
      label = String(body.ip); targets.push(['ip', String(body.ip)]);
    } else fail('Cible manquante');
    for (const [type, value] of targets) {
      this.state.bans = this.state.bans.filter(b => !(b.type === type && b.value === value));
      const b = { id: crypto.randomUUID(), type, value, label, reason, by: user.name, at: Date.now(), until };
      this.state.bans.push(b);
      for (const c of this.ctx.clients.values()) if ((type === 'account' && c.account === value) || (type === 'ip' && c.ip === value && this.levelOf(c) < 3)) this.ctx.kick(c, this.banText(b));
    }
    this.save();
    this.log('moderation', `${label} banni par ${user.name} (${minutes ? minutes + ' min' : 'définitif'})`);
    return { _detail: `${label} — ${minutes ? minutes + ' min' : 'définitif'} — ${reason}` };
  } },
  unban: { level: 1, post: true, label: 'Débannissement', fn({ body }) {
    const b = this.state.bans.find(x => x.id === body.id); if (!b) fail('Ban introuvable', 404);
    this.state.bans = this.state.bans.filter(x => x !== b); this.save();
    return { _detail: b.label };
  } },
  mute: { level: 1, post: true, label: 'Réduction au silence', fn({ body, user, lvl }) {
    let key, label;
    if (body.id) { const c = this.findClient(body.id); key = c.account || 'guest:' + c.name; label = c.name; if (c.account) this.guard(lvl, this.findUser(c.account), null); }
    else if (body.name) { const u = this.findUser(body.name); this.guard(lvl, u, null); key = this.ctx.accounts.key(u.name); label = u.name; }
    else fail('Cible manquante');
    const minutes = int(body.minutes ?? 30, 0, 525600);
    const reason = str(body.reason, 200) || 'Non précisée';
    this.state.mutes = this.state.mutes.filter(m => m.key !== key);
    this.state.mutes.push({ id: crypto.randomUUID(), key, label, reason, by: user.name, at: Date.now(), until: minutes ? Date.now() + minutes * 60000 : 0 });
    this.save();
    for (const c of this.ctx.clients.values()) if ((c.account || 'guest:' + c.name) === key) this.ctx.send(c.id, { type: 'system', kind: 'notice', text: `Tu ne peux plus écrire dans le chat${minutes ? ` pendant ${minutes} min` : ''}. Raison : ${reason}` });
    return { _detail: `${label} — ${minutes ? minutes + ' min' : 'illimité'}` };
  } },
  unmute: { level: 1, post: true, label: 'Fin du silence', fn({ body }) {
    const m = this.state.mutes.find(x => x.id === body.id); if (!m) fail('Introuvable', 404);
    this.state.mutes = this.state.mutes.filter(x => x !== m); this.save();
    return { _detail: m.label };
  } },
  message: { level: 1, post: true, label: 'Message privé', fn({ body, user }) {
    const c = this.findClient(body.id); const text = str(body.text, 300); if (!text) fail('Message vide');
    this.ctx.send(c.id, { type: 'system', kind: 'pm', from: user.name, text });
    return { _detail: `à ${c.name} : ${text}` };
  } },
  slay: { level: 1, post: true, label: 'Élimination forcée', fn({ body }) {
    const c = this.findClient(body.id);
    const r = c.roomId && this.ctx.rooms.get(c.roomId);
    const p = r?.match?.players.get(c.id);
    if (!p || !p.alive || r.match.phase === 'over') fail('Ce joueur n\'est pas vivant dans une partie.');
    r.match.kill(p, null, 'admin', false);
    return { _detail: c.name };
  } },
  'report/resolve': { level: 1, post: true, label: 'Signalement traité', fn({ body }) {
    const r = this.state.reports.find(x => x.id === body.id); if (!r) fail('Introuvable', 404);
    r.resolved = body.resolved !== false; this.save();
    return { _detail: `${r.from} → ${r.target}` };
  } },
  'report/delete': { level: 2, post: true, label: 'Signalement supprimé', fn({ body }) {
    this.state.reports = this.state.reports.filter(x => x.id !== body.id); this.save();
  } },
  'filter/save': { level: 2, post: true, label: 'Filtre de mots modifié', fn({ body }) {
    const words = (Array.isArray(body.words) ? body.words : []).map(w => str(w, 30).toLowerCase()).filter(Boolean);
    this.state.filter = [...new Set(words)].slice(0, 300); this.save();
    return { words: this.state.filter, _detail: `${this.state.filter.length} mot(s)` };
  } },
  'chat/clear': { level: 2, post: true, label: 'Journal du chat vidé', fn() { this.chat = []; } },

  // comptes
  'account/eclats': { level: 2, post: true, label: 'Éclats modifiés', fn({ body }) {
    const u = this.findUser(body.name);
    const v = int(body.value, -10000000, 10000000);
    u.eclats = Math.max(0, Math.min(10000000, body.mode === 'add' ? u.eclats + v : v));
    this.ctx.accounts.save(); this.notifyProfile(u);
    return { eclats: u.eclats, _detail: `${u.name} → ${u.eclats}` };
  } },
  'account/skins': { level: 2, post: true, label: 'Skins offerts', fn({ body }) {
    const u = this.findUser(body.name);
    if (body.skin === 'all') u.owned = SKINS.map(s => s.id);
    else if (body.skin === 'none') { u.owned = ['default']; for (const w of SKINNABLE) u.equipped[w] = 'default'; }
    else { if (!SKINS.some(s => s.id === body.skin)) fail('Skin inconnu'); if (!u.owned.includes(body.skin)) u.owned.push(body.skin); }
    this.ctx.accounts.save(); this.notifyProfile(u);
    return { owned: u.owned, _detail: `${u.name} — ${body.skin}` };
  } },
  'account/resetStats': { level: 2, post: true, label: 'Statistiques remises à zéro', fn({ body, lvl, user }) {
    const u = this.findUser(body.name); this.guard(lvl, u, user);
    u.stats = { matches: 0, wins: 0, kills: 0, deaths: 0, duels: 0, duelWins: 0 };
    this.ctx.accounts.save(); this.notifyProfile(u);
    return { _detail: u.name };
  } },
  'account/resetPassword': { level: 2, post: true, label: 'Mot de passe réinitialisé', fn({ body, lvl, user }) {
    const u = this.findUser(body.name); this.guard(lvl, u, user);
    const pass = crypto.randomBytes(9).toString('base64url').slice(0, 10);
    u.salt = crypto.randomBytes(16).toString('hex');
    u.hash = this.ctx.accounts.hash(pass, u.salt);
    const key = this.ctx.accounts.key(u.name);
    this.revokeSessions(key);
    for (const c of this.clientsOf(key)) this.ctx.kick(c, 'Ton mot de passe a été réinitialisé par un administrateur.');
    return { password: pass, _detail: u.name };
  } },
  'account/rename': { level: 2, post: true, label: 'Compte renommé', fn({ body, lvl, user }) {
    const u = this.findUser(body.name); this.guard(lvl, u, user);
    const nn = String(body.newName || '').trim();
    if (!NAME_RE.test(nn)) fail('Pseudo invalide : 3 à 16 caractères (lettres, chiffres, _ ou -).');
    const oldKey = this.ctx.accounts.key(u.name), newKey = this.ctx.accounts.key(nn);
    if (newKey !== oldKey && this.ctx.accounts.exists(nn)) fail('Ce pseudo est déjà pris.');
    const users = this.users();
    delete users[oldKey]; users[newKey] = u;
    const old = u.name; u.name = nn;
    for (const s of Object.values(this.ctx.accounts.data.sessions)) if (s.user === oldKey) s.user = newKey;
    for (const b of this.state.bans) if (b.type === 'account' && b.value === oldKey) { b.value = newKey; b.label = nn; }
    for (const m of this.state.mutes) if (m.key === oldKey) { m.key = newKey; m.label = nn; }
    this.ctx.accounts.save(); this.save();
    for (const c of this.clientsOf(oldKey)) this.ctx.kick(c, `Ton pseudo a été changé en « ${nn} ». Reconnecte-toi.`);
    return { _detail: `${old} → ${nn}` };
  } },
  'account/delete': { level: 2, post: true, label: 'Compte supprimé', fn({ body, lvl, user }) {
    const u = this.findUser(body.name);
    if (u.name === user.name) fail('Tu ne peux pas supprimer ton propre compte ici.');
    this.guard(lvl, u, null);
    const key = this.ctx.accounts.key(u.name);
    for (const c of this.clientsOf(key)) this.ctx.kick(c, 'Ton compte a été supprimé.');
    this.revokeSessions(key);
    delete this.users()[key];
    this.ctx.accounts.save();
    return { _detail: u.name };
  } },
  'account/role': { level: 2, post: true, label: 'Rôle modifié', fn({ body, lvl, user }) {
    const u = this.findUser(body.name);
    const role = String(body.role);
    if (!(role in LEVEL)) fail('Rôle inconnu');
    if (u.name === user.name) fail('Tu ne peux pas changer ton propre rôle.');
    if (lvl < 3 && (LEVEL[role] >= lvl || (LEVEL[u.role || 'player'] || 0) >= lvl)) fail('Seul le propriétaire peut nommer ou retirer un administrateur.', 403);
    u.role = role === 'player' ? undefined : role;
    this.ctx.accounts.save();
    return { _detail: `${u.name} → ${role}` };
  } },
  'account/logout': { level: 2, post: true, label: 'Sessions révoquées', fn({ body, lvl, user }) {
    const u = this.findUser(body.name); this.guard(lvl, u, user);
    const key = this.ctx.accounts.key(u.name);
    const n = this.revokeSessions(key);
    for (const c of this.clientsOf(key)) this.ctx.kick(c, 'Tu as été déconnecté par un administrateur.');
    return { sessions: n, _detail: `${u.name} (${n})` };
  } },

  // salons et parties
  'room/close': { level: 1, post: true, label: 'Salon fermé', fn({ body }) {
    const r = this.room(body.id); this.ctx.closeRoom(r, 'Le salon a été fermé par l\'équipe de modération.');
    return { _detail: r.name };
  } },
  'room/end': { level: 1, post: true, label: 'Partie terminée de force', fn({ body }) {
    const r = this.room(body.id); if (!r.match || r.match.phase === 'over') fail('Aucune partie en cours dans ce salon.');
    const w = body.winner || null;
    if (w && !['alpha', 'beta'].includes(w) && !r.match.players.has(w)) fail('Vainqueur invalide');
    r.match.matchOver(w);
    return { _detail: `${r.name} — vainqueur : ${w || 'aucun'}` };
  } },
  'room/start': { level: 1, post: true, label: 'Partie lancée', fn({ body }) {
    const r = this.room(body.id); if (r.state !== 'lobby') fail('La partie a déjà commencé.');
    if (!r.members.size) fail('Le salon est vide.');
    this.ctx.startMatch(r); return { _detail: r.name };
  } },
  'room/skip': { level: 1, post: true, label: 'Manche annulée', fn({ body }) {
    const r = this.room(body.id); const m = r.match;
    if (!m || m.mode === 'ffa' || !['buy', 'live', 'planted'].includes(m.phase)) fail('Aucune manche à annuler.');
    m.endRound(null, 'admin'); return { _detail: r.name };
  } },
  'room/pause': { level: 1, post: true, label: 'Pause de partie', fn({ body }) {
    const r = this.room(body.id); if (!r.match) fail('Aucune partie en cours.');
    r.match.paused = !!body.paused;
    r.match.broadcast({ type: 'notice', text: r.match.paused ? 'PARTIE EN PAUSE (ADMIN)' : 'REPRISE DE LA PARTIE' });
    return { paused: r.match.paused, _detail: `${r.name} — ${r.match.paused ? 'pause' : 'reprise'}` };
  } },
  'room/message': { level: 1, post: true, label: 'Message au salon', fn({ body, user }) {
    const r = this.room(body.id); const text = str(body.text, 300); if (!text) fail('Message vide');
    for (const m of r.members.values()) if (!m.isBot) this.ctx.send(m.id, { type: 'chat', from: `ADMIN ${user.name}`, text });
    return { _detail: `${r.name} : ${text}` };
  } },
  'room/bot': { level: 1, post: true, label: 'Bots du salon', fn({ body }) {
    const r = this.room(body.id);
    if (body.action === 'add') {
      const before = r.members.size;
      this.ctx.addBot(r, ['alpha', 'beta'].includes(body.team) ? body.team : this.ctx.pickTeam(r));
      if (r.members.size === before) fail('Salon complet (ou équipe pleine).');
    } else {
      const bots = [...r.members.values()].filter(m => m.isBot);
      const bot = bots.find(b => b.id === body.botId) || bots[bots.length - 1];
      if (!bot) fail('Aucun bot dans ce salon.');
      r.members.delete(bot.id); if (r.match) r.match.removePlayer(bot.id);
    }
    this.ctx.pushRoom(r);
    return { _detail: `${r.name} — ${body.action === 'add' ? 'ajout' : 'retrait'}` };
  } },
  'room/settings': { level: 1, post: true, label: 'Réglages de salon', fn({ body }) {
    const r = this.room(body.id); if (r.state !== 'lobby') fail('Modifiable uniquement avant le lancement de la partie.');
    const cfg = this.ctx.MODE_CFG;
    if (body.name) r.name = str(body.name, 28) || r.name;
    if (body.mode && body.mode !== r.mode && cfg[body.mode]) {
      const humans = [...r.members.values()].filter(m => !m.isBot);
      if (humans.length > cfg[body.mode].max) fail('Trop de joueurs pour ce mode.');
      r.mode = body.mode; r.maxPlayers = cfg[r.mode].max; r.target = cfg[r.mode].target;
      for (const m of [...r.members.values()]) if (m.isBot) r.members.delete(m.id);
      let k = 0; for (const m of r.members.values()) m.team = r.mode === 'ffa' ? 'ffa' : (k++ % 2 ? 'beta' : 'alpha');
      if (!mapsForMode(r.mode).includes(r.mapId)) r.mapId = mapsForMode(r.mode)[0];
    }
    if (body.mapId && mapsForMode(r.mode).includes(body.mapId)) r.mapId = body.mapId;
    if (body.target) r.target = int(body.target, cfg[r.mode].tmin, cfg[r.mode].tmax);
    if (this.ctx.DIFFICULTIES.includes(body.difficulty)) r.difficulty = body.difficulty;
    this.ctx.pushRoom(r);
    return { _detail: r.name };
  } },
  'room/create': { level: 2, post: true, label: 'Salon officiel créé', fn({ body }) {
    const r = this.ctx.createRoom({ name: str(body.name, 28), mode: body.mode, mapId: body.mapId, difficulty: body.difficulty, bots: int(body.bots ?? 0, 0, 9) });
    return { id: r.id, _detail: r.name };
  } },

  // annonces et configuration
  broadcast: { level: 2, post: true, label: 'Annonce globale', fn({ body, user }) {
    const text = str(body.text, 300); if (!text) fail('Message vide');
    for (const c of this.onlineClients()) this.ctx.send(c.id, { type: 'system', kind: 'broadcast', from: user.name, text });
    return { sent: this.onlineClients().length, _detail: text };
  } },
  'config/save': { level: 2, post: true, label: 'Configuration modifiée', fn({ body, user }) {
    const cfg = this.state.config, patch = body.patch || {};
    const changed = [];
    for (const [k, rule] of Object.entries(CONFIG_RULES)) {
      if (!(k in patch)) continue;
      let v = patch[k];
      if (rule === 'bool') v = !!v;
      else if (rule[0] === 'str') v = str(v, rule[1]);
      else { v = Number(v); if (!Number.isFinite(v)) fail(`Valeur invalide pour ${k}`); v = Math.max(rule[0], Math.min(rule[1], DECIMAL.has(k) ? Math.round(v * 10) / 10 : Math.round(v))); }
      if (cfg[k] !== v) { cfg[k] = v; changed.push(k); }
    }
    if (patch.weapons && typeof patch.weapons === 'object') {
      for (const [id, o] of Object.entries(patch.weapons)) {
        if (!WEAPON_DEFAULTS[id] || typeof o !== 'object') continue;
        const d = o.reset ? null : { damage: int(o.damage ?? WEAPONS[id].damage, 1, 300), headMul: Math.max(1, Math.min(6, Math.round(Number(o.headMul ?? WEAPONS[id].headMul) * 10) / 10)) };
        if (d) cfg.weapons[id] = d; else delete cfg.weapons[id];
        changed.push('arme:' + id);
      }
    }
    this.applyConfig(); this.save();
    if (changed.includes('maintenance') && cfg.maintenance) {
      for (const c of this.onlineClients()) if (this.levelOf(c) < 1) this.ctx.kick(c, cfg.maintenanceMsg);
    }
    if (changed.includes('motd')) for (const c of this.onlineClients()) this.ctx.send(c.id, { type: 'system', kind: 'motd', text: cfg.motd });
    if (changed.some(k => k.startsWith('event'))) for (const c of this.onlineClients()) this.ctx.send(c.id, { type: 'event', event: this.eventInfo() });
    return { config: cfg, _detail: changed.join(', ') || 'aucun changement' };
  } },
  'news/save': { level: 2, post: true, label: 'Notes de mise à jour modifiées', fn({ body }) {
    if (!Array.isArray(body.news)) fail('Format invalide');
    const news = body.news.slice(0, 50).map(n => ({
      version: str(n.version, 12) || '?', date: /^\d{4}-\d{2}-\d{2}$/.test(n.date) ? n.date : today(), title: str(n.title, 120) || 'Sans titre',
      items: (Array.isArray(n.items) ? n.items : []).map(i => str(i, 300)).filter(Boolean).slice(0, 25),
    }));
    fs.writeFileSync(path.join(this.ctx.dataDir, 'news.json'), JSON.stringify(news, null, 2));
    return { count: news.length, _detail: `${news.length} entrée(s)` };
  } },
  'stats/reset': { level: 2, post: true, label: 'Statistiques globales remises à zéro', fn() { this.state.stats = DEFAULT_STATS(); this.save(); } },

  // exports et système
  'export/accounts': { level: 2, fn({ res }) {
    const rows = Object.values(this.users()).map(u => this.accountRow(u));
    const head = ['pseudo', 'role', 'cree_le', 'eclats', 'parties', 'victoires', 'eliminations', 'morts', 'skins', 'banni'];
    const csv = [head.join(';'), ...rows.map(r => [r.name, r.role, new Date(r.created).toISOString(), r.eclats, r.matches, r.wins, r.kills, r.deaths, r.skins, r.banned ? 'oui' : 'non'].map(csvCell).join(';'))].join('\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="eclipse-comptes.csv"', 'Cache-Control': 'no-store' });
    res.end('﻿' + csv); return RAW;
  } },
  'export/logs': { level: 2, fn({ res }) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="eclipse-journaux.json"', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ exported: new Date().toISOString(), logs: this.logs, chat: this.chat, audit: this.state.audit }, null, 2)); return RAW;
  } },
  backup: { level: 3, fn({ res, user }) {
    const users = this.ctx.accounts.data.users;
    this.audit(user.name, 'Sauvegarde téléchargée');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="eclipse-sauvegarde-${today()}.json"`, 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ exported: new Date().toISOString(), version: this.ctx.version, users, admin: this.state }, null, 2)); return RAW;
  } },
  restart: { level: 3, post: true, label: 'Redémarrage du serveur', fn() {
    setTimeout(() => {
      this.flush(); this.ctx.accounts.flush();
      for (const c of this.ctx.clients.values()) this.ctx.send(c.id, { type: 'system', kind: 'notice', text: 'Le serveur redémarre, reconnexion automatique dans quelques secondes…' });
      setTimeout(() => process.exit(1), 400); // systemd / Docker relancent le service
    }, 300);
    return { ok: true };
  } },
  // ---------- métriques ----------
  metrics: { level: 1, fn() {
    const online = this.onlineClients();
    const pings = online.map(c => ({ name: c.name, ping: c.ping || 0, room: this.ctx.rooms.get(c.roomId)?.name || '' })).sort((a, b) => b.ping - a.ping);
    const vals = pings.map(p => p.ping).filter(Boolean);
    const t = this.ticks.length ? this.ticks : [0];
    return {
      points: this.history, errors: this.errors.slice(-60).reverse(), pings,
      now: { online: online.length, inGame: this.inGameCount(), avgPing: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0, maxPing: vals.length ? Math.max(...vals) : 0,
        tick: Math.round(t.reduce((a, b) => a + b, 0) / t.length * 100) / 100, tickMax: Math.round(Math.max(...t) * 100) / 100, cpu: this.rates.cpu, mem: process.memoryUsage().rss, errorsLastHour: this.errors.filter(e => Date.now() - e.t < 3600000).length },
    };
  } },

  // ---------- progression : classements, saisons, quêtes ----------
  leaderboard: { level: 1, fn({ q }) {
    const kind = q.get('kind') || 'level';
    return { kind, season: this.state.season, rows: this.ctx.social.leaderboardRows(kind).slice(0, 100).map(({ key, ...r }) => r) };
  } },
  seasons: { level: 1, fn() {
    const users = Object.values(this.users());
    const dist = RANKS.map(r => ({ key: r.id, label: r.name, value: users.filter(u => u.seasonDuels > 0 && rankOf(u.elo).id === r.id).length }));
    return { season: this.state.season, history: this.state.seasonsHistory, distribution: dist, ranks: RANKS };
  } },
  'season/new': { level: 2, post: true, label: 'Nouvelle saison', fn({ body }) {
    const A = this.ctx.accounts, old = this.state.season;
    const name = str(body.name, 40) || `Saison ${old.n + 1}`;
    let rewarded = 0, total = 0;
    const top = [];
    for (const u of Object.values(this.users())) {
      ensureUser(u);
      if (u.seasonDuels > 0) {
        const rk = rankOf(u.elo);
        u.seasons.unshift({ n: old.n, name: old.name, elo: u.elo, peak: u.eloPeak, rank: rk.name, reward: rk.reward });
        if (u.seasons.length > 20) u.seasons.length = 20;
        if (body.rewards !== false && rk.reward) { u.eclats += rk.reward; rewarded++; total += rk.reward; }
        top.push({ name: u.name, elo: u.elo });
      }
      // remise à zéro partielle : l'Elo se rapproche de 1 000 de moitié
      u.elo = Math.round(ELO_START + (u.elo - ELO_START) / 2); u.eloPeak = u.elo; u.seasonDuels = 0;
    }
    top.sort((a, b) => b.elo - a.elo);
    this.state.seasonsHistory.unshift({ ...old, ended: Date.now(), players: top.length, top: top.slice(0, 10), rewarded: total });
    this.state.season = { n: old.n + 1, name, started: Date.now() };
    A.save(); this.save(); this.ctx.social.lbCache.clear();
    for (const c of this.onlineClients()) {
      this.ctx.send(c.id, { type: 'system', kind: 'broadcast', from: 'ECLIPSE', text: `${old.name} terminée ! Bienvenue dans la ${name}. Les récompenses de rang ont été distribuées.` });
      const u = c.account && A.get(c.account); if (u) this.notifyProfile(u);
    }
    return { season: this.state.season, rewarded, _detail: `${old.name} → ${name} (${rewarded} joueur(s) récompensé(s), ${total} Éclats)` };
  } },
  quests: { level: 2, fn() {
    const o = this.state.config.questOverrides || {};
    return { quests: Object.entries(QUESTS).map(([id, q]) => ({ id, ...q, base: QUEST_REWARD[q.kind], off: !!o[id]?.off, eclats: o[id]?.eclats ?? null, xp: o[id]?.xp ?? null })) };
  } },
  'quests/save': { level: 2, post: true, label: 'Catalogue de quêtes modifié', fn({ body }) {
    const out = {};
    for (const [id, o] of Object.entries(body.quests || {})) {
      if (!QUESTS[id] || !o || typeof o !== 'object') continue;
      const e = {};
      if (o.off) e.off = true;
      if (o.eclats !== '' && o.eclats != null && Number.isFinite(+o.eclats)) e.eclats = int(o.eclats, 0, 100000);
      if (o.xp !== '' && o.xp != null && Number.isFinite(+o.xp)) e.xp = int(o.xp, 0, 100000);
      if (Object.keys(e).length) out[id] = e;
    }
    const kinds = ['daily', 'weekly'];
    for (const k of kinds) if (Object.entries(QUESTS).filter(([id, q]) => q.kind === k && !out[id]?.off).length < 3) fail('Garde au moins 3 quêtes actives par catégorie.');
    this.state.config.questOverrides = out; this.applyConfig(); this.save();
    return { _detail: `${Object.values(out).filter(o => o.off).length} désactivée(s)` };
  } },

  // ---------- comptes : progression, notes, avertissements ----------
  'account/xp': { level: 2, post: true, label: 'Niveau / XP modifié', fn({ body }) {
    const u = this.findUser(body.name); ensureUser(u);
    if (body.mode === 'level') setLevel(u, int(body.value, 1, 100));
    else addXp(u, int(body.value, -10000000, 10000000));
    this.ctx.accounts.save(); this.notifyProfile(u); this.ctx.social.lbCache.clear();
    return { level: levelOf(u.xp), _detail: `${u.name} → niveau ${levelOf(u.xp)} (${u.xp} XP)` };
  } },
  'account/elo': { level: 2, post: true, label: 'Elo modifié', fn({ body }) {
    const u = this.findUser(body.name); ensureUser(u);
    u.elo = int(body.value, 0, 5000); u.eloPeak = Math.max(u.eloPeak, u.elo);
    this.ctx.accounts.save(); this.notifyProfile(u); this.ctx.social.lbCache.clear();
    return { _detail: `${u.name} → ${u.elo}` };
  } },
  'account/title': { level: 2, post: true, label: 'Titre attribué', fn({ body }) {
    const u = this.findUser(body.name); ensureUser(u);
    const id = String(body.title || '');
    if (!TITLES[id]) fail('Titre inconnu');
    if (body.remove) { u.titles = u.titles.filter(t => t !== id); if (u.title === id) u.title = null; }
    else if (!u.titles.includes(id)) u.titles.push(id);
    this.ctx.accounts.save(); this.notifyProfile(u);
    return { _detail: `${u.name} — ${body.remove ? 'retrait' : 'ajout'} : ${TITLES[id]}` };
  } },
  'account/note': { level: 1, post: true, label: 'Note de staff', fn({ body, user }) {
    const u = this.findUser(body.name); ensureUser(u);
    if (body.delete != null) { u.notes = u.notes.filter(n => n.id !== body.delete); this.ctx.accounts.save(); return { _detail: `${u.name} — note supprimée` }; }
    const text = str(body.text, 500); if (!text) fail('Note vide');
    u.notes.unshift({ id: crypto.randomUUID(), t: Date.now(), by: user.name, text });
    if (u.notes.length > 50) u.notes.length = 50;
    this.ctx.accounts.save();
    return { _detail: `${u.name} : ${text}` };
  } },
  warn: { level: 1, post: true, label: 'Avertissement', fn({ body, user, lvl }) {
    const u = this.findUser(body.name); ensureUser(u); this.guard(lvl, u, null);
    const reason = str(body.reason, 200) || 'Comportement inapproprié';
    u.warnings = (u.warnings || 0) + 1;
    u.notes.unshift({ id: crypto.randomUUID(), t: Date.now(), by: user.name, text: `Avertissement n°${u.warnings} : ${reason}` });
    const key = this.ctx.accounts.key(u.name);
    for (const c of this.clientsOf(key)) this.ctx.send(c.id, { type: 'system', kind: 'warn', from: user.name, text: `Avertissement n°${u.warnings} : ${reason}` });
    let banned = false;
    const at = this.state.config.warnBanAt;
    if (at && u.warnings >= at && u.warnings % at === 0) {
      const b = { id: crypto.randomUUID(), type: 'account', value: key, label: u.name, reason: `${u.warnings} avertissements (dernier : ${reason})`, by: 'Automatique', at: Date.now(), until: Date.now() + 86400000 };
      this.state.bans = this.state.bans.filter(x => !(x.type === 'account' && x.value === key)); this.state.bans.push(b);
      for (const c of this.clientsOf(key)) this.ctx.kick(c, this.banText(b));
      banned = true; this.save();
    }
    this.ctx.accounts.save();
    return { warnings: u.warnings, banned, _detail: `${u.name} (n°${u.warnings}${banned ? ', ban 24 h automatique' : ''}) — ${reason}` };
  } },
  'warn/reset': { level: 2, post: true, label: 'Avertissements remis à zéro', fn({ body }) {
    const u = this.findUser(body.name); u.warnings = 0; this.ctx.accounts.save(); return { _detail: u.name };
  } },

  // ---------- anti-triche ----------
  suspects: { level: 1, fn() {
    return Object.entries(this.state.suspects).map(([key, s]) => {
      const u = s.account && this.ctx.accounts.get(s.account);
      const reports = this.state.reports.filter(r => (s.account && r.targetAccount === s.account) || r.target === s.name).length;
      return { key, ...s, reports, banned: !!(s.account && this.activeBan('account', s.account)), online: s.account ? this.clientsOf(s.account).length > 0 : false,
        kd: u ? (u.stats.deaths ? Math.round(u.stats.kills / u.stats.deaths * 100) / 100 : u.stats.kills) : null,
        hs: u && u.stats.kills ? Math.round((u.stats.hsKills || 0) / u.stats.kills * 100) : null, acc: u && u.stats.shots ? Math.round(u.stats.hits / u.stats.shots * 100) : null };
    }).sort((a, b) => b.last - a.last);
  } },
  'suspect/clear': { level: 1, post: true, label: 'Alertes anti-triche effacées', fn({ body }) {
    const s = this.state.suspects[body.key]; if (!s) fail('Introuvable', 404);
    delete this.state.suspects[body.key]; this.save(); return { _detail: s.name };
  } },

  // ---------- historique des parties ----------
  matches: { level: 1, fn({ q }) {
    const s = (q.get('q') || '').toLowerCase(), mode = q.get('mode');
    let rows = this.state.matches;
    if (mode) rows = rows.filter(m => m.mode === mode);
    if (s) rows = rows.filter(m => m.room.toLowerCase().includes(s) || m.players.some(p => p.name.toLowerCase().includes(s)));
    const agents = Object.entries(this.state.stats.agentWins).map(([id, a]) => ({ id, name: AGENTS[id]?.name || id, ...a, winRate: a.played ? Math.round(a.won / a.played * 100) : 0 }));
    return { rows: rows.slice(0, 200), agents };
  } },
  'export/matches': { level: 2, fn({ res }) {
    const head = ['date', 'salon', 'mode', 'carte', 'duree_s', 'score', 'vainqueur', 'mvp', 'joueurs'];
    const csv = [head.join(';'), ...this.state.matches.map(m => [new Date(m.t).toISOString(), m.room, m.mode, MAP_INFO[m.map]?.name || m.map, m.duration, m.score, m.winner, m.mvp, m.players.map(p => `${p.name} ${p.kills}/${p.deaths}`).join(' | ')].map(csvCell).join(';'))].join('\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="eclipse-parties.csv"', 'Cache-Control': 'no-store' });
    res.end('﻿' + csv); return RAW;
  } },

  // ---------- économie ----------
  economy: { level: 2, fn() {
    const users = Object.values(this.users());
    const total = users.reduce((n, u) => n + (u.eclats || 0), 0);
    const st = this.state.stats;
    const owners = {};
    for (const u of users) for (const id of u.owned || []) owners[id] = (owners[id] || 0) + 1;
    return {
      total, avg: users.length ? Math.round(total / users.length) : 0, accounts: users.length,
      richest: users.slice().sort((a, b) => b.eclats - a.eclats).slice(0, 10).map(u => ({ name: u.name, eclats: u.eclats, level: levelOf(u.xp) })),
      earnByDay: Object.entries(st.earnByDay).sort().slice(-14), spendByDay: Object.entries(st.spendByDay).sort().slice(-14),
      skins: SKINS.filter(s => s.id !== 'default').map(s => ({ key: s.id, label: s.name + (s.level ? ` (niv. ${s.level})` : ` (${s.price})`), value: owners[s.id] || 0, sales: st.skinSales[s.id] || 0 })).sort((a, b) => b.value - a.value),
      levels: [[1, 4], [5, 9], [10, 19], [20, 29], [30, 49], [50, 100]].map(([a, b]) => ({ key: a, label: `Niv. ${a}–${b}`, value: users.filter(u => { const l = levelOf(u.xp); return l >= a && l <= b; }).length })),
      mul: this.mul(), event: this.eventInfo(),
    };
  } },
  gift: { level: 2, post: true, label: 'Cadeau collectif', fn({ body, user }) {
    const eclats = int(body.eclats ?? 0, 0, 100000), xp = int(body.xp ?? 0, 0, 1000000);
    if (!eclats && !xp) fail('Indique un montant d\'Éclats ou d\'XP.');
    const msg = str(body.message, 200);
    const A = this.ctx.accounts;
    const targets = body.target === 'online' ? this.onlineClients().filter(c => c.account).map(c => A.get(c.account)).filter(Boolean) : Object.values(this.users());
    const seen = new Set();
    for (const u of targets) { if (seen.has(u)) continue; seen.add(u); ensureUser(u); u.eclats += eclats; if (xp) addXp(u, xp); }
    A.save(); this.economy('earn', eclats * seen.size); this.ctx.social.lbCache.clear();
    for (const c of this.onlineClients()) {
      const u = c.account && A.get(c.account);
      if (!u || !seen.has(u)) continue;
      this.notifyProfile(u);
      this.ctx.send(c.id, { type: 'system', kind: 'gift', from: user.name, text: `Cadeau de l'équipe : ${eclats ? `+${eclats} Éclats` : ''}${eclats && xp ? ' et ' : ''}${xp ? `+${xp} XP` : ''}${msg ? ` — ${msg}` : ''}` });
    }
    return { count: seen.size, _detail: `${seen.size} compte(s) : ${eclats} Éclats, ${xp} XP${msg ? ' — ' + msg : ''}` };
  } },

  // ---------- annonces programmées ----------
  schedule: { level: 2, fn() { return this.state.schedule.slice().sort((a, b) => a.at - b.at); } },
  'schedule/add': { level: 2, post: true, label: 'Annonce programmée', fn({ body, user }) {
    const text = str(body.text, 300); if (!text) fail('Message vide');
    const at = Number(body.at); if (!Number.isFinite(at) || at < Date.now() - 60000) fail('Date invalide (elle doit être dans le futur).');
    const repeat = int(body.repeat ?? 0, 0, 10080);
    if (this.state.schedule.length >= 50) fail('50 annonces programmées au maximum.');
    const a = { id: crypto.randomUUID(), at, text, repeat, by: user.name, created: Date.now() };
    this.state.schedule.push(a); this.save();
    return { _detail: `${new Date(at).toLocaleString('fr-FR')}${repeat ? ` (toutes les ${repeat} min)` : ''} : ${text}` };
  } },
  'schedule/delete': { level: 2, post: true, label: 'Annonce programmée supprimée', fn({ body }) {
    const a = this.state.schedule.find(x => x.id === body.id); if (!a) fail('Introuvable', 404);
    this.state.schedule = this.state.schedule.filter(x => x !== a); this.save(); return { _detail: a.text };
  } },

  // ---------- pseudos interdits ----------
  names: { level: 1, fn() { return { words: this.state.nameWords }; } },
  'names/save': { level: 2, post: true, label: 'Mots interdits dans les pseudos', fn({ body }) {
    const words = (Array.isArray(body.words) ? body.words : []).map(w => str(w, 20).toLowerCase()).filter(w => w.length >= 2);
    this.state.nameWords = [...new Set(words)].slice(0, 300); this.applyConfig(); this.save();
    return { words: this.state.nameWords, _detail: `${this.state.nameWords.length} mot(s)` };
  } },
  titles: { level: 1, fn() { return { titles: TITLES, staff: STAFF_TITLES }; } },
};
