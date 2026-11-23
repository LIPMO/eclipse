// Logique de partie autoritaire côté serveur
import { WEAPONS, AGENTS, ROUND, FFA, DUEL, PLAYER, MOVE, TICK_RATE, ARMOR, REWARDS, sideOf, AGENT_ORDER, isFfa, GUN_LADDER } from '../shared/data.js';
import { parseMap, CELL } from '../shared/maps.js';
import { raycastBoxes, rayAABB, raySphere, hitboxes, norm, groundHeight, depenetrate } from '../shared/physics.js';
import { BotBrain } from './bot.js';
import { WEAPON_UNLOCK } from '../shared/progress.js';
// retard de la retransmission pour les amis spectateurs (ms)
export const FRIEND_DELAY = 10000;

const r2 = v => Math.round(v * 100) / 100;
const r3 = v => Math.round(v * 1000) / 1000;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const finite = v => typeof v === 'number' && Number.isFinite(v);

export class Match {
  constructor(room, io) {
    this.room = room;
    this.io = io; // { send(id,obj), sendRaw(id,str), onEnd() }
    this.map = parseMap(room.mapId);
    this.mode = room.mode; // 'assault' | 'duel' | 'ffa' | 'gungame'
    this.target = room.target;
    this.difficulty = room.difficulty;
    this.time = 0;
    this.tickCount = 0;
    this.players = new Map();
    this.phase = 'warmup';
    this.phaseEnd = 0;
    this.round = 0;
    this.half = 0;
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
    this.opts = { infAmmo: !!o.infAmmo, noAbilities: !!o.noAbilities, headOnly: !!o.headOnly, lowGrav: !!o.lowGrav };
    this.firstBlood = false; this.roundHistory = []; this.leaderId = null; this.emoteT = new Map();
  }

  // ---------- Gestion des joueurs ----------
  makePlayer(m) {
    const agent = AGENTS[m.agent] ? m.agent : AGENT_ORDER[0];
    const p = {
      id: m.id, name: m.name, isBot: !!m.isBot, team: m.team, agent, skins: m.skins || {},
      pos: [0, 0, 0], yaw: 0, pitch: 0, crouch: false, alive: false,
      hp: 100, armor: 0, money: ROUND.startMoney,
      weapons: { 1: null, 2: this.newWeapon('spark'), 3: { id: 'knife' } }, slot: 2,
      lastShot: -10, reloadEnd: 0, charges: {}, recharge: {}, ult: 0,
      kills: 0, deaths: 0, assists: 0, score: 0, damagedBy: new Map(),
      healEnd: 0, healRate: 0, buffEnd: 0, buffSpeed: 1, hasteEnd: 0, slowEnd: 0, speedPeak: 1, speedPeakEnd: 0, speedMul: 1, rateMul: 1, invisEnd: 0, revealEnd: 0, blindEnd: 0,
      interact: false, prog: 0, progKind: null, interactPos: null,
      respawnAt: 0, diedAt: 0, roundsWon: 0, account: m.account || null, lastDamagedBy: null, lastDamagedAt: -10, joinedMidRound: false,
      level: m.isBot ? 999 : (m.level || 1), title: m.title || null, clan: m.clan || null, gun: 0,
      streak: 0, bestStreak: 0, lives: this.mode === 'lives' ? (this.target || 3) : 0, out: false, weaponKills: {}, roundDmg: 0,
      // statistiques détaillées (progression, quêtes, anti-triche)
      dmg: 0, hsKills: 0, knifeKills: 0, shots: 0, hits: 0, plants: 0, defuses: 0, aces: 0, multi3: 0, abilities: 0, ults: 0, roundKills: 0,
    };
    this.refillCharges(p);
    if (p.isBot) p.brain = new BotBrain(this, p, this.difficulty);
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
      players: [...this.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, agent: p.agent, bot: p.isBot, skins: p.skins, title: p.title, clan: p.clan || null, level: p.isBot ? null : p.level })),
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
    if ('clan' in m) p.clan = m.clan || null;
    this.broadcast(this.rosterMsg());
  }

  startMsg(id) {
    const p = this.players.get(id);
    return { type: 'matchStart', you: id, mapId: this.map.id, mode: this.mode, target: this.target, players: this.rosterMsg().players, level: p?.level || 1, unlocks: this.unlocksOn(), opts: this.opts, diff: this.difficulty };
  }

  // déblocage des armes par niveau (désactivable dans l'administration)
  // en Mêlée, tout le monde a l'équipement complet ; les bots suivent le niveau du joueur humain le plus bas (combat équitable)
  unlocksOn() { return !isFfa(this.mode) && (this.io.weaponUnlocks ? !!this.io.weaponUnlocks() : false); }
  humanMinLevel() { let l = Infinity; for (const q of this.players.values()) if (!q.isBot) l = Math.min(l, q.level || 1); return l === Infinity ? 999 : l; }
  weaponLocked(p, id) { return this.unlocksOn() && (WEAPON_UNLOCK[id] || 1) > (p.isBot ? this.humanMinLevel() : p.level); }

  start(members) {
    for (const m of members) this.players.set(m.id, this.makePlayer(m));
    this.io.onEvent?.('start', { players: [...this.players.values()].map(p => ({ agent: p.agent, isBot: p.isBot })) });
    for (const p of this.players.values()) if (!p.isBot) this.io.send(p.id, this.startMsg(p.id));
    if (isFfa(this.mode)) {
      for (const p of this.players.values()) this.spawnFFA(p);
      this.phase = 'live';
      this.phaseEnd = this.time + (this.mode === 'gungame' ? FFA.gunTimeLimit : FFA.timeLimit);
    } else {
      this.phase = 'warmup';
      this.phaseEnd = this.time + 2;
    }
  }

  side(p) { return sideOf(p.team, this.half); }
  isEnemy(a, b) { return a.id !== b.id && (isFfa(this.mode) || a.team !== b.team); }
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
    this.send(p, { type: 'teleport', p: p.pos, y: yaw });
  }

  // ---------- Manches ----------
  startRound() {
    this.round++;
    this.phase = 'buy';
    this.phaseEnd = this.time + (this.mode === 'duel' ? DUEL.buyTime : ROUND.buyTime);
    this.projectiles = []; this.smokes = []; this.fires = []; this.walls = []; this.wallBoxesCache = null; this.drops = []; this.readyDone = false;
    this.core = { status: 'carried', carrier: null, pos: null, site: null, plantedAt: 0 };
    this.botSite = Math.random() < 0.5 ? 'A' : 'B';
    const spawnSets = { atk: shuffle(this.map.spawns.atk.slice()), def: shuffle(this.map.spawns.def.slice()) };
    const idx = { atk: 0, def: 0 };
    const reset = this.resetEconomy;
    this.resetEconomy = false;
    const [mw, mh] = this.map.size;
    for (const p of this.players.values()) {
      const side = this.side(p);
      if (reset) { p.money = ROUND.startMoney; }
      if (this.mode === 'duel') p.money = DUEL.money;
      if (reset || !p.alive) {
        p.weapons = { 1: null, 2: this.newWeapon('spark'), 3: { id: 'knife' } };
        p.armor = 0;
      } else {
        for (const s of [1, 2]) if (p.weapons[s]) { const d = WEAPONS[p.weapons[s].id]; p.weapons[s].mag = d.mag; p.weapons[s].reserve = d.reserve; }
      }
      p.alive = true; p.hp = 100; p.slot = p.weapons[1] ? 1 : 2; p.reloadEnd = 0;
      p.healEnd = 0; p.buffEnd = 0; p.buffSpeed = 1; p.hasteEnd = 0; p.slowEnd = 0; p.speedMul = 1; p.rateMul = 1; p.invisEnd = 0; p.revealEnd = 0; p.blindEnd = 0;
      p.interact = false; p.prog = 0; p.damagedBy = new Map(); p.joinedMidRound = false; p.roundKills = 0; p.roundDmg = 0; p.ready = false; p.armorBought = null;
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
    const atk = [...this.players.values()].filter(p => this.side(p) === 'atk');
    if (this.mode === 'duel') this.core.status = 'none';
    else if (atk.length) {
      const humans = atk.filter(p => !p.isBot);
      const pool = humans.length && Math.random() < 0.7 ? humans : atk;
      this.core.carrier = pool[(Math.random() * pool.length) | 0].id;
    } else this.core.status = 'none';
    this.broadcast({ type: 'roundStart', round: this.round, half: this.half, score: this.score });
  }

  endRound(winSide, reason) {
    if (this.phase === 'end' || this.phase === 'over') return;
    const winTeam = winSide ? this.teamOfSide(winSide) : null;
    if (winTeam) this.score[winTeam]++;
    for (const p of this.players.values()) {
      const won = p.team === winTeam;
      if (won) p.roundsWon++;
      p.money = Math.min(ROUND.maxMoney, p.money + (won ? ROUND.winMoney : ROUND.lossMoney));
      p.ult = Math.min(this.ultCost(p), p.ult + 1);
      p.interact = false; p.prog = 0;
    }
    this.phase = 'end';
    this.phaseEnd = this.time + ROUND.endTime;
    for (const p of this.players.values()) if (p.alive) this.sendDmgReport(p);
    this.roundHistory.push(winTeam || '');
    let mvp = null;
    for (const p of this.players.values()) if (p.roundKills > 0 || p.roundDmg > 0) if (!mvp || p.roundKills > mvp.roundKills || (p.roundKills === mvp.roundKills && p.roundDmg > mvp.roundDmg)) mvp = p;
    this.broadcast({ type: 'roundEnd', winner: winTeam, side: winSide, reason, score: this.score, history: this.roundHistory, mvp: mvp ? { id: mvp.id, name: mvp.name, kills: mvp.roundKills, dmg: Math.round(mvp.roundDmg) } : null });
    if (winTeam && this.score[winTeam] >= this.target) this.pendingOver = winTeam;
    else if (this.half === 0 && this.round === this.target - 1) {
      this.half = 1; this.resetEconomy = true;
      this.broadcast({ type: 'notice', text: 'CHANGEMENT DE CÔTÉ' });
    }
  }

  teamOfSide(side) { return sideOf('alpha', this.half) === side ? 'alpha' : 'beta'; }
  ultCost(p) { return AGENTS[p.agent].abilities.x.cost; }

  matchOver(winner) {
    this.phase = 'over';
    setTimeout(() => this.io.onOver?.(), 0);
    this.overAt = this.time + 9;
    // MVP : meilleur score de la partie
    let mvp = null;
    for (const p of this.players.values()) if (!mvp || p.score > mvp.score) mvp = p;
    const stats = [...this.players.values()].map(p => ({ id: p.id, name: p.name, team: p.team, agent: p.agent, kills: p.kills, deaths: p.deaths, assists: p.assists, score: p.score, bot: p.isBot, dmg: Math.round(p.dmg), hs: p.hsKills, title: p.title, shots: p.shots, hits: p.hits, best: p.bestStreak, fav: Object.entries(p.weaponKills || {}).sort((x, y) => y[1] - x[1])[0]?.[0] || null, lives: this.mode === 'lives' ? p.lives : undefined }));
    const rewards = {}, results = [];
    const scoreLine = isFfa(this.mode) ? '' : `${this.score.alpha}-${this.score.beta}`;
    for (const p of this.players.values()) {
      if (p.isBot) continue;
      const won = isFfa(this.mode) ? winner === p.id : winner === p.team;
      rewards[p.id] = Math.round((REWARDS.matchPlayed + p.kills * REWARDS.kill + p.roundsWon * REWARDS.roundWin + (won ? REWARDS.matchWin : 0)) * (this.io.rewardMul ? this.io.rewardMul() : 1));
      results.push({
        id: p.id, account: p.account, name: p.name, team: p.team, reward: rewards[p.id], won, kills: p.kills, deaths: p.deaths, assists: p.assists, score: p.score,
        mode: this.mode, mapId: this.map.id, agent: p.agent, dmg: p.dmg, hsKills: p.hsKills, knifeKills: p.knifeKills, shots: p.shots, hits: p.hits,
        plants: p.plants, defuses: p.defuses, aces: p.aces, multi3: p.multi3, abilities: p.abilities, ults: p.ults, roundsWon: p.roundsWon,
        mvp: mvp === p, duration: this.time, weaponKills: p.weaponKills, bestStreak: p.bestStreak, others: [...this.players.values()].filter(q => q !== p && !q.isBot && q.account).map(q => q.account), scoreLine: p.team === 'beta' ? scoreLine.split('-').reverse().join('-') : scoreLine,
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
    p.alive = true; p.hp = 100; p.armor = 50; p.money = 9000; p.reloadEnd = 0;
    if (this.mode === 'gungame') { this.gunLoadout(p); p.armor = 0; } // pas d'armure : le couteau final reste jouable
    else {
      const prim = p.weapons?.[1]?.id || 'lancer';
      p.weapons = { 1: prim ? this.newWeapon(prim) : null, 2: this.newWeapon(p.weapons?.[2]?.id || 'spark'), 3: { id: 'knife' } };
      p.slot = p.weapons[1] ? 1 : 2;
    }
    p.reloadEnd = 0; p.damagedBy = new Map(); p.invisEnd = 0; p.buffEnd = 0; p.buffSpeed = 1; p.hasteEnd = 0; p.slowEnd = 0; p.speedMul = 1; p.rateMul = 1; p.blindEnd = 0;
    p.protEnd = this.time + 1.5; // protection de réapparition : annulée dès que le joueur tire ou utilise une capacité
    const [mw, mh] = this.map.size;
    this.teleport(p, best, Math.atan2(-(mw / 2 - best[0]), -(mh / 2 - best[2])));
    if (p.brain) p.brain.onRoundStart();
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
    switch (msg.type) {
      case 'input': return this.handleInput(p, msg);
      case 'shoot': return this.handleShoot(p, msg);
      case 'reload': return this.handleReload(p);
      case 'buy': return this.handleBuy(p, msg.item);
      case 'sell': return this.handleSell(p, msg);
      case 'drop': return this.handleDrop(p);
      case 'ready': return this.handleReady(p);
      case 'ability': return this.handleAbility(p, msg);
      case 'interact': p.interact = !!msg.on; if (p.interact) p.interactPos = p.pos.slice(); return;
      case 'mark': return this.handleMark(p, msg);
      case 'emote': return this.handleEmote(p, msg);
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
    if (!p.alive || !Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(finite)) return;
    const [mw, mh] = this.map.size;
    const T = this.time;
    const np = [Math.max(0, Math.min(mw, m.p[0])), Math.max(-1, Math.min(8, m.p[1])), Math.max(0, Math.min(mh, m.p[2]))];
    if (p.tpGrace > T && Math.hypot(np[0] - p.tpPos[0], np[2] - p.tpPos[2]) > 3) { this.applyLook(p, m); return; }
    p.tpGrace = 0;
    // anti-speedhack / téléportation / vol : la distance parcourue doit être physiquement possible
    if (p.moveBonusEnd && T > p.moveBonusEnd) { p.moveBonus = 0; p.moveBonusEnd = 0; }
    const last = p.lastValid || { pos: p.pos, t: T };
    const elapsed = Math.min(2, T - last.t) + 0.35; // marge pour la gigue réseau
    const maxSpeed = MOVE.run * 1.3 * Math.max(1, p.speedMul, p.speedPeakEnd > T ? p.speedPeak : 1) + 0.5;
    const base = maxSpeed * elapsed + 1;
    const d = Math.hypot(np[0] - last.pos[0], np[2] - last.pos[2]);
    const flying = np[1] > (this.opts.lowGrav ? 9 : 4.8); // plus haut que caisse haute + saut
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
    p.lastValid = { pos: np.slice(), t: T };
    p.pos = np;
    this.applyLook(p, m);
  }

  applyLook(p, m) {
    if (finite(m.y)) p.yaw = m.y;
    if (finite(m.pt)) p.pitch = Math.max(-1.55, Math.min(1.55, m.pt));
    p.crouch = !!m.c;
    if ([1, 2, 3].includes(m.s) && p.weapons[m.s] && m.s !== p.slot) { p.slot = m.s; p.reloadEnd = 0; }
    if (p.interact && p.interactPos && Math.hypot(p.pos[0] - p.interactPos[0], p.pos[2] - p.interactPos[2]) > 0.6) { p.prog = 0; p.interactPos = p.pos.slice(); }
  }

  handleReload(p) {
    const w = p.weapons[p.slot];
    if (!p.alive || !w || !WEAPONS[w.id].mag || p.reloadEnd > this.time) return;
    if (w.mag >= WEAPONS[w.id].mag || w.reserve <= 0) return;
    p.reloadEnd = this.time + WEAPONS[w.id].reload;
  }

  handleBuy(p, item) {
    if (!p.alive || this.mode === 'gungame') return;
    const ffa = isFfa(this.mode);
    if (!ffa && this.phase !== 'buy') return;
    if (WEAPONS[item] && item !== 'knife') {
      const d = WEAPONS[item];
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
  dropsOn() { return !isFfa(this.mode); }
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
    if (this.drops.length > 24) this.drops.shift();
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
        if (!slot || p.weapons[slot] || (d.from === p.id && T < d.noPick)) continue;
        if (Math.hypot(p.pos[0] - d.pos[0], p.pos[2] - d.pos[2]) > 1.4 || Math.abs(p.pos[1] - d.pos[1]) > 1.8) continue;
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
      if (dealt || recv) rows.push({ i: q.id, n: q.name, dealt, recv, dead: !q.alive });
    }
    if (rows.length) this.send(p, { type: 'dmgReport', rows: rows.sort((a, b) => b.dealt + b.recv - a.dealt - a.recv).slice(0, 8) });
  }

  handleShoot(p, msg) {
    if (!p.alive || this.phase === 'buy' || this.phase === 'over' || this.phase === 'warmup') return;
    const w = p.weapons[p.slot];
    if (!w) return;
    const d = WEAPONS[w.id];
    const interval = 1 / (d.rate * p.rateMul);
    if (this.time - p.lastShot < interval * 0.7) return;
    if (d.type !== 'melee') {
      if (p.reloadEnd > this.time || w.mag <= 0) return;
      if (!this.opts.infAmmo) w.mag--;
    }
    p.lastShot = this.time; p.protEnd = 0;
    if (d.type !== 'melee') p.shots++;
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
      let bestT = wr.t, target = null, zone = null;
      for (const q of this.players.values()) {
        if (!q.alive || !this.isEnemy(p, q)) continue;
        if (Math.hypot(q.pos[0] - origin[0], q.pos[2] - origin[2]) > bestT + 2) continue;
        for (const hb of hitboxes(q.pos, q.crouch)) {
          const t = rayAABB(origin, dir, hb.min, hb.max);
          if (t < bestT) { bestT = t; target = q; zone = hb.zone; }
        }
      }
      if (target && this.opts.headOnly && zone !== 'head' && d.type !== 'melee') target = null; // têtes uniquement
      if (target) {
        let dmg = d.damage * (zone === 'head' ? d.headMul : zone === 'legs' ? d.legMul : 1);
        if (d.falloff && bestT > d.falloff[0]) dmg *= d.falloff[1];
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
    for (const [q, acc] of dmgAcc) this.damage(q, acc.dmg, p, w.id, acc.head);
    this.broadcast({ type: 'shot', i: p.id, w: w.id, o: origin.map(r2), e: ends.slice(0, 4) });
    (p.shotLog ||= []).push([r2(this.time), w.id, ends[0]]);
    while (p.shotLog.length && this.time - p.shotLog[0][0] > 3.5) p.shotLog.shift();
    if (p.shotLog.length > 40) p.shotLog.shift();
  }

  damage(q, amount, attacker, wpn, head, silent = false) {
    if (!q.alive || amount <= 0) return;
    if (attacker && attacker !== q && q.protEnd > this.time) return; // protection de réapparition
    if (attacker && attacker !== q) {
      q.damagedBy.set(attacker.id, (q.damagedBy.get(attacker.id) || 0) + Math.min(amount, Math.max(0, q.hp) + Math.max(0, q.armor)));
      q.lastDamagedBy = attacker.id; q.lastDamagedAt = this.time;
    }
    if (attacker && attacker !== q && this.isEnemy(attacker, q)) { const real = Math.min(amount, q.hp + q.armor); attacker.dmg += real; attacker.roundDmg = (attacker.roundDmg || 0) + real; }
    let rest = amount;
    if (q.armor > 0) { const a = Math.min(q.armor, rest); q.armor -= a; rest -= a; }
    q.hp -= rest;
    const killed = q.hp <= 0;
    if (attacker && attacker !== q && !silent) this.send(attacker, { type: 'hit', d: Math.round(amount), h: head ? 1 : 0, k: killed ? 1 : 0 });
    if (!silent || killed) this.send(q, { type: 'hurt', d: Math.round(amount), from: attacker ? attacker.pos.map(r2) : null });
    if (killed) this.kill(q, attacker, wpn, head);
  }

  kill(v, a, wpn, head) {
    v.alive = false; v.hp = 0; v.deaths++; v.diedAt = this.time; v.interact = false; v.prog = 0;
    if (this.core.carrier === v.id) this.dropCore(v);
    // l'arme principale (sinon le pistolet acheté) tombe au sol et peut être ramassée
    if (this.dropsOn()) { const s = v.weapons[1] ? 1 : v.weapons[2] && v.weapons[2].id !== 'spark' ? 2 : 0; if (s) { this.spawnDrop(v, v.weapons[s], false); v.weapons[s] = s === 2 ? this.newWeapon('spark') : null; } }
    const vStreak = v.streak; v.streak = 0;
    if (a && a !== v) {
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
        if (a.roundKills === 5 && this.mode === 'assault') { a.aces++; this.broadcast({ type: 'notice', text: `AS ! ${a.name.toUpperCase()} A ÉLIMINÉ TOUTE L'ÉQUIPE` }); }
      }
      if (this.mode === 'assault') a.money = Math.min(ROUND.maxMoney, a.money + ROUND.killMoney);
      a.ult = Math.min(this.ultCost(a), a.ult + 1);
    }
    for (const [id] of v.damagedBy) {
      if (a && id === a.id) continue;
      const ass = this.players.get(id);
      if (ass) { ass.assists++; ass.score += 50; }
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
      v.respawnAt = this.time + FFA.respawn;
      if (this.mode === 'lives') return this.livesKill(v);
      if (this.mode === 'gungame') this.gunKill(v, a, wpn);
      else if (a && a !== v && a.kills >= this.target && this.phase !== 'over') this.matchOver(a.id);
    }
  }

  // Dernier debout : chaque joueur a quelques vies ; le dernier encore en jeu gagne
  livesKill(v) {
    v.lives = Math.max(0, v.lives - 1);
    if (v.lives <= 0) { v.out = true; v.respawnAt = 0; this.broadcast({ type: 'notice', text: `${v.name.toUpperCase()} EST ÉLIMINÉ DÉFINITIVEMENT` }); }
    const left = [...this.players.values()].filter(p => !p.out);
    if (left.length <= 1 && this.phase !== 'over') this.matchOver(left[0]?.id || null);
  }
  updateLeader() {
    let best = null, tie = false;
    for (const p of this.players.values()) { if (!best || p.kills > best.kills) { best = p; tie = false; } else if (p.kills === best.kills) tie = true; }
    const id = best && !tie && best.kills >= 3 ? best.id : null;
    if (id !== this.leaderId) { this.leaderId = id; this.broadcast({ type: 'leader', id }); }
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
    if (!(id >= 0 && id < 8)) return;
    const last = this.emoteT.get(p.id) || -9;
    if (this.time - last < 2) return;
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
    if (!p.alive || this.phase === 'over' || this.phase === 'warmup') return;
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

  deployProjectile(pr) {
    const T = this.time;
    const g = groundHeight(pr.pos[0], pr.pos[2], pr.pos[1] + 0.3, this.map.boxes);
    if (pr.kind === 'smoke') this.smokes.push({ id: this.nextId++, pos: [pr.pos[0], g + 1.8, pr.pos[2]], r: 4.5, end: T + 14 });
    else if (pr.kind === 'cryo') this.fires.push({ id: this.nextId++, pos: [pr.pos[0], g, pr.pos[2]], r: 4.2, end: T + 6, dps: 0, slow: true, owner: pr.owner, kind: 'frost' });
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
      if (p.buffEnd && T >= p.buffEnd) { p.buffEnd = 0; p.buffSpeed = 1; p.rateMul = 1; }
      // vitesse effective : bonus (ultime) × élan × ralentissement (givre)
      const sm = Math.round((p.buffEnd ? p.buffSpeed : 1) * (p.hasteEnd > T ? 1.35 : 1) * (p.slowEnd > T ? 0.6 : 1) * 100) / 100;
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
            if (pr.kind === 'flash') { pr.stopped = true; }
            else { pr.done = true; this.deployProjectile(pr); continue; }
          } else pr.pos = pr.pos.map((v, i) => v + step[i]);
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
    if (assault) this.tickAssault(dt);
    else if (this.phase === 'live' && T >= this.phaseEnd) {
      let best = null;
      for (const p of this.players.values()) if (!best || p.lives > best.lives || (p.lives === best.lives && (p.gun > best.gun || (p.gun === best.gun && p.kills > best.kills)))) best = p;
      this.matchOver(best ? best.id : null);
    }

    if (this.phase === 'over' && T >= this.overAt) { this.io.onEnd(); return; }
    if (this.tickCount % 2 === 0) this.sendSnapshots();
  }

  tickAssault(dt) {
    const T = this.time;
    const core = this.core;
    if (this.phase === 'warmup' && T >= this.phaseEnd) { this.startRound(); return; }
    if (this.phase === 'buy' && T >= this.phaseEnd) {
      this.phase = 'live'; this.phaseEnd = T + (this.mode === 'duel' ? DUEL.roundTime : ROUND.roundTime);
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
        if (p.prog >= ROUND.defuseTime) {
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
    }
  }

  // ---------- anti-wallhack : le serveur ne révèle que ce que le joueur peut voir ou entendre ----------
  losFrom(viewer, q, T) {
    const e = this.eye(viewer);
    const v = viewer.snapVel || [0, 0];
    const eyes = [e, [e[0] + v[0] * 0.15, e[1], e[2] + v[1] * 0.15]]; // anticipe un léger déplacement (pas d'apparition brutale au coin)
    const h = q.crouch ? PLAYER.hCrouch : PLAYER.h;
    const qv = q.snapVel || [0, 0];
    const dx = q.pos[0] - e[0], dz = q.pos[2] - e[2];
    const dist = Math.hypot(dx, dz);
    if (q.invisEnd > T) return dist < 4;
    if (dist < 5) return true;
    if (dist > 95) return false;
    const px = -dz / dist * 0.55, pz = dx / dist * 0.55; // décalage latéral (épaules)
    const pts = [
      [q.pos[0], q.pos[1] + h - 0.15, q.pos[2]], [q.pos[0], q.pos[1] + h * 0.55, q.pos[2]], [q.pos[0], q.pos[1] + 0.3, q.pos[2]],
      [q.pos[0] + px, q.pos[1] + h * 0.6, q.pos[2] + pz], [q.pos[0] - px, q.pos[1] + h * 0.6, q.pos[2] - pz],
      [q.pos[0] + qv[0] * 0.2, q.pos[1] + h * 0.6, q.pos[2] + qv[1] * 0.2],
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

  visibility(r, q, T) {
    if (q.revealEnd > T) return 'full';
    const viewers = r.alive ? [r] : [...this.players.values()].filter(a => a.alive && a !== r && !this.isEnemy(r, a));
    r.visUntil = r.visUntil || new Map();
    if (viewers.some(v => this.losFrom(v, q, T))) { r.visUntil.set(q.id, T + 0.5); return 'full'; }
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
    const dtS = 2 / TICK_RATE;
    for (const p of this.players.values()) {
      const prev = p.snapPos || p.pos;
      p.snapVel = [(p.pos[0] - prev[0]) / dtS, (p.pos[2] - prev[2]) / dtS];
      p.snapPos = p.pos.slice();
    }
    const pub = new Map(), priv = new Map();
    for (const p of this.players.values()) {
      const w = p.weapons[p.slot];
      const base = {
        i: p.id, p: p.pos.map(r2), y: r3(p.yaw), pt: r3(p.pitch), c: p.crouch ? 1 : 0, al: p.alive ? 1 : 0,
        w: w ? w.id : 'knife', iv: p.invisEnd > T ? 1 : 0, rv: p.revealEnd > T ? 1 : 0,
        pl: p.prog > 0 ? 1 : 0, gl: p.gun, lv: p.lives, st: p.streak, k: p.kills, d: p.deaths, a: p.assists, sc: p.score, pg: p.ping || 0, dm: Math.round(p.dmg),
      };
      if (p.protEnd > T) base.sp = 1;
      pub.set(p.id, JSON.stringify(base));
      // santé, argent et porteur du Noyau : réservés aux alliés
      priv.set(p.id, JSON.stringify({ ...base, hp: Math.ceil(p.hp), ar: Math.ceil(p.armor), pw: p.weapons[1]?.id || p.weapons[2]?.id || null, cr: this.core.carrier === p.id ? 1 : 0, $: p.money, rd: p.ready ? 1 : 0 }));
    }
    const common = {
      t: Date.now(), ph: this.phase, tm: Math.max(0, r2(this.phaseEnd - T)), rd: this.round, hf: this.half, sc: this.score,
      proj: this.projectiles.map(p => ({ i: p.id, k: p.kind, p: p.pos.map(r2) })),
      smokes: this.smokes.map(s => ({ i: s.id, p: s.pos.map(r2), r: s.r, u: r2(s.end - T) })),
      fires: this.fires.map(f => ({ i: f.id, p: f.pos.map(r2), r: f.r, k: f.kind, u: r2(f.end - T) })),
      walls: this.walls.map(w => ({ i: w.wallId, min: w.min.map(r2), max: w.max.map(r2), hp: w.hp })),
      drops: this.drops.map(d => ({ i: d.id, w: d.w.id, p: d.pos.map(r2) })),
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
        else if (vis === 'audio') list.push(JSON.stringify({ i: q.id, p: q.pos.map(r2), au: 1, al: 1, gl: q.gun, k: q.kills, d: q.deaths, a: q.assists, sc: q.score, pg: q.ping || 0, dm: Math.round(q.dmg) }));
        else list.push(JSON.stringify({ i: q.id, h: 1, al: 1, gl: q.gun, k: q.kills, d: q.deaths, a: q.assists, sc: q.score, pg: q.ping || 0, dm: Math.round(q.dmg) }));
      }
      // le Noyau porté n'est montré qu'aux attaquants ; posé ou au sol, il est visible par tous
      const side = this.side(p);
      const c = this.core;
      const core = { s: c.status, p: c.pos ? c.pos.map(r2) : null, c: side === 'atk' || isFfa(this.mode) ? c.carrier : null, site: c.site, f: c.status === 'planted' ? r2(this.phaseEnd - T) : 0 };
      const wp = {};
      for (const s of [1, 2, 3]) { const w = p.weapons[s]; wp[s] = w ? [w.id, w.mag, w.reserve] : null; }
      const me = {
        hp: Math.ceil(p.hp), ar: Math.ceil(p.armor), $: p.money, sl: p.slot, wp, al: p.alive ? 1 : 0,
        rl: p.reloadEnd > T ? r2(p.reloadEnd - T) : 0, ab: p.charges, ult: p.ult, side,
        pr: p.prog > 0 ? [p.progKind, r2(p.prog / (p.progKind === 'plant' ? ROUND.plantTime : ROUND.defuseTime))] : null,
        sm: p.speedMul, rm: p.rateMul, rs: p.respawnAt ? r2(Math.max(0, p.respawnAt - T)) : 0,
        rc: { q: p.recharge.q ? r2(p.recharge.q - T) : 0, e: p.recharge.e ? r2(p.recharge.e - T) : 0 },
        iv: p.invisEnd > T ? 1 : 0, bf: p.buffEnd > T ? 1 : 0, bt: this.buffTimers(p, T),
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
