// Social : amis, joueurs bloqués, messages privés, invitations, profils publics, classements, commandes de chat.
import { publicCard, titlesOf, rerollQuest, ensureUser, weekKey, rankFor } from './progression.js';
import { TITLES, levelOf, BANNERS, ENDORSE } from '../shared/progress.js';
import { SKINS } from '../shared/data.js';
// boutique du jour : 3 skins à -40 %, renouvelés chaque jour (même sélection pour tout le monde)
export function dailyShop(day = new Date().toISOString().slice(0, 10)) {
  const pool = SKINS.filter(s => s.price > 0 && !s.level);
  let h = 0; for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = [];
  while (pick.length < Math.min(3, pool.length)) { h = (h * 1103515245 + 12345) >>> 0; const s = pool[h % pool.length]; if (!pick.includes(s)) pick.push(s); }
  return pick.map(s => ({ id: s.id, name: s.name, old: s.price, price: Math.round(s.price * 0.6 / 10) * 10 }));
}

const MAX_FRIENDS = 100;
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

export class Social {
  constructor(ctx) {
    this.ctx = ctx; // { accounts, clients, rooms, send, joinRoom, admin, chatLimit }
    this.lbCache = new Map();
  }

  get A() { return this.ctx.accounts; }
  userOf(c) { return c.account ? this.A.get(c.account) : null; }
  clientOfKey(key) { for (const c of this.ctx.clients.values()) if (c.account === key && c.name) return c; return null; }
  clientByName(name) {
    const n = String(name || '').toLowerCase();
    for (const c of this.ctx.clients.values()) if (c.name && c.name.toLowerCase() === n) return c;
    return null;
  }
  err(c, text) { this.ctx.send(c.id, { type: 'error', text }); }
  info(c, text) { this.ctx.send(c.id, { type: 'chat', from: 'SYSTÈME', text, system: true }); }

  status(c) {
    if (!c) return { status: 'hors ligne', online: false };
    const r = c.roomId && this.ctx.rooms.get(c.roomId);
    if (!r) return { status: 'dans le menu', online: true };
    return { status: r.match ? 'en partie' : 'dans un salon', online: true, roomId: r.id, roomName: r.private ? 'Salon privé' : r.name, mode: r.mode, full: r.members.size >= r.maxPlayers && ![...r.members.values()].some(m => m.isBot) };
  }

  friendsPayload(u) {
    const row = key => {
      const f = this.A.get(key); if (!f) return null;
      ensureUser(f);
      return { name: f.name, level: levelOf(f.xp), title: f.title ? TITLES[f.title] : null, lastSeen: f.lastSeen || f.created, pinned: (u.pinned || []).includes(key), lfg: !!f.lfg, clan: f.clan ? this.A.data.clans?.[f.clan]?.tag || null : null, ...this.status(this.clientOfKey(key)) };
    };
    const friends = u.friends.map(row).filter(Boolean).sort((a, b) => (b.pinned - a.pinned) || (b.online - a.online) || a.name.localeCompare(b.name));
    return { type: 'friends', friends, incoming: u.friendReq.map(k => this.A.get(k)?.name).filter(Boolean), blocked: u.blocked.map(k => this.A.get(k)?.name).filter(Boolean) };
  }
  sendFriends(c) { const u = this.userOf(c); if (u) this.ctx.send(c.id, this.friendsPayload(u)); }
  // prévient les amis connectés d'un changement de statut (connexion, salon, partie)
  pushFriendsOf(key) {
    const u = key && this.A.get(key); if (!u) return;
    for (const fk of u.friends) { const fc = this.clientOfKey(fk); if (fc) this.sendFriends(fc); }
  }
  blocks(ownerKey, otherKey) { const u = ownerKey && this.A.get(ownerKey); return !!(u && otherKey && u.blocked.includes(otherKey)); }

  // ---------- messages ----------
  handle(c, msg) {
    const fn = this['m_' + msg.type];
    if (!fn) return false;
    fn.call(this, c, msg);
    return true;
  }

  needAccount(c) { const u = this.userOf(c); if (!u) this.err(c, 'Crée un compte pour utiliser cette fonction.'); return u; }
  target(c, name) {
    const t = this.A.get(clean(name, 16));
    if (!t) { this.err(c, 'Joueur introuvable.'); return null; }
    if (this.A.key(t.name) === c.account) { this.err(c, 'C\'est toi !'); return null; }
    return t;
  }

  m_friends(c) { if (this.needAccount(c)) this.sendFriends(c); }

  m_friendAdd(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const t = this.target(c, msg.name); if (!t) return;
    const me = c.account, tk = this.A.key(t.name);
    ensureUser(t);
    if (u.friends.includes(tk)) return this.err(c, `${t.name} est déjà ton ami.`);
    if (t.blocked.includes(me) || u.blocked.includes(tk)) return this.err(c, 'Impossible d\'ajouter ce joueur.');
    if (u.friends.length >= MAX_FRIENDS) return this.err(c, 'Liste d\'amis pleine.');
    if (u.friendReq.includes(tk)) return this.m_friendAccept(c, { name: t.name });
    if (!t.friendReq.includes(me)) t.friendReq.push(me);
    if (t.friendReq.length > 50) t.friendReq.shift();
    this.A.save();
    this.info(c, `Demande d'ami envoyée à ${t.name}.`);
    const tc = this.clientOfKey(tk);
    if (tc) { this.ctx.send(tc.id, { type: 'friendRequest', from: u.name }); this.sendFriends(tc); }
  }

  m_friendAccept(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const t = this.target(c, msg.name); if (!t) return;
    const me = c.account, tk = this.A.key(t.name);
    if (!u.friendReq.includes(tk)) return this.err(c, 'Aucune demande de ce joueur.');
    u.friendReq = u.friendReq.filter(k => k !== tk);
    if (!u.friends.includes(tk)) u.friends.push(tk);
    if (!t.friends.includes(me)) t.friends.push(me);
    t.friendReq = t.friendReq.filter(k => k !== me);
    this.A.save();
    this.sendFriends(c);
    const tc = this.clientOfKey(tk);
    if (tc) { this.info(tc, `${u.name} a accepté ta demande d'ami.`); this.sendFriends(tc); }
  }

  m_friendDecline(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const tk = this.A.key(clean(msg.name, 16));
    u.friendReq = u.friendReq.filter(k => k !== tk); this.A.save(); this.sendFriends(c);
  }

  m_friendRemove(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const tk = this.A.key(clean(msg.name, 16)), t = this.A.get(tk);
    u.friends = u.friends.filter(k => k !== tk);
    if (t) t.friends = (t.friends || []).filter(k => k !== c.account);
    this.A.save(); this.sendFriends(c);
    const tc = this.clientOfKey(tk); if (tc) this.sendFriends(tc);
  }

  m_block(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const t = this.target(c, msg.name); if (!t) return;
    const tk = this.A.key(t.name);
    if (!u.blocked.includes(tk)) u.blocked.push(tk);
    if (u.blocked.length > 200) u.blocked.shift();
    // bloquer retire aussi l'amitié et les demandes
    u.friends = u.friends.filter(k => k !== tk); u.friendReq = u.friendReq.filter(k => k !== tk);
    ensureUser(t); t.friends = t.friends.filter(k => k !== c.account); t.friendReq = t.friendReq.filter(k => k !== c.account);
    this.A.save(); this.sendFriends(c);
    const tc = this.clientOfKey(tk); if (tc) this.sendFriends(tc); // sa liste d'amis se met à jour tout de suite
    this.info(c, `${t.name} est bloqué : tu ne verras plus ses messages et il ne peut plus t'inviter.`);
  }

  m_unblock(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const tk = this.A.key(clean(msg.name, 16));
    u.blocked = u.blocked.filter(k => k !== tk); this.A.save(); this.sendFriends(c);
  }

  m_invite(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const r = c.roomId && this.ctx.rooms.get(c.roomId);
    if (!r) return this.err(c, 'Rejoins ou crée un salon avant d\'inviter.');
    const t = this.target(c, msg.name); if (!t) return;
    const tk = this.A.key(t.name);
    if (!u.friends.includes(tk)) return this.err(c, 'Tu ne peux inviter que tes amis.');
    if (t.blockInvites) return this.err(c, `${t.name} n'accepte pas les invitations pour le moment.`);
    const tc = this.clientOfKey(tk);
    if (!tc) return this.err(c, `${t.name} n'est pas connecté.`);
    if (tc.roomId === r.id) return this.err(c, `${t.name} est déjà dans ton salon.`);
    tc.invites = tc.invites || new Set(); tc.invites.add(r.id);
    this.ctx.send(tc.id, { type: 'invite', from: u.name, roomId: r.id, roomName: r.private ? 'Salon privé' : r.name, mode: r.mode });
    this.info(c, `Invitation envoyée à ${t.name}.`);
  }

  m_joinFriend(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const tk = this.A.key(clean(msg.name, 16));
    if (!u.friends.includes(tk)) return this.err(c, 'Ce joueur n\'est pas dans tes amis.');
    const tc = this.clientOfKey(tk);
    const r = tc?.roomId && this.ctx.rooms.get(tc.roomId);
    if (!r) return this.err(c, 'Ton ami n\'est dans aucun salon.');
    c.invites = c.invites || new Set(); c.invites.add(r.id);
    this.ctx.joinRoom(c, r);
  }

  m_whisper(c, msg) { this.whisper(c, msg.name, msg.text); }
  whisper(c, name, text) {
    text = clean(text, 200);
    if (!text) return;
    const tc = this.clientByName(name);
    if (!tc) return this.err(c, 'Ce joueur n\'est pas connecté.');
    if (tc === c) return this.err(c, 'Tu ne peux pas t\'écrire à toi-même.');
    if (this.blocks(tc.account, c.account)) return this.err(c, 'Ce joueur n\'accepte pas tes messages.');
    if (!this.ctx.chatLimit.take(c.id)) return this.err(c, 'Doucement, tu envoies trop de messages.');
    const admin = this.ctx.admin;
    const mute = admin.activeMute(c);
    if (mute) return this.err(c, 'Tu ne peux pas envoyer de message pour le moment (silence).');
    const verdict = admin.chatMessage(c, { id: 'mp', name: `MP → ${tc.name}` }, text, { whisper: true });
    if (verdict.reply) return this.info(c, verdict.reply);
    tc.lastWhisper = c.name;
    this.ctx.send(tc.id, { type: 'whisper', from: c.name, text: verdict.deliver });
    this.ctx.send(c.id, { type: 'whisper', to: tc.name, text: verdict.deliver });
  }

  m_viewProfile(c, msg) {
    const t = this.A.get(clean(msg.name, 16));
    if (!t) return this.err(c, 'Joueur introuvable.');
    const tk = this.A.key(t.name);
    const u = this.userOf(c);
    const card = publicCard(t, !!this.clientOfKey(tk));
    const cl = t.clan && this.A.data.clans?.[t.clan];
    card.clan = cl ? { tag: cl.tag, name: cl.name } : null;
    card.relation = !u ? 'guest' : tk === c.account ? 'self' : u.friends.includes(tk) ? 'friend' : u.friendReq.includes(tk) ? 'incoming' : (t.friendReq || []).includes(c.account) ? 'pending' : u.blocked.includes(tk) ? 'blocked' : 'none';
    this.ctx.send(c.id, { type: 'playerProfile', profile: card });
  }

  leaderboardRows(kind) {
    const hit = this.lbCache.get(kind);
    if (hit && Date.now() - hit.t < 10000) return hit.rows;
    const wk = weekKey();
    const val = {
      level: u => u.xp, elo: u => u.elo, week: u => (u.week?.key === wk ? u.week.xp : 0), kills: u => u.stats.kills, wins: u => u.stats.wins,
    }[kind] || (u => u.xp);
    let users = Object.values(this.A.data.users).filter(u => u && u.stats);
    if (kind === 'elo') users = users.filter(u => u.seasonDuels > 0);
    if (kind === 'week') users = users.filter(u => val(u) > 0);
    const rows = users.map(u => ({ name: u.name, key: this.A.key(u.name), v: val(u), level: levelOf(u.xp), title: u.title ? TITLES[u.title] : null, elo: u.elo, rank: rankFor(u).name, rankColor: rankFor(u).color }))
      .sort((a, b) => b.v - a.v || a.name.localeCompare(b.name));
    rows.forEach((r, i) => { r.pos = i + 1; });
    this.lbCache.set(kind, { t: Date.now(), rows });
    return rows;
  }
  m_leaderboard(c, msg) {
    const kind = ['level', 'elo', 'week', 'kills', 'wins'].includes(msg.kind) ? msg.kind : 'level';
    let rows = this.leaderboardRows(kind);
    const u = this.userOf(c);
    if (msg.scope === 'friends' && u) { const set = new Set([c.account, ...u.friends]); rows = rows.filter(r => set.has(r.key)).map((r, i) => ({ ...r, pos: i + 1 })); }
    const me = u ? rows.find(r => r.key === c.account) || null : null;
    const strip = r => r && ({ pos: r.pos, name: r.name, v: r.v, level: r.level, title: r.title, elo: r.elo, rank: r.rank, rankColor: r.rankColor });
    this.ctx.send(c.id, { type: 'leaderboard', kind, scope: msg.scope === 'friends' ? 'friends' : 'all', rows: rows.slice(0, 50).map(strip), me: strip(me), season: this.ctx.admin.state.season, total: rows.length });
  }

  m_setTitle(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    if (msg.id && !titlesOf(u).includes(msg.id)) return this.err(c, 'Titre non débloqué.');
    u.title = msg.id || null; this.A.save();
    this.ctx.send(c.id, { type: 'profile', profile: this.A.publicProfile(u) });
  }

  m_questReroll(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const e = rerollQuest(u, msg.kind === 'weekly' ? 'weekly' : 'daily', Math.round(Number(msg.idx)), this.A.questOverrides);
    if (e) this.err(c, e); else this.A.save();
    this.ctx.send(c.id, { type: 'profile', profile: this.A.publicProfile(u) });
  }

  m_changePassword(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const r = this.A.changePassword(u, msg.old, msg.password);
    if (r.error) return this.ctx.send(c.id, { type: 'passwordResult', ok: false, text: r.error });
    c.token = r.token;
    for (const o of this.ctx.clients.values()) if (o !== c && o.account === c.account) { this.ctx.send(o.id, { type: 'kicked', text: 'Mot de passe modifié depuis un autre appareil.' }); o.ws.close(); }
    this.ctx.admin.log('auth', `Mot de passe changé par ${u.name} (${c.ip})`);
    this.ctx.send(c.id, { type: 'passwordResult', ok: true, token: r.token, text: 'Mot de passe modifié. Tes autres appareils sont déconnectés.' });
  }

  m_logoutAll(c) {
    const u = this.needAccount(c); if (!u) return;
    const n = this.A.revokeAll(c.account);
    const token = this.A.newSession(u);
    c.token = token;
    for (const o of this.ctx.clients.values()) if (o !== c && o.account === c.account) { this.ctx.send(o.id, { type: 'kicked', text: 'Session fermée depuis un autre appareil.' }); o.ws.close(); }
    this.ctx.send(c.id, { type: 'passwordResult', ok: true, token, text: `${Math.max(0, n - 1)} autre(s) session(s) fermée(s).` });
  }

  // réglages du joueur sauvegardés sur son compte (synchronisation entre appareils)
  m_saveSettings(c, msg) {
    const u = this.userOf(c); if (!u) return;
    const now = Date.now();
    if (now - (c.lastSettingsSave || 0) < 1500) return;
    c.lastSettingsSave = now;
    const st = msg.settings;
    if (!st || typeof st !== 'object' || Array.isArray(st)) return;
    const out = {};
    let n = 0;
    for (const [k, v] of Object.entries(st)) {
      if (++n > 120 || !/^[A-Za-z0-9]{1,24}$/.test(k)) break;
      if (k === 'keys' && v && typeof v === 'object') { out.keys = {}; for (const [a, code] of Object.entries(v).slice(0, 40)) if (/^[A-Za-z0-9]{1,24}$/.test(a) && typeof code === 'string' && /^[A-Za-z0-9]{0,24}$/.test(code)) out.keys[a] = code; continue; }
      if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
      else if (typeof v === 'string' && v.length <= 40 && !/[<>"'`]/.test(v)) out[k] = v;
    }
    u.settings = out; u.settingsAt = now;
    this.A.save();
  }
  // ---------- profil : bannière, devise, vitrine, options ----------
  m_setProfile(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    if (typeof msg.banner === 'string') {
      const b = BANNERS[msg.banner];
      if (!b) return this.err(c, 'Bannière inconnue.');
      if (levelOf(u.xp) < b.level) return this.err(c, `Bannière débloquée au niveau ${b.level}.`);
      u.banner = msg.banner;
    }
    if (typeof msg.motto === 'string') {
      const m = msg.motto.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const f = this.ctx.admin.filterText(m);
      if (f.hits.length || f.link) return this.err(c, 'Ta devise contient un mot interdit ou un lien.');
      u.motto = m;
    }
    if (Array.isArray(msg.showcase)) u.showcase = [...new Set(msg.showcase.filter(id => typeof id === 'string' && u.achievements.includes(id)))].slice(0, 3);
    if (typeof msg.blockInvites === 'boolean') u.blockInvites = msg.blockInvites;
    if (typeof msg.lfg === 'boolean') { u.lfg = msg.lfg; this.pushFriendsOf(c.account); }
    this.A.save();
    this.ctx.send(c.id, { type: 'profile', profile: this.A.publicProfile(u) });
  }
  // recommandations après une partie (une par joueur et par partie)
  m_endorse(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const lm = c.lastMatch;
    const t = this.A.get(String(msg.name || '').slice(0, 16)); if (!t) return;
    const tk = this.A.key(t.name);
    if (!lm || Date.now() - lm.t > 10 * 60000 || !lm.accounts.has(tk)) return this.err(c, 'Tu ne peux recommander que les joueurs de ta dernière partie.');
    if (lm.done.has(tk)) return this.err(c, 'Tu as déjà recommandé ce joueur.');
    if (!ENDORSE[msg.kind]) return;
    lm.done.add(tk);
    t.endorse ||= {}; t.endorse[msg.kind] = (t.endorse[msg.kind] || 0) + 1;
    this.A.save();
    this.ctx.send(c.id, { type: 'endorsed', name: t.name, kind: msg.kind });
    const tc = this.clientOfKey(tk); if (tc) this.ctx.send(tc.id, { type: 'chat', from: 'SYSTÈME', text: `${u.name} t'a recommandé : ${ENDORSE[msg.kind]} !`, system: true });
  }
  m_recent(c) {
    const u = this.needAccount(c); if (!u) return;
    const rows = (u.recent || []).map(r => { const t = this.A.get(r.k); return t && { name: t.name, level: levelOf(t.xp), t: r.t, n: r.n, friend: u.friends.includes(r.k), online: !!this.clientOfKey(r.k) }; }).filter(Boolean);
    this.ctx.send(c.id, { type: 'recent', rows, suggestions: rows.filter(r => !r.friend && r.n >= 2 && !(u.blocked || []).includes(this.A.key(r.name))).slice(0, 5) });
  }
  m_pinFriend(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const k = this.A.key(String(msg.name || '').slice(0, 16));
    if (!u.friends.includes(k)) return;
    u.pinned ||= [];
    u.pinned = u.pinned.includes(k) ? u.pinned.filter(x => x !== k) : [...u.pinned, k].slice(-20);
    this.A.save(); this.sendFriends(c);
  }
  // cadeau d'Éclats à un ami (niveau 5, 100 par jour au maximum)
  m_gift(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const t = this.target(c, msg.name); if (!t) return;
    const tk = this.A.key(t.name);
    if (!u.friends.includes(tk)) return this.err(c, 'Tu ne peux offrir des Éclats qu\'à tes amis.');
    if (levelOf(u.xp) < 5) return this.err(c, 'Il faut être niveau 5 pour offrir des Éclats.');
    const amount = Math.round(Number(msg.amount));
    if (!(amount >= 10 && amount <= 100)) return this.err(c, 'Montant : entre 10 et 100 Éclats.');
    const day = new Date().toISOString().slice(0, 10);
    u.giftDay = u.giftDay?.d === day ? u.giftDay : { d: day, sum: 0 };
    if (u.giftDay.sum + amount > 100) return this.err(c, `Limite de 100 Éclats offerts par jour (encore ${100 - u.giftDay.sum} aujourd'hui).`);
    if (u.eclats < amount) return this.err(c, 'Pas assez d\'Éclats.');
    u.eclats -= amount; t.eclats = (t.eclats || 0) + amount; u.giftDay.sum += amount;
    this.A.save();
    this.ctx.admin.log('economie', `${u.name} offre ${amount} Éclats à ${t.name}`);
    this.ctx.send(c.id, { type: 'profile', profile: this.A.publicProfile(u) });
    this.info(c, `Tu as offert ${amount} Éclats à ${t.name}.`);
    const tc = this.clientOfKey(tk); if (tc) { this.ctx.send(tc.id, { type: 'profile', profile: this.A.publicProfile(t) }); this.ctx.send(tc.id, { type: 'gift', from: u.name, amount }); }
  }
  m_shop(c) { this.ctx.send(c.id, { type: 'shop', items: dailyShop(), resetAt: new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime() + 86400000 }); }
  m_buyShop(c, msg) {
    const u = this.needAccount(c); if (!u) return;
    const item = dailyShop().find(i => i.id === msg.id);
    if (!item) return this.err(c, 'Ce skin n\'est plus dans la boutique du jour.');
    if (u.owned.includes(item.id)) return this.err(c, 'Tu possèdes déjà ce skin.');
    if (u.eclats < item.price) return this.err(c, 'Pas assez d\'Éclats.');
    u.eclats -= item.price; u.owned.push(item.id); this.A.save();
    this.ctx.admin.economy?.('spend', item.price); this.ctx.admin.economy?.('skin', item.id);
    this.ctx.send(c.id, { type: 'profile', profile: this.A.publicProfile(u) });
    this.info(c, `${item.name} ajouté à ta collection (-40 %) !`);
  }
  m_myProfile(c) { const u = this.userOf(c); if (u) this.ctx.send(c.id, { type: 'profile', profile: this.A.publicProfile(u) }); }

  // ---------- commandes de chat ----------
  command(c, r, text) {
    const m = text.match(/^\/(\S+)\s*(.*)$/s);
    if (!m) return false;
    const cmd = m[1].toLowerCase(), arg = m[2].trim();
    const [first, ...rest] = arg.split(/\s+/);
    switch (cmd) {
      case 'aide': case 'help':
        this.info(c, 'Commandes : /mp pseudo message · /r message (répondre) · /ami pseudo · /inviter pseudo · /bloquer pseudo · /debloquer pseudo · /stats [pseudo] · /c message (chat de clan) · /g message (chat de groupe) · /groupe pseudo (inviter dans ton groupe) · /signaler pseudo raison');
        return true;
      case 'mp': case 'w': case 'msg': if (!first || !rest.length) this.info(c, 'Utilisation : /mp pseudo message'); else this.whisper(c, first, rest.join(' ')); return true;
      case 'r': if (!c.lastWhisper) this.info(c, 'Personne ne t\'a encore écrit.'); else if (arg) this.whisper(c, c.lastWhisper, arg); return true;
      case 'ami': case 'friend': if (first) this.m_friendAdd(c, { name: first }); return true;
      case 'inviter': case 'invite': if (first) this.m_invite(c, { name: first }); return true;
      case 'bloquer': case 'block': if (first) this.m_block(c, { name: first }); return true;
      case 'debloquer': case 'unblock': if (first) { this.m_unblock(c, { name: first }); this.info(c, `${first} est débloqué.`); } return true;
      case 'c': case 'clan': if (!this.userOf(c)) this.info(c, 'Les clans sont réservés aux comptes.'); else if (arg) this.clans?.chat(c, arg, false); return true;
      case 'g': case 'groupe': case 'party':
        if (!this.userOf(c)) { this.info(c, 'Les groupes sont réservés aux comptes.'); return true; }
        if (cmd === 'g') { if (arg) this.parties?.chat(c, { text: arg }); } else if (first) this.parties?.invite(c, { name: first }); else this.info(c, 'Utilisation : /groupe pseudo');
        return true;
      case 'stats': {
        const t = first ? this.A.get(first) : this.userOf(c);
        if (!t) { this.info(c, first ? 'Joueur introuvable.' : 'Les statistiques sont réservées aux comptes.'); return true; }
        ensureUser(t);
        const s = t.stats, kd = s.deaths ? (s.kills / s.deaths).toFixed(2) : s.kills;
        this.info(c, `${t.name} · niveau ${levelOf(t.xp)} · ${s.matches} parties · ${s.wins} victoires · K/D ${kd} · ${t.seasonDuels > 0 ? `Elo ${t.elo} (${rankFor(t).name})` : 'non classé en duel'}`);
        return true;
      }
      default: return false; // /signaler et les commandes inconnues sont traitées ailleurs
    }
  }
}
