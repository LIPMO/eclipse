// Tournois : duels 1v1 à élimination directe, créés par l'administration.
// Inscription (comptes uniquement) → tirage du tableau → un salon privé par match, réservé aux deux joueurs →
// le vainqueur avance. Absent 5 minutes après l'ouverture du match ou départ en cours de partie = forfait.
import fs from 'node:fs';
import path from 'node:path';
import { levelOf } from '../shared/progress.js';

export const TOUR = { sizes: [4, 8, 16, 32], targets: [2, 3, 4, 5, 7], noShowMs: 5 * 60000, keepDone: 20, maxPrize: 100000 };
const clean = (s, n) => (typeof s === 'string' ? s : '').normalize('NFKC').replace(/[<>"'`\\]/g, '').replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, n);
const int = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const ROUND_NAME = (round, total) => total - round === 1 ? 'Finale' : total - round === 2 ? 'Demi-finales' : total - round === 3 ? 'Quarts de finale' : `Tour ${round + 1}`;

export class Tournaments {
  constructor(ctx) {
    this.ctx = ctx; // { accounts, clients, rooms, send, admin, dataDir, createRoom(t, m), startMatch(r), closeRoom(r, text) }
    this.file = path.join(ctx.dataDir, 'tournaments.json');
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { /* aucun tournoi */ }
    this.list = Array.isArray(raw.list) ? raw.list : [];
    this.seq = Number(raw.seq) || 1;
    // au redémarrage, les salons de match n'existent plus : ils seront recréés à la demande
    for (const t of this.list) for (const rd of t.rounds || []) for (const m of rd) { m.roomId = null; if (m.status === 'playing') m.status = 'ready'; if (m.status === 'ready') m.readyAt = Date.now(); }
    this.timer = setInterval(() => this.tick(), 10000);
    this.timer.unref?.();
  }

  get A() { return this.ctx.accounts; }
  save() {
    clearTimeout(this.saveT);
    this.saveT = setTimeout(() => {
      const tmp = this.file + '.tmp';
      fs.writeFile(tmp, JSON.stringify({ seq: this.seq, list: this.list }), { mode: 0o600 }, err => { if (!err) fs.rename(tmp, this.file, () => {}); });
    }, 300);
  }
  get(id) { return this.list.find(t => t.id === id) || null; }
  nameOf(key) { return key ? this.A.get(key)?.name || key : null; }
  online(key) { for (const c of this.ctx.clients.values()) if (c.account === key && c.name) return c; return null; }
  log(text) { this.ctx.admin.log('tournoi', text); }
  // annonces Discord (1.32) : beaux « embeds » envoyés par le webhook de l'administration
  announce(kind, t, extra = '') {
    const admin = this.ctx.admin; if (!admin?.discord) return;
    const SITE = (process.env.SITE_URL || 'https://eclipseee.online').replace(/\/$/, '');
    const fmt = n => Number(n || 0).toLocaleString('fr-FR');
    const when = t.startAt ? `<t:${Math.round(t.startAt / 1000)}:F>\n(<t:${Math.round(t.startAt / 1000)}:R>)` : 'Dès que le staff le lance';
    const base = { url: `${SITE}/#tournois`, thumbnail: { url: `${SITE}/img/logo-512.png` } };
    if (kind === 'created') {
      admin.discord('tournament', null, { ...base,
        title: `🏆 Nouveau tournoi : ${t.name}`,
        description: `Les inscriptions sont **ouvertes** !\nDuels en élimination directe : le vainqueur remporte **${fmt(t.prize)} Éclats** et un titre exclusif.\n\n➡️ **[S'inscrire dans le jeu](${SITE}/#tournois)** (onglet TOURNOIS)`,
        fields: [
          { name: '👥 Places', value: `**${t.size}** joueurs`, inline: true },
          { name: '⚔️ Format', value: `Duel 1v1 · premier à **${t.target}** manche${t.target > 1 ? 's' : ''}`, inline: true },
          { name: '💎 Récompense', value: `**${fmt(t.prize)}** Éclats`, inline: true },
          { name: '⭐ Niveau minimum', value: `Niveau **${t.minLevel}**`, inline: true },
          { name: '🕒 Début', value: when, inline: true },
          { name: '🎖️ Organisé par', value: String(extra || '—'), inline: true },
        ],
        image: { url: `${SITE}/img/og-image.png` } });
    } else if (kind === 'started') {
      const names = t.players.map(k => this.nameOf(k)).filter(Boolean);
      admin.discord('tournament', null, { ...base,
        title: `⚔️ C'est parti : ${t.name}`,
        description: `Le tableau est tiré au sort, les premiers duels commencent !\nBonne chance à tous les participants.`,
        fields: [
          { name: `👥 Participants (${names.length})`, value: names.slice(0, 32).map(n => `• ${n}`).join('\n').slice(0, 1024) || '—', inline: false },
          { name: '⚔️ Format', value: `Premier à **${t.target}** manche${t.target > 1 ? 's' : ''}`, inline: true },
          { name: '💎 Récompense', value: `**${fmt(t.prize)}** Éclats`, inline: true },
          { name: '🗂️ Tours', value: `**${t.rounds.length}**`, inline: true },
        ] });
    } else if (kind === 'done') {
      admin.discord('tournament', null, { ...base,
        title: `👑 ${this.nameOf(t.champion) || '?'} remporte « ${t.name} » !`,
        description: `Félicitations au grand vainqueur, qui empoche **${fmt(t.prize)} Éclats** et le titre de champion.`,
        fields: [
          { name: '🥇 Champion', value: `**${this.nameOf(t.champion) || '—'}**`, inline: true },
          { name: '🥈 Finaliste', value: this.nameOf(t.runnerUp) || '—', inline: true },
          { name: '👥 Participants', value: `${t.players.length}`, inline: true },
          ...(t.startedAt ? [{ name: '⏱️ Durée', value: `${Math.max(1, Math.round((Date.now() - t.startedAt) / 60000))} min`, inline: true }] : []),
        ] });
    } else if (kind === 'cancelled') {
      admin.discord('tournament', null, { ...base, color: 0x6b6f80, title: `Tournoi annulé : ${t.name}`, description: `Raison : ${extra || 'non précisée'}.` });
    }
  }

  // ---------- vues ----------
  publicView(t, viewerKey = null) {
    const total = t.rounds?.length || 0;
    const v = {
      id: t.id, name: t.name, status: t.status, size: t.size, target: t.target, prize: t.prize, minLevel: t.minLevel, startAt: t.startAt, created: t.created,
      players: t.players.map(k => this.nameOf(k)), count: t.players.length,
      champion: this.nameOf(t.champion), runnerUp: this.nameOf(t.runnerUp), endedAt: t.endedAt || null,
      rounds: (t.rounds || []).map((rd, ri) => ({ name: ROUND_NAME(ri, total), matches: rd.map(m => ({ id: m.id, p1: this.nameOf(m.p1), p2: this.nameOf(m.p2), winner: this.nameOf(m.winner), status: m.status, bye: !!m.bye, forfeit: !!m.forfeit, score: m.score || null })) })),
    };
    if (viewerKey) {
      v.registered = t.players.includes(viewerKey);
      const my = this.currentMatch(t, viewerKey);
      if (my) v.myMatch = { id: my.id, opponent: this.nameOf(my.p1 === viewerKey ? my.p2 : my.p1), status: my.status, deadline: my.readyAt ? my.readyAt + TOUR.noShowMs : null };
      v.eliminated = t.status === 'running' && t.players.includes(viewerKey) && !my && t.champion !== viewerKey && this.isOut(t, viewerKey);
    }
    return v;
  }
  visible() {
    const done = this.list.filter(t => t.status === 'done' || t.status === 'cancelled').slice(-6);
    return [...this.list.filter(t => t.status === 'open' || t.status === 'running'), ...done.reverse()];
  }
  payloadFor(c) { return { type: 'tournaments', list: this.visible().map(t => this.publicView(t, c.account)) }; }
  // regroupé : plusieurs changements rapprochés ne déclenchent qu'un seul envoi à tous les joueurs
  pushAll() {
    if (this.pushT) return;
    this.pushT = setTimeout(() => { this.pushT = null; for (const c of this.ctx.clients.values()) if (c.name) this.ctx.send(c.id, this.payloadFor(c)); }, 400);
  }

  currentMatch(t, key) {
    if (t.status !== 'running') return null;
    for (const rd of t.rounds) for (const m of rd) if ((m.p1 === key || m.p2 === key) && m.p1 && m.p2 && m.status !== 'done') return m;
    return null;
  }
  isOut(t, key) { for (const rd of t.rounds) for (const m of rd) if (m.status === 'done' && (m.p1 === key || m.p2 === key) && m.winner !== key) return true; return false; }
  findMatch(t, id) { for (const rd of t.rounds || []) for (const m of rd) if (m.id === id) return m; return null; }

  // ---------- joueurs ----------
  handle(c, msg) {
    if (typeof msg.type !== 'string' || !msg.type.startsWith('tour')) return false;
    if (msg.type === 'tourList') { this.ctx.send(c.id, this.payloadFor(c)); return true; }
    const u = c.account && this.A.get(c.account);
    if (!u) { this.ctx.send(c.id, { type: 'error', text: 'Les tournois sont réservés aux comptes.' }); return true; }
    const t = this.get(String(msg.id || ''));
    if (!t) { this.ctx.send(c.id, { type: 'error', text: 'Tournoi introuvable.' }); return true; }
    const err = text => this.ctx.send(c.id, { type: 'error', text });
    if (msg.type === 'tourRegister') {
      if (t.status !== 'open') return err('Les inscriptions sont fermées.'), true;
      if (t.players.includes(c.account)) return err('Tu es déjà inscrit.'), true;
      if (t.players.length >= t.size) return err('Le tournoi est complet.'), true;
      if (levelOf(u.xp || 0) < t.minLevel) return err(`Niveau ${t.minLevel} requis pour ce tournoi.`), true;
      if (this.ctx.admin.activeBan('account', c.account)) return err('Compte suspendu.'), true;
      t.players.push(c.account); this.save(); this.pushAll();
      this.ctx.send(c.id, { type: 'tourNotice', text: `Inscription confirmée au tournoi « ${t.name} ».` });
    } else if (msg.type === 'tourUnregister') {
      if (t.status !== 'open') return err('Le tournoi a commencé : impossible de se désinscrire.'), true;
      t.players = t.players.filter(k => k !== c.account); this.save(); this.pushAll();
    } else if (msg.type === 'tourPlay') {
      const m = this.currentMatch(t, c.account);
      if (!m) return err('Tu n\'as pas de match à jouer pour l\'instant.'), true;
      const cur = c.roomId && this.ctx.rooms.get(c.roomId);
      if (cur && cur.match && cur.match.phase !== 'over' && cur.tournament?.match !== m.id) return err('Termine ta partie en cours avant de rejoindre ton match.'), true;
      let r = m.roomId && this.ctx.rooms.get(m.roomId);
      if (!r) { r = this.ctx.createRoom(t, m, `${t.name} · ${this.nameOf(m.p1)} vs ${this.nameOf(m.p2)}`); m.roomId = r.id; }
      this.ctx.joinRoom(c, r);
    }
    return true;
  }

  // appelé par le serveur quand un joueur entre dans un salon de tournoi
  onJoin(r) {
    const info = r.tournament; if (!info) return;
    const t = this.get(info.tid); const m = t && this.findMatch(t, info.match);
    if (!m || m.status === 'done') return;
    const humans = [...r.members.values()].filter(x => !x.isBot);
    if (r.state === 'lobby' && humans.length === 2 && humans.every(h => h.account === m.p1 || h.account === m.p2)) {
      for (const h of humans) this.ctx.send(h.id, { type: 'chat', from: 'SYSTÈME', text: 'Les deux joueurs sont là : le match commence dans 5 secondes. Bonne chance !' });
      clearTimeout(r.tourStartT);
      r.tourStartT = setTimeout(() => {
        const hs = [...r.members.values()].filter(x => !x.isBot);
        if (this.ctx.rooms.has(r.id) && r.state === 'lobby' && hs.length === 2 && m.status !== 'done') { m.status = 'playing'; this.save(); this.ctx.startMatch(r); this.pushAll(); }
      }, 5000);
    }
  }
  // un joueur quitte le salon pendant le match : forfait
  onLeave(r, c) {
    const info = r.tournament; if (!info || !c.account) return;
    const t = this.get(info.tid); const m = t && this.findMatch(t, info.match);
    if (!m || m.status !== 'playing' || !r.match || r.match.phase === 'over') return;
    const winner = m.p1 === c.account ? m.p2 : m.p1;
    this.finish(t, m, winner, { forfeit: true });
    for (const o of r.members.values()) if (!o.isBot) this.ctx.send(o.id, { type: 'chat', from: 'SYSTÈME', text: `${c.name} a quitté le match : victoire par forfait.` });
    this.ctx.closeRoom(r, 'Victoire par forfait : ton adversaire a quitté le match.');
    return true;
  }
  // fin de partie d'un salon de tournoi
  onResults(r, results) {
    const info = r.tournament; if (!info) return;
    const t = this.get(info.tid); const m = t && this.findMatch(t, info.match);
    if (!m || m.status === 'done') return;
    const w = results.find(x => x.won && (x.account === m.p1 || x.account === m.p2));
    if (!w) { m.status = 'ready'; this.save(); return; } // pas de vainqueur (partie annulée) : on rejoue
    this.finish(t, m, w.account, { score: w.scoreLine || null });
  }
  afterMatchEnd(r) {
    // le résultat est enregistré : le salon se ferme quelques secondes après l'écran de fin
    const info = r.tournament; if (!info) return;
    const t = this.get(info.tid); const m = t && this.findMatch(t, info.match);
    if (m && m.status === 'done') setTimeout(() => { if (this.ctx.rooms.has(r.id) && !r.match) this.ctx.closeRoom(r, 'Match de tournoi terminé : consulte le tableau dans l\'onglet TOURNOIS.'); }, 4000);
    else if (m) this.onJoin(r);
  }

  // ---------- déroulement ----------
  create({ name, size, target, prize, minLevel, startAt }, by) {
    name = clean(name, 40);
    if (name.length < 3) throw new Error('Nom du tournoi : 3 à 40 caractères.');
    size = TOUR.sizes.includes(Number(size)) ? Number(size) : 8;
    const t = {
      id: 't' + (this.seq++), name, size, target: TOUR.targets.includes(Number(target)) ? Number(target) : 3,
      prize: int(prize, 0, TOUR.maxPrize, 1000), minLevel: int(minLevel, 1, 100, 1),
      startAt: Number(startAt) > Date.now() ? Number(startAt) : null, status: 'open', players: [], rounds: [], created: Date.now(), by,
    };
    this.list.push(t); this.save(); this.pushAll();
    this.log(`Tournoi « ${t.name} » créé par ${by} (${t.size} places, ${t.prize} Éclats)`);
    this.announce('created', t, by);
    for (const c of this.ctx.clients.values()) if (c.name && c.account) this.ctx.send(c.id, { type: 'tourNew', id: t.id, name: t.name, size: t.size, prize: t.prize });
    return t;
  }

  start(t, by = 'automatique') {
    if (t.status !== 'open') throw new Error('Ce tournoi n\'est pas en phase d\'inscription.');
    if (t.players.length < 2) { this.cancel(t, 'moins de 2 inscrits'); throw new Error('Moins de 2 inscrits : tournoi annulé.'); }
    const players = t.players.slice();
    for (let i = players.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [players[i], players[j]] = [players[j], players[i]]; }
    let size = 2; while (size < players.length) size *= 2;
    const nRounds = Math.log2(size);
    t.rounds = [];
    for (let r = 0; r < nRounds; r++) t.rounds.push(Array.from({ length: size / 2 ** (r + 1) }, (_, i) => ({ id: `${r}-${i}`, p1: null, p2: null, winner: null, status: 'wait' })));
    const first = t.rounds[0], half = size / 2;
    for (let i = 0; i < half; i++) first[i].p1 = players[i];
    for (let i = half; i < players.length; i++) first[i - half].p2 = players[i];
    t.status = 'running'; t.startedAt = Date.now();
    this.log(`Tournoi « ${t.name} » lancé (${players.length} joueurs) — ${by}`);
    this.announce('started', t, by);
    for (const [i, m] of first.entries()) {
      if (!m.p2) { m.winner = m.p1; m.status = 'done'; m.bye = true; this.advance(t, 0, i, m.p1); }
      else this.makeReady(t, m);
    }
    this.save(); this.pushAll();
  }

  makeReady(t, m) {
    m.status = 'ready'; m.readyAt = Date.now();
    const total = t.rounds.length; const ri = Number(m.id.split('-')[0]);
    for (const [k, o] of [[m.p1, m.p2], [m.p2, m.p1]]) {
      const c = this.online(k);
      if (c) this.ctx.send(c.id, { type: 'tourMatch', id: t.id, name: t.name, round: ROUND_NAME(ri, total), opponent: this.nameOf(o), minutes: TOUR.noShowMs / 60000 });
    }
  }

  advance(t, ri, mi, winner) {
    if (ri + 1 >= t.rounds.length) return this.complete(t, winner);
    const next = t.rounds[ri + 1][Math.floor(mi / 2)];
    if (mi % 2 === 0) next.p1 = winner; else next.p2 = winner;
    if (next.p1 && next.p2) this.makeReady(t, next);
  }

  finish(t, m, winner, { forfeit = false, score = null, manual = false } = {}) {
    if (m.status === 'done') return;
    m.winner = winner; m.status = 'done'; m.forfeit = forfeit; m.score = score; m.manual = manual;
    const [ri, mi] = m.id.split('-').map(Number);
    this.log(`« ${t.name} » ${m.id} : ${this.nameOf(winner)} bat ${this.nameOf(m.p1 === winner ? m.p2 : m.p1)}${forfeit ? ' (forfait)' : ''}${manual ? ' (décision du staff)' : ''}`);
    this.advance(t, ri, mi, winner);
    this.save(); this.pushAll();
  }

  complete(t, champion) {
    t.status = 'done'; t.champion = champion; t.endedAt = Date.now();
    const final = t.rounds[t.rounds.length - 1][0];
    t.runnerUp = final.p1 === champion ? final.p2 : final.p1;
    this.announce('done', t);
    const pay = (key, amount, title) => {
      const u = key && this.A.get(key); if (!u) return;
      if (amount > 0) { u.eclats = (u.eclats || 0) + amount; this.ctx.admin.economy?.('earn', amount); }
      if (title) { u.titles ||= []; if (!u.titles.includes(title)) u.titles.push(title); }
      u.tournamentWins = (u.tournamentWins || 0) + (title ? 1 : 0);
      const c = this.online(key);
      if (c) { this.ctx.send(c.id, { type: 'profile', profile: this.A.publicProfile(u) }); this.ctx.send(c.id, { type: 'tourNotice', text: title ? `Tu remportes le tournoi « ${t.name} » ! +${amount} Éclats et le titre Champion.` : `Finaliste du tournoi « ${t.name} » : +${amount} Éclats.` }); }
    };
    // historique des tournois sur le profil de chaque participant
    const total = t.rounds.length;
    const place = new Map();
    t.rounds.forEach((rd, ri) => rd.forEach(m => { if (m.status === 'done' && !m.bye) { const loser = m.winner === m.p1 ? m.p2 : m.p1; if (loser) place.set(loser, ri === total - 1 ? 'Finaliste' : ROUND_NAME(ri, total)); } }));
    place.set(champion, 'Vainqueur');
    for (const k of t.players) { const u = this.A.get(k); if (!u) continue; u.tourHist ||= []; u.tourHist.unshift({ name: t.name, place: place.get(k) || 'Participant', t: Date.now() }); if (u.tourHist.length > 20) u.tourHist.length = 20; }
    pay(champion, t.prize, 'champion');
    pay(t.runnerUp, Math.round(t.prize / 2), null);
    this.A.save();
    this.log(`Tournoi « ${t.name} » remporté par ${this.nameOf(champion)}`);
    this.ctx.admin.discord?.('tournament', `🏆 **${this.nameOf(champion)}** remporte le tournoi « ${t.name} » (finaliste : ${this.nameOf(t.runnerUp)})`);
    for (const c of this.ctx.clients.values()) if (c.name) this.ctx.send(c.id, { type: 'system', kind: 'notice', text: `🏆 ${this.nameOf(champion)} remporte le tournoi « ${t.name} » !` });
    this.prune();
  }

  cancel(t, why) {
    if (t.status === 'done' || t.status === 'cancelled') return;
    t.status = 'cancelled'; t.endedAt = Date.now(); t.cancelReason = why;
    for (const rd of t.rounds || []) for (const m of rd) { const r = m.roomId && this.ctx.rooms.get(m.roomId); if (r) this.ctx.closeRoom(r, 'Le tournoi a été annulé.'); }
    this.log(`Tournoi « ${t.name} » annulé (${why})`);
    this.announce('cancelled', t, why);
    this.save(); this.pushAll(); this.prune();
  }
  prune() {
    const done = this.list.filter(t => t.status === 'done' || t.status === 'cancelled');
    if (done.length > TOUR.keepDone) { const drop = new Set(done.slice(0, done.length - TOUR.keepDone)); this.list = this.list.filter(t => !drop.has(t)); this.save(); }
  }

  // toutes les 10 s : départ programmé, forfaits pour absence
  tick() {
    const now = Date.now();
    for (const t of this.list) {
      if (t.status === 'open' && t.startAt && now >= t.startAt) { try { this.start(t); } catch { /* annulé faute de joueurs */ } continue; }
      if (t.status !== 'running') continue;
      for (const rd of t.rounds) for (const m of rd) {
        if (m.status !== 'ready' || !m.readyAt || now - m.readyAt < TOUR.noShowMs) continue;
        const r = m.roomId && this.ctx.rooms.get(m.roomId);
        const present = r ? [...r.members.values()].filter(x => !x.isBot).map(x => x.account) : [];
        const in1 = present.includes(m.p1), in2 = present.includes(m.p2);
        if (in1 && in2) continue; // les deux sont là : le match va démarrer
        // un seul présent : il gagne. Aucun : celui qui est connecté, sinon le premier du tableau
        const winner = in1 ? m.p1 : in2 ? m.p2 : this.online(m.p1) ? m.p1 : this.online(m.p2) ? m.p2 : m.p1;
        this.finish(t, m, winner, { forfeit: true });
        if (r) this.ctx.closeRoom(r, 'Victoire par forfait : ton adversaire ne s\'est pas présenté.');
      }
    }
  }

  // ---------- administration ----------
  adminList() { return this.list.slice().reverse().map(t => ({ ...this.publicView(t), by: t.by, cancelReason: t.cancelReason || null })); }
  setWinner(t, matchId, name, by) {
    const m = this.findMatch(t, String(matchId || ''));
    if (!m || t.status !== 'running') throw new Error('Match introuvable.');
    if (!m.p1 || !m.p2) throw new Error('Les deux joueurs de ce match ne sont pas encore connus.');
    if (m.status === 'done') throw new Error('Ce match est déjà terminé.');
    const k = this.A.key(String(name || ''));
    if (k !== m.p1 && k !== m.p2) throw new Error('Ce joueur ne fait pas partie du match.');
    const r = m.roomId && this.ctx.rooms.get(m.roomId);
    this.finish(t, m, k, { manual: true });
    if (r) this.ctx.closeRoom(r, `Match arbitré par le staff (${by}) : ${this.nameOf(k)} l'emporte.`);
  }
  remove(t) {
    if (t.status === 'open' || t.status === 'running') throw new Error('Annule d\'abord le tournoi.');
    this.list = this.list.filter(x => x !== t); this.save(); this.pushAll();
  }
  onAccountDeleted(key) {
    for (const t of this.list) {
      if (t.status === 'open') t.players = t.players.filter(k => k !== key);
      if (t.status === 'running') { const m = this.currentMatch(t, key); if (m) this.finish(t, m, m.p1 === key ? m.p2 : m.p1, { forfeit: true }); }
    }
    this.save();
  }
}
