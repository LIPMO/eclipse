// Administration : API HTTP sous /admin/api/*, modération, statistiques, configuration, journaux.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { SKINS, WEAPONS, ROUND, DUEL, AGENTS, SKINNABLE, isFfa } from '../shared/data.js';
import { MAP_INFO, mapsForMode } from '../shared/maps.js';
import { QUESTS, QUEST_REWARD, TITLES, STAFF_TITLES, RANKS, rankOf, levelOf, levelInfo, ELO_START, REPORT_REASONS, ACHIEVEMENTS } from '../shared/progress.js';
import { addXp, setLevel, ensureUser, titlesOf, rankFor, weekKey } from './progression.js';

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
  // anti-triche (désactivable) : seuil d'infractions de déplacement avant alerte
  anticheat: true, acStrikes: 5,
  // alertes Discord (webhook) et inscriptions
  discordWebhook: '', discordCheat: true, discordReports: true, discordBans: true, discordTournaments: true, alertSuspectLogin: true,
  maxAccountsPerIp: Math.max(0, parseInt(process.env.MAX_ACCOUNTS_PER_IP ?? '3', 10) || 0), weekendXp: false,
  // surveillance des performances, sauvegardes automatiques, limites de débit réglables
  perfAlerts: true, perfTickMs: 30, discordPerf: true, autoBackup: true, backupKeep: 7, rateChat: 5, rateSocial: 12,
  // clans : niveau requis pour en créer un (1 = tout le monde)
  clanMinLevel: 3,
  // déplacement : glissade (s'accroupir en courant)
  slide: true,
  // 1.15 : blagues de l'administrateur (autorisées, durée max en s), événements serveur, message envoyé aux nouveaux comptes
  trollsOn: true, trollMax: 30, eventBigHead: false, eventLowGrav: false, eventTurbo: false, welcomeMsg: '',
  // 1.19 : agents et cartes désactivés (identifiants séparés par des virgules), multiplicateur des récompenses de quêtes
  disabledAgents: '', disabledMaps: '', questMul: 1,
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
  anticheat: 'bool', acStrikes: [2, 50], discordWebhook: ['str', 300], discordCheat: 'bool', discordReports: 'bool', discordBans: 'bool', discordTournaments: 'bool',
  alertSuspectLogin: 'bool', maxAccountsPerIp: [0, 50], weekendXp: 'bool',
  perfAlerts: 'bool', perfTickMs: [5, 200], discordPerf: 'bool', autoBackup: 'bool', backupKeep: [1, 30], rateChat: [2, 30], rateSocial: [4, 60], clanMinLevel: [1, 50], slide: 'bool',
  disabledAgents: ['str', 300], disabledMaps: ['str', 300], questMul: [0, 5], trollsOn: 'bool', trollMax: [5, 120], eventBigHead: 'bool', eventLowGrav: 'bool', eventTurbo: 'bool', welcomeMsg: ['str', 300],
};
// libellés lisibles de la configuration (historique des modifications)
const CONFIG_LABELS = {
  maintenance: 'Maintenance', maintenanceMsg: 'Message de maintenance', motd: 'Message du jour', registrationOpen: 'Inscriptions ouvertes', guestsAllowed: 'Invités acceptés',
  guestRooms: 'Salons des invités', chatEnabled: 'Chat activé', maxRooms: 'Salons max.', maxPlayers: 'Joueurs max.', rewardMul: 'Multiplicateur d\'Éclats', startEclats: 'Éclats de départ',
  buyTime: 'Temps d\'achat', roundTime: 'Durée de manche', fuseTime: 'Mèche du noyau', duelBuyTime: 'Achat en duel', duelRoundTime: 'Manche de duel', xpMul: 'Multiplicateur d\'XP',
  weaponUnlocks: 'Déblocage des armes', dailyBonus: 'Bonus quotidien', eventName: 'Nom de l\'événement', eventXpMul: 'XP de l\'événement', eventEclatsMul: 'Éclats de l\'événement',
  eventUntil: 'Fin de l\'événement', slowMode: 'Mode lent', blockLinks: 'Liens bloqués', autoMute: 'Silence automatique', autoMuteThreshold: 'Seuil du silence auto.',
  autoMuteMinutes: 'Durée du silence auto.', warnBanAt: 'Ban après avertissements', anticheat: 'Anti-triche', acStrikes: 'Seuil anti-triche', discordWebhook: 'Webhook Discord',
  discordCheat: 'Discord : triche', discordReports: 'Discord : signalements', discordBans: 'Discord : bans', discordTournaments: 'Discord : tournois', alertSuspectLogin: 'Alerte compte surveillé',
  maxAccountsPerIp: 'Comptes par IP', weekendXp: 'XP du week-end', perfAlerts: 'Alertes de lenteur', perfTickMs: 'Seuil de lenteur (ms)', discordPerf: 'Discord : lenteur',
  autoBackup: 'Sauvegarde automatique', backupKeep: 'Sauvegardes conservées', rateChat: 'Limite du chat', rateSocial: 'Limite des actions sociales', clanMinLevel: 'Niveau requis pour créer un clan', slide: 'Glissade',
  disabledAgents: 'Agents désactivés', disabledMaps: 'Cartes désactivées', questMul: 'Récompenses des quêtes', trollsOn: 'Blagues autorisées', trollMax: 'Durée max. des blagues', eventBigHead: 'Événement grosses têtes', eventLowGrav: 'Événement gravité basse', eventTurbo: 'Événement turbo',
  welcomeMsg: 'Message d\'accueil des nouveaux comptes',
};
// blagues de l'administrateur (1.15) : all = visible par toute la partie, max = durée plafonnée (s)
export const TROLLS = {
  upside: { name: 'Écran à l\'envers' }, spin: { name: 'Vertige' }, drunk: { name: 'Caméra ivre' }, invert: { name: 'Commandes inversées' },
  pixel: { name: 'Écran pixelisé' }, rainbow: { name: 'Arc-en-ciel' }, bighead: { name: 'Grosse tête', all: true }, tiny: { name: 'Minuscule', all: true },
  duck: { name: 'Tirs « coin-coin »', all: true }, fakeban: { name: 'Faux bannissement', max: 8 }, fakedc: { name: 'Fausse déconnexion', max: 8 },
  confetti: { name: 'Confettis', all: true }, dance: { name: 'Danse forcée', all: true }, flash: { name: 'Flash blanc', max: 3 }, freeze: { name: 'Gel sur place', max: 5 },
};
const BACKUP_RE = /^eclipse-\d{4}-\d{2}-\d{2}(-\d{6})?\.json$/;
const DECIMAL = new Set(['rewardMul', 'xpMul', 'eventXpMul', 'eventEclatsMul', 'questMul']);
export const ACCOUNT_TAGS = { surveille: 'Surveillé', suspect: 'Suspect', vip: 'VIP', testeur: 'Testeur', createur: 'Créateur', partenaire: 'Partenaire' };
const SITE_URL = (process.env.SITE_URL || 'https://eclipseee.online').replace(/\/$/, '');
// style des alertes Discord par catégorie : couleur, auteur et icône
const DISCORD_STYLE = {
  cheat: { color: 0xff3355, author: '🚨 Anti-triche' },
  report: { color: 0xff9f1c, author: '⚑ Signalement' },
  ban: { color: 0x8b0a1e, author: '⛔ Sanction' },
  perf: { color: 0xffd23f, author: '🐢 Performances' },
  tournament: { color: 0xa259ff, author: '🏆 Tournois ECLIPSE' },
  info: { color: 0x19e3c4, author: 'ECLIPSE' },
};
function discordEmbed(kind, e) {
  const st = DISCORD_STYLE[kind] || DISCORD_STYLE.info;
  return {
    color: st.color,
    author: { name: st.author, icon_url: `${SITE_URL}/img/logo-180.png`, url: SITE_URL },
    timestamp: new Date().toISOString(),
    footer: { text: 'ECLIPSE · eclipseee.online', icon_url: `${SITE_URL}/img/logo-32.png` },
    ...e,
  };
}
const DISCORD_RE = /^https:\/\/(discord\.com|discordapp\.com|canary\.discord\.com|ptb\.discord\.com)\/api\/webhooks\/\d{5,25}\/[\w-]{20,100}$/;
const LINK_RE = /(https?:\/\/|www\.|discord\.gg|\b[a-z0-9-]{2,}\.(com|net|org|fr|io|gg|xyz|ru|info|me|be|co)\b)/i;
const WEAPON_DEFAULTS = Object.fromEntries(Object.entries(WEAPONS).map(([id, w]) => [id, { damage: w.damage, headMul: w.headMul }]));
const DEFAULT_STATS = () => ({ matches: 0, kills: 0, headshots: 0, modes: {}, maps: {}, agents: {}, weapons: {}, regsByDay: {}, matchesByDay: {}, peak: 0, peakAt: 0, agentWins: {}, earnByDay: {}, spendByDay: {}, skinSales: {}, weaponHs: {}, hourly: Array(24).fill(0), hourlyN: Array(24).fill(0), slides: 0, adsShots: 0 });

function fail(msg, status = 400) { const e = new Error(msg); e.status = status; throw e; }
const str = (v, n) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, n);
const int = (v, a, b) => { const n = Math.round(Number(v)); if (!Number.isFinite(n)) fail('Nombre invalide'); return Math.max(a, Math.min(b, n)); };
const maskIp = ip => { const p = String(ip || '').split('.'); return p.length === 4 ? `${p[0]}.${p[1]}.x.x` : String(ip || '').replace(/:[^:]+:[^:]+$/, ':x:x'); };
const csvCell = v => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export class Admin {
  // pays du joueur : en-tête ajouté par Cloudflare, accepté uniquement derrière le tunnel (connexion locale)
  static countryOf(req) {
    const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    if (remote !== '127.0.0.1' && remote !== '::1') return '';
    const cc = String(req.headers['cf-ipcountry'] || '').toUpperCase();
    return /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1' ? cc : '';
  }
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
      configHistory: saved.configHistory || [], maintSchedule: saved.maintSchedule || null, lastBackup: saved.lastBackup || 0,
      // 1.15 : journal des blagues, retours des joueurs (bugs et idées), sondage du jour
      trollLog: saved.trollLog || [], feedback: saved.feedback || [], poll: saved.poll || null, pollsHistory: saved.pollsHistory || [],
      // 1.22 : connecteur Claude (empreinte du jeton seulement)
      mcp: saved.mcp || null,
    };
    this.clientErrors = []; this.slowSamples = 0; this.lastPerfAlert = 0; this.pendingRestart = null;
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
    const L = this.ctx.limits || {};
    if (L.chat) { L.chat.burst = c.rateChat; L.chat.rate = c.rateChat * 0.24; }
    if (L.social) { L.social.burst = c.rateSocial; L.social.rate = c.rateSocial / 8; }
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
    const wd = new Date().getDay(), weekend = c.weekendXp && (wd === 0 || wd === 6);
    return { xp: c.xpMul * (ev ? c.eventXpMul : 1) * (weekend ? 1.5 : 1), eclats: c.rewardMul * (ev ? c.eventEclatsMul : 1), quest: c.questMul ?? 1 };
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
    this.discord('report', null, { title: `Signalement : ${r.target}`, description: r.reason ? `> ${String(r.reason).slice(0, 500)}` : undefined,
      fields: [{ name: 'Motif', value: `**${REPORT_REASONS[r.category] || r.category}**`, inline: true }, { name: 'Par', value: r.from, inline: true }, { name: 'Contre', value: `**${r.target}**`, inline: true },
        ...(report.suspect ? [{ name: 'Signalements reçus', value: `${report.suspect}`, inline: true }] : [])] });
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
      { const hr = new Date(now).getHours(); st.hourly ||= Array(24).fill(0); st.hourlyN ||= Array(24).fill(0); st.hourly[hr] += online; st.hourlyN[hr]++; }
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
    this.checkPerf(now);
    this.checkMaintenance(now);
    this.autoBackup(now);
    if (this.pendingRestart && !this.anyMatch()) this.doRestart('Redémarrage programmé : plus aucune partie en cours');
    // nettoyage des sanctions expirées
    const keep = x => !x.until || x.until > now;
    const nb = this.state.bans.length, nm = this.state.mutes.length;
    this.state.bans = this.state.bans.filter(keep); this.state.mutes = this.state.mutes.filter(keep);
    if (nb !== this.state.bans.length || nm !== this.state.mutes.length) this.save();
  }

  // ---------- contrôles d'accès des joueurs ----------
  // alertes Discord : envoi limité (file de 30 messages, 1 toutes les 1,2 s), jamais d'adresse autre que Discord
  // 1.32 : chaque alerte part en « embed » Discord (couleur, titre, champs, logo, date) ; le texte reste en secours
  discord(kind, text, embed = null) {
    const cfg = this.state.config;
    if (!cfg.discordWebhook || !DISCORD_RE.test(cfg.discordWebhook)) return;
    const flag = { cheat: 'discordCheat', report: 'discordReports', ban: 'discordBans', tournament: 'discordTournaments', perf: 'discordPerf' }[kind];
    if (flag && cfg[flag] === false) return;
    this.discordQ ||= [];
    if (this.discordQ.length >= 30) return;
    const safe = s => String(s ?? '').replace(/@(everyone|here)/g, '@\u200b$1');
    const e = discordEmbed(kind, embed || { description: text });
    // nettoyage : pas de mention de masse, longueurs maximales de Discord
    e.title = e.title ? safe(e.title).slice(0, 256) : undefined;
    e.description = e.description ? safe(e.description).slice(0, 4000) : undefined;
    e.fields = (e.fields || []).slice(0, 25).map(f => ({ name: safe(f.name).slice(0, 256) || '\u200b', value: safe(f.value).slice(0, 1024) || '\u200b', inline: !!f.inline }));
    this.discordQ.push({ username: 'ECLIPSE', avatar_url: `${SITE_URL}/img/logo-512.png`, embeds: [e], allowed_mentions: { parse: [] } });
    if (this.discordT) return;
    const pump = () => {
      const msg = this.discordQ.shift();
      if (!msg) { this.discordT = null; return; }
      fetch(cfg.discordWebhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg), signal: AbortSignal.timeout(8000) })
        .catch(() => {}).finally(() => { this.discordT = setTimeout(pump, 1200); this.discordT.unref?.(); });
    };
    pump();
  }
  // historique des sanctions d'un compte (50 dernières)
  sanction(key, type, text, by) {
    const u = key && this.ctx.accounts.get(key); if (!u) return;
    (u.sanctions ||= []).unshift({ t: Date.now(), type, text: String(text || '').slice(0, 240), by: by || 'Automatique' });
    if (u.sanctions.length > 50) u.sanctions.length = 50;
    this.ctx.accounts.save();
  }
  staffNotice(text) { for (const c of this.onlineClients()) if (this.levelOf(c) >= 1) this.ctx.send(c.id, { type: 'system', kind: 'staff', text }); }
  anyMatch() { for (const r of this.ctx.rooms.values()) if (r.match && r.match.phase !== 'over') return true; return false; }
  // alerte quand le serveur ralentit : 3 mesures de suite au-dessus du seuil (15 s), puis au plus une alerte toutes les 10 min
  checkPerf(now) {
    const cfg = this.state.config;
    const t = this.ticks.slice(-60); if (!cfg.perfAlerts || t.length < 10) { this.slowSamples = 0; return; }
    const avg = t.reduce((a, b) => a + b, 0) / t.length;
    const memPct = process.memoryUsage().rss / os.totalmem() * 100;
    const slow = avg > cfg.perfTickMs || memPct > 85;
    this.slowSamples = slow ? this.slowSamples + 1 : 0;
    if (this.slowSamples < 3 || now - this.lastPerfAlert < 600000) return;
    this.lastPerfAlert = now;
    const text = `Le serveur ralentit : calcul d'une image de jeu ${Math.round(avg * 10) / 10} ms en moyenne (seuil ${cfg.perfTickMs} ms), mémoire ${Math.round(memPct)} %, ${this.inGameCount()} joueur(s) en partie.`;
    this.log('systeme', text);
    this.staffNotice(text);
    if (cfg.discordPerf) this.discord('perf', null, { title: 'Le serveur ralentit', description: text,
      fields: [{ name: 'Image de jeu', value: `${Math.round(avg * 10) / 10} ms (seuil ${cfg.perfTickMs} ms)`, inline: true }, { name: 'Mémoire', value: `${Math.round(memPct)} %`, inline: true }, { name: 'En partie', value: `${this.inGameCount()} joueur(s)`, inline: true }] });
  }
  // maintenance programmée : avertissements à 10, 5 et 1 minute, puis activation
  checkMaintenance(now) {
    const m = this.state.maintSchedule; if (!m) return;
    const left = m.at - now;
    for (const w of [10, 5, 1]) {
      if (left <= w * 60000 && left > 0 && !m.warned.includes(w)) {
        m.warned.push(w); this.save();
        for (const c of this.onlineClients()) this.ctx.send(c.id, { type: 'system', kind: 'broadcast', from: 'SERVEUR', text: `Maintenance dans ${w} minute${w > 1 ? 's' : ''}${m.msg ? ' : ' + m.msg : ''}. Termine ta partie.` });
      }
    }
    if (left > 0) return;
    this.state.maintSchedule = null;
    const cfg = this.state.config;
    cfg.maintenance = true; if (m.msg) cfg.maintenanceMsg = m.msg;
    this.recordConfig(m.by, 'maintenance', false, true);
    this.save();
    this.log('admin', `Maintenance programmée activée (demandée par ${m.by})`);
    for (const c of this.onlineClients()) if (this.levelOf(c) < 1) this.ctx.kick(c, cfg.maintenanceMsg);
  }
  recordConfig(by, key, oldV, newV) {
    const mask = v => key === 'discordWebhook' ? (v ? '(configuré)' : '(vide)') : v;
    this.state.configHistory.unshift({ id: crypto.randomUUID(), t: Date.now(), by, key, label: CONFIG_LABELS[key] || key, old: mask(oldV), new: mask(newV), revertable: key !== 'discordWebhook' });
    if (this.state.configHistory.length > 200) this.state.configHistory.length = 200;
  }
  // sauvegarde automatique quotidienne (comptes, clans, administration) dans data/backups
  updInfo() {
    let status = null;
    try { status = JSON.parse(fs.readFileSync(process.env.MAJ_STATUS_FILE || '/var/lib/eclipse-statut/status.json', 'utf8')); } catch { /* service absent */ }
    let pending = null;
    try { pending = JSON.parse(fs.readFileSync(path.join(this.ctx.dataDir, 'maj', 'demande'), 'utf8')); } catch { /* aucune demande */ }
    return { installed: !!status, status, pending, version: this.ctx.version };
  }
  // exécute une action de lecture de l'administration sans passer par HTTP (utilisé par le connecteur MCP)
  runAction(name) { const def = ACTIONS[name]; if (!def) throw new Error('action inconnue'); return def.fn.call(this, { body: {}, q: new URLSearchParams(), user: null, lvl: 3 }); }
  backupDir() { return path.join(this.ctx.dataDir, 'backups'); }
  writeBackup(tag = '') {
    const dir = this.backupDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const d = new Date(), name = `eclipse-${today()}${tag ? '-' + tag : ''}.json`;
    const tours = (() => { try { return JSON.parse(fs.readFileSync(path.join(this.ctx.dataDir, 'tournaments.json'), 'utf8')); } catch { return null; } })();
    const data = JSON.stringify({ exported: d.toISOString(), version: this.ctx.version, accounts: this.ctx.accounts.data, admin: this.state, tournaments: tours });
    fs.writeFileSync(path.join(dir, name + '.tmp'), data, { mode: 0o600 });
    fs.renameSync(path.join(dir, name + '.tmp'), path.join(dir, name));
    this.state.lastBackup = Date.now(); this.save();
    this.pruneBackups();
    return { name, size: Buffer.byteLength(data) };
  }
  pruneBackups() {
    const keep = this.state.config.backupKeep;
    const files = this.listBackups();
    for (const f of files.slice(keep)) { try { fs.unlinkSync(path.join(this.backupDir(), f.name)); } catch { /* */ } }
  }
  listBackups() {
    let names = []; try { names = fs.readdirSync(this.backupDir()).filter(n => BACKUP_RE.test(n)); } catch { return []; }
    return names.map(n => { const st = fs.statSync(path.join(this.backupDir(), n)); return { name: n, size: st.size, t: st.mtimeMs }; }).sort((a, b) => b.t - a.t);
  }
  autoBackup(now) {
    if (!this.state.config.autoBackup || this.backupBusy) return;
    if (new Date(this.state.lastBackup || 0).toISOString().slice(0, 10) === today()) return;
    this.backupBusy = true;
    try { const b = this.writeBackup(); this.log('systeme', `Sauvegarde automatique : ${b.name} (${Math.round(b.size / 1024)} Ko)`); }
    catch (e) { this.error('Sauvegarde automatique impossible : ' + e.message); this.state.lastBackup = now; }
    finally { this.backupBusy = false; }
  }
  doRestart(why) {
    if (this.restarting) return; this.restarting = true;
    this.log('systeme', why);
    setTimeout(() => {
      this.flush(); this.ctx.accounts.flush();
      for (const c of this.ctx.clients.values()) this.ctx.send(c.id, { type: 'system', kind: 'notice', text: 'Le serveur redémarre, reconnexion automatique dans quelques secondes…' });
      setTimeout(() => (this.ctx.exit || process.exit)(1), 400); // systemd / Docker relancent le service
    }, 300);
  }
  // nouvelle partie refusée pendant un redémarrage programmé ou juste avant une maintenance
  blockNewMatch() {
    if (this.pendingRestart) return 'Le serveur va redémarrer dans un instant : impossible de lancer une nouvelle partie.';
    const m = this.state.maintSchedule;
    if (m && m.at - Date.now() < 5 * 60000) return 'Une maintenance commence dans moins de 5 minutes : impossible de lancer une nouvelle partie.';
    return null;
  }
  // erreurs JavaScript remontées par les navigateurs des joueurs (5 par connexion)
  clientError(c, msg) {
    c.errSent = (c.errSent || 0) + 1; if (c.errSent > 5) return;
    const e = { t: Date.now(), who: c.name || '?', text: str(msg.text, 200) || 'Erreur', src: str(msg.src, 120), line: Math.max(0, Math.min(1e6, Math.round(Number(msg.line) || 0))), ua: str(msg.ua, 120) };
    this.clientErrors.unshift(e); if (this.clientErrors.length > 200) this.clientErrors.length = 200;
    this.log('client', `Erreur dans le navigateur de ${e.who} : ${e.text}${e.src ? ` (${e.src}:${e.line})` : ''}`);
  }
  // connexion d'un compte surveillé : le staff connecté (et Discord) est prévenu
  onLogin(c, u) {
    const tags = u.tags || [];
    if (!this.state.config.alertSuspectLogin || !(tags.includes('surveille') || tags.includes('suspect'))) return;
    const text = `Compte ${tags.includes('surveille') ? 'surveillé' : 'suspect'} connecté : ${u.name}`;
    this.log('moderation', text);
    for (const o of this.onlineClients()) if (o !== c && this.levelOf(o) >= 1) this.ctx.send(o.id, { type: 'system', kind: 'staff', text });
    this.discord('cheat', null, { title: `👀 ${text}`, fields: [{ name: 'Étiquettes', value: tags.join(', ') || '—', inline: true }] });
  }
  filterText(text) {
    let out = text, hits = [];
    for (const w of this.state.filter) {
      if (!w) continue;
      const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(w.length <= 3 ? `(^|[^\\p{L}\\p{N}])(${esc})(?=$|[^\\p{L}\\p{N}])` : esc, w.length <= 3 ? 'giu' : 'gi');
      if (re.test(out)) { hits.push(w); out = w.length <= 3 ? out.replace(re, (m, pre, word) => pre + '*'.repeat(word.length)) : out.replace(re, m => '*'.repeat(m.length)); }
    }
    return { out, hits, link: LINK_RE.test(text) };
  }
  serverAverages() {
    if (this.avgCache && Date.now() - this.avgCache.t < 60000) return this.avgCache.v;
    let k = 0, hs = 0, sh = 0, hi = 0, n = 0, d = 0;
    for (const u of Object.values(this.users())) { const s = u?.stats; if (!s || s.kills < 20) continue; n++; k += s.kills; hs += s.hsKills || 0; sh += s.shots || 0; hi += s.hits || 0; d += s.deaths || 0; }
    const v = { players: n, hs: k ? Math.round(hs / k * 100) : null, acc: sh ? Math.round(hi / sh * 100) : null, kd: d ? Math.round(k / d * 100) / 100 : null };
    this.avgCache = { t: Date.now(), v };
    return v;
  }
  // action de modération lancée depuis le jeu (spectateur) : mêmes droits et même journal que le panneau
  staffRun(c, action, body) {
    const user = c.account && this.ctx.accounts.get(c.account);
    const lvl = LEVEL[user?.role || 'player'] || 0;
    const def = ACTIONS[action];
    if (!user || !def || lvl < def.level) fail('Droits insuffisants', 403);
    const out = def.fn.call(this, { body, user, lvl, q: new URLSearchParams(), ip: c.ip });
    if (def.post && def.audit !== false) this.audit(user.name, (def.label || action) + ' (spectateur)', out && out._detail ? out._detail : '');
    return out;
  }
  levelOf(c) { const u = c.account && this.ctx.accounts.get(c.account); return LEVEL[u?.role || 'player'] || 0; }
  pollView(p, key = null) {
    if (!p) return null;
    const counts = p.opts.map(() => 0); for (const v of Object.values(p.votes)) if (counts[v] !== undefined) counts[v]++;
    return { id: p.id, q: p.q, opts: p.opts, counts, total: Object.keys(p.votes).length, created: p.created, by: p.by, mine: key && key in p.votes ? p.votes[key] : null };
  }
  closePoll() {
    const p = this.state.poll; if (!p) return;
    this.state.pollsHistory.unshift({ ...this.pollView(p), closed: Date.now() });
    if (this.state.pollsHistory.length > 50) this.state.pollsHistory.length = 50;
    this.state.poll = null; this.save();
  }
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
    if (cfg.maxAccountsPerIp > 0) {
      const since = Date.now() - 86400000;
      const n = Object.values(this.users()).filter(u => u && u.regIp === c.ip && u.created > since).length;
      if (n >= cfg.maxAccountsPerIp) { this.log('securite', `Inscription refusée : ${n} comptes déjà créés en 24 h depuis ${c.ip}`); return 'Trop de comptes créés depuis ta connexion aujourd\'hui. Réessaie demain.'; }
    }
    return null;
  }
  onRegister(user, c) {
    if (c) user.regIp = c.ip;
    const wm = this.state.config.welcomeMsg;
    if (wm && c) setTimeout(() => { if (c.ws?.readyState === 1) this.ctx.send(c.id, { type: 'system', kind: 'pm', from: 'ECLIPSE', text: wm }); }, 2500);
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
      if (d.head) { st.weaponHs ||= {}; st.weaponHs[d.weapon] = (st.weaponHs[d.weapon] || 0) + 1; }
      this.log('kill', `${d.killer || '—'} a éliminé ${d.victim}${d.head ? ' (tête)' : ''} — ${WEAPONS[d.weapon]?.name || d.weapon}`);
    } else if (type === 'end') {
      const r = d.room, m = r.match;
      this.log('partie', `Partie terminée : « ${r.name} »`);
      // historique global des parties
      const winner = d.winner === 'alpha' ? 'Alpha' : d.winner === 'beta' ? 'Oméga' : (m?.players.get(d.winner)?.name || '—');
      this.state.matches.unshift({ id: crypto.randomUUID(), t: Date.now(), room: r.name, mode: r.mode, map: r.mapId, duration: Math.round(d.duration || 0),
        score: isFfa(r.mode) ? '' : `${m?.score.alpha ?? 0}-${m?.score.beta ?? 0}`, winner, mvp: d.mvp || '', players: d.players || [] });
      if (this.state.matches.length > 300) this.state.matches.length = 300;
      // victoires par agent (équilibrage)
      if (m) for (const p of m.players.values()) {
        if (p.isBot) continue;
        st.slides = (st.slides || 0) + (p.slides || 0); st.adsShots = (st.adsShots || 0) + (p.adsShots || 0);
        const won = isFfa(r.mode) ? d.winner === p.id : d.winner === p.team;
        const a = st.agentWins[p.agent] || (st.agentWins[p.agent] = { played: 0, won: 0, kills: 0, deaths: 0 });
        a.played++; if (won) a.won++; a.kills += p.kills; a.deaths += p.deaths;
      }
    } else if (type === 'cheat') {
      this.log('securite', `${d.stat ? 'Statistiques suspectes' : `Mouvement suspect (${d.strikes} alertes)`} : ${d.name} dans « ${d.room.name} » — ${d.reason}`);
      this.discord('cheat', null, { title: `${d.stat ? 'Statistiques suspectes' : 'Mouvement suspect'} : ${d.name}`, description: `**${d.reason}**`,
        fields: [{ name: 'Joueur', value: `**${d.name}**${d.account ? '' : ' (invité)'}`, inline: true }, { name: 'Salon', value: d.room.name || '—', inline: true }, ...(d.strikes ? [{ name: 'Alertes', value: `${d.strikes}`, inline: true }] : [])] });
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
      level: levelOf(u.xp), xp: u.xp, elo: u.elo, lastSeen: u.lastSeen || u.created, warnings: u.warnings || 0, tags: u.tags || [] };
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
      recentSanctions: this.state.audit.filter(a => /^(Bannissement|Réduction au silence|Expulsion|Avertissement|Sanction annulée)/.test(a.action)).slice(-8).reverse(),
      pendingRestart: this.pendingRestart, maintSchedule: this.state.maintSchedule ? { at: this.state.maintSchedule.at, msg: this.state.maintSchedule.msg, by: this.state.maintSchedule.by } : null,
      lastBackup: this.state.lastBackup || 0,

      usage: { slides: st.slides || 0, adsShots: st.adsShots || 0, matches: st.matches || 0 },
    };
  } },
  history: { level: 1, fn() { return { points: this.history }; } },
  spectators: { level: 1, fn() {
    const out = [];
    for (const c of this.ctx.clients.values()) {
      if (!c.spectating) continue;
      const r = this.ctx.rooms.get(c.spectating); const sp = r?.match?.spectators?.get(c.id);
      out.push({ staff: c.name, room: r?.name || '?', target: sp ? r.match.players.get(sp.target)?.name || '?' : '?' });
    }
    return out;
  } },
  peaks: { level: 1, fn() {
    const st = this.state.stats, h = st.hourly || [], n = st.hourlyN || [];
    return { hours: Array.from({ length: 24 }, (_, i) => n[i] ? Math.round(h[i] / n[i] * 10) / 10 : 0), samples: n.reduce((a, b) => a + b, 0) };
  } },
  weapons: { level: 1, fn() {
    const st = this.state.stats;
    return Object.entries(st.weapons || {}).map(([id, k]) => ({ id, name: WEAPONS[id]?.name || { fire: 'Feu', shock: 'Électricité', frost: 'Givre', core: 'Noyau', admin: 'Admin' }[id] || id, kills: k, hs: (st.weaponHs || {})[id] || 0 })).sort((a, b) => b.kills - a.kills);
  } },
  search: { level: 1, fn({ q }) {
    const s = String(q.get('q') || '').toLowerCase().trim().slice(0, 40);
    if (s.length < 2) return { accounts: [], players: [], rooms: [], clans: [], tournaments: [] };
    return {
      accounts: Object.values(this.users()).filter(u => u?.name?.toLowerCase().includes(s)).slice(0, 10).map(u => ({ name: u.name, level: levelOf(u.xp || 0), banned: !!this.activeBan('account', this.ctx.accounts.key(u.name)) })),
      players: this.onlineClients().filter(c => c.name.toLowerCase().includes(s)).slice(0, 10).map(c => ({ id: c.id, name: c.name, inMatch: !!(c.roomId && this.ctx.rooms.get(c.roomId)?.match) })),
      rooms: [...this.ctx.rooms.values()].filter(r => r.name.toLowerCase().includes(s)).slice(0, 10).map(r => ({ id: r.id, name: r.name, state: r.state })),
      clans: (this.ctx.clans?.adminList() || []).filter(c => c.tag.toLowerCase().includes(s) || c.name.toLowerCase().includes(s)).slice(0, 10).map(c => ({ tag: c.tag, name: c.name })),
      tournaments: (this.ctx.tournaments?.adminList() || []).filter(t => t.name.toLowerCase().includes(s)).slice(0, 10).map(t => ({ id: t.id, name: t.name, status: t.status })),
    };
  } },
  'report/week': { level: 1, fn() {
    const since = Date.now() - 7 * 86400000, users = Object.values(this.users()).filter(Boolean);
    const days = Array.from({ length: 7 }, (_, i) => new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
    const st = this.state.stats;
    const wk = weekKey();
    return {
      newAccounts: users.filter(u => u.created > since).length,
      matches: days.reduce((a, d) => a + (st.matchesByDay?.[d] || 0), 0),
      reports: this.state.reports.filter(r => r.t > since).length,
      bans: this.state.bans.filter(b => b.at > since).length,
      peak: this.history.filter(h => h.t > since).reduce((m, h) => Math.max(m, h.online), 0),
      active: users.filter(u => (u.lastSeen || 0) > since).length,
      top: users.filter(u => u.week?.key === wk && u.week.xp > 0).sort((a, b) => b.week.xp - a.week.xp).slice(0, 5).map(u => ({ name: u.name, xp: u.week.xp, kills: u.week.kills, wins: u.week.wins })),
    };
  } },
  'filter/test': { level: 1, post: true, audit: false, fn({ body }) { return this.filterText(str(body.text, 300)); } },
  'account/tags': { level: 1, post: true, label: 'Étiquettes de compte', fn({ body }) {
    const u = this.findUser(body.name);
    const tags = (Array.isArray(body.tags) ? body.tags : []).map(String).filter(t => ACCOUNT_TAGS[t]);
    u.tags = [...new Set(tags)]; this.ctx.accounts.save();
    return { tags: u.tags, _detail: `${u.name} : ${u.tags.map(t => ACCOUNT_TAGS[t]).join(', ') || 'aucune'}` };
  } },
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
      reports: this.state.reports.filter(r => r.targetAccount === key || r.target?.toLowerCase() === key).length,
      sanctions: u.sanctions || [], tags: u.tags || [], avg: this.serverAverages(), regIp: lvl >= 2 ? u.regIp || null : null,
      outfitsAll: !!u.outfitsAll, winStreak: u.winStreak || 0, aimBest: u.aimBest || 0, customTitle: u.customTitle || '' };
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
  audit: { level: 2, fn({ q }) {
    const s = String(q.get('q') || '').toLowerCase().slice(0, 60), by = String(q.get('by') || ''), days = Math.max(0, Math.min(365, parseInt(q.get('days') || '0', 10) || 0));
    let rows = this.state.audit;
    if (by) rows = rows.filter(a => a.by === by);
    if (s) rows = rows.filter(a => (a.action + ' ' + a.detail).toLowerCase().includes(s));
    if (days) { const since = Date.now() - days * 86400000; rows = rows.filter(a => a.t >= since); }
    return rows.slice(-300).reverse();
  } },
  config: { level: 2, fn() {
    return { config: this.state.config, weaponDefaults: WEAPON_DEFAULTS, weapons: Object.fromEntries(Object.entries(WEAPONS).map(([id, w]) => [id, { name: w.name, damage: w.damage, headMul: w.headMul, type: w.type }])) };
  } },
  news: { level: 2, fn() { try { return JSON.parse(fs.readFileSync(this.newsPath(), 'utf8')); } catch { return []; } } },

  // modération
  kick: { level: 1, post: true, label: 'Expulsion', fn({ body, lvl, user }) {
    const c = this.findClient(body.id);
    if (c.account) this.guard(lvl, this.findUser(c.account), null);
    const reason = str(body.reason, 200);
    if (c.account) this.sanction(c.account, 'kick', `Expulsé${reason ? ' — ' + reason : ''}`, user.name);
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
    for (const [type, value] of targets) if (type === 'account') this.sanction(value, 'ban', `Banni ${minutes ? `${minutes} min` : 'définitivement'} — ${reason}`, user.name);
    this.discord('ban', null, { title: `${label} banni`, description: `> ${reason}`,
      fields: [{ name: 'Durée', value: minutes ? `${minutes} min · fin <t:${Math.round(Date.now() / 1000 + minutes * 60)}:R>` : '**Définitif**', inline: true }, { name: 'Par', value: user.name, inline: true }] });
    return { _detail: `${label} — ${minutes ? minutes + ' min' : 'définitif'} — ${reason}` };
  } },
  unban: { level: 1, post: true, label: 'Débannissement', fn({ body, user }) {
    const b = this.state.bans.find(x => x.id === body.id); if (!b) fail('Ban introuvable', 404);
    if (b.type === 'account') this.sanction(b.value, 'unban', 'Ban levé', user.name);
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
    if (!key.startsWith('guest:')) this.sanction(key, 'mute', `Silence ${minutes ? `${minutes} min` : 'définitif'} — ${reason}`, user.name);
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
  // ---------- blagues de l'administrateur (1.15) : effets visuels limités dans le temps, journalisés ----------
  troll: { level: 2, post: true, label: 'Blague', fn({ body, user, lvl }) {
    const cfg = this.state.config;
    if (cfg.trollsOn === false) fail('Les blagues sont désactivées (Configuration → Blagues et événements).');
    const kind = String(body.kind || '');
    if (kind !== 'stop' && !TROLLS[kind]) fail('Blague inconnue');
    const secs = Math.max(3, Math.min(cfg.trollMax || 30, Math.round(Number(body.seconds) || 10)));
    const A = this.ctx.accounts;
    let targets;
    if (body.room) {
      // toute une partie : tous les joueurs humains du salon
      const r = this.ctx.rooms.get(String(body.room)); if (!r || !r.match) fail('Ce salon n\'a pas de partie en cours.');
      targets = [...r.members.values()].filter(m => !m.isBot).map(m => this.ctx.clients.get(m.id)).filter(Boolean);
    } else if (body.self) {
      // tester sur soi-même : la session de jeu ouverte avec ce compte
      const c = this.clientsOf(A.key(user.name)).find(x => x.name); if (!c) fail('Ouvre le jeu avec ton compte pour tester une blague sur toi.');
      targets = [c];
    } else {
      const c = this.findClient(body.id);
      if (c.account) this.guard(lvl, this.findUser(c.account), user);
      targets = [c];
    }
    let done = 0;
    for (const c of targets) {
      const r = c.roomId && this.ctx.rooms.get(c.roomId);
      // pas de blague pendant un tournoi ni un duel classé (Elo) : la compétition reste équitable
      if (kind !== 'stop' && r && (r.tournament || (r.mode === 'duel' && r.match && [...r.members.values()].filter(m => !m.isBot && this.ctx.clients.get(m.id)?.account).length >= 2))) continue;
      const s = TROLLS[kind]?.max ? Math.min(TROLLS[kind].max, secs) : secs;
      this.ctx.send(c.id, { type: 'troll', kind, s, by: user.name });
      // effets visibles par tous les joueurs de la partie (grosse tête, minuscule, confettis, danse, coin-coin)
      if (r?.match && (kind === 'stop' || TROLLS[kind]?.all)) r.match.broadcast({ type: 'trollFx', kind, i: c.id, s });
      if (kind === 'freeze' && r?.match) { const p = r.match.players.get(c.id); if (p) p.trollFreeze = r.match.time + s; }
      done++;
    }
    if (!done) fail('Impossible ici (tournoi ou duel classé) : aucune blague envoyée.');
    const label = kind === 'stop' ? 'Arrêt des blagues' : TROLLS[kind].name;
    const who = body.room ? `toute la partie (${done} joueur${done > 1 ? 's' : ''})` : targets[0].name;
    this.state.trollLog.unshift({ t: Date.now(), by: user.name, target: who, kind, label, s: kind === 'stop' ? 0 : secs });
    if (this.state.trollLog.length > 100) this.state.trollLog.length = 100;
    this.save();
    return { ok: true, sent: done, _detail: `${label} → ${who}${kind === 'stop' ? '' : ` (${secs} s)`}` };
  } },
  trollLog: { level: 2, fn() { return { log: this.state.trollLog.slice(0, 50), kinds: Object.entries(TROLLS).map(([k, v]) => ({ k, name: v.name, all: !!v.all, max: v.max || null })), max: this.state.config.trollMax || 30, on: this.state.config.trollsOn !== false }; } },
  // titre personnalisé affiché à la place du titre débloqué (vide = retirer)
  customTitle: { level: 2, post: true, label: 'Titre personnalisé', fn({ body, user, lvl }) {
    const u = this.findUser(body.name); this.guard(lvl, u, user);
    const t = str(body.title, 24);
    if (t && this.filterText(t).hits.length) fail('Ce titre contient un mot interdit.');
    if (t) u.customTitle = t; else delete u.customTitle;
    this.ctx.accounts.save();
    for (const c of this.clientsOf(this.ctx.accounts.key(u.name))) this.ctx.send(c.id, { type: 'profile', profile: this.ctx.accounts.publicProfile(u) });
    return { ok: true, _detail: `${u.name} : ${t || '(retiré)'}` };
  } },
  // retours des joueurs : bugs et idées
  feedback: { level: 1, fn() { return { items: this.state.feedback.slice(0, 200) }; } },
  feedbackDone: { level: 1, post: true, label: 'Retour traité', fn({ body }) {
    const f = this.state.feedback.find(x => x.id === body.id); if (!f) fail('Introuvable', 404);
    if (body.remove) this.state.feedback = this.state.feedback.filter(x => x !== f); else f.done = !f.done;
    this.save(); return { ok: true, _detail: `${f.kind === 'bug' ? 'Bug' : 'Idée'} de ${f.name}` };
  } },
  // sondage du jour : création, clôture, résultats
  polls: { level: 2, fn() { return { poll: this.pollView(this.state.poll), history: this.state.pollsHistory.slice(0, 20) }; } },
  pollCreate: { level: 2, post: true, label: 'Sondage créé', fn({ body, user }) {
    const q = str(body.question, 140); const opts = (Array.isArray(body.options) ? body.options : []).map(o => str(o, 60)).filter(Boolean).slice(0, 4);
    if (q.length < 5 || opts.length < 2) fail('Une question et au moins 2 réponses.');
    if (this.state.poll) this.closePoll();
    this.state.poll = { id: crypto.randomUUID().slice(0, 8), q, opts, votes: {}, created: Date.now(), by: user.name };
    this.save(); this.ctx.onPoll?.();
    return { ok: true, _detail: q };
  } },
  pollClose: { level: 2, post: true, label: 'Sondage clos', fn() { if (!this.state.poll) fail('Aucun sondage en cours.'); const q = this.state.poll.q; this.closePoll(); this.ctx.onPoll?.(); return { ok: true, _detail: q }; } },
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
  // 1.19 : collection offerte, tenues débloquées, quêtes renouvelées
  'account/giveSet': { level: 2, post: true, label: 'Collection offerte', fn({ body }) {
    const u = this.findUser(body.name);
    const ids = SKINS.filter(s => s.set === body.set).map(s => s.id); if (!ids.length) fail('Collection inconnue');
    for (const id of ids) if (!u.owned.includes(id)) u.owned.push(id);
    this.ctx.accounts.save(); this.notifyProfile(u);
    return { _detail: `${u.name} — ${body.set}` };
  } },
  'account/outfitsAll': { level: 2, post: true, label: 'Tenues débloquées', fn({ body }) {
    const u = this.findUser(body.name); u.outfitsAll = !u.outfitsAll; this.ctx.accounts.save(); this.notifyProfile(u);
    return { on: u.outfitsAll, _detail: `${u.name} — ${u.outfitsAll ? 'oui' : 'non'}` };
  } },
  'account/resetQuests': { level: 2, post: true, label: 'Quêtes renouvelées', fn({ body }) {
    const u = this.findUser(body.name); u.quests = null; this.ctx.accounts.save(); this.notifyProfile(u);
    return { _detail: u.name };
  } },
  questsResetAll: { level: 3, post: true, label: 'Nouvelles quêtes pour tous', fn() {
    let n = 0; for (const u of Object.values(this.ctx.accounts.data.users)) if (u) { u.quests = null; n++; }
    this.ctx.accounts.save();
    return { n, _detail: `${n} compte(s)` };
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
    this.ctx.clans?.onAccountDeleted(key);
    this.ctx.tournaments?.onAccountDeleted(key);
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
    if (!m || isFfa(m.mode) || !['buy', 'live', 'planted'].includes(m.phase)) fail('Aucune manche à annuler.');
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
      let k = 0; for (const m of r.members.values()) m.team = isFfa(r.mode) ? 'ffa' : (k++ % 2 ? 'beta' : 'alpha');
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
  'discord/test': { level: 2, post: true, label: 'Test du webhook Discord', fn({ user }) {
    if (!this.state.config.discordWebhook) fail('Aucun webhook configuré.');
    this.discord('test', `✅ Test des alertes ECLIPSE envoyé par ${user.name}.`);
    return {};
  } },
  'config/save': { level: 2, post: true, label: 'Configuration modifiée', fn({ body, user }) {
    const cfg = this.state.config, patch = body.patch || {};
    const changed = [];
    for (const [k, rule] of Object.entries(CONFIG_RULES)) {
      if (!(k in patch)) continue;
      let v = patch[k];
      if (rule === 'bool') v = !!v;
      else if (rule[0] === 'str') v = str(v, rule[1]);
      if (k === 'discordWebhook' && v && !DISCORD_RE.test(v)) fail('Adresse de webhook invalide : elle doit commencer par https://discord.com/api/webhooks/');
      if (rule === 'bool' || rule[0] === 'str') { /* déjà traité */ }
      else { v = Number(v); if (!Number.isFinite(v)) fail(`Valeur invalide pour ${k}`); v = Math.max(rule[0], Math.min(rule[1], DECIMAL.has(k) ? Math.round(v * 10) / 10 : Math.round(v))); }
      if (cfg[k] !== v) { this.recordConfig(user.name, k, cfg[k], v); cfg[k] = v; changed.push(k); }
    }
    if (patch.weapons && typeof patch.weapons === 'object') {
      for (const [id, o] of Object.entries(patch.weapons)) {
        if (!WEAPON_DEFAULTS[id] || typeof o !== 'object') continue;
        const d = o.reset ? null : { damage: int(o.damage ?? WEAPONS[id].damage, 1, 300), headMul: Math.max(1, Math.min(6, Math.round(Number(o.headMul ?? WEAPONS[id].headMul) * 10) / 10)) };
        const before = cfg.weapons[id] ? `${cfg.weapons[id].damage} / x${cfg.weapons[id].headMul}` : 'par défaut';
        if (d) cfg.weapons[id] = d; else delete cfg.weapons[id];
        const after = d ? `${d.damage} / x${d.headMul}` : 'par défaut';
        if (before !== after) { this.state.configHistory.unshift({ id: crypto.randomUUID(), t: Date.now(), by: user.name, key: 'arme:' + id, label: `Arme ${WEAPONS[id].name} (dégâts / tête)`, old: before, new: after, revertable: false }); this.state.configHistory.length = Math.min(200, this.state.configHistory.length); }
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
  restart: { level: 3, post: true, label: 'Redémarrage du serveur', fn({ user }) {
    this.doRestart(`Redémarrage immédiat demandé par ${user.name}`);
    return { ok: true };
  } },
  // ---------- métriques ----------
  metrics: { level: 1, fn() {
    const online = this.onlineClients();
    const pings = online.map(c => ({ name: c.name, ping: c.ping || 0, room: this.ctx.rooms.get(c.roomId)?.name || '' })).sort((a, b) => b.ping - a.ping);
    const vals = pings.map(p => p.ping).filter(Boolean);
    const t = this.ticks.length ? this.ticks : [0];
    const cc = new Map();
    for (const c of online) { const k = c.country || '??'; const e = cc.get(k) || { country: k, players: 0, sum: 0, n: 0 }; e.players++; if (c.ping > 0) { e.sum += c.ping; e.n++; } cc.set(k, e); }
    const byCountry = [...cc.values()].map(e => ({ country: e.country, players: e.players, avgPing: e.n ? Math.round(e.sum / e.n) : 0 })).sort((a, b) => b.players - a.players);
    return {
      byCountry, clientErrors: this.clientErrors.slice(0, 50),
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
    this.sanction(this.ctx.accounts.key(u.name), 'warn', `Avertissement n°${u.warnings} — ${reason}`, user.name);
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
      const live = s.account ? this.clientsOf(s.account)[0] : null;
      const inMatch = live && live.roomId && this.ctx.rooms.get(live.roomId)?.match ? live.id : null;
      return { key, ...s, reports, banned: !!(s.account && this.activeBan('account', s.account)), online: !!live, cid: inMatch,
        kd: u ? (u.stats.deaths ? Math.round(u.stats.kills / u.stats.deaths * 100) / 100 : u.stats.kills) : null,
        hs: u && u.stats.kills ? Math.round((u.stats.hsKills || 0) / u.stats.kills * 100) : null, acc: u && u.stats.shots ? Math.round(u.stats.hits / u.stats.shots * 100) : null };
    }).sort((a, b) => b.last - a.last);
  } },
  'suspect/clear': { level: 1, post: true, label: 'Alertes anti-triche effacées', fn({ body }) {
    const s = this.state.suspects[body.key]; if (!s) fail('Introuvable', 404);
    delete this.state.suspects[body.key]; this.save(); return { _detail: s.name };
  } },

  // ---------- anti-triche ----------
  'anticheat/toggle': { level: 2, post: true, label: 'Anti-triche', fn({ body, user }) {
    const on = body.on === undefined ? this.state.config.anticheat === false : !!body.on;
    this.state.config.anticheat = on; this.save();
    this.log('securite', `Anti-triche ${on ? 'RÉACTIVÉ' : 'DÉSACTIVÉ'} par ${user.name}`);
    this.discord?.('cheat', `🛡️ Anti-triche **${on ? 'réactivé' : 'désactivé'}** par ${user.name}`);
    return { on, _detail: on ? 'réactivé' : 'désactivé' };
  } },

  // ---------- lot A : historique de configuration, permissions, sanctions, santé, sauvegardes, maintenance ----------
  'config/history': { level: 2, fn() { return this.state.configHistory; } },
  'config/revert': { level: 2, post: true, label: 'Configuration restaurée', fn({ body, user, lvl, q, ip }) {
    const h = this.state.configHistory.find(x => x.id === body.id); if (!h) fail('Modification introuvable', 404);
    if (!h.revertable || !(h.key in CONFIG_RULES)) fail('Cette modification ne peut pas être annulée automatiquement.');
    ACTIONS['config/save'].fn.call(this, { body: { patch: { [h.key]: h.old } }, user, lvl, q, ip });
    return { config: this.state.config, _detail: `${h.label} : ${h.new} → ${h.old}` };
  } },
  permissions: { level: 1, fn() {
    const rows = Object.entries(ACTIONS).filter(([, d]) => d.post || d.label).map(([id, d]) => ({ id, label: d.label || id, level: d.level }));
    return { roles: [{ id: 'mod', label: 'Modérateur', level: 1 }, { id: 'admin', label: 'Administrateur', level: 2 }, { id: 'owner', label: 'Propriétaire', level: 3 }], actions: rows.sort((a, b) => a.level - b.level || a.label.localeCompare(b.label, 'fr')) };
  } },
  'sanction/undo': { level: 1, post: true, label: 'Sanction annulée', fn({ body, user, lvl }) {
    const u = this.findUser(body.name); ensureUser(u); this.guard(lvl, u, null);
    const key = this.ctx.accounts.key(u.name), type = String(body.type);
    if (type === 'ban') {
      const b = this.activeBan('account', key); if (!b) fail('Ce compte n\'est pas banni.');
      if (lvl < 2 && !b.until) fail('Seul un administrateur peut lever un ban définitif.', 403);
      this.state.bans = this.state.bans.filter(x => x !== b);
    } else if (type === 'mute') {
      const before = this.state.mutes.length; this.state.mutes = this.state.mutes.filter(m => m.key !== key);
      if (before === this.state.mutes.length) fail('Ce compte n\'est pas réduit au silence.');
      for (const c of this.clientsOf(key)) this.ctx.send(c.id, { type: 'system', kind: 'notice', text: 'Tu peux de nouveau écrire dans le chat.' });
    } else if (type === 'warn') {
      if (!u.warnings) fail('Ce compte n\'a aucun avertissement.');
      u.warnings--;
    } else fail('Type de sanction inconnu');
    this.save();
    this.sanction(key, 'undo', `${{ ban: 'Ban levé', mute: 'Silence levé', warn: 'Dernier avertissement retiré' }[type]}${body.reason ? ' — ' + str(body.reason, 160) : ''}`, user.name);
    return { warnings: u.warnings || 0, _detail: `${u.name} — ${type}` };
  } },
  'export/bans': { level: 2, fn({ res }) {
    const head = ['type', 'cible', 'raison', 'par', 'le', 'jusqu_au'];
    const csv = [head.join(';'), ...this.state.bans.map(b => [b.type === 'ip' ? 'IP' : 'compte', b.type === 'ip' ? maskIp(b.value) : b.label, b.reason, b.by, new Date(b.at).toISOString(), b.until ? new Date(b.until).toISOString() : 'définitif'].map(csvCell).join(';'))].join('\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="eclipse-bans.csv"', 'Cache-Control': 'no-store' });
    res.end('\ufeff' + csv); return RAW;
  } },
  'export/reports': { level: 2, fn({ res }) {
    const head = ['le', 'auteur', 'cible', 'motif', 'detail', 'salon', 'traite'];
    const csv = [head.join(';'), ...this.state.reports.map(r => [new Date(r.t).toISOString(), r.from, r.target, REPORT_REASONS[r.category] || r.category, r.reason, r.room, r.resolved ? 'oui' : 'non'].map(csvCell).join(';'))].join('\n');
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="eclipse-signalements.csv"', 'Cache-Control': 'no-store' });
    res.end('\ufeff' + csv); return RAW;
  } },
  health: { level: 1, fn() {
    const checks = [], add = (name, state, detail) => checks.push({ name, state, detail });
    try { const f = path.join(this.ctx.dataDir, '.sante'); fs.writeFileSync(f, String(Date.now())); fs.unlinkSync(f); add('Écriture des données', 'ok', this.ctx.dataDir.startsWith('/') ? 'dossier de données accessible' : 'ok'); }
    catch (e) { add('Écriture des données', 'bad', 'impossible d\'écrire : ' + e.code); }
    try { const s = fs.statfsSync(this.ctx.dataDir); const free = s.bavail * s.bsize, pct = free / (s.blocks * s.bsize) * 100; add('Espace disque', pct < 5 ? 'bad' : pct < 15 ? 'warn' : 'ok', `${Math.round(free / 1073741824 * 10) / 10} Go libres (${Math.round(pct)} %)`); }
    catch { add('Espace disque', 'warn', 'mesure indisponible'); }
    const memPct = Math.round(process.memoryUsage().rss / os.totalmem() * 100);
    add('Mémoire du serveur', memPct > 85 ? 'bad' : memPct > 60 ? 'warn' : 'ok', `${Math.round(process.memoryUsage().rss / 1048576)} Mo (${memPct} % de la machine)`);
    const t = this.ticks.length ? this.ticks : [0], avg = t.reduce((a, b) => a + b, 0) / t.length;
    add('Vitesse du jeu', avg > this.state.config.perfTickMs ? 'bad' : avg > this.state.config.perfTickMs / 2 ? 'warn' : 'ok', `${Math.round(avg * 100) / 100} ms par image de jeu (seuil ${this.state.config.perfTickMs} ms)`);
    const errH = this.errors.filter(e => Date.now() - e.t < 3600000).length;
    add('Erreurs (1 h)', errH > 20 ? 'bad' : errH ? 'warn' : 'ok', `${errH} erreur(s) serveur, ${this.clientErrors.filter(e => Date.now() - e.t < 3600000).length} dans les navigateurs`);
    add('Fichiers vérifiés', this.ctx.verified ? 'ok' : 'warn', this.ctx.verified ? `${this.ctx.verified()} fichiers servis depuis la mémoire` : 'mode protégé désactivé');
    const lb = this.state.lastBackup;
    add('Sauvegarde', !this.state.config.autoBackup ? 'warn' : lb && Date.now() - lb < 2 * 86400000 ? 'ok' : 'bad', !this.state.config.autoBackup ? 'sauvegarde automatique désactivée' : lb ? `dernière le ${new Date(lb).toLocaleString('fr-FR')}` : 'aucune sauvegarde');
    add('Alertes Discord', this.state.config.discordWebhook ? 'ok' : 'warn', this.state.config.discordWebhook ? 'webhook configuré' : 'aucun webhook');
    add('Anti-triche', this.state.config.anticheat ? 'ok' : 'warn', this.state.config.anticheat ? 'actif' : 'désactivé');
    add('Démarré depuis', 'ok', `${Math.floor(process.uptime() / 3600)} h ${Math.floor(process.uptime() % 3600 / 60)} min (version ${this.ctx.version})`);
    return { checks, overall: checks.some(c => c.state === 'bad') ? 'bad' : checks.some(c => c.state === 'warn') ? 'warn' : 'ok' };
  } },
  // ---- mise à jour à distance (1.18) ----
  // le jeu (sans droits) dépose une demande dans son dossier de données ; un service root sur le serveur
  // (installé par scripts/installer-maj-auto.sh) la voit, lance la mise à jour et publie son état
  updStatus: { level: 2, fn() { return this.updInfo(); } },
  // ---- connecteur Claude (MCP, 1.22) ----
  'mcp/status': { level: 3, fn() { return this.mcp ? this.mcp.info() : { enabled: false }; } },
  'mcp/generate': { level: 3, post: true, label: 'Adresse du connecteur Claude générée', fn({ user }) { if (!this.mcp) fail('Connecteur indisponible.'); return { token: this.mcp.generate(user.name) }; } },
  'mcp/disable': { level: 3, post: true, label: 'Connecteur Claude désactivé', fn() { this.mcp?.disable(); return { ok: true }; } },
  updRequest: { level: 3, post: true, label: 'Mise à jour à distance demandée', fn({ body, user }) {
    const info = this.updInfo();
    if (!info.installed) fail('Le service de mise à jour à distance n\'est pas installé sur le serveur (voir les instructions sous le bouton).');
    if (info.pending) fail('Une demande de mise à jour est déjà en attente.');
    const dir = path.join(this.ctx.dataDir, 'maj');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'demande'), JSON.stringify({ at: Date.now(), by: user.name, force: !!body.force }));
    this.log('admin', `${user.name} demande une mise à jour à distance${body.force ? ' (forcée)' : ''}`);
    return { ok: true, _detail: body.force ? 'forcée' : '' };
  } },
  backups: { level: 3, fn() { return { list: this.listBackups(), last: this.state.lastBackup || 0, keep: this.state.config.backupKeep, auto: this.state.config.autoBackup }; } },
  'backup/now': { level: 3, post: true, label: 'Sauvegarde manuelle', fn() {
    const d = new Date(); const b = this.writeBackup(`${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`);
    return { ...b, _detail: b.name };
  } },
  'backup/get': { level: 3, fn({ q, res, user }) {
    const name = String(q.get('name') || ''); if (!BACKUP_RE.test(name)) fail('Nom de sauvegarde invalide');
    let data; try { data = fs.readFileSync(path.join(this.backupDir(), name)); } catch { fail('Sauvegarde introuvable', 404); }
    this.audit(user.name, 'Sauvegarde téléchargée', name);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' });
    res.end(data); return RAW;
  } },
  'restart/whenEmpty': { level: 3, post: true, label: 'Redémarrage programmé (quand plus personne ne joue)', fn({ user }) {
    this.pendingRestart = { by: user.name, at: Date.now() };
    this.staffNotice(`${user.name} a programmé un redémarrage : il aura lieu dès que plus aucune partie n'est en cours.`);
    if (!this.anyMatch()) this.doRestart(`Redémarrage programmé par ${user.name} (aucune partie en cours)`);
    return { now: !this.anyMatch(), _detail: user.name };
  } },
  'restart/cancel': { level: 3, post: true, label: 'Redémarrage programmé annulé', fn() {
    if (!this.pendingRestart || this.restarting) fail('Aucun redémarrage en attente.');
    this.pendingRestart = null; return {};
  } },
  'maintenance/schedule': { level: 2, post: true, label: 'Maintenance programmée', fn({ body, user }) {
    const minutes = int(body.minutes ?? 10, 1, 1440);
    this.state.maintSchedule = { at: Date.now() + minutes * 60000, msg: str(body.message, 200), by: user.name, warned: [] };
    // les rappels déjà dépassés ne sont pas envoyés en rafale
    for (const w of [10, 5, 1]) if (minutes < w) this.state.maintSchedule.warned.push(w);
    this.save();
    for (const c of this.onlineClients()) this.ctx.send(c.id, { type: 'system', kind: 'broadcast', from: 'SERVEUR', text: `Maintenance prévue dans ${minutes} minute${minutes > 1 ? 's' : ''}${this.state.maintSchedule.msg ? ' : ' + this.state.maintSchedule.msg : ''}.` });
    return { at: this.state.maintSchedule.at, _detail: `dans ${minutes} min` };
  } },
  'maintenance/cancel': { level: 2, post: true, label: 'Maintenance programmée annulée', fn() {
    if (!this.state.maintSchedule) fail('Aucune maintenance programmée.');
    this.state.maintSchedule = null; this.save();
    for (const c of this.onlineClients()) this.ctx.send(c.id, { type: 'system', kind: 'broadcast', from: 'SERVEUR', text: 'La maintenance prévue est annulée. Bon jeu !' });
    return {};
  } },

  // ---------- tournois ----------
  tournaments: { level: 1, fn() { return { list: this.ctx.tournaments.adminList() }; } },
  'tournament/create': { level: 2, post: true, label: 'Tournoi créé', fn({ body, user }) {
    let t; try { t = this.ctx.tournaments.create(body, user.name); } catch (e) { fail(e.message); }
    return { id: t.id, _detail: t.name };
  } },
  'tournament/start': { level: 2, post: true, label: 'Tournoi lancé', fn({ body, user }) {
    const t = this.ctx.tournaments.get(String(body.id || '')); if (!t) fail('Tournoi introuvable', 404);
    try { this.ctx.tournaments.start(t, user.name); } catch (e) { fail(e.message); }
    return { _detail: t.name };
  } },
  'tournament/cancel': { level: 2, post: true, label: 'Tournoi annulé', fn({ body, user }) {
    const t = this.ctx.tournaments.get(String(body.id || '')); if (!t) fail('Tournoi introuvable', 404);
    this.ctx.tournaments.cancel(t, `par ${user.name}`); return { _detail: t.name };
  } },
  'tournament/winner': { level: 1, post: true, label: 'Match de tournoi arbitré', fn({ body, user }) {
    const t = this.ctx.tournaments.get(String(body.id || '')); if (!t) fail('Tournoi introuvable', 404);
    try { this.ctx.tournaments.setWinner(t, body.match, body.name, user.name); } catch (e) { fail(e.message); }
    return { _detail: `${t.name} · ${body.match} → ${body.name}` };
  } },
  'tournament/delete': { level: 2, post: true, label: 'Tournoi supprimé', fn({ body }) {
    const t = this.ctx.tournaments.get(String(body.id || '')); if (!t) fail('Tournoi introuvable', 404);
    try { this.ctx.tournaments.remove(t); } catch (e) { fail(e.message); }
    return { _detail: t.name };
  } },

  // ---------- clans ----------
  clans: { level: 1, fn() { return { clans: this.ctx.clans ? this.ctx.clans.adminList() : [] }; } },
  'clan/disband': { level: 1, post: true, label: 'Clan dissous', fn({ body, user }) {
    if (!this.ctx.clans?.adminDisband(String(body.tag || ''), `la modération (${user.name})`)) fail('Clan introuvable', 404);
    return { _detail: String(body.tag).toUpperCase() };
  } },
  'clan/kick': { level: 1, post: true, label: 'Membre retiré d\'un clan', fn({ body }) {
    if (!this.ctx.clans?.adminKick(String(body.tag || ''), String(body.name || ''))) fail('Clan ou membre introuvable', 404);
    return { _detail: `${body.name} de [${String(body.tag).toUpperCase()}]` };
  } },
  'clan/rename': { level: 1, post: true, label: 'Clan renommé', fn({ body }) {
    if (!this.ctx.clans?.adminRename(String(body.tag || ''), String(body.name || ''))) fail('Clan introuvable ou nom invalide (3 à 24 caractères)');
    return { _detail: `[${String(body.tag).toUpperCase()}] → ${body.name}` };
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
