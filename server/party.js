// Groupes : jusqu'à 4 amis qui jouent ensemble. Le chef choisit la partie, les autres le suivent automatiquement.
// Les groupes n'existent qu'en mémoire (ils disparaissent à la déconnexion de tous leurs membres).
import { rankFor, refusesInvites, presenceOf } from './progression.js';
import { BANNERS } from '../shared/progress.js';
const MAX = 4;
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);
let seq = 1;

export class Parties {
  constructor(ctx) {
    this.ctx = ctx; // { accounts, clients, rooms, send, joinRoom, pushRoom, social, isFfa }
    this.parties = new Map(); // id → { id, leader: clientId, members: [clientId] }
  }
  get A() { return this.ctx.accounts; }
  partyOf(c) { return c?.partyId ? this.parties.get(c.partyId) || null : null; }
  err(c, text) { this.ctx.send(c.id, { type: 'error', text }); }
  info(c, text) { this.ctx.send(c.id, { type: 'chat', from: 'GROUPE', text, system: true }); }

  handle(c, msg) {
    const fn = { partyInvite: this.invite, partyAccept: this.accept, partyDecline: this.decline, partyLeave: this.leave, partyKick: this.kick, partyPromote: this.promote, partyChat: this.chat, partySet: this.setCfg, partyReady: this.setReady, partyCancel: this.cancel }[msg.type];
    if (!fn) return false;
    if (!c.account) { this.err(c, 'Crée un compte pour former un groupe.'); return true; }
    fn.call(this, c, msg);
    return true;
  }

  payload(p, forId) {
    if (!p) return { type: 'party', party: null };
    const st = id => this.ctx.social.status(this.ctx.clients.get(id));
    return { type: 'party', party: { id: p.id, leader: this.ctx.clients.get(p.leader)?.name || '?', lead: p.leader === forId, max: MAX, cfg: p.cfg,
      countdown: p.countdownEnd ? Math.max(0, Math.ceil((p.countdownEnd - Date.now()) / 1000)) : 0,
      members: p.members.map(id => {
        const c = this.ctx.clients.get(id); const s = st(id); const info = c && this.ctx.memberInfo ? this.ctx.memberInfo(c) : {};
        const u = c?.account && this.A.get(c.account);
        return { name: c?.name || '?', leader: id === p.leader, me: id === forId, status: s.status, roomName: s.roomName || null,
          ready: id === p.leader || p.ready.has(id), busy: s.status === 'en partie', agent: c?.prefAgent || u?.agent || null, outfit: c?.outfits?.[c?.prefAgent || u?.agent] || null, skin: c?.skins?.lancer || 'default',
          level: info.level || 1, prestige: info.prestige || 0, presence: u ? presenceOf(u) : 'online', title: info.title || null, clan: info.clan || null,
          // carte de joueur (1.19) : bannière et rang
          banner: BANNERS[u?.banner]?.css || BANNERS.nuit.css, rank: u ? rankFor(u).name : null, rankColor: u ? rankFor(u).color : null };
      }) } };
  }
  push(p) { if (p) for (const id of p.members) this.ctx.send(id, this.payload(p, id)); }

  invite(c, msg) {
    const u = this.A.get(c.account);
    const t = this.A.get(clean(msg.name, 16));
    if (!t) return this.err(c, 'Joueur introuvable.');
    const tk = this.A.key(t.name);
    if (tk === c.account) return this.err(c, 'C\'est toi !');
    if (!u.friends.includes(tk)) return this.err(c, 'Tu ne peux inviter que tes amis dans ton groupe.');
    if (refusesInvites(t)) return this.err(c, t.presence === 'busy' && !t.dnd ? `${t.name} est occupé : invitations refusées automatiquement.` : `${t.name} n'accepte pas les invitations pour le moment.`);
    const tc = this.ctx.social.clientOfKey(tk);
    if (!tc) return this.err(c, `${t.name} n'est pas connecté.`);
    let p = this.partyOf(c);
    if (p && p.leader !== c.id) return this.err(c, 'Seul le chef du groupe peut inviter.');
    if (p && p.members.includes(tc.id)) return this.err(c, `${t.name} est déjà dans ton groupe.`);
    if (p && p.members.length >= MAX) return this.err(c, `Un groupe compte ${MAX} joueurs au maximum.`);
    if (!p) { p = { id: 'g' + (seq++), leader: c.id, members: [c.id], cfg: this.ctx.cleanCfg ? this.ctx.cleanCfg(msg.cfg) : {}, ready: new Set(), countdownEnd: 0, timer: null }; this.parties.set(p.id, p); c.partyId = p.id; this.push(p); }
    tc.partyInvites ||= new Map();
    tc.partyInvites.set(p.id, Date.now() + 120000);
    this.ctx.send(tc.id, { type: 'partyInvite', id: p.id, from: c.name, size: p.members.length });
    this.info(c, `Invitation dans le groupe envoyée à ${t.name}.`);
  }

  accept(c, msg) {
    const id = String(msg.id || ''), until = c.partyInvites?.get(id);
    if (!until || until < Date.now()) return this.err(c, 'Cette invitation a expiré.');
    c.partyInvites.delete(id);
    const p = this.parties.get(id);
    if (!p) return this.err(c, 'Ce groupe n\'existe plus.');
    if (p.members.length >= MAX) return this.err(c, 'Ce groupe est complet.');
    if (this.partyOf(c) === p) return;
    this.removeMember(c, 'a quitté le groupe');
    p.members.push(c.id); c.partyId = p.id;
    this.push(p);
    for (const id2 of p.members) if (id2 !== c.id) this.info(this.ctx.clients.get(id2), `${c.name} a rejoint le groupe.`);
    // rejoint tout de suite le salon du chef s'il attend dans un salon
    const leader = this.ctx.clients.get(p.leader);
    const r = leader?.roomId && this.ctx.rooms.get(leader.roomId);
    if (r && r.state === 'lobby' && !r.tournament && !r.quick) this.bring(c, r, leader);
  }
  decline(c, msg) {
    const id = String(msg.id || ''); if (!c.partyInvites?.delete(id)) return;
    const p = this.parties.get(id), lc = p && this.ctx.clients.get(p.leader);
    if (lc) this.info(lc, `${c.name} a refusé l'invitation.`);
  }
  leave(c) { if (!this.partyOf(c)) return; this.removeMember(c, 'a quitté le groupe'); this.ctx.send(c.id, this.payload(null)); }
  kick(c, msg) {
    const p = this.partyOf(c); if (!p || p.leader !== c.id) return this.err(c, 'Seul le chef du groupe peut retirer un membre.');
    const tc = p.members.map(id => this.ctx.clients.get(id)).find(x => x && x.name.toLowerCase() === String(msg.name || '').toLowerCase());
    if (!tc || tc === c) return;
    this.removeMember(tc, 'a été retiré du groupe');
    this.ctx.send(tc.id, this.payload(null)); this.info(tc, 'Tu as été retiré du groupe.');
  }
  promote(c, msg) {
    const p = this.partyOf(c); if (!p || p.leader !== c.id) return;
    const tc = p.members.map(id => this.ctx.clients.get(id)).find(x => x && x.name.toLowerCase() === String(msg.name || '').toLowerCase());
    if (!tc) return;
    p.leader = tc.id; this.stopCountdown(p); p.ready.clear(); this.push(p);
    for (const id of p.members) this.info(this.ctx.clients.get(id), `${tc.name} est le nouveau chef du groupe.`);
  }
  chat(c, msg) {
    const p = this.partyOf(c); if (!p) return this.err(c, 'Tu n\'es dans aucun groupe.');
    const text = clean(msg.text, 140); if (!text) return;
    if (!this.ctx.chatLimit.take(c.id)) return this.err(c, 'Doucement, tu envoies trop de messages.');
    const v = this.ctx.admin.chatMessage(c, { id: 'groupe', name: 'Groupe' }, text, { whisper: true });
    if (v.reply) return this.info(c, v.reply);
    for (const id of p.members) this.ctx.send(id, { type: 'chat', from: c.name, text: v.deliver, party: true });
  }

  // ---------- salon de groupe (1.15) : réglages du chef, « prêt », compte à rebours ----------
  setCfg(c, msg) {
    const p = this.partyOf(c); if (!p) return;
    if (p.leader !== c.id) return this.err(c, 'Seul le chef du groupe choisit la partie.');
    const cfg = this.ctx.cleanCfg(msg.cfg);
    const changed = JSON.stringify(cfg) !== JSON.stringify(p.cfg);
    p.cfg = cfg;
    // comme dans les jeux de groupe : changer de partie remet tout le monde « pas prêt »
    if (changed) { this.stopCountdown(p); p.ready.clear(); }
    this.push(p);
  }
  setReady(c, msg) {
    const p = this.partyOf(c); if (!p || p.leader === c.id) return;
    if (msg.ready) p.ready.add(c.id); else { p.ready.delete(c.id); if (p.countdownEnd) { this.stopCountdown(p); for (const id of p.members) this.info(this.ctx.clients.get(id), `${c.name} n'est plus prêt : lancement annulé.`); } }
    this.push(p);
  }
  cancel(c) {
    const p = this.partyOf(c); if (!p || !p.countdownEnd) return;
    this.stopCountdown(p); this.push(p);
    for (const id of p.members) this.info(this.ctx.clients.get(id), `Lancement annulé par ${c.name}.`);
  }
  stopCountdown(p) { if (p.timer) clearTimeout(p.timer); p.timer = null; p.countdownEnd = 0; }
  // bouton JOUER du chef : tout le monde doit être prêt et disponible ; le groupe part directement dans la salle d'attente (1 minute)
  launch(c) {
    const p = this.partyOf(c); if (!p) return;
    if (p.leader !== c.id) return this.err(c, 'Seul le chef du groupe lance la partie : clique sur PRÊT.');
    if (p.countdownEnd) return;
    const others = p.members.filter(id => id !== c.id).map(id => this.ctx.clients.get(id)).filter(Boolean);
    const waiting = others.filter(o => !p.ready.has(o.id)).map(o => o.name);
    if (waiting.length) return this.err(c, `En attente : ${waiting.join(', ')} (pas encore prêt).`);
    const busy = [c, ...others].filter(o => { const r = o.roomId && this.ctx.rooms.get(o.roomId); return r?.match && r.match.phase !== 'over'; }).map(o => o.name);
    if (busy.length) return this.err(c, `Encore en partie : ${busy.join(', ')}.`);
    if (p.cfg.mode === 'duel' && p.members.length > 2) return this.err(c, 'Le duel se joue à deux : choisis un autre mode.');
    p.ready.clear();
    this.ctx.launch(c, p.cfg, p);
    this.push(p);
  }

  removeMember(c, why) {
    const p = this.partyOf(c); if (!p) return;
    this.stopCountdown(p); p.ready.delete(c.id);
    p.members = p.members.filter(id => id !== c.id); c.partyId = null;
    if (p.members.length <= 1) {
      for (const id of p.members) { const o = this.ctx.clients.get(id); if (o) { o.partyId = null; this.ctx.send(o.id, this.payload(null)); this.info(o, `${c.name} ${why} : le groupe est dissous.`); } }
      this.parties.delete(p.id); return;
    }
    if (p.leader === c.id) p.leader = p.members[0];
    this.push(p);
    for (const id of p.members) this.info(this.ctx.clients.get(id), `${c.name} ${why}.${p.leader !== c.id && id === p.leader ? ' Tu es le nouveau chef.' : ''}`);
  }
  onDisconnect(c) { if (this.partyOf(c)) this.removeMember(c, 's\'est déconnecté'); }

  // un membre suit le chef dans son salon, dans la même équipe si possible
  bring(m, r, leader) {
    m.invites ||= new Set(); m.invites.add(r.id);
    this.ctx.joinRoom(m, r);
    if (m.roomId !== r.id || this.ctx.isFfa(r.mode) || r.match) return;
    const lm = r.members.get(leader.id), mm = r.members.get(m.id);
    if (!lm || !mm || mm.team === lm.team) return;
    const size = [...r.members.values()].filter(x => x.team === lm.team).length;
    if (size < r.maxPlayers / 2) mm.team = lm.team;
    else { // échange avec un bot de l'équipe du chef
      const bot = [...r.members.values()].find(x => x.isBot && x.team === lm.team);
      if (bot) { bot.team = mm.team; mm.team = lm.team; }
    }
    this.ctx.pushRoom(r);
  }
  // appelé quand un joueur rejoint un salon : s'il mène un groupe, les membres disponibles le suivent
  follow(c, r) {
    const p = this.partyOf(c);
    if (!p || p.leader !== c.id || r.tournament || r.quick || r.maxPlayers <= 2) return;
    for (const id of p.members) {
      if (id === c.id) continue;
      const m = this.ctx.clients.get(id); if (!m || m.roomId === r.id) continue;
      const cur = m.roomId && this.ctx.rooms.get(m.roomId);
      if (cur?.match && cur.match.phase !== 'over') { this.ctx.send(m.id, { type: 'partyFollow', from: c.name, roomId: r.id, roomName: r.name }); m.invites ||= new Set(); m.invites.add(r.id); continue; }
      this.bring(m, r, c);
      if (m.roomId === r.id) this.info(m, `Tu suis ${c.name} (chef du groupe) dans « ${r.private ? 'Salon privé' : r.name} ».`);
      else this.info(c, `${m.name} n'a pas pu te suivre (salon complet ?).`);
    }
    this.push(p);
  }
}
