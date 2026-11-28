// Logique de partie autoritaire côté serveur
import { brTeamSize, WEAPONS, AGENTS, ROUND, FFA, DUEL, PLAYER, MOVE, TICK_RATE, ARMOR, REWARDS, sideOf, AGENT_ORDER, isFfa, isLastStand, BR, GUN_LADDER, KIT, WEAPON_RULES, cleanCustomOpts, SNAP_EVERY, STATS_EVERY, KNIFE_THROW, lossBonus, knifePower, TIMEOUT, reloadTime, partialShells, FALL, BASH } from '../shared/data.js';
import { parseMap, CELL } from '../shared/maps.js';
import { raycastBoxes, rayAABB, raySphere, hitboxes, norm, groundHeight, depenetrate } from '../shared/physics.js';
import { BotBrain } from './bot.js';
import { WEAPON_UNLOCK } from '../shared/progress.js';
// retard de la retransmission pour les amis spectateurs (ms)
export const FRIEND_DELAY = 10000;

const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
// normale de la face d'une boîte la plus proche d'un point (rebond des grenades)
function boxNormal(pt, b) {
  if (!b || !b.min) return [0, 1, 0]; // sol de la carte
  const d = [[pt[0] - b.min[0], [-1, 0, 0]], [b.max[0] - pt[0], [1, 0, 0]], [pt[1] - b.min[1], [0, -1, 0]], [b.max[1] - pt[1], [0, 1, 0]], [pt[2] - b.min[2], [0, 0, -1]], [b.max[2] - pt[2], [0, 0, 1]]];
  let best = d[0];
  for (const x of d) if (Math.abs(x[0]) < Math.abs(best[0])) best = x;
  return best[1];
}
const finite = v => typeof v === 'number' && Number.isFinite(v);
// distance de sortie d'un rayon qui traverse une boîte (méthode des « tranches »)
function rayExit(o, d, min, max) {
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) continue;
    const t1 = (min[i] - o[i]) / d[i], t2 = (max[i] - o[i]) / d[i];
    tmax = Math.min(tmax, Math.max(t1, t2));
  }
  return tmax;
}

const T_NADE_CD = (p, T) => T - (p.nadeT || -9) < 0.9; // une grenade toutes les 0,9 s
export class Match {
  constructor(room, io) {
    this.room = room;
    this.io = io; // { send(id,obj), sendRaw(id,str), onEnd() }
    this.map = parseMap(room.mapId);
    this.brTeam = brTeamSize(room.mode); // duos / escouades : on joue en Battle Royale avec des équipes
    this.mode = this.brTeam > 1 ? 'br' : room.mode; // 'assault' | 'duel' | 'ffa' | 'gungame' | 'lives' | 'br'
    this.target = room.target;
    this.difficulty = room.difficulty;
    this.time = 0;
    this.tickCount = 0;
    this.players = new Map();
    this.phase = 'warmup';
    this.phaseEnd = 0;
    this.round = 0;
    this.half = 0;
    this.lossStreak = { alpha: 0, beta: 0 }; // défaites d'affilée par équipe (bonus de défaite)
    this.timeoutsUsed = { alpha: 0, beta: 0 }; // temps morts tactiques utilisés cette mi-temps
    this.sideFlip = false; // manche au couteau : le gagnant a choisi l'autre côté
    this.score = { alpha: 0, beta: 0 };
    this.projectiles = []; this.smokes = []; this.fires = []; this.walls = []; this.drops = [];
    this.nextId = 1;
    this.core = { status: 'none', carrier: null, pos: null, site: null, plantedAt: 0 };
    this.overAt = 0;
    this.pendingOver = null;
    this.resetEconomy = true;
    this.botSite = 'A';
    this.wallBoxesCache = null;
    this.paused = false; // pause décidée depuis l'administration
    // options du salon : munitions infinies, sans capacités, têtes uniquement, gravité basse
    const o = room.opts || {};
    // règles personnalisées (1.16) : vitesse, dégâts reçus, armes autorisées, argent, durées, réapparition
    const c = cleanCustomOpts(o);
    this.opts = { ...c, lowGrav: c.lowGrav || !!io.eventLowGrav?.(), friendlyFire: c.friendlyFire && !isFfa(room.mode), bigHead: c.bigHead || !!io.eventBigHead?.(), wallJump: io.wallJumpEnabled ? io.wallJumpEnabled() !== false : true };
    this.turbo = !!io.eventTurbo?.(); // événement serveur « turbo » : vitesse ×1,3
    this.customOpts = c; // règles choisies par l'hôte (sans les événements du serveur)
    this.speedBase = (this.turbo ? 1.3 : 1) * (c.speed || 1);
    this.dmgMul = c.dmg || 1;
    this.wRule = this.mode === 'gungame' ? null : WEAPON_RULES[c.weapons] || null;
    this.firstBlood = false; this.roundHistory = []; this.leaderId = null; this.emoteT = new Map();
  }

  // ---------- Gestion des joueurs ----------
  makePlayer(m) {
    const agent = AGENTS[m.agent] ? m.agent : AGENT_ORDER[0];
    const p = {
      id: m.id, name: m.name, isBot: !!m.isBot, team: m.team, agent, skins: m.skins || {}, outfits: m.outfits || {},
      pos: [0, 0, 0], yaw: 0, pitch: 0, crouch: false, alive: false,
      hp: 100, armor: 0, money: ROUND.startMoney,
      weapons: { 1: null, 2: this.newWeapon('spark'), 3: { id: 'knife' } }, slot: 2,
      lastShot: -10, reloadEnd: 0, charges: {}, recharge: {}, ult: 0,
      kills: 0, deaths: 0, assists: 0, score: 0, damagedBy: new Map(),
      healEnd: 0, healRate: 0, buffEnd: 0, buffSpeed: 1, hasteEnd: 0, slowEnd: 0, speedPeak: 1, speedPeakEnd: 0, speedMul: 1, rateMul: 1, invisEnd: 0, revealEnd: 0, blindEnd: 0,
      interact: false, prog: 0, progKind: null, interactPos: null,
      respawnAt: 0, diedAt: 0, roundsWon: 0, account: m.account || null, lastDamagedBy: null, lastDamagedAt: -10, joinedMidRound: false,
      level: m.isBot ? 999 : (m.level || 1), prestige: m.isBot ? 0 : (m.prestige || 0), title: m.title || null, clan: m.clan || null, gun: 0,
      streak: 0, bestStreak: 0, lives: this.mode === 'lives' ? (this.target || 3) : this.mode === 'br' ? 1 : 0, out: false, weaponKills: {}, roundDmg: 0,
      // statistiques détaillées (progression, quêtes, anti-triche)
      dmg: 0, hsKills: 0, knifeKills: 0, shots: 0, hits: 0, plants: 0, defuses: 0, aces: 0, multi3: 0, abilities: 0, ults: 0, roundKills: 0,
      slides: 0, adsShots: 0,
    };
    this.refillCharges(p);
    if (p.isBot) p.brain = new BotBrain(this, p, m.botDiff || this.difficulty); // difficulté propre au bot (parties perso)
    return p;
  }

  newWeapon(id) {
    const d = WEAPONS[id];
    return { id, mag: d.mag || 0, reserve: d.reserve || 0, boughtRound: -1, buyer: null };
  }

  refillCharges(p) {
    const ag = AGENTS[p.agent];
    p.charges = { q: ag.abilities.q.charges, e: ag.abilities.e.charges };
    p.recharge = {};
  }

  rosterMsg() {
    return {
      type: 'roster',
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, agent: p.agent, of: p.outfits?.[p.agent] || null, bot: p.isBot, skins: p.skins, title: p.title, clan: p.clan || null, level: p.isBot ? null : p.level, prestige: p.isBot ? 0 : p.prestige || 0 })),
    };
  }

  addPlayer(m) {
    const p = this.makePlayer(m);
    this.players.set(p.id, p);
    if (isFfa(this.mode)) this.spawnFFA(p);
    else { p.alive = false; p.joinedMidRound = true; }
    this.broadcast(this.rosterMsg());
    if (!p.isBot) this.io.send(p.id, this.startMsg(p.id));
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    // les amis qui regardaient ce joueur voient la fin de sa partie (après le différé)
    if (this.friendWatched(id)) this.queueDelayed(id, JSON.stringify({ type: 'specEnd', text: `${p.name} a quitté la partie.` }), true);
    if (this.core.carrier === id) this.dropCore(p);
    this.players.delete(id);
    this.broadcast(this.rosterMsg());
  }

  updateMember(m) {
    const p = this.players.get(m.id);
    if (!p) return;
    if (m.skins) p.skins = m.skins;
    if (m.outfits) p.outfits = m.outfits;
    if ('clan' in m) p.clan = m.clan || null;
    this.broadcast(this.rosterMsg());
  }

  startMsg(id) {
    const p = this.players.get(id);
    return { type: 'matchStart', you: id, mapId: this.map.id, mode: this.mode, brTeam: this.brTeam, target: this.target, players: this.rosterMsg().players, level: p?.prestige ? 999 : p?.level || 1, unlocks: this.unlocksOn(), opts: this.opts, diff: this.difficulty, slide: this.slideOn(), fx: { bigHead: !!this.opts.bigHead, turbo: this.turbo }, custom: this.customOpts };
  }

  // déblocage des armes par niveau (désactivable dans l'administration)
  // en Mêlée, tout le monde a l'équipement complet ; les bots suivent le niveau du joueur humain le plus bas (combat équitable)
  weaponAllowed(id) { return !this.wRule || this.wRule.allow.includes(id); }
  // applique la règle « Armes » : retire les armes interdites, offre l'arme principale prévue
  applyWeaponRule(p) {
    const r = this.wRule; if (!r) return;
    for (const s of [1, 2]) if (p.weapons[s] && !r.allow.includes(p.weapons[s].id)) p.weapons[s] = null;
    if (r.give && !p.weapons[1]) p.weapons[1] = this.newWeapon(r.give);
    if (!r.noPistol && !p.weapons[2]) p.weapons[2] = this.newWeapon('spark');
    p.slot = p.weapons[1] ? 1 : p.weapons[2] ? 2 : 3;
  }
  unlocksOn() { return !isFfa(this.mode) && (this.io.weaponUnlocks ? !!this.io.weaponUnlocks() : false); }
  humanCount() { let n = 0; for (const q of this.players.values()) if (!q.isBot) n++; return n; }
  humanMinLevel() { let l = Infinity; for (const q of this.players.values()) if (!q.isBot) l = Math.min(l, q.prestige ? 999 : q.level || 1); return l === Infinity ? 999 : l; }
  weaponLocked(p, id) { return this.unlocksOn() && !p.prestige && (WEAPON_UNLOCK[id] || 1) > (p.isBot ? this.humanMinLevel() : p.level); }

  start(members) {
    for (const m of members) this.players.set(m.id, this.makePlayer(m));
    if (this.brTeam > 1) { const list = [...this.players.values()].sort((a, b) => (a.isBot - b.isBot)); list.forEach((p, i) => { p.team = 'sq' + (1 + Math.floor(i / this.brTeam)); }); }
    this.io.onEvent?.('start', { players: [...this.players.values()].map(p => ({ agent: p.agent, isBot: p.isBot })) });
    for (const p of this.players.values()) if (!p.isBot) this.io.send(p.id, this.startMsg(p.id));
    if (isFfa(this.mode)) {
      if (this.mode === 'br') this.initBus();
      for (const p of this.players.values()) this.spawnFFA(p);
      this.phase = 'live';
      this.phaseEnd = this.time + (this.mode === 'br' ? BR.timeLimit : this.opts.timeLimit || (this.mode === 'gungame' ? FFA.gunTimeLimit : FFA.timeLimit));
      if (this.mode === 'br') this.initBR();
    } else {
      this.phase = 'warmup';
      this.phaseEnd = this.time + 2;
    }
  }

  // mi-temps « effective » : la manche au couteau peut inverser les côtés de départ
  effHalf() { return (this.half + (this.sideFlip ? 1 : 0)) % 2; }
  side(p) { return sideOf(p.team, this.effHalf()); }
  isEnemy(a, b) { return a.id !== b.id && ((isFfa(this.mode) && this.brTeam <= 1) || a.team !== b.team); }
  eye(p) { return [p.pos[0], p.pos[1] + (p.crouch ? PLAYER.eyeCrouch : PLAYER.eye), p.pos[2]]; }

  allBoxes() {
    if (!this.wallBoxesCache) this.wallBoxesCache = this.map.boxes.concat(this.walls);
    return this.wallBoxesCache;
  }

  broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const p of this.players.values()) if (!p.isBot) this.io.sendRaw(p.id, s);
    if (this.spectators?.size) for (const id of this.spectators.keys()) this.io.sendRaw(id, s);
    if (this.friendSpecs?.size) this.queueDelayed(null, s);
  }
  send(p, obj) {
    if (!p.isBot) this.io.send(p.id, obj);
    // le staff qui observe ce joueur reçoit aussi ses événements (touches, dégâts, aveuglement…)
    if (this.spectators?.size && obj.type !== 'killcam') for (const [id, sp] of this.spectators) if (sp.target === p.id) this.io.send(id, obj);
    if (this.friendSpecs?.size && obj.type !== 'killcam' && this.friendWatched(p.id)) this.queueDelayed(p.id, JSON.stringify(obj));
  }

  // ---------- amis spectateurs : retransmission EN DIFFÉRÉ (anti-triche) ----------
  // L'ami voit exactement ce que voit le joueur suivi (mêmes informations filtrées, aucun rayon X),
  // avec FRIEND_DELAY ms de retard : impossible de renseigner le joueur en direct.
  addFriendSpectator(cid, targetId) {
    const t = this.players.get(targetId);
    if (!t || t.isBot || this.phase === 'over') return false;
    (this.friendSpecs ||= new Map()).set(cid, { target: t.id });
    this.io.send(cid, { ...this.startMsg(t.id), you: t.id, spectate: true, friendSpec: true, delay: FRIEND_DELAY / 1000, watchName: t.name });
    if (!this.delayTimer) { this.delayTimer = setInterval(() => this.pumpDelayed(), 50); this.delayTimer.unref?.(); }
    return true;
  }
  removeFriendSpectator(cid) { this.friendSpecs?.delete(cid); }
  friendSpecCount(targetId) { let n = 0; for (const s of this.friendSpecs?.values() || []) if (!targetId || s.target === targetId) n++; return n; }
  friendWatched(pid) { for (const s of this.friendSpecs?.values() || []) if (s.target === pid) return true; return false; }
  queueDelayed(target, str, end = false) {
    const q = (this.delayQ ||= []);
    if (q.length >= 6000) q.shift(); // garde-fou mémoire (≈ 40 s de partie)
    q.push({ at: Date.now() + FRIEND_DELAY, target, str, end });
  }
  pumpDelayed() {
    const q = this.delayQ || [], now = Date.now();
    while (q.length && q[0].at <= now) {
      const e = q.shift();
      for (const [cid, s] of this.friendSpecs || []) {
        if (e.target !== null && e.target !== s.target) continue;
        this.io.sendRaw(cid, e.str);
        if (e.end) { this.friendSpecs.delete(cid); this.io.onFriendSpecEnd?.(cid); }
      }
    }
    if (!q.length && (this.closed || !this.friendSpecs?.size)) {
      if (this.closed) for (const cid of [...(this.friendSpecs?.keys() || [])]) { this.io.send(cid, { type: 'specEnd', text: 'La partie est terminée.' }); this.io.onFriendSpecEnd?.(cid); }
      this.friendSpecs?.clear();
      clearInterval(this.delayTimer); this.delayTimer = null;
    }
  }
  // la partie est finie (salon fermé ou retour au salon) : on termine la retransmission une fois le différé écoulé
  closeFriendSpecs() { this.closed = true; if (this.friendSpecs?.size && !this.delayTimer) { this.delayTimer = setInterval(() => this.pumpDelayed(), 50); this.delayTimer.unref?.(); } }

  // ---------- spectateur staff (invisible) ----------
  addSpectator(cid, targetId) {
    const t = this.players.get(targetId) || [...this.players.values()].find(p => !p.isBot) || [...this.players.values()][0];
    if (!t) return false;
    (this.spectators ||= new Map()).set(cid, { target: t.id });
    this.io.send(cid, { ...this.startMsg(t.id), you: t.id, spectate: true });
    this.sendSpecInfo(cid);
    return true;
  }
  switchSpectator(cid, targetId) {
    const sp = this.spectators?.get(cid); const t = this.players.get(targetId);
    if (!sp || !t) return false;
    sp.target = t.id;
    this.io.send(cid, { type: 'specTarget', you: t.id });
    this.sendSpecInfo(cid);
    return true;
  }
  removeSpectator(cid) { this.spectators?.delete(cid); }
  endSpectators(text) {
    this.closeFriendSpecs();
    if (!this.spectators?.size) return;
    for (const id of this.spectators.keys()) this.io.send(id, { type: 'specEnd', text });
    this.spectators.clear();
  }
  // fiche du joueur observé (1 fois par seconde)
  sendSpecInfo(cid) {
    const sp = this.spectators?.get(cid); if (!sp) return;
    const p = this.players.get(sp.target);
    if (!p) { const next = [...this.players.values()].find(q => !q.isBot) || [...this.players.values()][0]; if (next) this.switchSpectator(cid, next.id); else this.io.send(cid, { type: 'specEnd', text: 'Plus aucun joueur dans la partie.' }); return; }
    const w = p.weapons[p.slot];
    this.io.send(cid, { type: 'specInfo',
      p: { id: p.id, name: p.name, account: !!p.account, bot: p.isBot, level: p.isBot ? null : p.level, title: p.title, clan: p.clan, agent: p.agent, team: p.team,
        hp: Math.ceil(p.hp), armor: Math.ceil(p.armor), money: p.money, weapon: w ? w.id : null, mag: w?.mag ?? null, reserve: w?.reserve ?? null,
        weapons: [1, 2, 3].map(k => p.weapons[k]?.id).filter(Boolean), kills: p.kills, deaths: p.deaths, assists: p.assists, score: p.score,
        hs: p.hsKills, shots: p.shots, hits: p.hits, dmg: Math.round(p.dmg), abilities: p.abilities, ults: p.ults, strikes: p.cheatStrikes || 0,
        ping: p.ping || 0, alive: p.alive, gun: this.mode === 'gungame' ? p.gun : undefined, speed: Math.round(Math.hypot(...(p.snapVel || [0, 0])) * 10) / 10 },
      players: [...this.players.values()].map(q => ({ id: q.id, name: q.name, team: q.team, bot: q.isBot, alive: q.alive, k: q.kills, d: q.deaths })),
      mode: this.mode, map: this.map.id, phase: this.phase, ac: this.acOn() });
  }
  acOn() { return this.io.anticheat ? this.io.anticheat().on !== false : true; }

  teleport(p, pos, yaw) {
    p.pos = pos.slice(); p.yaw = yaw; p.pitch = 0;
    // le client continue d'envoyer son ancienne position tant qu'il n'a pas reçu la téléportation
    p.tpGrace = this.time + 1.5; p.tpPos = p.pos.slice();
    p.lastValid = { pos: p.pos.slice(), t: this.time };
    p.fallTop = null;
    this.send(p, { type: 'teleport', p: p.pos, y: yaw });
  }

  // ---------- Manches ----------
  startRound() {
    this.knifeRound = !!(this.opts.knifeRound && this.mode === 'assault' && !this.knifeDone && this.round === 0);
    this.round++;
    this.phase = 'buy';
    this.phaseEnd = this.time + (this.mode === 'duel' ? DUEL.buyTime : ROUND.buyTime);
    for (const tr of this.traps || []) this.broadcast({ type: 'trapGone', id: tr.id });
    this.projectiles = []; this.smokes = []; this.fires = []; this.walls = []; this.wallBoxesCache = null; this.drops = []; this.readyDone = false; this.traps = [];
    this.core = { status: 'carried', carrier: null, pos: null, site: null, plantedAt: 0 };
    this.botSite = Math.random() < 0.5 ? 'A' : 'B';
    const spawnSets = { atk: shuffle(this.map.spawns.atk.slice()), def: shuffle(this.map.spawns.def.slice()) };
    const idx = { atk: 0, def: 0 };
    const reset = this.resetEconomy;
    this.resetEconomy = false;
    if (reset) this.lossStreak = { alpha: 0, beta: 0 };
    const [mw, mh] = this.map.size;
    for (const p of this.players.values()) {
      const side = this.side(p);
      if (reset) { p.money = this.opts.money || ROUND.startMoney; p.kit = false; }
      if (this.opts.money >= ROUND.maxMoney && this.mode === 'assault') p.money = ROUND.maxMoney; // argent illimité
      p.lastActive = this.time; p.afkWarned = false; // inactivité : remise à zéro à chaque manche
      if (this.mode === 'duel') p.money = DUEL.money;
      if (reset || !p.alive) {
        p.weapons = { 1: null, 2: this.newWeapon('spark'), 3: { id: 'knife' } };
        p.armor = 0; p.kit = false;
      } else {
        for (const s of [1, 2]) if (p.weapons[s]) { const d = WEAPONS[p.weapons[s].id]; p.weapons[s].mag = d.mag; p.weapons[s].reserve = d.reserve; }
      }
      p.alive = true; p.hp = 100; p.slot = p.weapons[1] ? 1 : 2; p.reloadEnd = 0; p.knifeOut = false;
      this.applyWeaponRule(p);
      p.healEnd = 0; p.buffEnd = 0; p.buffSpeed = 1; p.hasteEnd = 0; p.slowEnd = 0; p.speedMul = 1; p.rateMul = 1; p.invisEnd = 0; p.revealEnd = 0; p.blindEnd = 0;
      p.interact = false; p.prog = 0; p.damagedBy = new Map(); p.hitsBy = new Map(); p.joinedMidRound = false; p.roundKills = 0; p.roundDmg = 0; p.ready = false; p.armorBought = null;
      this.refillCharges(p);
      const list = spawnSets[side];
      const sp = list[idx[side]++ % list.length];
      const jitter = () => (Math.random() - 0.5) * 1.5;
      const pos = [sp[0] + jitter(), 0, sp[1] + jitter()];
      // orienter vers le centre de la carte
      const yaw = Math.atan2(-(mw / 2 - pos[0]), -(mh / 2 - pos[2]));
      this.teleport(p, pos, yaw);
      if (p.brain) p.brain.onRoundStart();
    }
    if (this.knifeRound) {
      // manche au couteau : couteaux uniquement, pas d'achat ni de Noyau, courte attente avant le départ
      for (const p of this.players.values()) { p.weapons = { 1: null, 2: null, 3: { id: 'knife' } }; p.slot = 3; p.armor = 0; p.charges = {}; }
      this.phaseEnd = this.time + 4; this.core.status = 'none';
      this.broadcast({ type: 'notice', text: 'MANCHE AU COUTEAU : LE GAGNANT CHOISIT SON CÔTÉ' });
      return this.broadcast({ type: 'roundStart', round: 0, half: this.half, score: this.score, knife: 1, loss: { ...this.lossStreak } });
    }
    const atk = [...this.players.values()].filter(p => this.side(p) === 'atk');
    if (this.mode === 'duel') this.core.status = 'none';
    else if (atk.length) {
      const humans = atk.filter(p => !p.isBot);
      const pool = humans.length && Math.random() < 0.7 ? humans : atk;
      this.core.carrier = pool[(Math.random() * pool.length) | 0].id;
    } else this.core.status = 'none';
    this.broadcast({ type: 'roundStart', round: this.round, half: this.half, score: this.score, loss: { ...this.lossStreak } });
  }

  endRound(winSide, reason) {
    if (this.phase === 'end' || this.phase === 'over' || this.phase === 'sidechoice') return;
    if (this.knifeRound) {
      let team = winSide ? this.teamOfSide(winSide) : null;
      if (!team || reason === 'time') { const alive = { alpha: 0, beta: 0 }; for (const p of this.players.values()) if (p.alive) alive[p.team]++; team = alive.alpha === alive.beta ? (Math.random() < 0.5 ? 'alpha' : 'beta') : alive.alpha > alive.beta ? 'alpha' : 'beta'; }
      this.knifeWinner = team; this.phase = 'sidechoice'; this.phaseEnd = this.time + 12;
      const cur = {}; for (const p of this.players.values()) if (p.team === team) cur.side = this.side(p);
      this.broadcast({ type: 'sideChoice', team, current: cur.side || null, until: 12 });
      return;
    }
    const winTeam = winSide ? this.teamOfSide(winSide) : null;
    if (winTeam) this.score[winTeam]++;
    if (winTeam) { const lose = winTeam === 'alpha' ? 'beta' : 'alpha'; this.lossStreak[winTeam] = 0; this.lossStreak[lose] = Math.min(5, this.lossStreak[lose] + 1); }
    const bonus = { alpha: winTeam === 'alpha' ? ROUND.winMoney : lossBonus(this.lossStreak.alpha || 1), beta: winTeam === 'beta' ? ROUND.winMoney : lossBonus(this.lossStreak.beta || 1) };
    for (const p of this.players.values()) {
      const won = p.team === winTeam;
      if (won) p.roundsWon++;
      p.money = Math.min(ROUND.maxMoney, p.money + (bonus[p.team] ?? ROUND.lossMoney));
      p.ult = Math.min(this.ultCost(p), p.ult + 1);
      p.interact = false; p.prog = 0;
    }
    this.phase = 'end';
    this.phaseEnd = this.time + ROUND.endTime;
    for (const p of this.players.values()) this.sendDmgReport(p);
    this.roundHistory.push(winTeam || '');
    let mvp = null;
    for (const p of this.players.values()) if (p.roundKills > 0 || p.roundDmg > 0) if (!mvp || p.roundKills > mvp.roundKills || (p.roundKills === mvp.roundKills && p.roundDmg > mvp.roundDmg)) mvp = p;
    this.broadcast({ type: 'roundEnd', winner: winTeam, side: winSide, reason, score: this.score, history: this.roundHistory, loss: { ...this.lossStreak }, bonus, mvp: mvp ? { id: mvp.id, name: mvp.name, kills: mvp.roundKills, dmg: Math.round(mvp.roundDmg) } : null });
    if (winTeam && this.score[winTeam] >= this.target) this.pendingOver = winTeam;
    else if (this.half === 0 && this.round === this.target - 1) {
      this.half = 1; this.resetEconomy = true; this.timeoutsUsed = { alpha: 0, beta: 0 };
      this.broadcast({ type: 'notice', text: 'CHANGEMENT DE CÔTÉ' });
    }
  }

  applySideChoice(side, by = null) {
    if (this.phase !== 'sidechoice') return;
    const team = this.knifeWinner;
    const curSide = sideOf(team, this.effHalf());
    if (side && side !== curSide) this.sideFlip = !this.sideFlip;
    const finalSide = sideOf(team, this.effHalf());
    this.knifeRound = false; this.knifeDone = true; this.round = 0; this.resetEconomy = true;
    for (const p of this.players.values()) { p.alive = false; }
    this.broadcast({ type: 'sideChosen', team, side: finalSide, by: by?.name || null });
    this.startRound();
  }
  // temps mort tactique : +30 s de phase d'achat, une fois par équipe et par mi-temps
  handleTimeout(p) {
    if (this.mode !== 'assault' || this.phase !== 'buy' || this.knifeRound || p.isBot) return;
    if ((this.timeoutsUsed[p.team] || 0) >= 1) { this.send(p, { type: 'notice', text: 'TON ÉQUIPE A DÉJÀ UTILISÉ SON TEMPS MORT CETTE MI-TEMPS' }); return; }
    this.timeoutsUsed[p.team] = 1;
    const left = this.phaseEnd - this.time;
    this.phaseEnd = this.time + Math.min(TIMEOUT.maxBuy, left + TIMEOUT.extra);
    this.broadcast({ type: 'timeout', team: p.team, by: p.name, until: Math.round(this.phaseEnd - this.time) });
  }
  teamOfSide(side) { return sideOf('alpha', this.effHalf()) === side ? 'alpha' : 'beta'; }
  ultCost(p) { return AGENTS[p.agent].abilities.x.cost; }

  matchOver(winner) {
    this.phase = 'over';
    setTimeout(() => this.io.onOver?.(), 0);
    this.overAt = this.time + 9;
    // MVP : meilleur score de la partie
    let mvp = null;
    for (const p of this.players.values()) if (!mvp || p.score > mvp.score) mvp = p;
    const stats = [...this.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, agent: p.agent, kills: p.kills, deaths: p.deaths, assists: p.assists, score: p.score, bot: p.isBot, dmg: Math.round(p.dmg), hs: p.hsKills, title: p.title, shots: p.shots, hits: p.hits, best: p.bestStreak, fav: Object.entries(p.weaponKills || {}).sort((x, y) => y[1] - x[1])[0]?.[0] || null, lives: this.mode === 'lives' ? p.lives : undefined, team: this.brTeam > 1 ? p.team : undefined, place: this.mode === 'br' ? (p.place || 1) : undefined }));
    const rewards = {}, results = [];
    const scoreLine = isFfa(this.mode) ? '' : `${this.score.alpha}-${this.score.beta}`;
    for (const p of this.players.values()) {
      if (p.isBot) continue;
      const won = this.brTeam > 1 ? (this.brWinTeam && p.team === this.brWinTeam) : isFfa(this.mode) ? winner === p.id : winner === p.team;
      const brBonus = this.mode === 'br' ? Math.max(0, 9 - (p.place || 1)) * 20 : 0; // classement : 160 Éclats au 1er … 20 au 8e
      rewards[p.id] = Math.round((REWARDS.matchPlayed + p.kills * REWARDS.kill + p.roundsWon * REWARDS.roundWin + (won ? REWARDS.matchWin : 0) + brBonus) * (this.io.rewardMul ? this.io.rewardMul() : 1));
      results.push({
        id: p.id, account: p.account, name: p.name, team: p.team, reward: rewards[p.id], won, kills: p.kills, deaths: p.deaths, assists: p.assists, score: p.score,
        mode: this.mode, mapId: this.map.id, agent: p.agent, dmg: p.dmg, hsKills: p.hsKills, knifeKills: p.knifeKills, shots: p.shots, hits: p.hits,
        plants: p.plants, defuses: p.defuses, aces: p.aces, multi3: p.multi3, abilities: p.abilities, ults: p.ults, roundsWon: p.roundsWon,
        mvp: mvp === p, duration: this.time, weaponKills: p.weaponKills, bestStreak: p.bestStreak, slides: p.slides || 0, adsShots: p.adsShots || 0, others: [...this.players.values()].filter(q => q !== p && !q.isBot && q.account).map(q => q.account), scoreLine: p.team === 'beta' ? scoreLine.split('-').reverse().join('-') : scoreLine,
      });
      this.statCheck(p);
    }
    this.broadcast({ type: 'matchEnd', winner, mode: this.mode, score: this.score, stats, rewards, mvp: mvp ? mvp.id : null });
    if (this.io.onResults) this.io.onResults(results);
    this.io.onEvent?.('end', { winner, duration: this.time, mvp: mvp?.name, players: stats.filter(s => !s.bot).map(s => ({ name: s.name, kills: s.kills, deaths: s.deaths, team: s.team })) });
  }

  // anti-triche statistique : précision et tirs à la tête anormalement élevés sur un échantillon suffisant
  statCheck(p) {
    if (!this.acOn()) return;
    const reasons = [];
    if (p.kills >= 12 && p.hsKills / p.kills >= 0.8) reasons.push(`${Math.round(p.hsKills / p.kills * 100)} % d'éliminations à la tête (${p.hsKills}/${p.kills})`);
    if (p.shots >= 60 && p.hits / p.shots >= 0.75) reasons.push(`précision de ${Math.round(p.hits / p.shots * 100)} % sur ${p.shots} tirs`);
    if (p.deaths === 0 && p.kills >= 25) reasons.push(`${p.kills} éliminations sans mourir`);
    if (reasons.length) this.io.onEvent?.('cheat', { name: p.name, account: p.account, reason: 'statistiques : ' + reasons.join(', '), strikes: p.cheatStrikes || 0, stat: true });
  }

  // ---------- FFA ----------
  spawnFFA(p) {
    const others = [...this.players.values()].filter(o => o !== p && o.alive);
    let best = null, bestD = -1;
    for (let k = 0; k < 14; k++) {
      const [i, j] = this.map.floor[(Math.random() * this.map.floor.length) | 0];
      const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL;
      let d = Infinity;
      for (const o of others) d = Math.min(d, Math.hypot(o.pos[0] - x, o.pos[2] - z));
      if (d > bestD) { bestD = d; best = [x, 0, z]; }
    }
    p.alive = true; p.hp = 100; p.armor = 50; p.money = 9000; p.reloadEnd = 0; p.knifeOut = false;
    this.projectiles = this.projectiles.filter(pr => !(pr.kind === 'knife' && pr.owner === p.id));
    if (this.mode === 'gungame') { this.gunLoadout(p); p.armor = 0; } // pas d'armure : le couteau final reste jouable
    else if (this.mode === 'br') { p.weapons = { 1: null, 2: null, 3: { id: 'knife' } }; p.slot = 3; p.armor = 0; p.money = 0; p.bag = []; p.pots = { heal: 0, shield: 0, bandage: 0, mini: 0, nade: 0 }; p.drinkEnd = 0; }
    else {
      const prim = p.weapons?.[1]?.id || 'lancer';
      p.weapons = { 1: prim ? this.newWeapon(prim) : null, 2: this.newWeapon(p.weapons?.[2]?.id || 'spark'), 3: { id: 'knife' } };
      p.slot = p.weapons[1] ? 1 : 2;
      this.applyWeaponRule(p);
    }
    p.reloadEnd = 0; p.damagedBy = new Map(); p.hitsBy = new Map(); p.invisEnd = 0; p.buffEnd = 0; p.buffSpeed = 1; p.hasteEnd = 0; p.slowEnd = 0; p.speedMul = 1; p.rateMul = 1; p.blindEnd = 0;
    p.protEnd = this.time + 1.5; // protection de réapparition : annulée dès que le joueur tire ou utilise une capacité
    const [mw, mh] = this.map.size;
    if (this.mode === 'br' && !p.isBot && this.bus && !this.bus.done) { const [x, z] = this.busPos(); best = [x, BR.bus.height, z]; p.inBus = true; p.fallTop = null; }
    else if (this.mode === 'br' && !p.isBot) { best = [best[0], BR.drop.height, best[2]]; p.chuteEnd = this.time + 40; p.fallTop = null; }
    if (this.mode === 'br' && p.isBot && this.bus) {
      // le bot « saute » à un moment au hasard : il apparaît au sol près de la route, et attend la durée de la descente
      const u = Math.random(), T0 = this.bus.t0 + u * this.bus.dur, [bx, bz] = this.busPos(T0);
      let b2 = best, bd = 1e9; for (const [i, j] of this.map.floor) { const x = (i + 0.5) * CELL, z = (j + 0.5) * CELL, d = Math.hypot(x - bx, z - bz) + Math.random() * 18; if (d < bd) { bd = d; b2 = [x, 0, z]; } }
      best = b2; p.dropUntil = T0 + BR.drop.botWait;
    } else if (this.mode === 'br' && p.isBot) p.dropUntil = this.time + BR.drop.botWait + Math.random() * 4;
    this.teleport(p, best, Math.atan2(-(mw / 2 - best[0]), -(mh / 2 - best[2])));
    if (this.mode === 'br' && !p.isBot) p.tpGrace = this.time + (p.inBus ? 999 : 0.6);
    if (p.brain) p.brain.onRoundStart();
  }

  // ---------- Battle Royale (1.42) ----------
  // dirigeable de départ (1.52) : traverse la carte en ligne droite passant près du centre
  initBus() {
    const [mw, mh] = this.map.size, a = Math.random() * Math.PI * 2, off = (Math.random() - 0.5) * 50, R = Math.hypot(mw, mh) / 2 + 6;
    const cx = mw / 2 + Math.cos(a + Math.PI / 2) * off, cz = mh / 2 + Math.sin(a + Math.PI / 2) * off;
    const clamp = (v, m) => Math.max(4, Math.min(m - 4, v));
    this.bus = { a: [clamp(cx - Math.cos(a) * R, mw), clamp(cz - Math.sin(a) * R, mh)], b: [clamp(cx + Math.cos(a) * R, mw), clamp(cz + Math.sin(a) * R, mh)], t0: this.time + BR.bus.delay, dur: BR.bus.duration };
  }
  busPos(T = this.time) { const b = this.bus, k = Math.max(0, Math.min(1, (T - b.t0) / b.dur)); return [b.a[0] + (b.b[0] - b.a[0]) * k, b.a[1] + (b.b[1] - b.a[1]) * k]; }
  busJump(p) {
    if (!p.inBus || !p.alive || this.time < this.bus.t0) return;
    const [x, z] = this.busPos(); p.inBus = false;
    p.chuteEnd = this.time + 40; p.fallTop = null;
    this.teleport(p, [x, BR.drop.height, z], p.yaw); p.tpGrace = this.time + 0.6;
  }
  tickBus() {
    if (!this.bus || this.bus.done) return;
    const T = this.time, [x, z] = this.busPos(), end = T >= this.bus.t0 + this.bus.dur;
    for (const p of this.players.values()) if (p.inBus) { if (end) this.busJump(p); else { p.pos = [x, BR.bus.height, z]; p.lastValid = { pos: p.pos.slice(), t: T }; } }
    if (end) this.bus.done = true;
  }
  initBR() {
    const [mw, mh] = this.map.size;
    this.chests = this.map.chests.map(([x, z], i) => ({ id: i, pos: [x, 0, z], open: false }));
    // distributeurs : sur la case de sol la plus proche de chaque emplacement prévu
    this.dispensers = (this.map.disp || BR.dispensers).map(([ci, cj], i) => {
      let b = null, bd = 1e9;
      for (const [fi, fj] of this.map.floor) { if (this.map.grid[fj][fi] !== '.') continue; const d = Math.hypot(fi - ci, fj - cj); if (d < bd) { bd = d; b = [fi, fj]; } }
      return { id: i, pos: [(b[0] + 0.5) * CELL, 0, (b[1] + 0.5) * CELL], readyAt: 0 };
    });
    this.zone = { c: [mw / 2, mh / 2], r: Math.max(BR.startRadius, Math.hypot(mw, mh) / 2 + 4), stage: 0, shrinking: false, until: this.time + BR.stages[0][0] + (this.bus ? BR.bus.delay + BR.bus.duration : 0) };
    this.pickNextZone();
  }
  pickNextZone() {
    const z = this.zone, st = BR.stages[Math.min(z.stage, BR.stages.length - 1)];
    z.nr = st[2];
    // le prochain cercle est entièrement dans l'actuel, centré sur une case praticable
    for (let k = 0; k < 30; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * Math.max(0, Math.min(z.r, 70) - z.nr);
      const x = z.c[0] + Math.cos(a) * d, y = z.c[1] + Math.sin(a) * d;
      if (this.map.walkable(Math.floor(x / CELL), Math.floor(y / CELL)) || k === 29) { z.nc = [x, y]; break; }
    }
  }
  tickZone(dt) {
    const z = this.zone, T = this.time, st = BR.stages[Math.min(z.stage, BR.stages.length - 1)];
    if (!z.shrinking && T >= z.until) {
      z.shrinking = true; z.from = { c: z.c.slice(), r: z.r, t: T }; z.until = T + st[1];
      this.broadcast({ type: 'notice', text: 'LA ZONE SE RESSERRE !' });
    } else if (z.shrinking) {
      const k = Math.min(1, (T - z.from.t) / st[1]);
      z.r = z.from.r + (z.nr - z.from.r) * k;
      z.c = [z.from.c[0] + (z.nc[0] - z.from.c[0]) * k, z.from.c[1] + (z.nc[1] - z.from.c[1]) * k];
      if (k >= 1) {
        z.shrinking = false;
        if (z.stage < BR.stages.length - 1) { z.stage++; z.until = T + BR.stages[z.stage][0]; this.pickNextZone(); }
        else z.until = Infinity;
      }
    }
    // dégâts hors de la zone (ceux de l'étape en cours)
    const dps = BR.stages[Math.min(z.stage, BR.stages.length - 1)][3];
    for (const p of this.players.values()) {
      if (!p.alive || p.out) continue;
      if (Math.hypot(p.pos[0] - z.c[0], p.pos[2] - z.c[1]) > z.r) this.damage(p, dps * dt, null, 'zone', false, true);
    }
  }
  // sac à dos : l'arme rangée prend la place de celle de même type (principale ou pistolet), qui part dans le sac
  bagSwap(p, k) {
    if (!p.alive || !p.bag || !Number.isInteger(k) || !p.bag[k]) return;
    const w = p.bag[k], slot = WEAPONS[w.id]?.slot; if (!slot || slot === 3) return;
    const cur = p.weapons[slot];
    p.weapons[slot] = w;
    if (cur) p.bag[k] = cur; else p.bag.splice(k, 1);
    p.slot = slot; p.reloadEnd = 0;
  }
  // potions (1.47) : on boit pendant un court instant (pas de tir), puis le soin ou l'armure s'applique
  drinkPotion(p, k) {
    if (p.downed) return;
    const P = BR.potions[k] || (k === 'bandage' || k === 'mini' ? BR.items[k] : null);
    if (k === 'bandage' && p.hp >= BR.items.bandage.cap) return;
    if (k === 'mini' && (p.armor || 0) >= BR.items.mini.cap) return;
    if (!P || !p.alive || !p.pots?.[k] || p.drinkEnd > this.time) return;
    if (k === 'heal' && p.hp >= 100) return;
    if (k === 'shield' && (p.armor || 0) >= 100) return;
    p.drinkEnd = this.time + P.time; p.drinkKind = k; p.reloadEnd = 0;
  }
  tickPotions() {
    for (const p of this.players.values()) {
      if (!p.drinkEnd || this.time < p.drinkEnd) continue;
      const k = p.drinkKind, P = BR.potions[k] || BR.items[k]; p.drinkEnd = 0;
      if (!p.alive || !p.pots?.[k]) continue;
      p.pots[k]--;
      if (P.hp) p.hp = Math.min(P.cap || 100, Math.max(p.hp, p.hp + P.hp)); else p.armor = Math.min(P.cap || 100, Math.max(p.armor || 0, (p.armor || 0) + P.armor));
      this.send(p, { type: 'potionDone', k });
    }
  }
  throwNade(p, d) {
    if (p.downed) return;
    if (!p.alive || !p.pots?.nade || this.phase !== 'live' || p.drinkEnd > this.time || T_NADE_CD(p, this.time)) return;
    const dir = Array.isArray(d) && d.length === 3 && d.every(Number.isFinite) ? norm(d) : [-Math.sin(p.yaw), 0, -Math.cos(p.yaw)];
    p.pots.nade--; p.nadeT = this.time;
    const eye = this.eye(p);
    this.projectiles.push({ id: this.nextId++, kind: 'frag', owner: p.id, team: p.team, pos: [eye[0] + dir[0] * 0.6, eye[1] + dir[1] * 0.6 - 0.1, eye[2] + dir[2] * 0.6],
      vel: [dir[0] * 17, dir[1] * 17 + 3.2, dir[2] * 17], fuse: this.time + 2, stopped: false });
  }
  useDispenser(p, i) {
    const d = this.dispensers?.[i];
    if (!d || !p.alive || this.phase !== 'live' || this.time < d.readyAt || p.hp >= 100) return;
    if (Math.hypot(p.pos[0] - d.pos[0], p.pos[2] - d.pos[2]) > BR.chestRange + 0.4) return;
    p.hp = 100; d.readyAt = this.time + BR.dispenserCooldown;
    this.broadcast({ type: 'dispUsed', i, by: p.id });
    this.send(p, { type: 'brBought', hp: 100, full: true });
  }
  openChest(p, i) {
    const c = this.chests?.[i];
    if (p.downed) return;
    if (!c || c.open || !p.alive || this.phase !== 'live') return;
    if (Math.hypot(p.pos[0] - c.pos[0], p.pos[2] - c.pos[2]) > BR.chestRange + 0.4) return;
    c.open = true;
    let roll = Math.random() * 100, rar = 'common';
    for (const [r, pct] of Object.entries(BR.lootOdds)) { rar = r; if ((roll -= pct) < 0) break; }
    const pool = BR.loot[rar], id = pool[(Math.random() * pool.length) | 0], slot = WEAPONS[id].slot;
    const w = this.newWeapon(id); w.rar = rar;
    if (w.reserve != null) w.reserve += Math.round((WEAPONS[id].mag || 10) * 1.5);
    let got = '';
    if (!p.weapons[slot]) { p.weapons[slot] = w; got = 'arme'; this.send(p, { type: 'picked', item: id, slot }); }
    else if (p.bag && p.bag.length < BR.bagSize) { p.bag.push(w); got = 'sac'; }
    else this.drops.push({ id: this.nextId++, w, pos: [c.pos[0] + 0.6, 0, c.pos[2]], from: null, noPick: 0 });
    const bonus = Math.random(), pk = bonus < 0.25 ? 'heal' : bonus < 0.43 ? 'shield' : bonus < 0.63 ? 'bandage' : bonus < 0.78 ? 'mini' : bonus < 0.93 ? 'nade' : null;
    let potGot = null;
    if (pk && p.pots) { const max = (BR.potions[pk] || BR.items[pk]).max; if (p.pots[pk] < max) { p.pots[pk] += pk === 'nade' || pk === 'bandage' || pk === 'mini' ? Math.min(2, max - p.pots[pk]) : 1; potGot = pk; } else if (pk === 'heal') p.hp = Math.min(100, p.hp + 25); }
    p.money = (p.money || 0) + BR.money.chest;
    this.broadcast({ type: 'chestOpen', i, by: p.id });
    this.send(p, { type: 'chestLoot', w: id, rar, pot: potGot, inSlot: got === 'arme', inBag: got === 'sac' });
  }

  // ---------- Gun Game ----------
  // une seule arme (celle du niveau) + le couteau ; au dernier niveau, le couteau seul
  gunLoadout(p) {
    const id = GUN_LADDER[Math.min(p.gun, GUN_LADDER.length - 1)];
    const slot = WEAPONS[id].slot;
    p.weapons = { 1: null, 2: null, 3: { id: 'knife' } };
    if (slot !== 3) p.weapons[slot] = this.newWeapon(id);
    p.slot = slot; p.reloadEnd = 0;
  }
  gunKill(v, a, wpn) {
    const last = GUN_LADDER.length - 1;
    // une élimination au couteau fait reculer la victime d'une arme
    if (wpn === 'knife' && v.gun > 0 && v !== a) { v.gun--; this.send(v, { type: 'gun', lvl: v.gun, down: 1, by: a.name }); }
    if (!a || a === v) return;
    if (a.gun >= last) { if (wpn === 'knife' && this.phase !== 'over') { a.gun = GUN_LADDER.length; this.matchOver(a.id); } return; }
    a.gun++;
    a.score += 100;
    if (a.alive) this.gunLoadout(a);
    this.send(a, { type: 'gun', lvl: a.gun });
    if (a.gun === last) this.broadcast({ type: 'notice', text: `${a.name.toUpperCase()} EST AU COUTEAU !` });
  }

  // ---------- Messages ----------
  handle(id, msg) {
    const p = this.players.get(id);
    if (!p) return;
    // dans le dirigeable : seulement regarder, sauter, et les messages sans effet sur le jeu (1.55 : on pouvait frapper au couteau)
    if (p.inBus && !['input', 'busJump', 'ping', 'emote', 'emoteStop', 'spec', 'mark'].includes(msg.type)) return;
    switch (msg.type) {
      case 'input': return this.handleInput(p, msg);
      case 'slide': return this.handleSlide(p);
      case 'wallJump': return this.handleWallJump(p);
      case 'chest': return this.openChest(p, msg.i);
      case 'spec': return this.setSpec(p, msg.id);
      case 'bagSwap': return this.bagSwap(p, msg.k);
      case 'potion': return this.drinkPotion(p, msg.k);
      case 'dispense': return this.useDispenser(p, msg.i);
      case 'nade': return this.throwNade(p, msg.d);
      case 'busJump': return this.busJump(p);
      case 'shoot': return this.handleShoot(p, msg);
      case 'reload': return this.handleReload(p);
      case 'bash': return this.handleBash(p, msg);
      case 'buy': return msg.for && msg.for !== p.id ? this.buyForMate(p, msg.item, msg.for) : this.handleBuy(p, msg.item);
      case 'throwKnife': return this.handleThrowKnife(p, msg);
      case 'knifeCharge': if (p.alive && p.weapons[p.slot]?.id === 'knife' && !p.knifeOut) p.knifeChargeAt = this.time; return;
      case 'sell': return this.handleSell(p, msg);
      case 'drop': return this.handleDrop(p);
      case 'ready': return this.handleReady(p);
      case 'chooseSide': if (this.phase === 'sidechoice' && p.team === this.knifeWinner && (msg.side === 'atk' || msg.side === 'def')) this.applySideChoice(msg.side, p); return;
      case 'timeout': return this.handleTimeout(p);
      case 'ability': return this.handleAbility(p, msg);
      case 'interact': p.interact = !!msg.on; if (p.interact) p.interactPos = p.pos.slice(); return;
      case 'mark': return this.handleMark(p, msg);
      case 'emote': return this.handleEmote(p, msg);
      case 'emoteStop': this.broadcast({ type: 'emoteStop', i: p.id }); return;
    }
  }

  // marqueur de position (clic molette) : le point est calculé par le serveur à partir du regard,
  // il n'est envoyé qu'aux coéquipiers (au joueur seul en Mêlée) et limité à 3 toutes les 4 secondes
  handleMark(p, m) {
    if (!p.alive || this.phase === 'over') return;
    const T = this.time;
    p.markT = (p.markT || []).filter(t => T - t < 4);
    if (p.markT.length >= 3) return;
    if (!Array.isArray(m.d) || m.d.length !== 3 || !m.d.every(finite)) return;
    const dir = norm(m.d);
    if (!dir.every(finite) || Math.hypot(...dir) < 0.5) return;
    p.markT.push(T);
    const eye = this.eye(p);
    const r = raycastBoxes(eye, dir, 150, this.allBoxes());
    const t = Math.min(150, r.t);
    const pt = [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t];
    // un ennemi visible près du rayon ? → marqueur « danger »
    let danger = false;
    for (const q of this.players.values()) {
      if (!q.alive || !this.isEnemy(p, q) || q.invisEnd > T) continue;
      const c = [q.pos[0] - eye[0], q.pos[1] + 1 - eye[1], q.pos[2] - eye[2]];
      const along = c[0] * dir[0] + c[1] * dir[1] + c[2] * dir[2];
      if (along < 0 || along > t + 1) continue;
      const off = Math.hypot(c[0] - dir[0] * along, c[1] - dir[1] * along, c[2] - dir[2] * along);
      if (off < 1.4 + along * 0.02) { danger = true; pt[0] = q.pos[0]; pt[1] = q.pos[1] + 1; pt[2] = q.pos[2]; break; }
    }
    const msg = { type: 'mark', i: p.id, n: p.name, p: pt.map(r2), d: danger ? 1 : 0 };
    for (const q of this.players.values()) if (q === p || (!isFfa(this.mode) && q.team === p.team)) this.send(q, msg);
  }

  handleInput(p, m) {
    if (p.inBus) { this.applyLook(p, m); return; } // dans le dirigeable : seulement le regard
    if (!p.alive || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(finite)) return;
    const [mw, mh] = this.map.size;
    const T = this.time;
    const np = [Math.max(0, Math.min(mw, m.p[0])), Math.max(-1, Math.min(8, m.p[1])), Math.max(0, Math.min(mh, m.p[2]))];
    if (p.tpGrace > T && Math.hypot(np[0] - p.tpPos[0], np[2] - p.tpPos[2]) > 3) { this.applyLook(p, m); return; }
    p.tpGrace = 0;
    if (p.trollFreeze > T && Math.hypot(np[0] - p.pos[0], np[2] - p.pos[2]) > 0.05) { this.applyLook(p, m); return; }
    // anti-speedhack / téléportation / vol : la distance parcourue doit être physiquement possible
    if (p.moveBonusEnd && T > p.moveBonusEnd) { p.moveBonus = 0; p.moveBonusEnd = 0; }
    const last = p.lastValid || { pos: p.pos, t: T };
    const elapsed = Math.min(2, T - last.t) + 0.35; // marge pour la gigue réseau
    const maxSpeed = MOVE.run * 1.3 * Math.max(1, p.speedMul, p.speedPeakEnd > T ? p.speedPeak : 1) + 0.5;
    const base = maxSpeed * elapsed + 1;
    const d = Math.hypot(np[0] - last.pos[0], np[2] - last.pos[2]);
    if (p.chuteEnd > T && np[1] < 0.15) p.chuteEnd = Math.min(p.chuteEnd, T + 1); // posé : fin du parachute
    const flying = np[1] > (p.chuteEnd > T ? BR.drop.height + 2 : this.opts.lowGrav ? 9 : p.wallJumpEnd > T ? 6.6 : 4.8); // plus haut que caisse haute + saut (+ sauts muraux)
    const ac = this.io.anticheat ? this.io.anticheat() : { on: true, strikes: 5 };
    if (ac.on !== false && (d > base + (p.moveBonus || 0) || flying)) {
      p.cheatStrikes = (p.cheatStrikes || 0) + 1;
      const at = ac.strikes || 5;
      if (p.cheatStrikes === at || p.cheatStrikes % 50 === 0) {
        this.io.onEvent?.('cheat', { name: p.name, account: p.account, reason: flying ? `vol (altitude ${np[1].toFixed(1)} m)` : `vitesse (${d.toFixed(1)} m en ${(elapsed - 0.35).toFixed(2)} s)`, strikes: p.cheatStrikes });
      }
      this.teleport(p, last.pos, p.yaw);
      return;
    }
    if (d > base) p.moveBonus = Math.max(0, p.moveBonus - (d - base));
    if (d > 0.05 || (finite(m.y) && Math.abs(m.y - p.yaw) > 0.02)) { p.lastActive = T; p.afkWarned = false; }
    if (Math.abs(np[1] - p.pos[1]) < 0.01 && T > (p.wallJumpEnd || 0) - 1.9) p.wallJumps = 0; // posé : rebonds rechargés
    p.lastValid = { pos: np.slice(), t: T };
    p.pos = np;
    this.fallStep(p, np);
    this.applyLook(p, m);
  }

  // glissade : le client prévient au départ ; le serveur limite la fréquence et accorde un peu de distance
  // en plus à l'anti-triche (l'élan dépasse brièvement la vitesse de course)
  slideOn() { return this.io.slideEnabled ? this.io.slideEnabled() !== false : true; }
  handleSlide(p) {
    const T = this.time;
    if (!p.alive || !this.slideOn() || T < (p.slideNext || 0) || this.phase === 'warmup' || this.phase === 'over') return;
    p.slideNext = T + MOVE.slideCooldown - 0.2; // marge pour la gigue réseau
    p.slideUntil = T + MOVE.slideTime + 0.4;
    p.slides = (p.slides || 0) + 1;
    p.moveBonus = (p.moveBonus || 0) + MOVE.slideSpeed * 0.3;
    p.moveBonusEnd = Math.max(p.moveBonusEnd || 0, T + MOVE.slideTime + 1);
  }

  // saut mural (1.41) : 2 rebonds au plus avant de retoucher le sol ; le serveur accorde un peu d'altitude et de distance
  handleWallJump(p) {
    const T = this.time;
    if (!p.alive || !this.opts.wallJump || this.phase === 'warmup' || this.phase === 'over') return;
    if (p.pos[1] < 0.05 || (p.wallJumpGround && p.wallJumpGround > T - 0.1)) p.wallJumps = 0;
    if ((p.wallJumps || 0) >= 2 || T < (p.wallJumpNext || 0)) return;
    p.wallJumps = (p.wallJumps || 0) + 1; p.wallJumpNext = T + 0.15;
    p.wallJumpEnd = T + 2.2;
    p.moveBonus = (p.moveBonus || 0) + 2.5; p.moveBonusEnd = Math.max(p.moveBonusEnd || 0, T + 1.5);
  }

  applyLook(p, m) {
    if (finite(m.y)) p.yaw = m.y;
    if (finite(m.pt)) p.pitch = Math.max(-1.55, Math.min(1.55, m.pt));
    p.crouch = !!m.c;
    p.sliding = !!m.sl && p.crouch && (p.slideUntil || 0) > this.time;
    if ([1, 2, 3].includes(m.s) && p.weapons[m.s] && m.s !== p.slot) { this.cancelReload(p); p.slot = m.s; p.reloadEnd = 0; p.knifeChargeAt = 0; }
    if (p.interact && p.interactPos && Math.hypot(p.pos[0] - p.interactPos[0], p.pos[2] - p.interactPos[2]) > 0.6) { p.prog = 0; p.interactPos = p.pos.slice(); }
  }

  handleReload(p) {
    const w = p.weapons[p.slot];
    if (!p.alive || !w || !WEAPONS[w.id].mag || p.reloadEnd > this.time) return;
    if (w.mag >= WEAPONS[w.id].mag || w.reserve <= 0) return;
    const dur = reloadTime(WEAPONS[w.id], w.mag); // recharge « tactique » plus rapide s'il reste des balles
    p.reloadStart = this.time; p.reloadDur = dur; p.reloadMag0 = w.mag;
    p.reloadEnd = this.time + dur;
  }
  // cartouches déjà glissées dans un fusil à pompe si on interrompt la recharge maintenant
  reloadPartial(p) {
    const w = p.weapons[p.slot];
    if (!w || !(p.reloadEnd > this.time)) return 0;
    return partialShells(WEAPONS[w.id], p.reloadMag0 ?? w.mag, this.time - (p.reloadStart ?? this.time), p.reloadDur, w.reserve);
  }
  cancelReload(p) {
    if (!(p.reloadEnd > this.time)) return;
    const w = p.weapons[p.slot], n = this.reloadPartial(p);
    if (w && n > 0) { w.mag += n; w.reserve -= n; }
    p.reloadEnd = 0;
  }

  // coup de crosse (1.28) : attaque rapide au corps à corps, avec n'importe quelle arme en main
  handleBash(p, msg) {
    const T = this.time;
    if (!p.alive || ['buy', 'over', 'warmup', 'sidechoice'].includes(this.phase) || T < (p.bashNext || 0)) return;
    const d = Array.isArray(msg.d) && msg.d.length === 3 && msg.d.every(finite) ? norm(msg.d) : [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
    p.bashNext = T + BASH.cooldown - 0.1; // marge pour la gigue réseau
    p.lastActive = T; p.protEnd = 0; p.invisEnd = Math.min(p.invisEnd, T);
    const o = this.eye(p);
    const wr = raycastBoxes(o, d, BASH.range, this.allBoxes());
    let best = null, bt = Math.min(wr.t, BASH.range);
    for (const q of this.players.values()) {
      if (!q.alive || q === p || (!this.isEnemy(p, q) && !this.opts.friendlyFire)) continue;
      if (Math.hypot(q.pos[0] - o[0], q.pos[2] - o[2]) > BASH.range + 1.5) continue;
      for (const hb of hitboxes(q.pos, q.crouch)) { const t = rayAABB(o, d, hb.min, hb.max); if (t >= 0 && t < bt) { bt = t; best = q; } }
    }
    if (best) this.damage(best, BASH.damage * (this.isEnemy(p, best) ? 1 : 0.5), p, 'bash', false);
    this.broadcast({ type: 'bash', i: p.id, h: best ? 1 : 0, o: o.map(r2) });
  }

  // dégâts de chute (1.28) : hauteur entre le point le plus haut du saut et l'atterrissage
  fallStep(p, np) {
    if (!p.alive || this.opts.lowGrav || p.tpGrace > this.time || p.chuteEnd > this.time) { p.fallTop = null; return; }
    const g = groundHeight(np[0], np[2], np[1], this.map.boxes);
    if (np[1] - g > 0.08) { p.fallTop = Math.max(p.fallTop ?? np[1], np[1]); return; }
    const drop = p.fallTop == null ? 0 : p.fallTop - np[1];
    p.fallTop = null;
    if (drop <= FALL.safe) return;
    // poussé dans le vide juste après des dégâts : l'élimination revient à l'adversaire
    const by = p.lastDamagedBy && this.time - (p.lastDamagedAt || -9) < 3 ? this.players.get(p.lastDamagedBy) : null;
    this.damage(p, Math.round((drop - FALL.safe) * FALL.perM), by && this.isEnemy(by, p) ? by : null, 'fall', false);
    this.send(p, { type: 'fall', d: r2(drop) });
  }

  handleBuy(p, item) {
    if (this.mode === 'br') { // 1.48 : en Battle Royale, la boutique ne vend que du soin
      const it = BR.shop[item === 'brHeal' ? 'heal' : ''];
      if (!it || !p.alive || p.hp >= 100 || (p.money || 0) < it.price) return;
      p.money -= it.price; p.hp = Math.min(100, p.hp + it.hp);
      this.send(p, { type: 'brBought', hp: it.hp });
      return;
    }
    if (!p.alive || this.mode === 'gungame' || this.knifeRound) return;
    const ffa = isFfa(this.mode);
    if (!ffa && this.phase !== 'buy') return;
    if (WEAPONS[item] && item !== 'knife') {
      const d = WEAPONS[item];
      if (!this.weaponAllowed(item)) { if (!p.isBot) this.send(p, { type: 'notice', text: `${d.name.toUpperCase()} : ARME INTERDITE DANS CETTE PARTIE` }); return; }
      const cur = p.weapons[d.slot];
      if (cur && cur.id === item) return;
      if (this.weaponLocked(p, item)) { this.send(p, { type: 'notice', text: `${d.name.toUpperCase()} : DÉBLOQUÉ AU NIVEAU ${WEAPON_UNLOCK[item]}` }); return; }
      let money = p.money;
      if (cur && cur.boughtRound === this.round && cur.buyer === p.id && !ffa) money += WEAPONS[cur.id].cost;
      if (!ffa && money < d.cost) return;
      if (!ffa) p.money = money - d.cost;
      p.weapons[d.slot] = this.newWeapon(item);
      p.weapons[d.slot].boughtRound = this.round; p.weapons[d.slot].buyer = p.id;
      p.slot = d.slot; p.reloadEnd = 0;
      this.send(p, { type: 'bought', item, slot: d.slot });
    } else if (item === KIT.id) {
      // kit de désamorçage : défenseurs en Assaut, gardé jusqu'à la mort
      if (ffa || this.mode !== 'assault' || this.side(p) !== 'def' || p.kit || p.money < KIT.cost) return;
      p.money -= KIT.cost; p.kit = true;
      this.send(p, { type: 'bought', item });
    } else if (ARMOR[item]) {
      const a = ARMOR[item];
      if (p.armor >= a.value) return;
      let money = p.money;
      const prev = p.armorBought && p.armorBought.round === this.round ? ARMOR[p.armorBought.item] : null;
      if (prev && !ffa) money += prev.cost; // passer du gilet léger au lourd rembourse le léger acheté cette manche
      if (!ffa) { if (money < a.cost) return; p.money = money - a.cost; }
      p.armor = a.value;
      p.armorBought = { item, round: this.round };
      this.send(p, { type: 'bought', item });
    }
  }

  // ---------- acheter une arme pour un coéquipier (1.25, Assaut) ----------
  buyForMate(p, item, forId) {
    if (this.mode !== 'assault' || this.phase !== 'buy' || !p.alive || this.knifeRound) return;
    const q = this.players.get(forId), d = WEAPONS[item];
    if (!q || q === p || !q.alive || q.team !== p.team || !d || item === 'knife' || !d.cost) return;
    const tell = text => { if (!p.isBot) this.send(p, { type: 'notice', text }); };
    if (!this.weaponAllowed(item)) return tell(`${d.name.toUpperCase()} : ARME INTERDITE DANS CETTE PARTIE`);
    if (this.weaponLocked(q, item)) return tell(`${q.name.toUpperCase()} N'A PAS ENCORE DÉBLOQUÉ ${d.name.toUpperCase()}`);
    const cur = q.weapons[d.slot];
    if (cur && !(d.slot === 2 && cur.id === 'spark')) return tell(`${q.name.toUpperCase()} A DÉJÀ UNE ARME DE CE TYPE`);
    if (p.money < d.cost) return tell('PAS ASSEZ DE CRÉDITS');
    p.money -= d.cost;
    q.weapons[d.slot] = this.newWeapon(item);
    q.weapons[d.slot].boughtRound = this.round; q.weapons[d.slot].buyer = p.id; // revendue par le coéquipier : moitié du prix seulement
    q.slot = d.slot; q.reloadEnd = 0;
    tell(`${d.name.toUpperCase()} OFFERT À ${q.name.toUpperCase()}`);
    if (!q.isBot) this.send(q, { type: 'gift', from: p.name, fromId: p.id, item, slot: d.slot });
    for (const m of this.players.values()) if (m !== p && m !== q && !m.isBot && m.team === p.team) this.send(m, { type: 'teamGift', from: p.name, to: q.name, item });
  }

  // ---------- couteau lancé (1.25) ----------
  handleThrowKnife(p, msg) {
    if (!p.alive || ['buy', 'warmup', 'over'].includes(this.phase)) return;
    if (p.weapons[p.slot]?.id !== 'knife' || p.knifeOut || this.time < (p.knifeNext || 0)) return;
    const raw = Array.isArray(msg.d) && msg.d.length === 3 && msg.d.every(finite) ? norm(msg.d) : null;
    if (!raw) return;
    const eye = this.eye(p), K = KNIFE_THROW;
    // force mesurée par le serveur (durée depuis l'appui), jamais celle annoncée par le joueur
    const power = knifePower(p.knifeChargeAt ? this.time - p.knifeChargeAt : 0);
    p.knifeChargeAt = 0;
    p.knifeOut = true; p.knifeNext = this.time + K.cooldown; p.protEnd = 0; p.lastActive = this.time; p.invisEnd = Math.min(p.invisEnd, this.time);
    const k = (power - K.minPower) / (1 - K.minPower); // 0 = lancer rapide, 1 = chargé à fond
    const speed = K.speedMin + (K.speedMax - K.speedMin) * k;
    this.projectiles.push({ id: this.nextId++, kind: 'knife', owner: p.id, team: p.team, pos: [eye[0] + raw[0] * 0.5, eye[1] + raw[1] * 0.5 - 0.05, eye[2] + raw[2] * 0.5], vel: raw.map(v => v * speed), dir: raw, power,
      dmg: K.damageMin + (K.damageMax - K.damageMin) * k, fuse: this.time + K.flight, stopped: false });
    this.broadcast({ type: 'knifeThrow', i: p.id, p: Math.round(power * 100) / 100 });
  }
  // un pas de vol du couteau : touche un joueur, se plante dans un mur, ou se ramasse
  tickKnife(pr, dt, boxes) {
    const K = KNIFE_THROW, T = this.time, owner = this.players.get(pr.owner);
    if (!owner) { pr.done = true; return; }
    if (pr.stopped) {
      if (owner.alive && Math.hypot(owner.pos[0] - pr.pos[0], owner.pos[1] + 0.9 - pr.pos[1], owner.pos[2] - pr.pos[2]) < K.pickup) { pr.done = true; owner.knifeOut = false; if (!owner.isBot) this.send(owner, { type: 'knifeBack' }); }
      else if (T >= pr.fuse) { pr.done = true; owner.knifeOut = false; if (!owner.isBot) this.send(owner, { type: 'knifeBack', auto: 1 }); }
      return;
    }
    if (K.gravity) pr.vel[1] -= K.gravity * dt;
    const step = pr.vel.map(v => v * dt), len = Math.hypot(...step);
    if (len <= 0) return;
    const dir = step.map(v => v / len);
    const wr = raycastBoxes(pr.pos, dir, len, boxes);
    let bestT = wr.t, target = null, zone = null;
    for (const q of this.players.values()) {
      if (!q.alive || q === owner || (!this.isEnemy(owner, q) && !this.opts.friendlyFire)) continue;
      if (Math.hypot(q.pos[0] - pr.pos[0], q.pos[2] - pr.pos[2]) > len + 3) continue;
      for (const hb of hitboxes(q.pos, q.crouch)) { const t = rayAABB(pr.pos, dir, hb.min, hb.max); if (t < bestT) { bestT = t; target = q; zone = hb.zone; } }
    }
    if (target) {
      const dmg = (pr.dmg || K.damageMin) * (zone === 'head' ? K.headMul : zone === 'legs' ? K.legMul : 1) * (this.isEnemy(owner, target) ? 1 : 0.5);
      owner.hits++;
      this.damage(target, dmg, owner, 'knife', zone === 'head');
      pr.pos = [target.pos[0], target.pos[1] + 0.05, target.pos[2]]; pr.stopped = true; pr.fuse = T + K.returnAfter;
      return;
    }
    if (wr.t < len) { const t = Math.max(0, wr.t - 0.05); pr.pos = pr.pos.map((v, i) => v + dir[i] * t); pr.stopped = true; pr.fuse = T + K.returnAfter; return; }
    pr.pos = pr.pos.map((v, i) => v + step[i]);
    // portée atteinte sans rien toucher (lancé dans le vide) : il revient directement dans la main
    if (T >= pr.fuse || pr.pos[1] < -5) { pr.done = true; owner.knifeOut = false; if (!owner.isBot) this.send(owner, { type: 'knifeBack', auto: 1 }); }
  }

  // ---------- revente pendant la phase d'achat ----------
  // prix complet pour ce que le joueur a acheté lui-même pendant la manche, moitié du prix sinon (arme gardée ou ramassée)
  sellValue(p, w) {
    if (!w || !WEAPONS[w.id] || w.id === 'knife') return 0;
    const cost = WEAPONS[w.id].cost || 0;
    return w.boughtRound === this.round && w.buyer === p.id ? cost : Math.floor(cost / 2 / 50) * 50;
  }
  handleSell(p, msg) {
    if (!p.alive || this.mode === 'gungame' || isFfa(this.mode) || this.phase !== 'buy') return;
    if (msg.item === 'armor') {
      const b = p.armorBought;
      if (!b || b.round !== this.round || p.armor <= 0) { this.send(p, { type: 'notice', text: 'SEUL UN GILET ACHETÉ CETTE MANCHE PEUT ÊTRE REVENDU' }); return; }
      const refund = ARMOR[b.item].cost;
      p.money = Math.min(ROUND.maxMoney, p.money + refund); p.armor = 0; p.armorBought = null;
      this.send(p, { type: 'sold', item: b.item, refund });
      return;
    }
    const slot = Number(msg.slot);
    if (slot !== 1 && slot !== 2) return;
    const w = p.weapons[slot];
    if (!w || (slot === 2 && w.id === 'spark')) return;
    const refund = this.sellValue(p, w);
    p.money = Math.min(ROUND.maxMoney, p.money + refund);
    // l'arme secondaire vendue est remplacée par le pistolet gratuit
    p.weapons[slot] = slot === 2 ? this.newWeapon('spark') : null;
    if (!p.weapons[p.slot]) p.slot = p.weapons[1] ? 1 : 2;
    p.reloadEnd = 0;
    this.send(p, { type: 'sold', item: w.id, refund, slot });
  }

  // ---------- armes au sol ----------
  dropsOn() { return !isFfa(this.mode) || this.mode === 'br'; } // 1.44 : en Battle Royale aussi, on peut jeter son arme
  spawnDrop(p, w, throwIt) {
    if (!w || w.id === 'knife' || !this.dropsOn()) return;
    let pos = [p.pos[0], 0, p.pos[2]];
    if (throwIt) {
      const dir = norm([-Math.sin(p.yaw), 0, -Math.cos(p.yaw)]);
      const eye = [p.pos[0], p.pos[1] + 1, p.pos[2]];
      const t = Math.max(0, Math.min(1.8, raycastBoxes(eye, dir, 1.8, this.allBoxes()).t - 0.5));
      pos = [p.pos[0] + dir[0] * t, 0, p.pos[2] + dir[2] * t];
    }
    pos[1] = groundHeight(pos[0], pos[2], p.pos[1] + 0.5, this.map.boxes);
    this.drops.push({ id: this.nextId++, w: { ...w }, pos, from: p.id, noPick: this.time + (throwIt ? 3 : 0) });
    if (this.drops.length > (this.mode === 'br' ? 80 : 24)) this.drops.shift();
  }
  handleDrop(p) {
    if (!p.alive || !this.dropsOn() || this.phase === 'over') return;
    const slot = p.slot;
    const w = p.weapons[slot];
    if (!w || slot === 3) return;
    p.weapons[slot] = null;
    p.slot = p.weapons[1] ? 1 : p.weapons[2] ? 2 : 3;
    p.reloadEnd = 0;
    this.spawnDrop(p, w, true);
    this.send(p, { type: 'dropped', item: w.id });
  }
  pickupDrops() {
    if (!this.drops.length) return;
    const T = this.time;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      for (let i = 0; i < this.drops.length; i++) {
        const d = this.drops[i];
        const slot = WEAPONS[d.w.id]?.slot;
        const toBag = slot && p.weapons[slot] && p.bag && p.bag.length < BR.bagSize;
        if (!slot || (p.weapons[slot] && !toBag) || (d.from === p.id && T < d.noPick) || !this.weaponAllowed(d.w.id)) continue;
        if (Math.hypot(p.pos[0] - d.pos[0], p.pos[2] - d.pos[2]) > 1.4 || Math.abs(p.pos[1] - d.pos[1]) > 1.8) continue;
        if (toBag) { p.bag.push(d.w); this.drops.splice(i, 1); i--; this.send(p, { type: 'notice', text: `${WEAPONS[d.w.id].name.toUpperCase()} RANGÉE DANS LE SAC` }); continue; }
        p.weapons[slot] = d.w;
        this.drops.splice(i, 1); i--;
        this.send(p, { type: 'picked', item: d.w.id, slot });
      }
    }
  }

  // ---------- « prêt » : la phase d'achat se termine plus tôt quand tous les joueurs humains sont prêts ----------
  handleReady(p) {
    if (isFfa(this.mode) || this.phase !== 'buy' || p.isBot || p.ready) return;
    p.ready = true;
    const humans = [...this.players.values()].filter(q => !q.isBot && !q.joinedMidRound);
    const n = humans.filter(q => q.ready).length;
    this.broadcast({ type: 'readyState', n, total: humans.length, name: p.name });
    if (n >= humans.length && !this.readyDone) {
      this.readyDone = true;
      this.phaseEnd = Math.min(this.phaseEnd, this.time + 3);
      this.broadcast({ type: 'notice', text: 'TOUT LE MONDE EST PRÊT : DÉPART DANS 3 S' });
    }
  }

  // ---------- rapport des dégâts de la manche (donnés et reçus, par adversaire) ----------
  sendDmgReport(p) {
    if (p.isBot) return;
    const rows = [];
    for (const q of this.players.values()) {
      if (q === p || !this.isEnemy(p, q)) continue;
      const dealt = Math.round(q.damagedBy.get(p.id) || 0), recv = Math.round(p.damagedBy.get(q.id) || 0);
      const out = q.hitsBy?.get(p.id), inn = p.hitsBy?.get(q.id);
      if (dealt || recv) rows.push({ i: q.id, n: q.name, dealt, recv, dead: !q.alive, hd: out?.n || 0, hh: out?.h || 0, hr: inn?.n || 0, hrh: inn?.h || 0 });
    }
    if (rows.length) this.send(p, { type: 'dmgReport', rows: rows.sort((a, b) => b.dealt + b.recv - a.dealt - a.recv).slice(0, 8) });
  }

  handleShoot(p, msg) {
    if (p.drinkEnd > this.time || p.inBus || p.downed) return; // en train de boire, dans le dirigeable, ou à terre
    if (!p.alive || this.phase === 'buy' || this.phase === 'over' || this.phase === 'warmup') return;
    const w = p.weapons[p.slot];
    if (!w) return;
    const d = WEAPONS[w.id];
    const interval = 1 / (d.rate * p.rateMul);
    if (this.time - p.lastShot < interval * 0.7) return;
    if (d.type === 'melee' && p.knifeOut) return; // couteau lancé : il faut d'abord le ramasser
    if (d.type !== 'melee') {
      if (p.reloadEnd > this.time) { if (w.mag + this.reloadPartial(p) <= 0) return; this.cancelReload(p); }
      if (w.mag <= 0) return;
      if (!this.opts.infAmmo) w.mag--;
    }
    p.lastShot = this.time; p.protEnd = 0; p.lastActive = this.time;
    if (d.type !== 'melee') p.shots++;
    if (msg.a && d.ads) p.adsShots++; // tir au viseur (statistiques)
    p.invisEnd = Math.min(p.invisEnd, this.time);
    const origin = this.eye(p);
    const dirs = (Array.isArray(msg.d) ? msg.d : []).slice(0, d.pellets || 1)
      .filter(v => Array.isArray(v) && v.length === 3 && v.every(finite)).map(norm);
    if (!dirs.length) return;
    const boxes = this.allBoxes();
    const ends = [];
    const range = d.type === 'melee' ? d.range : 400;
    const dmgAcc = new Map();
    for (const dir of dirs) {
      const wr = raycastBoxes(origin, dir, range, boxes);
      let bestT = wr.t, target = null, zone = null, through = false;
      const findTarget = (from, to) => {
        for (const q of this.players.values()) {
          if (!q.alive || q === p || (!this.isEnemy(p, q) && !this.opts.friendlyFire)) continue;
          if (Math.hypot(q.pos[0] - origin[0], q.pos[2] - origin[2]) > to + 2) continue;
          for (const hb of hitboxes(q.pos, q.crouch)) {
            const t = rayAABB(origin, dir, hb.min, hb.max);
            if (t > from && t < to && t < (target ? bestT : Infinity)) { bestT = t; target = q; zone = hb.zone; }
          }
        }
      };
      findTarget(-1, wr.t);
      if (!target) bestT = wr.t;
      // balle qui traverse une caisse en bois (armes avec « pen ») : continue derrière avec moins de dégâts
      if (!target && d.pen && wr.box && (wr.box.kind === 'crate' || wr.box.kind === 'crateHigh')) {
        const exitT = rayExit(origin, dir, wr.box.min, wr.box.max);
        if (exitT > wr.t && exitT - wr.t < 3.6) {
          const after = [origin[0] + dir[0] * (exitT + 0.01), origin[1] + dir[1] * (exitT + 0.01), origin[2] + dir[2] * (exitT + 0.01)];
          const wr2 = raycastBoxes(after, dir, range - exitT, boxes);
          findTarget(exitT, exitT + wr2.t);
          if (target) through = true; else bestT = exitT + wr2.t;
        }
      }
      if (target && this.opts.headOnly && zone !== 'head' && d.type !== 'melee') target = null; // têtes uniquement
      if (target) {
        let dmg = d.damage * (zone === 'head' ? d.headMul : zone === 'legs' ? d.legMul : 1);
        if (through) dmg *= d.pen; // à travers une caisse
        if (!this.isEnemy(p, target)) dmg *= 0.5; // tir allié (option de salon) : moitié des dégâts
        if (d.falloff && bestT > d.falloff[0]) dmg *= d.falloff[1];
        if (w.rar && BR.rarity[w.rar]) dmg *= BR.rarity[w.rar].mul; // Battle Royale : arme rare, épique, légendaire
        const acc = dmgAcc.get(target) || { dmg: 0, head: false };
        acc.dmg += dmg; acc.head = acc.head || zone === 'head';
        dmgAcc.set(target, acc);
      } else if (wr.box && wr.box.wallId) {
        const wall = wr.box;
        wall.hp -= d.damage;
        if (wall.hp <= 0) { this.walls = this.walls.filter(x => x !== wall); this.wallBoxesCache = null; this.broadcast({ type: 'wallBreak', id: wall.wallId }); }
      }
      ends.push([r2(origin[0] + dir[0] * bestT), r2(origin[1] + dir[1] * bestT), r2(origin[2] + dir[2] * bestT)]);
    }
    if (dmgAcc.size && d.type !== 'melee') p.hits++;
    // 1.34 : celui qui te tire dessus n'est jamais invisible pour toi ; l'éclair du tir le révèle aux ennemis qui voient l'arme
    if (d.type !== 'melee') {
      for (const q of this.players.values()) {
        if (q === p || !q.alive || !this.isEnemy(q, p) || q.isBot) continue;
        q.visUntil ||= new Map();
        if (dmgAcc.has(q)) { q.visUntil.set(p.id, this.time + 2); continue; }
        const qe = this.eye(q), dist = Math.hypot(origin[0] - qe[0], origin[2] - qe[2]);
        if (dist > 120 || p.invisEnd > this.time) continue;
        const dir = [(origin[0] - qe[0]) / (dist || 1), 0, (origin[2] - qe[2]) / (dist || 1)];
        const len = Math.hypot(origin[0] - qe[0], origin[1] - qe[1], origin[2] - qe[2]) || 1;
        const nd = [(origin[0] - qe[0]) / len, (origin[1] - qe[1]) / len, (origin[2] - qe[2]) / len];
        if (raycastBoxes(qe, nd, len - 0.3, this.allBoxes()).t >= len - 0.35) q.visUntil.set(p.id, this.time + 1.2);
      }
    }
    for (const [q, acc] of dmgAcc) this.damage(q, acc.dmg, p, w.id, acc.head);
    this.broadcast({ type: 'shot', i: p.id, w: w.id, o: origin.map(r2), e: ends.slice(0, 4) });
    (p.shotLog ||= []).push([r2(this.time), w.id, ends[0]]);
    while (p.shotLog.length && this.time - p.shotLog[0][0] > 3.5) p.shotLog.shift();
    if (p.shotLog.length > 40) p.shotLog.shift();
  }

  damage(q, amount, attacker, wpn, head, silent = false) {
    if (!q.alive || amount <= 0) return;
    if (q.inBus || attacker?.inBus) return; // personne n'est touché dans le dirigeable, et on ne frappe pas depuis le dirigeable
    amount *= this.dmgMul; // règle « dégâts reçus » (partie personnalisée)
    if (attacker && attacker !== q && q.protEnd > this.time) return; // protection de réapparition
    if (attacker && attacker !== q) {
      q.damagedBy.set(attacker.id, (q.damagedBy.get(attacker.id) || 0) + Math.min(amount, Math.max(0, q.hp) + Math.max(0, q.armor)));
      q.hitsBy ||= new Map(); const hb = q.hitsBy.get(attacker.id) || { n: 0, h: 0 }; hb.n++; if (head) hb.h++; q.hitsBy.set(attacker.id, hb);
      q.lastDamagedBy = attacker.id; q.lastDamagedAt = this.time;
    }
    if (attacker && attacker !== q && this.isEnemy(attacker, q)) { const real = Math.min(amount, q.hp + q.armor); attacker.dmg += real; attacker.roundDmg = (attacker.roundDmg || 0) + real; }
    let rest = amount;
    if (q.armor > 0) { const a = Math.min(q.armor, rest); q.armor -= a; rest -= a; }
    q.hp -= rest;
    if (q.hp <= 0 && this.brTeam > 1 && !q.downed && this.phase === 'live' && this.squadUp(q).length) { this.downPlayer(q, attacker, wpn); return; }
    const killed = q.hp <= 0;
    if (attacker && attacker !== q && !silent) this.send(attacker, { type: 'hit', d: Math.round(amount), h: head ? 1 : 0, k: killed ? 1 : 0, t: q.id });
    if (!silent || killed) this.send(q, { type: 'hurt', d: Math.round(amount), from: attacker ? attacker.pos.map(r2) : null });
    if (killed) this.kill(q, attacker, wpn, head);
  }

  kill(v, a, wpn, head) {
    v.alive = false; v.hp = 0; v.deaths++; v.diedAt = this.time; v.interact = false; v.prog = 0;
    this.statsDirty = true;
    if (this.core.carrier === v.id) this.dropCore(v);
    // l'arme principale (sinon le pistolet acheté) tombe au sol et peut être ramassée
    if (this.mode === 'br') { for (const s of [1, 2]) if (v.weapons[s]) { this.spawnDrop(v, v.weapons[s], false); v.weapons[s] = null; } } // Battle Royale : tout tombe
    else if (this.dropsOn()) { const s = v.weapons[1] ? 1 : v.weapons[2] && v.weapons[2].id !== 'spark' ? 2 : 0; if (s) { this.spawnDrop(v, v.weapons[s], false); v.weapons[s] = s === 2 ? this.newWeapon('spark') : null; } }
    if (v.bag?.length) { v.bag.forEach((w, k) => this.drops.push({ id: this.nextId++, w, pos: [v.pos[0] + Math.cos(k * 2.1) * 0.9, 0, v.pos[2] + Math.sin(k * 2.1) * 0.9], from: null, noPick: 0 })); v.bag = []; }
    if (this.mode === 'br' && a && a !== v) a.money = (a.money || 0) + BR.money.kill;
    if (this.mode === 'br' && a && a !== v && a.alive) { const h = Math.min(100 - a.hp, BR.killHeal); a.hp += h; a.armor = Math.min(100, (a.armor || 0) + BR.killHeal - h); this.send(a, { type: 'killHeal', n: BR.killHeal }); }
    const vStreak = v.streak; v.streak = 0; v.kit = false;
    if (a && a !== v && !this.isEnemy(a, v)) {
      a.score = Math.max(0, a.score - 100);
      this.broadcast({ type: 'notice', text: `${a.name.toUpperCase()} A ÉLIMINÉ UN ALLIÉ (−100)` });
    } else if (a && a !== v) {
      a.kills++; a.score += 200 + (head ? 50 : 0);
      a.weaponKills[wpn] = (a.weaponKills[wpn] || 0) + 1;
      a.streak++; if (a.streak > a.bestStreak) a.bestStreak = a.streak;
      if (a.streak >= 5 && a.streak % 5 === 0) this.broadcast({ type: 'notice', text: `${a.name.toUpperCase()} : SÉRIE DE ${a.streak} ÉLIMINATIONS !` });
      if (vStreak >= 5) this.broadcast({ type: 'notice', text: `${a.name.toUpperCase()} MET FIN À LA SÉRIE DE ${v.name.toUpperCase()} (${vStreak})` });
      // premier sang : première élimination de la partie
      if (!this.firstBlood) { this.firstBlood = true; a.score += 100; this.broadcast({ type: 'notice', text: `PREMIER SANG : ${a.name.toUpperCase()}` }); }
      // prime : éliminer le meneur (Mêlée) rapporte un bonus
      if (isFfa(this.mode) && v.id === this.leaderId) { a.score += 150; this.broadcast({ type: 'notice', text: `👑 ${a.name.toUpperCase()} A ABATTU LE MENEUR ${v.name.toUpperCase()} (+150)` }); }
      if (head) a.hsKills++;
      if (wpn === 'knife') a.knifeKills++;
      if (!isFfa(this.mode)) {
        a.roundKills++;
        if (a.roundKills === 3) a.multi3++;
        if (a.roundKills === 5 && this.mode === 'assault') a.aces++;
      }
      if (this.mode === 'assault') a.money = Math.min(ROUND.maxMoney, a.money + ROUND.killMoney);
      a.ult = Math.min(this.ultCost(a), a.ult + 1);
    }
    for (const [id] of v.damagedBy) {
      if (a && id === a.id) continue;
      const ass = this.players.get(id);
      if (ass && this.isEnemy(ass, v)) { ass.assists++; ass.score += 50; }
    }
    this.broadcast({ type: 'kill', k: a ? a.id : null, v: v.id, w: wpn, h: head ? 1 : 0 });
    this.sendDmgReport(v);
    if (a && a !== v && !v.isBot) {
      this.sendKillcam(v, a, wpn, head);
      // rapport de combat : dégâts échangés avec le tueur
      this.send(v, { type: 'combat', killer: a.name, dealt: Math.round(a.damagedBy.get(v.id) || 0), recv: Math.round(v.damagedBy.get(a.id) || 0), hp: Math.max(0, Math.ceil(a.hp)), armor: Math.max(0, Math.ceil(a.armor)), dist: Math.round(Math.hypot(a.pos[0] - v.pos[0], a.pos[2] - v.pos[2])) });
    }
    if (isFfa(this.mode)) this.updateLeader();
    if (this.mode === 'assault' || this.mode === 'duel') this.checkClutch();
    this.io.onEvent?.('kill', { weapon: wpn, head: !!head, killer: a && a !== v ? a.name : null, victim: v.name });
    if (isFfa(this.mode)) {
      v.respawnAt = this.time + (this.opts.respawn || FFA.respawn);
      if (isLastStand(this.mode)) return this.livesKill(v);
      if (this.mode === 'gungame') this.gunKill(v, a, wpn);
      else if (a && a !== v && a.kills >= this.target && this.phase !== 'over') this.matchOver(a.id);
    }
  }

  // ---------- duos et escouades (1.54) ----------
  squadUp(q) { return [...this.players.values()].filter(o => o !== q && o.team === q.team && o.alive && !o.downed && !o.out); }
  downPlayer(q, attacker, wpn) {
    q.downed = true; q.hp = BR.down.bleed; q.armor = 0; q.downBy = attacker?.id || null; q.drinkEnd = 0; q.interact = false; q.prog = 0;
    if (attacker && attacker !== q) this.send(attacker, { type: 'hit', d: 0, h: 0, k: 0, t: q.id, dn: 1 });
    this.broadcast({ type: 'downed', i: q.id, by: attacker?.id || null, w: wpn });
    this.statsDirty = true;
  }
  tickSquads(dt) {
    const T = this.time;
    for (const p of this.players.values()) {
      if (p.downed && p.alive) {
        // perd des PV petit à petit ; plus personne debout dans l'équipe : éliminé
        p.hp -= BR.down.bleedRate * dt;
        if (p.hp <= 0 || !this.squadUp(p).length) { p.downed = false; p.hp = 0; this.kill(p, this.players.get(p.downBy) || null, 'bleed', false); }
        continue;
      }
      // réanimation : maintenir la touche d'interaction près d'un coéquipier à terre
      if (!p.alive || p.downed || !p.interact) { if (p.progKind === 'revive') { p.prog = 0; p.progKind = null; p.reviving = null; } continue; }
      const mate = [...this.players.values()].find(o => o.downed && o.alive && o.team === p.team && Math.hypot(o.pos[0] - p.pos[0], o.pos[2] - p.pos[2]) < BR.down.range);
      if (!mate) { if (p.progKind === 'revive') { p.prog = 0; p.progKind = null; } continue; }
      if (p.reviving !== mate.id) { p.reviving = mate.id; p.prog = 0; }
      p.progKind = 'revive'; p.prog += dt;
      if (p.prog >= BR.down.reviveTime) {
        mate.downed = false; mate.hp = BR.down.reviveHp; p.prog = 0; p.progKind = null; p.reviving = null; p.interact = false;
        this.broadcast({ type: 'revived', i: mate.id, by: p.id });
      }
    }
  }
  // Dernier debout : chaque joueur a quelques vies ; le dernier encore en jeu gagne
  livesKill(v) {
    v.lives = Math.max(0, v.lives - 1);
    if (this.brTeam > 1) return this.squadOut(v);
    const alive0 = [...this.players.values()].filter(p => !p.out).length;
    if (v.lives <= 0) { v.out = true; v.respawnAt = 0; v.place = alive0; this.broadcast({ type: 'notice', text: this.mode === 'br' ? `${v.name.toUpperCase()} EST ÉLIMINÉ · ${alive0 - 1} JOUEUR(S) EN VIE` : `${v.name.toUpperCase()} EST ÉLIMINÉ DÉFINITIVEMENT` }); }
    const left = [...this.players.values()].filter(p => !p.out);
    if (left.length === 1) left[0].place = 1;
    // Battle Royale (1.47) : 5 secondes pour que le gagnant fasse sa danse avant l'écran de fin
    if (this.mode === 'br' && left.length <= 1 && this.phase !== 'over') { if (!this.brWin) { this.brWin = { id: left[0]?.id || null, at: this.time + 5 }; this.broadcast({ type: 'brWin', i: this.brWin.id }); } return; }
    if (left.length <= 1 && this.phase !== 'over') this.matchOver(left[0]?.id || null);
  }
  squadOut(v) {
    v.lives = 0; v.out = true; v.respawnAt = 0; v.downed = false;
    const teamsAlive = () => new Set([...this.players.values()].filter(p => !p.out).map(p => p.team));
    // équipe entièrement à terre ou éliminée : ses membres à terre sont éliminés aussi
    const left0 = teamsAlive();
    if (!this.squadUp(v).length) for (const o of this.players.values()) if (o.team === v.team && o.downed && o.alive) { o.downed = false; o.alive = false; o.hp = 0; o.out = true; o.lives = 0; }
    const left = teamsAlive();
    if (!left.has(v.team)) { for (const o of this.players.values()) if (o.team === v.team) o.place = left.size + 1; this.broadcast({ type: 'notice', text: `ÉQUIPE DE ${v.name.toUpperCase()} ÉLIMINÉE · ${left.size} ÉQUIPE(S) EN JEU` }); }
    else this.broadcast({ type: 'notice', text: `${v.name.toUpperCase()} EST ÉLIMINÉ` });
    void left0;
    if (left.size <= 1 && this.phase !== 'over' && !this.brWin) {
      const team = [...left][0] || null; this.brWinTeam = team;
      const win = [...this.players.values()].find(p => p.team === team && !p.out);
      for (const o of this.players.values()) if (o.team === team) o.place = 1;
      this.brWin = { id: win?.id || null, at: this.time + 5 }; this.broadcast({ type: 'brWin', i: win?.id || null, team });
    }
  }
  updateLeader() {
    let best = null, tie = false;
    for (const p of this.players.values()) { if (!best || p.kills > best.kills) { best = p; tie = false; } else if (p.kills === best.kills) tie = true; }
    const id = best && !tie && best.kills >= 3 ? best.id : null;
    if (id !== this.leaderId) { this.leaderId = id; this.broadcast({ type: 'leader', id }); }
  }
  // ---------- vote d'abandon (1.15) ----------
  voteSurrender(p) {
    if (this.mode !== 'assault' || this.phase === 'over' || this.phase === 'warmup') return 'Le vote d\'abandon n\'est possible qu\'en Assaut, pendant la partie.';
    if (this.round < 4) return 'Le vote d\'abandon est possible à partir de la manche 4.';
    const team = p.team, T = this.time;
    const humans = [...this.players.values()].filter(q => q.team === team && !q.isBot);
    this.ff ||= {}; this.ffLast ||= {};
    let v = this.ff[team];
    if (!v || T > v.until) {
      if (this.ffLast[team] && this.round - this.ffLast[team] < 2) return 'Un vote d\'abandon a déjà eu lieu récemment : attends 2 manches.';
      v = this.ff[team] = { yes: new Set(), until: T + 30 }; this.ffLast[team] = this.round;
    }
    v.yes.add(p.id);
    const need = humans.length <= 2 ? humans.length : Math.ceil(humans.length * 0.8);
    for (const q of humans) this.send(q, { type: 'notice', text: `VOTE D'ABANDON : ${v.yes.size}/${need} — TAPE /ff POUR ACCEPTER (30 s)` });
    if (v.yes.size >= need) {
      this.ff[team] = null;
      this.broadcast({ type: 'notice', text: `L'ÉQUIPE ${team === 'alpha' ? 'ALPHA' : 'OMÉGA'} ABANDONNE` });
      this.matchOver(team === 'alpha' ? 'beta' : 'alpha');
    }
    return null;
  }

  // 1 contre X : prévient le dernier survivant d'une équipe
  checkClutch() {
    if (this.phase !== 'live' && this.phase !== 'planted') return;
    for (const team of ['alpha', 'beta']) {
      const mine = [...this.players.values()].filter(p => p.team === team && p.alive);
      const foes = [...this.players.values()].filter(p => p.team !== team && p.alive);
      if (mine.length === 1 && foes.length >= 2 && this.clutchRound !== this.round + team) {
        this.clutchRound = this.round + team;
        this.send(mine[0], { type: 'notice', text: `1 CONTRE ${foes.length} : À TOI DE JOUER !` });
      }
    }
  }
  // émotes en partie (limitées)
  handleEmote(p, m) {
    const id = Math.round(Number(m.e));
    if (!(id >= 0 && id < 98)) return; // 0-7 : bulles, 8-97 : les 90 animations (1.46)
    if (id >= 8 && !p.alive) return;
    const last = this.emoteT.get(p.id) || -9;
    if (this.time - last < (id >= 8 ? 0.8 : 2)) return;
    this.emoteT.set(p.id, this.time);
    this.broadcast({ type: 'emote', i: p.id, e: id });
  }

  // killcam : les 3 dernières secondes vues par le tueur, envoyées seulement à la victime (qui est déjà morte)
  sendKillcam(v, a, wpn, head) {
    const T = this.time;
    const kh = (a.hist || []).filter(f => T - f[0] <= 3.2);
    if (kh.length < 3) return;
    const vh = new Map((v.hist || []).map(f => [f[0], f]));
    const frames = kh.map(f => { const g = vh.get(f[0]); return { t: f[0], k: f.slice(1, 7), v: g ? g.slice(1, 8) : null }; });
    frames.push({ t: r2(T), k: [r2(a.pos[0]), r2(a.pos[1]), r2(a.pos[2]), r3(a.yaw), r3(a.pitch), a.crouch ? 1 : 0], v: [r2(v.pos[0]), r2(v.pos[1]), r2(v.pos[2]), r3(v.yaw), r3(v.pitch), v.crouch ? 1 : 0, 0] });
    const shots = (a.shotLog || []).filter(s => T - s[0] <= 3.2);
    this.send(v, { type: 'killcam', k: a.id, kn: a.name, ka: a.agent, w: wpn, h: head ? 1 : 0, hp: Math.max(0, Math.ceil(a.hp)), frames, shots });
  }

  dropCore(p) {
    this.core.status = 'dropped';
    this.core.carrier = null;
    this.core.pos = [p.pos[0], groundHeight(p.pos[0], p.pos[2], p.pos[1] + 0.5, this.map.boxes), p.pos[2]];
  }

  // ---------- Capacités ----------
  handleAbility(p, m) {
    if (!p.alive || this.phase === 'over' || this.phase === 'warmup' || this.knifeRound) return;
    const key = m.k;
    const ab = AGENTS[p.agent].abilities[key];
    if (!ab || this.opts.noAbilities) return;
    if (key === 'x') {
      if (p.ult < ab.cost) return;
      p.ult = 0; p.ults++;
    } else {
      if ((p.charges[key] || 0) <= 0) return;
      p.charges[key]--; p.abilities++;
      if (isFfa(this.mode) && !p.recharge[key]) p.recharge[key] = this.time + FFA.abilityRecharge;
    }
    p.protEnd = 0;
    const dir = Array.isArray(m.d) && m.d.length === 3 && m.d.every(finite) ? norm(m.d) : [0, 0, -1];
    const eye = this.eye(p);
    const T = this.time;
    if (ab.type === 'grapple') { p.moveBonus = (p.moveBonus || 0) + 26; p.moveBonusEnd = T + 2; }
    if (ab.type === 'dash' || ab.type === 'blink') { p.moveBonus = (p.moveBonus || 0) + (ab.type === 'blink' ? MOVE.blinkDist + 2 : MOVE.dashSpeed * MOVE.dashTime + 3); p.moveBonusEnd = T + 1.5; }
    const shock = p.agent === 'volta';
    const aimPoint = (maxT) => {
      const r = raycastBoxes(eye, dir, maxT, this.allBoxes());
      const t = Math.max(1.5, r.t - 0.8);
      const pt = [eye[0] + dir[0] * t, eye[1] + dir[1] * t, eye[2] + dir[2] * t];
      pt[1] = groundHeight(pt[0], pt[2], pt[1], this.map.boxes);
      return pt;
    };
    const throwProj = (kind, speed, up, fuse) => {
      this.projectiles.push({ id: this.nextId++, kind, owner: p.id, team: p.team, shock,
        pos: [eye[0] + dir[0] * 0.6, eye[1] + dir[1] * 0.6 - 0.1, eye[2] + dir[2] * 0.6],
        vel: [dir[0] * speed, dir[1] * speed + up, dir[2] * speed], fuse: T + fuse, stopped: false });
    };
    switch (ab.type) {
      case 'smoke': throwProj('smoke', 17, 3, 2.2); break;
      case 'molotov': throwProj('molotov', 15, 3.5, 2.5); break;
      case 'flash': throwProj('flash', 20, 2, 0.7); break;
      case 'heal': p.healEnd = T + 3; p.healRate = 20; break;
      case 'shield': p.armor = Math.max(p.armor, 50); break;
      case 'invis': p.invisEnd = T + 4; break;
      case 'recon':
        for (const q of this.players.values()) if (q.alive && this.isEnemy(p, q) && Math.hypot(q.pos[0] - p.pos[0], q.pos[2] - p.pos[2]) < 40) q.revealEnd = T + 5;
        break;
      case 'hunt':
        for (const q of this.players.values()) if (q.alive && this.isEnemy(p, q)) q.revealEnd = T + 7;
        break;
      case 'wall': {
        const flat = norm([dir[0], 0, dir[2]]);
        const r = raycastBoxes(eye, flat, 14, this.map.boxes);
        const t = Math.max(2.5, r.t - 1.2);
        const c = [eye[0] + flat[0] * t, 0, eye[2] + flat[2] * t];
        const g = groundHeight(c[0], c[2], p.pos[1] + 0.5, this.map.boxes);
        const alongX = Math.abs(flat[2]) > Math.abs(flat[0]);
        const half = alongX ? [3.6, 0.45] : [0.45, 3.6];
        const box = { min: [c[0] - half[0], g, c[2] - half[1]], max: [c[0] + half[0], g + 4.2, c[2] + half[1]], kind: 'ice', wallId: this.nextId++, hp: 400, end: T + 15 };
        this.walls.push(box); this.wallBoxesCache = null;
        for (const q of this.players.values()) if (q.isBot && q.alive) depenetrate(q.pos, [box]);
        break;
      }
      case 'overdrive': p.buffEnd = T + 10; p.buffSpeed = 1.25; p.rateMul = 1.3; p.hp = 100; break;
      case 'phantom': p.buffEnd = T + 10; p.buffSpeed = 1.15; p.rateMul = 1; p.invisEnd = T + 10; break;
      case 'haste': p.hasteEnd = T + 4; break;
      case 'cryo': throwProj('cryo', 17, 3, 2.2); break;
      case 'blizzard': {
        const pt = aimPoint(45);
        this.fires.push({ id: this.nextId++, pos: pt, r: 8, end: T + 8, dps: 12, slow: true, owner: p.id, kind: 'frost' });
        break;
      }
      // ---- capacités des nouveaux agents (1.19) ----
      case 'drone': { // repère les ennemis autour du point visé
        const pt = aimPoint(40); let n = 0;
        for (const q of this.players.values()) if (q.alive && this.isEnemy(p, q) && Math.hypot(q.pos[0] - pt[0], q.pos[2] - pt[2]) < 14) { q.revealEnd = T + 6; n++; }
        for (const q of this.players.values()) if (!q.isBot && !this.isEnemy(p, q)) this.send(q, { type: 'mark', i: p.id, n: 'DRONE', p: pt.map(r2), d: n > 0 });
        this.send(p, { type: 'notice', text: n ? `DRONE : ${n} ENNEMI${n > 1 ? 'S' : ''} REPÉRÉ${n > 1 ? 'S' : ''}` : 'DRONE : PERSONNE ICI' });
        break;
      }
      case 'icewall': { // long mur de glace + sol gelé
        const flat = norm([dir[0], 0, dir[2]]);
        const r = raycastBoxes(eye, flat, 14, this.map.boxes);
        const t = Math.max(2.5, r.t - 1.2);
        const c = [eye[0] + flat[0] * t, 0, eye[2] + flat[2] * t];
        const g = groundHeight(c[0], c[2], p.pos[1] + 0.5, this.map.boxes);
        const alongX = Math.abs(flat[2]) > Math.abs(flat[0]);
        const half = alongX ? [5.2, 0.5] : [0.5, 5.2];
        const box = { min: [c[0] - half[0], g, c[2] - half[1]], max: [c[0] + half[0], g + 3.6, c[2] + half[1]], kind: 'ice', wallId: this.nextId++, hp: 300, end: T + 10 };
        this.walls.push(box); this.wallBoxesCache = null;
        for (const q of this.players.values()) if (q.isBot && q.alive) depenetrate(q.pos, [box]);
        this.fires.push({ id: this.nextId++, pos: [c[0], g, c[2]], r: 4, end: T + 8, dps: 0, slow: true, owner: p.id, kind: 'frost' });
        break;
      }
      case 'trap': { // piège caché, visible seulement par l'équipe
        this.traps ||= [];
        const mine = this.traps.filter(x => x.owner === p.id);
        if (mine.length >= 2) { this.traps = this.traps.filter(x => x !== mine[0]); this.broadcast({ type: 'trapGone', id: mine[0].id }); }
        const tr = { id: this.nextId++, owner: p.id, team: p.team, pos: [p.pos[0] + dir[0] * 0.8, p.pos[1], p.pos[2] + dir[2] * 0.8], armAt: T + 1 };
        this.traps.push(tr);
        for (const q of this.players.values()) if (!q.isBot && !this.isEnemy(p, q)) this.send(q, { type: 'trap', id: tr.id, p: tr.pos.map(r2) });
        break;
      }
      case 'fortress':
        for (const q of this.players.values()) if (q.alive && !this.isEnemy(p, q) && Math.hypot(q.pos[0] - p.pos[0], q.pos[2] - p.pos[2]) < 18) { q.hp = 100; q.armor = Math.max(q.armor, 50); }
        break;
      case 'megasmoke': {
        const r = raycastBoxes(eye, dir, 40, this.allBoxes());
        const len = Math.max(6, r.t - 1);
        for (const f of [0.35, 0.68, 1]) {
          const t = len * f;
          const pt = [eye[0] + dir[0] * t, 0, eye[2] + dir[2] * t];
          pt[1] = groundHeight(pt[0], pt[2], eye[1] + dir[1] * t, this.map.boxes) + 1.8;
          this.smokes.push({ id: this.nextId++, pos: pt, r: 4.6, end: T + 16 });
        }
        break;
      }
      case 'firestorm': {
        const pt = aimPoint(45);
        this.fires.push({ id: this.nextId++, pos: pt, r: 7, end: T + 8, dps: 40, owner: p.id, kind: 'shock' });
        break;
      }
    }
    this.broadcast({ type: 'ability', i: p.id, k: ab.type, p: p.pos.map(r2) });
  }

  tickTraps(T) {
    for (const tr of this.traps.slice()) {
      if (T < tr.armAt) continue;
      const owner = this.players.get(tr.owner);
      const v = [...this.players.values()].find(q => q.alive && owner && this.isEnemy(owner, q) && Math.hypot(q.pos[0] - tr.pos[0], q.pos[2] - tr.pos[2]) < 1.6 && Math.abs(q.pos[1] - tr.pos[1]) < 1.5);
      if (!v) continue;
      this.traps = this.traps.filter(x => x !== tr);
      v.slowEnd = T + 3; v.revealEnd = T + 5;
      this.damage(v, 25, owner, 'trap', false);
      this.broadcast({ type: 'trapGone', id: tr.id, hit: v.id });
      if (owner) this.send(owner, { type: 'notice', text: `PIÈGE DÉCLENCHÉ : ${v.name.toUpperCase()}` });
      this.send(v, { type: 'notice', text: 'TU AS MARCHÉ SUR UN PIÈGE !' });
    }
  }
  // rebond (1.28) : la vitesse repart en miroir de la surface touchée, amortie ; au sol, la grenade roule puis s'arrête
  bounceProjectile(pr, n) {
    const dot = pr.vel[0] * n[0] + pr.vel[1] * n[1] + pr.vel[2] * n[2];
    if (dot >= 0) return;
    pr.vel = pr.vel.map((v, i) => (v - 2 * dot * n[i]) * 0.45);
    if (n[1] > 0.5) { pr.vel[0] *= 0.7; pr.vel[2] *= 0.7; if (Math.hypot(...pr.vel) < 1.2) { pr.stopped = true; pr.vel = [0, 0, 0]; } }
    pr.bounces = (pr.bounces || 0) + 1;
    if (pr.bounces === 1 || pr.bounces % 3 === 0) this.broadcast({ type: 'bounce', p: pr.pos.map(r2) });
  }
  deployProjectile(pr) {
    const T = this.time;
    const g = groundHeight(pr.pos[0], pr.pos[2], pr.pos[1] + 0.3, this.map.boxes);
    if (pr.kind === 'smoke') this.smokes.push({ id: this.nextId++, pos: [pr.pos[0], g + 1.8, pr.pos[2]], r: 4.5, end: T + 14 });
    else if (pr.kind === 'cryo') this.fires.push({ id: this.nextId++, pos: [pr.pos[0], g, pr.pos[2]], r: 4.2, end: T + 6, dps: 0, slow: true, owner: pr.owner, kind: 'frost' });
    else if (pr.kind === 'frag') { // grenade du Battle Royale : explosion, dégâts dégressifs, bloquée par les murs
      const c = [pr.pos[0], g + 0.4, pr.pos[2]], R = BR.items.nade.radius, owner = this.players.get(pr.owner);
      for (const q of this.players.values()) {
        if (!q.alive) continue;
        const qc = [q.pos[0], q.pos[1] + 1, q.pos[2]], dv = [qc[0] - c[0], qc[1] - c[1], qc[2] - c[2]], dist = Math.hypot(...dv);
        if (dist > R) continue;
        if (dist > 0.3 && raycastBoxes(c, norm(dv), dist, this.allBoxes()).t < dist - 0.3) continue;
        if (owner && q !== owner && !this.isEnemy(owner, q)) continue;
        this.damage(q, BR.items.nade.dmg * (1 - dist / R * 0.75) * (q === owner ? 0.5 : 1), owner || null, 'nade', false);
      }
      this.broadcast({ type: 'explode', p: c.map(r2), small: 1 });
    }
    else if (pr.kind === 'molotov') this.fires.push({ id: this.nextId++, pos: [pr.pos[0], g, pr.pos[2]], r: 3.6, end: T + 6, dps: 38, owner: pr.owner, kind: pr.shock ? 'shock' : 'fire' });
    else if (pr.kind === 'flash') {
      for (const q of this.players.values()) {
        if (!q.alive) continue;
        const e = this.eye(q);
        const to = [pr.pos[0] - e[0], pr.pos[1] - e[1], pr.pos[2] - e[2]];
        const dist = Math.hypot(...to);
        if (dist > 38) continue;
        const nd = norm(to);
        if (raycastBoxes(e, nd, dist - 0.2, this.allBoxes()).t < dist - 0.3) continue;
        const cp = Math.cos(q.pitch);
        const look = [-Math.sin(q.yaw) * cp, Math.sin(q.pitch), -Math.cos(q.yaw) * cp];
        const dot = look[0] * nd[0] + look[1] * nd[1] + look[2] * nd[2];
        const dur = dot > 0.5 ? 2.6 : dot > 0 ? 1.4 : dot > -0.4 ? 0.5 : 0;
        if (dur > 0) { q.blindEnd = T + dur; this.send(q, { type: 'flash', d: dur }); }
      }
      this.broadcast({ type: 'flashBang', p: pr.pos.map(r2) });
    }
  }

  // ---------- Boucle ----------
  tick(dt) {
    this.time += dt;
    this.tickCount++;
    const T = this.time;
    if (this.traps?.length) this.tickTraps(T);
    const assault = !isFfa(this.mode); // modes à manches (assaut, duel)

    for (const p of this.players.values()) if (p.brain) p.brain.update(dt);
    // historique des 3,5 dernières secondes (10 images/s) pour la killcam
    if (this.tickCount % 3 === 0) for (const p of this.players.values()) {
      (p.hist ||= []).push([r2(T), r2(p.pos[0]), r2(p.pos[1]), r2(p.pos[2]), r3(p.yaw), r3(p.pitch), p.crouch ? 1 : 0, p.alive ? 1 : 0]);
      if (p.hist.length > 36) p.hist.shift();
    }

    // effets
    for (const p of this.players.values()) {
      if (p.reloadEnd && T >= p.reloadEnd) {
        const w = p.weapons[p.slot];
        if (w && WEAPONS[w.id].mag) { const need = WEAPONS[w.id].mag - w.mag; const take = Math.min(need, w.reserve); w.mag += take; w.reserve -= take; }
        p.reloadEnd = 0;
      }
      if (!p.alive) {
        if (!assault && !p.out && p.respawnAt && T >= p.respawnAt && this.phase === 'live') { p.respawnAt = 0; this.spawnFFA(p); }
        continue;
      }
      if (p.healEnd > T) p.hp = Math.min(100, p.hp + p.healRate * dt);
      if (!p.isBot && (this.phase === 'live' || this.phase === 'planted') && this.tickCount % 15 === 0 && this.humanCount() >= 2) {
        const idle = T - (p.lastActive ?? T);
        if (idle > 45 && !p.afkWarned) { p.afkWarned = true; this.send(p, { type: 'notice', text: 'INACTIF : BOUGE OU TU SERAS RETIRÉ DE LA PARTIE' }); }
        else if (idle > 75) { p.lastActive = T; this.io.onAfk?.(p.id); }
      }
      if (p.buffEnd && T >= p.buffEnd) { p.buffEnd = 0; p.buffSpeed = 1; p.rateMul = 1; }
      // vitesse effective : bonus (ultime) × élan × ralentissement (givre)
      const sm = Math.round((p.buffEnd ? p.buffSpeed : 1) * (p.hasteEnd > T ? 1.35 : 1) * (p.slowEnd > T ? 0.6 : 1) * this.speedBase * 100) / 100;
      if (sm < p.speedMul) { p.speedPeak = p.speedMul; p.speedPeakEnd = T + 0.8; } // le client met un instant à ralentir
      p.speedMul = sm;
      if (!assault) for (const k of ['q', 'e']) {
        if (p.recharge[k] && T >= p.recharge[k]) {
          const max = AGENTS[p.agent].abilities[k].charges;
          p.charges[k] = Math.min(max, (p.charges[k] || 0) + 1);
          p.recharge[k] = p.charges[k] < max ? T + FFA.abilityRecharge : 0;
        }
      }
    }

    // projectiles
    const boxes = this.allBoxes();
    for (const pr of this.projectiles) {
      if (pr.kind === 'knife') { this.tickKnife(pr, dt, boxes); continue; }
      if (!pr.stopped) {
        pr.vel[1] -= 18 * dt;
        const step = pr.vel.map(v => v * dt);
        const len = Math.hypot(...step);
        if (len > 0) {
          const dir = step.map(v => v / len);
          const r = raycastBoxes(pr.pos, dir, len, boxes);
          if (r.t < len) {
            const t = Math.max(0, r.t - 0.08);
            pr.pos = pr.pos.map((v, i) => v + dir[i] * t);
            const n = boxNormal(pr.pos, r.box);
            if (pr.kind === 'molotov' && n[1] > 0.5) { pr.done = true; this.deployProjectile(pr); continue; }
            this.bounceProjectile(pr, n);
          } else pr.pos = pr.pos.map((v, i) => v + step[i]);
          // sol de la carte
          if (pr.pos[1] <= 0.06 && pr.vel[1] < 0) {
            pr.pos[1] = 0.06;
            if (pr.kind === 'molotov') { pr.done = true; this.deployProjectile(pr); continue; }
            this.bounceProjectile(pr, [0, 1, 0]);
          }
        }
      }
      if (T >= pr.fuse) { pr.done = true; this.deployProjectile(pr); }
    }
    this.projectiles = this.projectiles.filter(p => !p.done);
    this.smokes = this.smokes.filter(s => s.end > T);
    this.fires = this.fires.filter(f => f.end > T);
    const wl = this.walls.length;
    this.walls = this.walls.filter(w => w.end > T);
    if (this.walls.length !== wl) this.wallBoxesCache = null;

    // dégâts de zone
    for (const f of this.fires) {
      const owner = this.players.get(f.owner);
      for (const q of this.players.values()) {
        if (!q.alive) continue;
        if (owner && !this.isEnemy(owner, q)) continue;
        if (Math.hypot(q.pos[0] - f.pos[0], q.pos[2] - f.pos[2]) < f.r && Math.abs(q.pos[1] - f.pos[1]) < 2.5) {
          if (f.slow) q.slowEnd = T + 0.4;
          if (f.dps > 0 && !this.opts.headOnly) this.damage(q, f.dps * dt, owner || null, f.kind === 'shock' ? 'shock' : f.kind === 'frost' ? 'frost' : 'fire', false, true);
        }
      }
    }

    this.pickupDrops();
    if (this.mode === 'br') this.tickBus();
    if (this.brTeam > 1 && this.phase === 'live') this.tickSquads(dt);
    if (this.mode === 'br' && this.phase === 'live') { if (this.brWin) { if (this.time >= this.brWin.at) this.matchOver(this.brWin.id); } else this.tickZone(dt); this.tickPotions(); }
    if (assault) this.tickAssault(dt);
    else if (this.phase === 'live' && T >= this.phaseEnd) {
      let best = null;
      for (const p of this.players.values()) if (!best || p.lives > best.lives || (p.lives === best.lives && (p.gun > best.gun || (p.gun === best.gun && p.kills > best.kills)))) best = p;
      this.matchOver(best ? best.id : null);
    }

    if (this.phase === 'over' && T >= this.overAt) { this.io.onEnd(); return; }
    if (this.tickCount % SNAP_EVERY === 0) this.sendSnapshots();
  }

  tickAssault(dt) {
    const T = this.time;
    const core = this.core;
    if (this.phase === 'warmup' && T >= this.phaseEnd) { this.startRound(); return; }
    if (this.phase === 'buy' && T >= this.phaseEnd) {
      this.phase = 'live'; this.phaseEnd = T + (this.knifeRound ? 60 : this.opts.roundTime || (this.mode === 'duel' ? DUEL.roundTime : ROUND.roundTime));
      this.broadcast({ type: 'phase', phase: 'live' });
    }
    // ramassage du noyau
    if (core.status === 'dropped') {
      for (const p of this.players.values()) {
        if (p.alive && this.side(p) === 'atk' && Math.hypot(p.pos[0] - core.pos[0], p.pos[2] - core.pos[2]) < 1.6 && Math.abs(p.pos[1] - core.pos[1]) < 2) {
          core.status = 'carried'; core.carrier = p.id; core.pos = null;
          this.send(p, { type: 'notice', text: 'NOYAU RÉCUPÉRÉ' });
          break;
        }
      }
    }
    // pose / désamorçage
    for (const p of this.players.values()) {
      if (!p.alive || !p.interact) { p.prog = 0; p.progKind = null; continue; }
      const side = this.side(p);
      const cell = this.map.cellAt(p.pos[0], p.pos[2]);
      if (side === 'atk' && this.phase === 'live' && core.carrier === p.id && (cell === 'A' || cell === 'B')) {
        p.progKind = 'plant'; p.prog += dt;
        if (p.prog >= ROUND.plantTime) {
          core.status = 'planted'; core.carrier = null; core.site = cell; core.plantedAt = T;
          core.pos = [p.pos[0], groundHeight(p.pos[0], p.pos[2], p.pos[1] + 0.3, this.map.boxes), p.pos[2]];
          this.phase = 'planted'; this.phaseEnd = T + ROUND.fuseTime;
          p.money = Math.min(ROUND.maxMoney, p.money + ROUND.plantMoney);
          p.ult = Math.min(this.ultCost(p), p.ult + 1); p.score += 100; p.plants++;
          p.interact = false; p.prog = 0;
          this.broadcast({ type: 'planted', site: cell, by: p.id });
        }
      } else if (side === 'def' && this.phase === 'planted' && Math.hypot(p.pos[0] - core.pos[0], p.pos[2] - core.pos[2]) < 2.3) {
        p.progKind = 'defuse'; p.prog += dt;
        if (p.prog >= (p.kit ? KIT.defuseTime : ROUND.defuseTime)) {
          core.status = 'defused'; p.ult = Math.min(this.ultCost(p), p.ult + 1); p.score += 100; p.defuses++;
          p.interact = false; p.prog = 0;
          this.broadcast({ type: 'defused', by: p.id });
          this.endRound('def', 'defuse');
        }
      } else { p.prog = 0; p.progKind = null; }
    }
    // conditions de victoire
    let atkN = 0, defN = 0, atkA = 0, defA = 0;
    for (const p of this.players.values()) {
      if (p.joinedMidRound) continue;
      if (this.side(p) === 'atk') { atkN++; if (p.alive) atkA++; } else { defN++; if (p.alive) defA++; }
    }
    if (this.phase === 'live') {
      if (atkN && !atkA) this.endRound('def', 'elim');
      else if (defN && !defA) this.endRound('atk', 'elim');
      else if (T >= this.phaseEnd) {
        if (this.mode === 'duel') {
          // temps écoulé en duel : avantage au camp qui a le plus de PV
          const hp = { atk: 0, def: 0 };
          for (const p of this.players.values()) if (p.alive) hp[this.side(p)] += p.hp + p.armor;
          this.endRound(hp.atk === hp.def ? null : hp.atk > hp.def ? 'atk' : 'def', hp.atk === hp.def ? 'draw' : 'hp');
        } else this.endRound('def', 'time');
      }
    } else if (this.phase === 'planted') {
      if (defN && !defA) this.endRound('atk', 'elim');
      else if (T >= this.phaseEnd) {
        core.status = 'exploded';
        this.broadcast({ type: 'explode', p: core.pos });
        for (const q of this.players.values()) {
          if (q.alive && Math.hypot(q.pos[0] - core.pos[0], q.pos[2] - core.pos[2]) < ROUND.explosionRadius) this.damage(q, 999, null, 'core', false, true);
        }
        this.endRound('atk', 'explode');
      }
    } else if (this.phase === 'end' && T >= this.phaseEnd) {
      if (this.pendingOver) this.matchOver(this.pendingOver);
      else this.startRound();
    } else if (this.phase === 'sidechoice') {
      // équipe de bots seulement : choix au hasard ; sinon, sans réponse, on garde les côtés actuels
      const humans = [...this.players.values()].some(p => p.team === this.knifeWinner && !p.isBot);
      if (!humans && T > this.phaseEnd - 9) this.applySideChoice(Math.random() < 0.5 ? 'atk' : 'def');
      else if (T >= this.phaseEnd) this.applySideChoice(null);
    }
  }

  // ---------- anti-wallhack : le serveur ne révèle que ce que le joueur peut voir ou entendre ----------
  losFrom(viewer, q, T) {
    const e = this.eye(viewer);
    const v = viewer.snapVel || [0, 0];
    // 1.34 : anticipation plus longue (latence + affichage différé) et regard depuis les deux côtés de la tête
    const eyes = [e, [e[0] + v[0] * 0.25, e[1], e[2] + v[1] * 0.25], [e[0] + v[0] * 0.12, e[1], e[2] + v[1] * 0.12]];
    const h = q.crouch ? PLAYER.hCrouch : PLAYER.h;
    const qv = q.snapVel || [0, 0];
    const dx = q.pos[0] - e[0], dz = q.pos[2] - e[2];
    const dist = Math.hypot(dx, dz);
    if (q.invisEnd > T) return dist < 4;
    if (dist < 5) return true;
    if (dist > 220) return false; // 1.34 : avant 95 m, les grandes cartes (≈ 130 m) avaient des ennemis invisibles au loin
    const px = -dz / dist * 0.55, pz = dx / dist * 0.55; // décalage latéral (épaules)
    const pts = [
      [q.pos[0], q.pos[1] + h - 0.15, q.pos[2]], [q.pos[0], q.pos[1] + h * 0.55, q.pos[2]], [q.pos[0], q.pos[1] + 0.3, q.pos[2]],
      [q.pos[0] + px, q.pos[1] + h * 0.6, q.pos[2] + pz], [q.pos[0] - px, q.pos[1] + h * 0.6, q.pos[2] - pz],
      [q.pos[0] + qv[0] * 0.2, q.pos[1] + h * 0.6, q.pos[2] + qv[1] * 0.2],
      // 1.34 : côtés de la tête et position anticipée de la tête (un ennemi qui sort d'un angle apparaît à temps)
      [q.pos[0] + px * 0.5, q.pos[1] + h - 0.12, q.pos[2] + pz * 0.5], [q.pos[0] - px * 0.5, q.pos[1] + h - 0.12, q.pos[2] - pz * 0.5],
      [q.pos[0] + qv[0] * 0.3, q.pos[1] + h - 0.15, q.pos[2] + qv[1] * 0.3],
    ];
    const boxes = this.allBoxes();
    for (const o of eyes) for (const t of pts) {
      const dir = [t[0] - o[0], t[1] - o[1], t[2] - o[2]];
      const len = Math.hypot(...dir);
      if (len < 0.01) return true;
      const nd = [dir[0] / len, dir[1] / len, dir[2] / len];
      if (raycastBoxes(o, nd, len, boxes).t < len - 0.25) continue;
      let smoked = false;
      for (const sm of this.smokes) if (raySphere(o, nd, sm.pos, sm.r * 0.9) < len) { smoked = true; break; }
      if (!smoked) return true;
    }
    return false;
  }

  // spectateur (1.43) : un joueur mort suit ses coéquipiers en vie ; s'il n'en reste aucun (ou en chacun pour soi),
  // il peut suivre n'importe quel joueur en vie et voit alors ce que ce joueur voit
  specAllies(r) { return [...this.players.values()].filter(a => a.alive && a !== r && !this.isEnemy(r, a)); }
  setSpec(p, id) {
    const q = typeof id === 'string' ? this.players.get(id) : null;
    if (p.alive || !q || !q.alive || q === p) { p.specId = null; return; }
    if (this.isEnemy(p, q) && this.specAllies(p).length) return; // des coéquipiers sont encore en vie : seulement eux
    p.specId = q.id;
  }
  visibility(r, q, T) {
    if (q.inBus) return 'hidden';
    if (q.revealEnd > T) return 'full';
    let viewers = r.alive ? [r] : this.specAllies(r);
    if (!r.alive && !viewers.length && r.specId) { const sp = this.players.get(r.specId); if (sp?.alive) viewers = [sp]; }
    r.visUntil = r.visUntil || new Map();
    if (viewers.some(v => this.losFrom(v, q, T))) { r.visUntil.set(q.id, T + 1.0); return 'full'; } // 1.34 : 1 s de marge (avant 0,5)
    if ((r.visUntil.get(q.id) || 0) > T) return 'full';
    // bruit de pas : un ennemi qui court à moins de 26 m s'entend (comme dans le jeu)
    const sp = q.snapVel ? Math.hypot(q.snapVel[0], q.snapVel[1]) : 0;
    if (sp > 4.3 && viewers.some(v => Math.hypot(q.pos[0] - v.pos[0], q.pos[2] - v.pos[2]) < 26)) return 'audio';
    return 'hidden';
  }

  // temps restant des effets en cours (affiché sous les capacités)
  buffTimers(p, T) {
    const o = {};
    if (p.buffEnd > T) o[p.invisEnd > T && p.buffSpeed < 1.2 ? 'ph' : 'od'] = r2(p.buffEnd - T);
    if (p.hasteEnd > T) o.hs = r2(p.hasteEnd - T);
    if (p.invisEnd > T && !(p.buffEnd > T)) o.iv = r2(p.invisEnd - T);
    if (p.slowEnd > T + 0.05) o.sl = 1;
    if (p.healEnd > T) o.hl = r2(p.healEnd - T);
    if (p.protEnd > T) o.pr = r2(p.protEnd - T);
    if (p.revealEnd > T) o.rv = r2(p.revealEnd - T);
    return o;
  }

  sendSnapshots() {
    const T = this.time;
    // vitesse sur ~0,1 s (bruit de pas) : indépendante de la fréquence des snapshots
    for (const p of this.players.values()) {
      if (p.snapT == null || T - p.snapT >= 0.099) {
        const prev = p.snapPos || p.pos, dtS = p.snapT == null ? 1 : Math.max(0.033, T - p.snapT);
        p.snapVel = [(p.pos[0] - prev[0]) / dtS, (p.pos[2] - prev[2]) / dtS];
        p.snapPos = p.pos.slice(); p.snapT = T;
      }
    }
    // 1.28 : les statistiques (tableau des scores) ne partent que 2 fois par seconde ou juste après une élimination
    const full = this.tickCount % STATS_EVERY === 0 || this.statsDirty;
    this.statsDirty = false;
    const stats = q => ({ gl: q.gun, lv: q.lives, st: q.streak, k: q.kills, d: q.deaths, a: q.assists, sc: q.score, pg: q.ping || 0, dm: Math.round(q.dmg), ac: q.shots ? Math.round(q.hits / q.shots * 100) : null, hs: q.kills ? Math.round(q.hsKills / q.kills * 100) : null });
    const pub = new Map(), priv = new Map();
    for (const p of this.players.values()) {
      const w = p.weapons[p.slot];
      const base = {
        i: p.id, p: p.pos.map(r2), y: r3(p.yaw), pt: r3(p.pitch), c: p.crouch ? 1 : 0, al: p.alive ? 1 : 0,
        w: w ? w.id : 'knife', iv: p.invisEnd > T ? 1 : 0, rv: p.revealEnd > T ? 1 : 0,
        pl: p.prog > 0 ? 1 : 0, ...(full ? stats(p) : {}),
      };
      if (p.protEnd > T) base.sp = 1;
      if (p.downed) base.dn = 1;
      if (p.sliding && p.alive && (p.slideUntil || 0) > T) base.sd = 1;
      pub.set(p.id, JSON.stringify(base));
      // santé, argent et porteur du Noyau : réservés aux alliés
      priv.set(p.id, JSON.stringify({ ...base, hp: Math.ceil(p.hp), ar: Math.ceil(p.armor), pw: p.weapons[1]?.id || p.weapons[2]?.id || null, cr: this.core.carrier === p.id ? 1 : 0, $: p.money, rd: p.ready ? 1 : 0 }));
    }
    const common = {
      t: Date.now(), ph: this.phase, tm: Math.max(0, r2(this.phaseEnd - T)), rd: this.round, hf: this.half, sc: this.score,
      proj: this.projectiles.map(p => ({ i: p.id, k: p.kind, p: p.pos.map(r2), ...(p.kind === 'knife' ? { s: p.stopped ? 1 : 0, o: p.owner, d: p.dir.map(r2) } : {}) })),
      smokes: this.smokes.map(s => ({ i: s.id, p: s.pos.map(r2), r: s.r, u: r2(s.end - T) })),
      fires: this.fires.map(f => ({ i: f.id, p: f.pos.map(r2), r: f.r, k: f.kind, u: r2(f.end - T) })),
      walls: this.walls.map(w => ({ i: w.wallId, min: w.min.map(r2), max: w.max.map(r2), hp: w.hp })),
      drops: this.drops.map(d => ({ i: d.id, w: d.w.id, p: d.pos.map(r2), ...(d.w.rar ? { r: d.w.rar } : {}) })),
      ...(this.bus && !this.bus.done ? { bus: { a: this.bus.a.map(r2), b: this.bus.b.map(r2), p: this.busPos().map(r2), go: r2(this.bus.t0 - T), left: r2(this.bus.t0 + this.bus.dur - T) } } : {}),
      ...(this.zone ? { zone: { c: this.zone.c.map(r2), r: r2(this.zone.r), nc: this.zone.nc.map(r2), nr: r2(this.zone.nr), st: this.zone.stage, sh: this.zone.shrinking ? 1 : 0, t: r2(Math.max(0, this.zone.until - T)) }, cho: this.chests.filter(c => c.open).map(c => c.id), dsp: this.dispensers.map(d => Math.max(0, Math.ceil(d.readyAt - T))), alive: [...this.players.values()].filter(p => !p.out).length } : {}),
    };
    const commonStr = JSON.stringify(common).slice(1);
    const meCache = new Map();
    const specTargets = new Set(this.spectators?.size ? [...this.spectators.values()].map(x => x.target) : []);
    for (const p of this.players.values()) {
      if (p.isBot && !specTargets.has(p.id)) continue;
      const list = [];
      if (!p.isBot) for (const q of this.players.values()) {
        if (q === p || !this.isEnemy(p, q)) { list.push(priv.get(q.id)); continue; }
        if (!q.alive) { list.push(pub.get(q.id)); continue; }
        const vis = this.visibility(p, q, T);
        if (vis === 'full') list.push(pub.get(q.id));
        else if (vis === 'audio') list.push(JSON.stringify({ i: q.id, p: q.pos.map(r2), au: 1, al: 1, ...(full ? stats(q) : {}) }));
        else list.push(JSON.stringify({ i: q.id, h: 1, al: 1, ...(full ? stats(q) : {}) }));
      }
      // le Noyau porté n'est montré qu'aux attaquants ; posé ou au sol, il est visible par tous
      const side = this.side(p);
      const c = this.core;
      const core = { s: c.status, p: c.pos ? c.pos.map(r2) : null, c: side === 'atk' || isFfa(this.mode) ? c.carrier : null, site: c.site, f: c.status === 'planted' ? r2(this.phaseEnd - T) : 0 };
      const wp = {};
      for (const s of [1, 2, 3]) { const w = p.weapons[s]; wp[s] = w ? (w.rar ? [w.id, w.mag, w.reserve, w.rar] : [w.id, w.mag, w.reserve]) : null; }
      const me = {
        hp: Math.ceil(p.hp), ar: Math.ceil(p.armor), $: p.money, sl: p.slot, wp, al: p.alive ? 1 : 0,
        rl: p.reloadEnd > T ? r2(p.reloadEnd - T) : 0, ko: p.knifeOut ? 1 : 0, ab: p.charges, ult: p.ult, side,
        pr: p.prog > 0 ? [p.progKind, r2(p.prog / (p.progKind === 'revive' ? BR.down.reviveTime : p.progKind === 'plant' ? ROUND.plantTime : (p.kit ? KIT.defuseTime : ROUND.defuseTime)))] : null, kt: p.kit ? 1 : 0,
        sm: p.speedMul, rm: p.rateMul, rs: p.respawnAt ? r2(Math.max(0, p.respawnAt - T)) : 0,
        rc: { q: p.recharge.q ? r2(p.recharge.q - T) : 0, e: p.recharge.e ? r2(p.recharge.e - T) : 0 },
        iv: p.invisEnd > T ? 1 : 0, bf: p.buffEnd > T ? 1 : 0, bt: this.buffTimers(p, T), ...(p.downed ? { dn: 1 } : {}),
        ...(p.bag ? { bg: p.bag.map(w => [w.id, w.mag, w.reserve, w.rar || 'common']) } : {}), ...(p.pots ? { po: [p.pots.heal, p.pots.shield, p.pots.bandage || 0, p.pots.mini || 0, p.pots.nade || 0], dk: p.drinkEnd > T ? r2(p.drinkEnd - T) : 0 } : {}), ...(p.chuteEnd > T ? { ch: 1 } : {}), ...(p.inBus ? { ib: 1 } : {}),
      };
      const meStr = JSON.stringify(me);
      meCache.set(p.id, { meStr, core: JSON.stringify(core) });
      if (!p.isBot) {
        const snapStr = '{"type":"snap","me":' + meStr + ',"players":[' + list.join(',') + '],"core":' + JSON.stringify(core) + ',' + commonStr;
        this.io.sendRaw(p.id, snapStr);
        if (this.friendSpecs?.size && this.friendWatched(p.id)) this.queueDelayed(p.id, snapStr);
      }
    }
    // staff spectateur : vue du joueur observé, avec TOUS les joueurs (pour juger un éventuel « wallhack »)
    if (this.spectators?.size) {
      const all = [...this.players.values()].map(q => priv.get(q.id)).join(',');
      for (const [id, sp] of this.spectators) {
        const c = meCache.get(sp.target);
        if (c) this.io.sendRaw(id, '{"type":"snap","spec":1,"me":' + c.meStr + ',"players":[' + all + '],"core":' + c.core + ',' + commonStr);
      }
      if (this.tickCount % 30 === 0) for (const id of this.spectators.keys()) this.sendSpecInfo(id);
    }
  }
}
