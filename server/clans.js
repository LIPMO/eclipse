// Clans : création, invitations, rôles (chef, officier, membre), chat de clan, classement des clans.
// Les clans sont enregistrés avec les comptes (accounts.json → clans) ; chaque compte membre a u.clan = clé du clan.
import { levelOf } from '../shared/progress.js';

export const CLAN = { maxMembers: 30, maxInvites: 40, minLevel: 3, tagRe: /^[A-Z0-9]{2,5}$/, nameMin: 3, nameMax: 24 };
const ROLE_LABEL = { owner: 'Chef', officer: 'Officier', member: 'Membre' };
const clean = (s, n) => (typeof s === 'string' ? s : typeof s === 'number' ? String(s) : '').normalize('NFKC').replace(/[<>"'`\\\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const RESERVED_TAGS = /^(ADMIN|ADM|MOD|MODO|STAFF|ECL|ECLIP|BOT|SYS|ROOT)$/;

export class Clans {
  constructor(ctx) {
    this.ctx = ctx; // { accounts, clients, send, admin, chatLimit, social }
    const d = this.A.data;
    if (!d.clans || typeof d.clans !== 'object') d.clans = Object.create(null);
    else d.clans = Object.assign(Object.create(null), d.clans);
    // cohérence au démarrage : un compte ne pointe que vers un clan existant dont il est membre
    for (const u of Object.values(d.users)) {
      if (!u || !u.clan) continue;
      const cl = d.clans[u.clan];
      if (!cl || !cl.members.includes(this.A.key(u.name))) delete u.clan;
    }
    for (const [k, cl] of Object.entries(d.clans)) {
      cl.members = cl.members.filter(m => this.A.get(m)?.clan === k);
      if (!cl.members.length) { delete d.clans[k]; continue; }
      if (!cl.members.includes(cl.owner)) cl.owner = cl.members[0];
      cl.officers = (cl.officers || []).filter(m => cl.members.includes(m) && m !== cl.owner);
      cl.invites = (cl.invites || []).filter(m => this.A.get(m) && !this.A.get(m).clan);
    }
    this.lbCache = null;
  }

  get A() { return this.ctx.accounts; }
  get clans() { return this.A.data.clans; }
  send(c, obj) { this.ctx.send(c.id, obj); }
  err(c, text) { this.ctx.send(c.id, { type: 'error', text }); }
  ok(c, text) { this.ctx.send(c.id, { type: 'clanNotice', text }); }
  userOf(c) { return c.account ? this.A.get(c.account) : null; }
  clanOf(u) { return u?.clan ? this.clans[u.clan] || null : null; }
  roleOf(cl, key) { return cl.owner === key ? 'owner' : cl.officers.includes(key) ? 'officer' : cl.members.includes(key) ? 'member' : null; }
  online(key) { for (const c of this.ctx.clients.values()) if (c.account === key && c.name) return c; return null; }
  tagOf(key) { const u = key && this.A.get(key); return u?.clan ? this.clans[u.clan]?.tag || null : null; }
  save() { this.lbCache = null; this.A.save(); }

  // ---- noms et tags : mêmes filtres que les pseudos et le chat ----
  badWord(text) {
    const low = text.toLowerCase().replace(/[^a-z0-9àâäéèêëïîôöùûüç]/g, '');
    const words = [...(this.ctx.admin.state.filter || []), ...(this.A.bannedNameWords || [])].map(w => String(w).toLowerCase().replace(/[^a-z0-9àâäéèêëïîôöùûüç]/g, '')).filter(w => w.length >= 2);
    return words.some(w => w.length <= 3 ? low === w : low.includes(w));
  }

  handle(c, msg) {
    if (typeof msg.type !== 'string' || !msg.type.startsWith('clan')) return false;
    const fn = this['m_' + msg.type];
    if (!fn) return false;
    const u = this.userOf(c);
    if (!u) { this.err(c, 'Crée un compte pour rejoindre un clan.'); return true; }
    fn.call(this, c, u, msg);
    return true;
  }

  // ---- données envoyées au client ----
  view(cl, viewerKey) {
    const members = cl.members.map(k => {
      const m = this.A.get(k); if (!m) return null;
      const oc = this.online(k);
      return { name: m.name, role: this.roleOf(cl, k), level: levelOf(m.xp || 0), online: !!oc, xp: cl.contrib?.[k] || 0 };
    }).filter(Boolean).sort((a, b) => (b.online - a.online) || ({ owner: 0, officer: 1, member: 2 }[a.role] - { owner: 0, officer: 1, member: 2 }[b.role]) || a.name.localeCompare(b.name));
    const me = viewerKey && cl.members.includes(viewerKey);
    const wk = this.week(cl);
    const out = { tag: cl.tag, name: cl.name, desc: cl.desc || '', motd: cl.motd || '', created: cl.created, xp: cl.xp || 0, wins: cl.wins || 0, matches: cl.matches || 0, members, max: CLAN.maxMembers, rank: this.rankOf(cl),
      week: { xp: wk.xp, kills: wk.kills, goal: this.missionGoal(cl), done: wk.done } };
    if (me) { out.myRole = this.roleOf(cl, viewerKey); if (out.myRole !== 'member') { out.invites = cl.invites.map(k => this.A.get(k)?.name).filter(Boolean); out.welcome = cl.welcome || ''; } }
    return out;
  }
  payload(u) {
    const key = this.A.key(u.name);
    const cl = this.clanOf(u);
    const invites = Object.values(this.clans).filter(x => x.invites.includes(key)).map(x => ({ tag: x.tag, name: x.name, members: x.members.length }));
    return { type: 'clan', clan: cl ? this.view(cl, key) : null, invites };
  }
  push(key) { const c = this.online(key); const u = this.A.get(key); if (c && u) this.send(c, this.payload(u)); }
  pushAll(cl) { for (const k of cl.members) this.push(k); }
  // le tag affiché devant le pseudo change : mise à jour du salon
  refreshTag(key) { const c = this.online(key); if (c) { c.clanTag = this.tagOf(key); this.ctx.onTagChange?.(c); } }

  rankOf(cl) { const rows = this.rows(); const i = rows.findIndex(r => r.tag === cl.tag); return i < 0 ? null : i + 1; }
  rows(kind = 'all') {
    this.lbCache ||= {};
    const hit = this.lbCache[kind];
    if (hit && Date.now() - hit.t < 10000) return hit.rows;
    const val = cl => kind === 'week' ? this.week(cl).xp : cl.xp || 0;
    const rows = Object.values(this.clans).map(cl => ({ tag: cl.tag, name: cl.name, xp: val(cl), wins: cl.wins || 0, members: cl.members.length }))
      .filter(r => kind !== 'week' || r.xp > 0)
      .sort((a, b) => b.xp - a.xp || b.wins - a.wins || a.tag.localeCompare(b.tag));
    this.lbCache[kind] = { t: Date.now(), rows };
    return rows;
  }

  // ---- actions ----
  m_clanGet(c, u) { this.send(c, this.payload(u)); }

  m_clanCreate(c, u, msg) {
    if (u.clan) return this.err(c, 'Tu fais déjà partie d\'un clan.');
    if (levelOf(u.xp || 0) < CLAN.minLevel) return this.err(c, `Il faut être niveau ${CLAN.minLevel} pour créer un clan.`);
    const tag = clean(msg.tag, 5).toUpperCase();
    const name = clean(msg.name, CLAN.nameMax);
    if (!CLAN.tagRe.test(tag)) return this.err(c, 'Tag invalide : 2 à 5 lettres ou chiffres.');
    if (name.length < CLAN.nameMin) return this.err(c, `Nom invalide : ${CLAN.nameMin} à ${CLAN.nameMax} caractères.`);
    if (RESERVED_TAGS.test(tag) || this.badWord(tag) || this.badWord(name)) return this.err(c, 'Ce nom ou ce tag n\'est pas autorisé.');
    const k = tag.toLowerCase();
    if (this.clans[k]) return this.err(c, 'Ce tag est déjà pris.');
    if (Object.values(this.clans).some(x => x.name.toLowerCase() === name.toLowerCase())) return this.err(c, 'Ce nom de clan est déjà pris.');
    const key = this.A.key(u.name);
    this.clans[k] = { tag, name, desc: '', owner: key, officers: [], members: [key], invites: [], created: Date.now(), xp: 0, wins: 0, matches: 0, contrib: Object.create(null) };
    u.clan = k;
    for (const x of Object.values(this.clans)) x.invites = x.invites.filter(i => i !== key);
    this.save();
    this.ctx.admin.log('clan', `${u.name} crée le clan [${tag}] ${name}`);
    this.refreshTag(key);
    this.send(c, this.payload(u));
    this.ok(c, `Clan [${tag}] ${name} créé !`);
  }

  m_clanDesc(c, u, msg) {
    const cl = this.clanOf(u); const key = this.A.key(u.name);
    if (!cl || this.roleOf(cl, key) === 'member') return this.err(c, 'Seuls le chef et les officiers peuvent modifier la description.');
    const desc = clean(msg.desc, 140);
    if (this.badWord(desc)) return this.err(c, 'Cette description contient un mot interdit.');
    cl.desc = desc; this.save(); this.pushAll(cl);
  }

  // mission de la semaine : un objectif d'éliminations collectif, récompensé une fois par semaine
  weekKey() { const d = new Date(); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10); }
  week(cl) { const k = this.weekKey(); if (!cl.week || cl.week.key !== k) cl.week = { key: k, xp: 0, kills: 0, done: false }; return cl.week; }
  missionGoal(cl) { return 60 + cl.members.length * 25; }
  m_clanMotd(c, u, msg) {
    const cl = this.clanOf(u); const key = this.A.key(u.name);
    if (!cl || this.roleOf(cl, key) === 'member') return this.err(c, 'Seuls le chef et les officiers peuvent écrire le message du jour.');
    const motd = clean(msg.motd, 140);
    if (this.badWord(motd)) return this.err(c, 'Ce message contient un mot interdit.');
    cl.motd = motd; this.save(); this.pushAll(cl);
  }
  // message de bienvenue envoyé à chaque nouveau membre
  m_clanWelcome(c, u, msg) {
    const cl = this.clanOf(u); const key = this.A.key(u.name);
    if (!cl || this.roleOf(cl, key) === 'member') return this.err(c, 'Seuls le chef et les officiers peuvent écrire le message de bienvenue.');
    const w = clean(msg.text, 200);
    if (this.badWord(w)) return this.err(c, 'Ce message contient un mot interdit.');
    cl.welcome = w; this.save(); this.pushAll(cl);
    this.ok(c, w ? 'Message de bienvenue enregistré.' : 'Message de bienvenue supprimé.');
  }
  onLogin(c, u) {
    const cl = this.clanOf(u);
    if (cl?.motd) setTimeout(() => this.send(c, { type: 'clanChat', from: null, tag: cl.tag, text: `Message du jour : ${cl.motd}` }), 1500);
  }
  m_clanInvite(c, u, msg) {
    const cl = this.clanOf(u); const key = this.A.key(u.name);
    if (!cl || this.roleOf(cl, key) === 'member') return this.err(c, 'Seuls le chef et les officiers peuvent inviter.');
    const t = this.A.get(clean(msg.name, 16));
    if (!t) return this.err(c, 'Joueur introuvable.');
    const tk = this.A.key(t.name);
    if (tk === key) return this.err(c, 'C\'est toi !');
    if (t.clan) return this.err(c, `${t.name} fait déjà partie d'un clan.`);
    if ((t.blocked || []).includes(key) || t.blockInvites) return this.err(c, `${t.name} n'accepte pas les invitations.`);
    if (cl.members.length >= CLAN.maxMembers) return this.err(c, 'Ton clan est complet.');
    if (cl.invites.includes(tk)) return this.err(c, 'Invitation déjà envoyée.');
    if (cl.invites.length >= CLAN.maxInvites) return this.err(c, 'Trop d\'invitations en attente : annule-en quelques-unes.');
    cl.invites.push(tk); this.save();
    const tc = this.online(tk);
    if (tc) { this.send(tc, { type: 'clanInvite', tag: cl.tag, name: cl.name, from: u.name }); this.send(tc, this.payload(t)); }
    this.pushAll(cl);
    this.ok(c, `Invitation envoyée à ${t.name}.`);
  }

  m_clanCancelInvite(c, u, msg) {
    const cl = this.clanOf(u); const key = this.A.key(u.name);
    if (!cl || this.roleOf(cl, key) === 'member') return;
    const tk = this.A.key(clean(msg.name, 16));
    cl.invites = cl.invites.filter(i => i !== tk); this.save(); this.pushAll(cl); this.push(tk);
  }

  m_clanAccept(c, u, msg) {
    if (u.clan) return this.err(c, 'Quitte d\'abord ton clan actuel.');
    const cl = this.clans[clean(msg.tag, 5).toLowerCase()];
    const key = this.A.key(u.name);
    if (!cl || !cl.invites.includes(key)) return this.err(c, 'Cette invitation n\'existe plus.');
    if (cl.members.length >= CLAN.maxMembers) return this.err(c, 'Ce clan est complet.');
    cl.invites = cl.invites.filter(i => i !== key);
    for (const x of Object.values(this.clans)) x.invites = x.invites.filter(i => i !== key);
    cl.members.push(key); u.clan = cl.tag.toLowerCase();
    this.save();
    this.refreshTag(key);
    this.pushAll(cl);
    this.systemMsg(cl, `${u.name} a rejoint le clan.`);
    if (cl.welcome) setTimeout(() => this.systemMsg(cl, `Bienvenue ${u.name} ! ${cl.welcome}`), 300);
  }

  m_clanDecline(c, u, msg) {
    const cl = this.clans[clean(msg.tag, 5).toLowerCase()];
    if (!cl) return;
    const key = this.A.key(u.name);
    cl.invites = cl.invites.filter(i => i !== key); this.save();
    this.send(c, this.payload(u)); this.pushAll(cl);
  }

  m_clanLeave(c, u) {
    const cl = this.clanOf(u); if (!cl) return;
    const key = this.A.key(u.name);
    this.removeMember(cl, key);
    this.ok(c, `Tu as quitté le clan [${cl.tag}].`);
    this.send(c, this.payload(u));
  }

  removeMember(cl, key, why = 'a quitté le clan') {
    const u = this.A.get(key);
    cl.members = cl.members.filter(m => m !== key);
    cl.officers = cl.officers.filter(m => m !== key);
    if (u) delete u.clan;
    if (!cl.members.length) { delete this.clans[cl.tag.toLowerCase()]; this.ctx.admin.log('clan', `Clan [${cl.tag}] dissous (plus de membres)`); }
    else if (cl.owner === key) {
      // le chef part : l'officier le plus ancien, sinon le membre le plus ancien, devient chef
      cl.owner = cl.officers[0] || cl.members[0];
      cl.officers = cl.officers.filter(m => m !== cl.owner);
      this.systemMsg(cl, `${this.A.get(cl.owner)?.name} est le nouveau chef du clan.`);
    }
    this.save();
    this.refreshTag(key);
    if (this.clans[cl.tag.toLowerCase()]) { this.pushAll(cl); if (u) this.systemMsg(cl, `${u.name} ${why}.`); }
  }

  m_clanKick(c, u, msg) {
    const cl = this.clanOf(u); const key = this.A.key(u.name);
    if (!cl) return;
    const tk = this.A.key(clean(msg.name, 16));
    const me = this.roleOf(cl, key), them = this.roleOf(cl, tk);
    if (!them || tk === key) return this.err(c, 'Ce joueur n\'est pas dans ton clan.');
    if (me === 'member' || (me === 'officer' && them !== 'member')) return this.err(c, 'Tu n\'as pas le droit d\'exclure ce joueur.');
    this.removeMember(cl, tk, 'a été exclu du clan');
    this.push(tk);
  }

  m_clanRole(c, u, msg) {
    const cl = this.clanOf(u); const key = this.A.key(u.name);
    if (!cl || cl.owner !== key) return this.err(c, 'Seul le chef peut changer les rôles.');
    const tk = this.A.key(clean(msg.name, 16));
    if (!cl.members.includes(tk) || tk === key) return this.err(c, 'Ce joueur n\'est pas dans ton clan.');
    const name = this.A.get(tk)?.name;
    if (msg.role === 'owner') {
      cl.officers = cl.officers.filter(m => m !== tk);
      cl.officers.unshift(key);
      cl.owner = tk;
      this.systemMsg(cl, `${name} est le nouveau chef du clan.`);
    } else if (msg.role === 'officer') { if (!cl.officers.includes(tk)) cl.officers.push(tk); this.systemMsg(cl, `${name} est promu officier.`); }
    else { cl.officers = cl.officers.filter(m => m !== tk); this.systemMsg(cl, `${name} redevient membre.`); }
    this.save(); this.pushAll(cl);
  }

  m_clanDisband(c, u) {
    const cl = this.clanOf(u); const key = this.A.key(u.name);
    if (!cl || cl.owner !== key) return this.err(c, 'Seul le chef peut dissoudre le clan.');
    this.disband(cl, `${u.name}`);
    this.ok(c, 'Clan dissous.');
  }

  disband(cl, by) {
    const members = cl.members.slice();
    this.systemMsg(cl, 'Le clan a été dissous.');
    for (const k of members) { const m = this.A.get(k); if (m) delete m.clan; }
    delete this.clans[cl.tag.toLowerCase()];
    this.save();
    this.ctx.admin.log('clan', `Clan [${cl.tag}] ${cl.name} dissous par ${by}`);
    for (const k of members) { this.refreshTag(k); this.push(k); }
  }

  m_clanView(c, u, msg) {
    const cl = this.clans[clean(msg.tag, 5).toLowerCase()];
    if (!cl) return this.err(c, 'Clan introuvable.');
    const v = this.view(cl, null);
    v.members = v.members.map(m => ({ name: m.name, role: m.role, level: m.level, online: m.online }));
    this.send(c, { type: 'clanView', clan: v });
  }

  m_clanLeaderboard(c, u, msg) {
    const kind = msg?.kind === 'week' ? 'week' : 'all';
    const rows = this.rows(kind);
    const mine = u.clan ? rows.findIndex(r => r.tag.toLowerCase() === u.clan) : -1;
    this.send(c, { type: 'clanLeaderboard', kind, rows: rows.slice(0, 50).map((r, i) => ({ pos: i + 1, ...r })), me: mine >= 0 ? { pos: mine + 1, ...rows[mine] } : null, total: rows.length });
  }

  m_clanChat(c, u, msg) { this.chat(c, msg.text); }
  chat(c, text, limited = true) {
    const u = this.userOf(c); const cl = this.clanOf(u);
    if (!cl) return this.err(c, 'Tu n\'as pas de clan.');
    text = (typeof text === 'string' ? text : '').replace(/[<>]/g, '').trim().slice(0, 200);
    if (!text) return;
    if (limited && !this.ctx.chatLimit.take(c.id)) return this.err(c, 'Doucement, tu envoies trop de messages.');
    const admin = this.ctx.admin;
    if (admin.activeMute(c)) return this.err(c, 'Tu ne peux pas envoyer de message pour le moment (silence).');
    const verdict = admin.chatMessage(c, { id: 'clan', name: `Clan [${cl.tag}]` }, text, { whisper: true });
    if (verdict.reply) return this.err(c, verdict.reply);
    const from = u.name, key = this.A.key(u.name);
    for (const k of cl.members) {
      const oc = this.online(k); if (!oc) continue;
      if (this.ctx.social.blocks(k, key)) continue;
      this.send(oc, { type: 'clanChat', from, tag: cl.tag, text: verdict.deliver });
    }
  }
  systemMsg(cl, text) { for (const k of cl.members) { const oc = this.online(k); if (oc) this.send(oc, { type: 'clanChat', from: null, tag: cl.tag, text }); } }

  // ---- fin de partie : l'XP gagnée par les membres alimente le clan ----
  onMatch(u, xpGain, won, kills = 0) {
    const cl = this.clanOf(u); if (!cl) return;
    const key = this.A.key(u.name);
    const wk = this.week(cl);
    wk.xp += Math.max(0, Math.round(xpGain || 0)); wk.kills += Math.max(0, kills | 0);
    if (!wk.done && wk.kills >= this.missionGoal(cl)) {
      wk.done = true; cl.xp = (cl.xp || 0) + 500;
      for (const k of cl.members) { const m = this.A.get(k); if (m) { m.eclats = (m.eclats || 0) + 100; const oc = this.online(k); if (oc) this.send(oc, { type: 'profile', profile: this.A.publicProfile(m) }); } }
      this.ctx.admin.economy?.('earn', 100 * cl.members.length);
      this.systemMsg(cl, `Mission de la semaine accomplie (${wk.kills} éliminations) ! +100 Éclats pour chaque membre et +500 XP pour le clan.`);
    }
    cl.xp = (cl.xp || 0) + Math.max(0, Math.round(xpGain || 0));
    cl.matches = (cl.matches || 0) + 1;
    if (won) cl.wins = (cl.wins || 0) + 1;
    cl.contrib ||= Object.create(null);
    cl.contrib[key] = (cl.contrib[key] || 0) + Math.max(0, Math.round(xpGain || 0));
    this.lbCache = null;
  }

  // ---- administration ----
  adminList() {
    return Object.values(this.clans).map(cl => ({ tag: cl.tag, name: cl.name, desc: cl.desc || '', owner: this.A.get(cl.owner)?.name || '?', members: cl.members.map(k => ({ name: this.A.get(k)?.name || k, role: this.roleOf(cl, k) })), xp: cl.xp || 0, wins: cl.wins || 0, matches: cl.matches || 0, created: cl.created }))
      .sort((a, b) => b.xp - a.xp);
  }
  adminDisband(tag, by) { const cl = this.clans[String(tag || '').toLowerCase()]; if (!cl) return false; this.disband(cl, by); return true; }
  adminKick(tag, name) {
    const cl = this.clans[String(tag || '').toLowerCase()]; if (!cl) return false;
    const k = this.A.key(name); if (!cl.members.includes(k)) return false;
    this.removeMember(cl, k, 'a été retiré du clan par la modération'); this.push(k); return true;
  }
  adminRename(tag, name) {
    const cl = this.clans[String(tag || '').toLowerCase()]; if (!cl) return false;
    name = clean(name, CLAN.nameMax); if (name.length < CLAN.nameMin) return false;
    cl.name = name; cl.desc = ''; this.save(); this.pushAll(cl); return true;
  }
  // un compte supprimé quitte son clan
  onAccountDeleted(key) { for (const cl of Object.values(this.clans)) { cl.invites = cl.invites.filter(i => i !== key); if (cl.members.includes(key)) this.removeMember(cl, key); } }
}

export { ROLE_LABEL };
