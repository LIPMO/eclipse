// Comptes joueurs : inscription / connexion, mots de passe hachés (scrypt),
// jetons de session (stockés hachés), profil persistant (Éclats, skins, statistiques).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SKINS, SKINNABLE, AGENTS } from '../shared/data.js';
import { sha256, COMMON_PASSWORDS } from './security.js';
import { ensureUser, privateProgress, applyMatch, isLevelSkin } from './progression.js';

export const NAME_RE = /^[A-Za-z0-9_\-]{3,16}$/;
// pseudos interdits : noms réservés au système et clés spéciales de JavaScript
const RESERVED = /^(__proto__|constructor|prototype|hasownproperty|tostring|valueof|admin|administrateur|administrator|moderateur|moderator|modo|staff|system|systeme|serveur|server|root|bot|eclipse|support|undefined|null)$/i;
const START_ECLATS = 600;
const SESSION_DAYS = 30;
const MAX_SESSIONS = 5;

const dict = obj => Object.assign(Object.create(null), obj || {});
const has = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

export class Accounts {
  constructor(dir) {
    this.file = path.join(dir, 'accounts.json');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* premier lancement */ }
    // objets sans prototype : un pseudo comme « __proto__ » ne peut rien corrompre
    this.data = { users: dict(raw.users), sessions: dict(raw.sessions), sessionsHashed: !!raw.sessionsHashed };
    if (!this.data.sessionsHashed) {
      // ancienne version : les jetons étaient en clair. Par sécurité, toutes les sessions sont invalidées
      // (chaque joueur se reconnecte une fois avec son mot de passe).
      this.data.sessions = dict();
      this.data.sessionsHashed = true;
      this.sessionsReset = true;
    }
    this.saveTimer = null;
    const now = Date.now();
    for (const [t, s] of Object.entries(this.data.sessions)) if (!s || s.exp < now) delete this.data.sessions[t];
    // comptes antérieurs à la 1.5 : ajout des champs de progression
    for (const u of Object.values(this.data.users)) if (u && typeof u === 'object') ensureUser(u);
    this.questOverrides = {};
    if (this.sessionsReset) this.flush();
  }

  save() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      const tmp = this.file + '.tmp';
      fs.writeFile(tmp, JSON.stringify(this.data), { mode: 0o600 }, err => { if (!err) fs.rename(tmp, this.file, () => {}); });
    }, 300);
  }

  flush() {
    clearTimeout(this.saveTimer);
    try { fs.writeFileSync(this.file, JSON.stringify(this.data), { mode: 0o600 }); } catch (e) { console.error('Sauvegarde des comptes impossible', e); }
  }

  key(name) { return String(name ?? '').toLowerCase(); }
  exists(name) { return has(this.data.users, this.key(name)); }
  get(name) { const k = this.key(name); return has(this.data.users, k) ? this.data.users[k] : null; }

  hash(password, salt) { return crypto.scryptSync(password, salt, 64).toString('hex'); }

  newSession(user) {
    const token = crypto.randomBytes(32).toString('hex');
    const key = this.key(user.name);
    // au plus MAX_SESSIONS appareils connectés : les plus anciens sont déconnectés
    const mine = Object.entries(this.data.sessions).filter(([, s]) => s.user === key).sort((a, b) => a[1].exp - b[1].exp);
    while (mine.length >= MAX_SESSIONS) delete this.data.sessions[mine.shift()[0]];
    this.data.sessions[sha256(token)] = { user: key, exp: Date.now() + SESSION_DAYS * 86400e3 };
    this.save();
    return token;
  }

  validName(name) {
    if (!NAME_RE.test(name)) return 'Pseudo invalide : 3 à 16 caractères (lettres, chiffres, _ ou -).';
    if (RESERVED.test(name)) return 'Ce pseudo est réservé, choisis-en un autre.';
    // mots interdits dans les pseudos (liste gérée dans le panneau d'administration)
    const low = name.toLowerCase();
    if ((this.bannedNameWords || []).some(w => w && low.includes(w))) return 'Ce pseudo contient un mot interdit, choisis-en un autre.';
    return null;
  }

  checkPassword(name, password) {
    if (password.length < 8 || password.length > 72) return 'Le mot de passe doit faire entre 8 et 72 caractères.';
    if (COMMON_PASSWORDS.has(password.toLowerCase()) || password.toLowerCase().includes(name.toLowerCase()) || /^(.)\1+$/.test(password)) {
      return 'Mot de passe trop facile à deviner : évite ton pseudo et les suites courantes.';
    }
    return null;
  }

  // changement de mot de passe par le joueur : toutes les autres sessions sont révoquées
  changePassword(u, oldPass, newPass) {
    if (typeof oldPass !== 'string' || typeof newPass !== 'string' || oldPass.length > 200) return { error: 'Mot de passe actuel incorrect.' };
    const h = Buffer.from(this.hash(oldPass, u.salt), 'hex'), ref = Buffer.from(u.hash, 'hex');
    if (h.length !== ref.length || !crypto.timingSafeEqual(h, ref)) return { error: 'Mot de passe actuel incorrect.' };
    if (oldPass === newPass) return { error: 'Le nouveau mot de passe doit être différent.' };
    const bad = this.checkPassword(u.name, newPass);
    if (bad) return { error: bad };
    u.salt = crypto.randomBytes(16).toString('hex');
    u.hash = this.hash(newPass, u.salt);
    this.revokeAll(this.key(u.name));
    return { token: this.newSession(u) };
  }

  revokeAll(key) {
    let n = 0;
    for (const [t, v] of Object.entries(this.data.sessions)) if (v.user === key) { delete this.data.sessions[t]; n++; }
    this.save();
    return n;
  }

  // dernière connexion et historique des adresses IP (visible par les administrateurs)
  touch(u, ip) {
    u.lastSeen = Date.now();
    if (ip) { u.ips = (u.ips || []).filter(x => x.ip !== ip); u.ips.unshift({ ip, t: Date.now() }); if (u.ips.length > 8) u.ips.length = 8; }
    this.save();
  }

  register(name, password) {
    name = String(name || '').trim();
    password = String(password || '');
    const bad = this.validName(name);
    if (bad) return { error: bad };
    const weak = this.checkPassword(name, password);
    if (weak) return { error: weak };
    if (this.exists(name)) return { error: 'Ce pseudo est déjà pris.' };
    const salt = crypto.randomBytes(16).toString('hex');
    const user = {
      name, salt, hash: this.hash(password, salt), created: Date.now(),
      eclats: this.startEclats ?? START_ECLATS, owned: ['default'], equipped: Object.fromEntries(SKINNABLE.map(w => [w, 'default'])), agent: 'ignis',
      stats: { matches: 0, wins: 0, kills: 0, deaths: 0, duels: 0, duelWins: 0 }, xp: 0,
    };
    ensureUser(user);
    this.data.users[this.key(name)] = user;
    return { user, token: this.newSession(user) };
  }

  login(name, password) {
    const fail = { error: 'Pseudo ou mot de passe incorrect.' };
    if (typeof name !== 'string' || typeof password !== 'string' || password.length > 200) return fail;
    const user = this.get(name);
    if (!user || typeof user.salt !== 'string' || typeof user.hash !== 'string') { this.hash(password || 'x', 'dummysalt-constant'); return fail; }
    const h = Buffer.from(this.hash(password, user.salt), 'hex');
    const ref = Buffer.from(user.hash, 'hex');
    if (h.length !== ref.length || !crypto.timingSafeEqual(h, ref)) return fail;
    return { user, token: this.newSession(user) };
  }

  resume(token) {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
    const k = sha256(token);
    const s = has(this.data.sessions, k) ? this.data.sessions[k] : null;
    if (!s || s.exp < Date.now()) return null;
    return has(this.data.users, s.user) ? this.data.users[s.user] : null;
  }

  logout(token) {
    if (typeof token !== 'string') return;
    delete this.data.sessions[sha256(token)];
    this.save();
  }

  publicProfile(u) {
    return { name: u.name, eclats: u.eclats, owned: u.owned, equipped: u.equipped, agent: u.agent, stats: u.stats, progress: privateProgress(u, this.questOverrides) };
  }

  buySkin(u, skinId) {
    const skin = SKINS.find(s => s.id === skinId);
    if (!skin) return 'Skin inconnu.';
    if (u.owned.includes(skinId)) return null;
    if (isLevelSkin(skinId)) return `Ce skin se débloque au niveau ${skin.level}.`;
    if (u.eclats < skin.price) return 'Pas assez d\'Éclats.';
    u.eclats -= skin.price; u.owned.push(skinId); this.save();
    if (this.onPurchase) this.onPurchase(skin);
    return null;
  }

  equip(u, weapon, skinId) {
    if (!SKINNABLE.includes(weapon) || !u.owned.includes(skinId)) return 'Skin non possédé.';
    u.equipped[weapon] = skinId; this.save();
    return null;
  }

  setAgent(u, agent) { if (Object.prototype.hasOwnProperty.call(AGENTS, agent)) { u.agent = agent; this.save(); } }

  applyResult(u, r, opts) {
    const out = applyMatch(u, r, { ...opts, overrides: this.questOverrides });
    this.save();
    return out;
  }
}
