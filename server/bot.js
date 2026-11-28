// IA des bots : navigation A* sur la grille, perception (ligne de vue, fumées), combat.
import { WEAPONS, PLAYER, MOVE, AGENTS, isFfa } from '../shared/data.js';
import { findPath, CELL } from '../shared/maps.js';
import { collideMove, raycastBoxes, raySphere, norm } from '../shared/physics.js';

// abil : probabilité d'utiliser une capacité quand l'occasion se présente ; hear : portée d'écoute des pas et des tirs
export const DIFF = {
  easy:   { react: 0.65, aimErr: 0.055, turn: 5,  head: 0.08, fov: 1.1,  abil: 0.15, hear: 0 },
  normal: { react: 0.42, aimErr: 0.03,  turn: 8,  head: 0.18, fov: 1.25, abil: 0.55, hear: 14 },
  hard:   { react: 0.24, aimErr: 0.016, turn: 13, head: 0.32, fov: 1.4,  abil: 0.85, hear: 22 },
  expert: { react: 0.17, aimErr: 0.011, turn: 17, head: 0.45, fov: 1.55, abil: 1,    hear: 30 },
  // champ de tir : cibles mobiles qui ne tirent pas
  cible:  { react: 99,   aimErr: 1,     turn: 4,  head: 0,    fov: 1.2,  abil: 0,    hear: 0, passive: true },
};
export const DIFFICULTIES = Object.keys(DIFF);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };

export class BotBrain {
  constructor(match, p, difficulty) {
    this.m = match; this.p = p;
    this.cfg = DIFF[difficulty] || DIFF.normal;
    this.vel = [0, 0, 0];
    this.onRoundStart();
  }

  onRoundStart() {
    this.path = null; this.pathIdx = 0; this.goal = null; this.goalKey = null;
    this.target = null; this.reactUntil = 0; this.holdUntil = 0;
    this.strafe = 1; this.strafeT = 0; this.stuckT = 0; this.lastPos = this.p.pos.slice();
    this.aimHead = false; this.lookYaw = this.p.yaw; this.scanT = 0;
    this.vel = [0, 0, 0];
    this.abilT = 0; this.usedRound = new Set(); this.dashT = 0; this.dashDir = null; this.turnAwayUntil = 0; this.noEnemySince = this.m.time; this.heard = null;
    this.p.interact = false;
    this.mySite = Math.random() < 0.5 ? 'A' : 'B';
    if (this.m.mode === 'assault') setTimeout(() => this.buy(), 300 + Math.random() * 1500);
  }

  buy() {
    const m = this.m, p = this.p;
    if (!p.alive) return;
    const $ = () => p.money;
    // n'achète que des armes débloquées pour le niveau de la partie (voir Match.weaponLocked)
    const ok = id => !m.weaponLocked(p, id) && m.weaponAllowed(id);
    if (!p.weapons[1]) {
      if ($() >= 2900 + 400 && ok('lancer')) m.handleBuy(p, Math.random() < 0.12 && $() >= 4700 + 400 && ok('longbow') ? 'longbow' : 'lancer');
      else if ($() >= 2250 + 400 && ok('tempest') && Math.random() < 0.5) m.handleBuy(p, 'tempest');
      else if ($() >= 1600 + 400 && ok('viper')) m.handleBuy(p, Math.random() < 0.7 || !ok('brute') ? 'viper' : 'brute');
    }
    if (!p.weapons[1] && $() >= 800 && p.weapons[2]?.id !== 'hornet' && Math.random() < 0.6) m.handleBuy(p, 'hornet');
    if ($() >= 1000 && p.armor < 50) m.handleBuy(p, 'heavy');
    else if ($() >= 400 && p.armor < 25) m.handleBuy(p, 'light');
    p.slot = p.weapons[1] ? 1 : 2;
  }

  canSee(q) {
    const m = this.m, p = this.p;
    const e = m.eye(p);
    const t = m.eye(q); t[1] -= 0.3;
    const to = [t[0] - e[0], t[1] - e[1], t[2] - e[2]];
    const dist = Math.hypot(...to);
    if (dist > 75) return false;
    const d = norm(to);
    if (raycastBoxes(e, d, dist, m.allBoxes()).t < dist - 0.4) return false;
    for (const s of m.smokes) if (raySphere(e, d, s.pos, s.r * 0.95) < dist) return false;
    return true;
  }

  findTarget() {
    const m = this.m, p = this.p, T = m.time;
    let best = null, bd = Infinity;
    for (const q of m.players.values()) {
      if (!q.alive || !m.isEnemy(p, q)) continue;
      const dx = q.pos[0] - p.pos[0], dz = q.pos[2] - p.pos[2];
      const dist = Math.hypot(dx, dz);
      if (q.invisEnd > T && dist > 4) continue;
      const yawTo = Math.atan2(-dx, -dz);
      const inFov = Math.abs(angDiff(yawTo, p.yaw)) < this.cfg.fov || dist < 5 ||
        (p.lastDamagedBy === q.id && T - p.lastDamagedAt < 2.5) || this.target === q;
      if (!inFov) continue;
      if (dist < bd && this.canSee(q)) { bd = dist; best = q; }
    }
    return best;
  }

  chooseGoal() {
    const m = this.m, p = this.p, core = m.core;
    const map = m.map;
    const randCell = cells => { const [i, j] = cells[(Math.random() * cells.length) | 0]; return [(i + 0.5) * CELL, (j + 0.5) * CELL]; };
    if (m.mode === 'duel') {
      // en duel, le bot chasse : il se dirige vers la dernière position connue de l'adversaire
      const foe = [...m.players.values()].find(q => q.alive && m.isEnemy(p, q));
      if (foe && (!this.huntT || m.time > this.huntT || this.reached)) {
        this.huntT = m.time + 2.5 + Math.random() * 2;
        return { key: 'hunt' + m.time, pos: [foe.pos[0] + (Math.random() - 0.5) * 6, foe.pos[2] + (Math.random() - 0.5) * 6] };
      }
      return null;
    }
    if (m.mode === 'br' && m.zone) {
      // Battle Royale : rester dans la zone (la prochaine si elle se resserre bientôt), chercher des armes dans les coffres
      const z = m.zone, safe = (z.shrinking || z.until - m.time < 15) ? { c: z.nc, r: z.nr } : { c: z.c, r: z.r };
      const out = Math.hypot(p.pos[0] - safe.c[0], p.pos[2] - safe.c[1]) > Math.max(2, safe.r * 0.85);
      if (out) {
        if (this.goalKey !== 'zone' + z.stage + (z.shrinking ? 's' : '') || this.reached) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * safe.r * 0.5;
          let gx = safe.c[0] + Math.cos(a) * d, gz = safe.c[1] + Math.sin(a) * d;
          if (!map.walkable(Math.floor(gx / CELL), Math.floor(gz / CELL))) { const near = map.floor.reduce((b, c) => { const x = (c[0] + 0.5) * CELL, y = (c[1] + 0.5) * CELL, dd = Math.hypot(x - gx, y - gz); return dd < b[0] ? [dd, x, y] : b; }, [1e9]); gx = near[1]; gz = near[2]; }
          return { key: 'zone' + z.stage + (z.shrinking ? 's' : ''), pos: [gx, gz] };
        }
        return null;
      }
      if (!p.weapons[1] || !p.weapons[2]) {
        let best = null, bd = 60;
        for (const c of m.chests) {
          if (c.open || Math.hypot(c.pos[0] - safe.c[0], c.pos[2] - safe.c[1]) > safe.r) continue;
          const d = Math.hypot(c.pos[0] - p.pos[0], c.pos[2] - p.pos[2]); if (d < bd) { bd = d; best = c; }
        }
        if (best) return this.goalKey === 'chest' + best.id && !this.reached ? null : { key: 'chest' + best.id, pos: [best.pos[0], best.pos[2]] };
      }
    }
    if (isFfa(m.mode)) {
      if (!this.goal || this.reached) { const [i, j] = map.floor[(Math.random() * map.floor.length) | 0]; return { key: 'ffa' + Math.random(), pos: [(i + 0.5) * CELL, (j + 0.5) * CELL] }; }
      return null;
    }
    const side = m.side(p);
    if (side === 'atk') {
      if (core.status === 'dropped') return { key: 'core' + core.pos[0], pos: [core.pos[0], core.pos[2]] };
      if (core.status === 'planted') { const k = 'guard' + core.site; if (this.goalKey !== k) return { key: k, pos: randCell(map.sites[core.site].cells) }; return null; }
      const site = m.botSite;
      const k = 'site' + site + (core.carrier === p.id ? 'c' : '');
      if (this.goalKey !== k) return { key: k, pos: randCell(map.sites[site].cells) };
      return null;
    }
    if (core.status === 'planted') return this.goalKey === 'defuse' ? null : { key: 'defuse', pos: [core.pos[0], core.pos[2]] };
    const k = 'hold' + this.mySite;
    if (this.goalKey !== k) return { key: k, pos: randCell(map.sites[this.mySite].cells) };
    return null;
  }

  // ---------- capacités ----------
  dirTo(pt, arc = 0) {
    const e = this.m.eye(this.p);
    const d = [pt[0] - e[0], pt[1] - e[1], pt[2] - e[2]];
    const dist = Math.hypot(d[0], d[2]);
    d[1] += dist * arc;
    return norm(d);
  }
  lookDir() { const p = this.p, c = Math.cos(p.pitch); return [-Math.sin(p.yaw) * c, Math.sin(p.pitch), -Math.cos(p.yaw) * c]; }
  use(k, dir) {
    const p = this.p, ab = AGENTS[p.agent].abilities[k];
    if (!ab) return false;
    if (k === 'x' ? p.ult < ab.cost : (p.charges[k] || 0) <= 0) return false;
    this.m.handleAbility(p, { k, d: dir || this.lookDir() });
    this.usedRound.add(ab.type);
    // le serveur gère l'effet des capacités ; les déplacements (ruée, saut d'ombre) sont appliqués ici
    if (ab.type === 'dash') { this.dashT = MOVE.dashTime; this.dashDir = this.dashDir || [-Math.sin(p.yaw), -Math.cos(p.yaw)]; }
    if (ab.type === 'blink') this.blink(dir || this.lookDir());
    if (ab.type === 'flash') this.turnAwayUntil = this.m.time + 0.95;
    return true;
  }
  blink(dir) {
    const m = this.m, p = this.p;
    const flat = norm([dir[0], 0, dir[2]]);
    const from = [p.pos[0], p.pos[1] + 0.9, p.pos[2]];
    const r = raycastBoxes(from, flat, MOVE.blinkDist, m.allBoxes());
    const t = Math.max(0, Math.min(MOVE.blinkDist, r.t) - 0.7);
    if (t < 2) return;
    p.pos[0] += flat[0] * t; p.pos[2] += flat[2] * t;
    p.lastValid = { pos: p.pos.slice(), t: m.time };
  }
  siteDist(site) {
    const sites = this.m.map.sites; if (!sites || !sites[site]) return Infinity;
    const [i, j] = sites[site].cells[0];
    return Math.hypot((i + 0.5) * CELL - this.p.pos[0], (j + 0.5) * CELL - this.p.pos[2]);
  }
  thinkAbilities(enemy) {
    const m = this.m, p = this.p, T = m.time, cfg = this.cfg;
    if (T < this.abilT || m.phase === 'buy' || m.phase === 'warmup' || m.phase === 'over' || m.phase === 'end') return;
    this.abilT = T + 0.45 + Math.random() * 0.4;
    if (Math.random() > cfg.abil) return;
    const ag = AGENTS[p.agent].abilities;
    const types = { q: ag.q.type, e: ag.e.type, x: ag.x.type };
    const has = k => k === 'x' ? p.ult >= ag.x.cost : (p.charges[k] || 0) > 0;
    const keyOf = type => ['q', 'e', 'x'].find(k => types[k] === type && has(k));
    const side = m.mode === 'assault' ? m.side(p) : 'ffa';
    const dist = enemy ? Math.hypot(enemy.pos[0] - p.pos[0], enemy.pos[2] - p.pos[2]) : Infinity;
    const allies = [...m.players.values()].filter(q => q.alive && q !== p && !m.isEnemy(p, q) && Math.hypot(q.pos[0] - p.pos[0], q.pos[2] - p.pos[2]) < 18);
    const nearSite = side === 'atk' && m.core.status !== 'planted' && this.siteDist(m.botSite) < 26;
    let k;
    // ultimes
    if ((k = keyOf('overdrive')) && enemy) return this.use(k);
    if ((k = keyOf('phantom')) && (nearSite || (enemy && p.hp < 50))) return this.use(k);
    if ((k = keyOf('hunt')) && !enemy && T - this.noEnemySince > 6) return this.use(k);
    if ((k = keyOf('fortress')) && allies.length >= 1 && (p.hp < 60 || allies.some(a => a.hp < 60))) return this.use(k);
    if ((k = keyOf('megasmoke')) && nearSite && !this.usedRound.has('megasmoke')) return this.use(k, this.goal ? this.dirTo([this.goal[0], 1, this.goal[1]]) : null);
    if ((k = keyOf('firestorm')) && enemy && dist > 8 && dist < 40) return this.use(k, this.dirTo(enemy.pos));
    if ((k = keyOf('blizzard')) && enemy && dist > 8 && dist < 40) return this.use(k, this.dirTo(enemy.pos));
    // soin et armure
    if ((k = keyOf('heal')) && !enemy && p.hp < 55) return this.use(k);
    if ((k = keyOf('shield')) && p.armor < 30 && (enemy || m.phase === 'live')) return this.use(k);
    if (enemy) {
      if ((k = keyOf('molotov')) && dist > 6 && dist < 22) return this.use(k, this.dirTo(enemy.pos, 0.18));
      if ((k = keyOf('cryo')) && dist > 6 && dist < 22) return this.use(k, this.dirTo(enemy.pos, 0.18));
      if ((k = keyOf('haste')) && (p.hp < 45 || dist > 14)) return this.use(k);
      if ((k = keyOf('flash')) && dist > 9 && dist < 30 && T < this.reactUntil + 0.3) return this.use(k, this.dirTo(enemy.pos, 0.08));
      if ((k = keyOf('dash')) && p.hp < 50) { this.dashDir = [Math.cos(p.yaw) * (this.strafe || 1), -Math.sin(p.yaw) * (this.strafe || 1)]; return this.use(k); }
      if ((k = keyOf('wall')) && side === 'def' && dist > 12) return this.use(k, this.dirTo(enemy.pos));
      if ((k = keyOf('smoke')) && p.hp < 40 && dist > 8) return this.use(k, this.dirTo(enemy.pos, 0.1));
      if ((k = keyOf('blink')) && p.hp < 35) { const away = norm([p.pos[0] - enemy.pos[0], 0, p.pos[2] - enemy.pos[2]]); return this.use(k, away); }
      return;
    }
    // sans ennemi en vue : préparation de l'attaque ou de la défense
    if (nearSite) {
      if ((k = keyOf('smoke')) && !this.usedRound.has('smoke') && this.goal) return this.use(k, this.dirTo([this.goal[0], 1, this.goal[1]], 0.12));
      if ((k = keyOf('invis'))) return this.use(k);
      if ((k = keyOf('flash')) && !this.usedRound.has('flash') && this.goal) return this.use(k, this.dirTo([this.goal[0], 3, this.goal[1]], 0.1));
    }
    if ((k = keyOf('recon')) && m.phase === 'live' && T - this.noEnemySince > 4 && !this.usedRound.has('recon')) return this.use(k);
    if ((k = keyOf('blink')) && this.path && this.pathIdx < this.path.length - 2 && this.goal && Math.hypot(this.goal[0] - p.pos[0], this.goal[1] - p.pos[2]) > 18) {
      const wp = this.path[Math.min(this.path.length - 1, this.pathIdx + 1)];
      return this.use(k, norm([wp[0] - p.pos[0], 0, wp[1] - p.pos[2]]));
    }
    if ((k = keyOf('haste')) && side === 'atk' && this.siteDist(m.botSite) < 30 && !this.usedRound.has('haste')) return this.use(k);
    if ((k = keyOf('dash')) && side === 'atk' && this.siteDist(m.botSite) < 14 && !this.usedRound.has('dash')) { this.dashDir = [-Math.sin(p.yaw), -Math.cos(p.yaw)]; return this.use(k); }
    if ((k = keyOf('wall')) && side === 'def' && this.reached && m.phase === 'live' && !this.usedRound.has('wall') && this.heard) return this.use(k, this.dirTo(this.heard));
  }

  // écoute : pas de course et tirs proches (comme un joueur au casque)
  listen() {
    const m = this.m, p = this.p, T = m.time, range = this.cfg.hear;
    if (!range) return null;
    let best = null, bd = Infinity;
    for (const q of m.players.values()) {
      if (!q.alive || !m.isEnemy(p, q)) continue;
      const d = Math.hypot(q.pos[0] - p.pos[0], q.pos[2] - p.pos[2]);
      const sp = q.snapVel ? Math.hypot(q.snapVel[0], q.snapVel[1]) : 0;
      const loud = (sp > 4.3 && d < range) || (T - q.lastShot < 0.8 && d < range * 2.2) || q.revealEnd > T;
      if (loud && d < bd) { bd = d; best = q; }
    }
    return best ? [best.pos[0], best.pos[1] + 1.4, best.pos[2]] : null;
  }

  update(dt) {
    const m = this.m, p = this.p, T = m.time, cfg = this.cfg;
    if (!p.alive) { this.vel = [0, 0, 0]; return; }
    if (p.dropUntil && T < p.dropUntil) { this.vel = [0, 0, 0]; return; } // Battle Royale : attend la fin de la descente des joueurs
    let wishX = 0, wishZ = 0, speed = MOVE.run * 0.88 * (WEAPONS[p.weapons[p.slot]?.id]?.speed || 1) * p.speedMul;
    const canMove = m.phase !== 'buy' && m.phase !== 'warmup' && m.phase !== 'over';
    p.interact = false;

    const enemy = canMove ? this.findTarget() : null;
    if (enemy) this.noEnemySince = T;
    this.heard = canMove && !enemy ? this.listen() : null;
    if (canMove) this.thinkAbilities(enemy);
    const w = p.weapons[p.slot];
    if (w && WEAPONS[w.id].mag && w.mag === 0 && w.reserve > 0) m.handleReload(p);
    if (w && WEAPONS[w.id].mag && w.mag === 0 && w.reserve === 0 && p.weapons[2] && p.slot !== 2) p.slot = 2;

    if (enemy) {
      if (this.target !== enemy) {
        this.target = enemy; this.reactUntil = T + cfg.react * (0.75 + Math.random() * 0.6); this.aimHead = Math.random() < cfg.head;
        // nouvel ennemi repéré : le bot le marque pour ses coéquipiers humains (au plus toutes les 10 s)
        if (!isFfa(m.mode) && T - (this.lastMark ?? -99) > 10 && [...m.players.values()].some(q => !q.isBot && q.team === p.team && q !== p)) {
          this.lastMark = T;
          const e0 = m.eye(p), to = [enemy.pos[0] - e0[0], enemy.pos[1] + 1.2 - e0[1], enemy.pos[2] - e0[2]];
          m.handleMark(p, { d: to });
        }
      }
      const e = m.eye(p);
      const h = enemy.crouch ? PLAYER.hCrouch : PLAYER.h;
      const tp = [enemy.pos[0], enemy.pos[1] + (this.aimHead ? h - 0.17 : h * 0.62), enemy.pos[2]];
      const to = [tp[0] - e[0], tp[1] - e[1], tp[2] - e[2]];
      const dist = Math.hypot(...to);
      const yawT = Math.atan2(-to[0], -to[2]);
      const pitchT = Math.asin(Math.max(-1, Math.min(1, to[1] / dist)));
      const k = Math.min(1, cfg.turn * dt);
      // détourne le regard pendant sa propre grenade aveuglante
      if (T < this.turnAwayUntil) { p.yaw += angDiff(yawT + Math.PI, p.yaw) * k; return this.physics(dt, 0, 0, speed, enemy); }
      p.yaw += angDiff(yawT, p.yaw) * k;
      p.pitch += (pitchT - p.pitch) * k;
      const aimed = Math.abs(angDiff(yawT, p.yaw)) < 0.12;
      if (!cfg.passive && T > this.reactUntil && aimed && p.blindEnd < T && w) {
        const d = WEAPONS[w.id];
        if (d.type === 'melee' && dist > 2.4) { wishX = to[0] / dist; wishZ = to[2] / dist; }
        else {
          const err = cfg.aimErr * (0.6 + dist / 35) + (d.spread || 0) * 0.5 + (d.type === 'sniper' ? 0.01 : 0);
          const dirs = [];
          for (let i = 0; i < (d.pellets || 1); i++) {
            const pe = d.pellets > 1 ? d.spread : 0;
            const yy = yawT + (Math.random() - 0.5) * 2 * (err + pe), pp = pitchT + (Math.random() - 0.5) * 2 * (err * 0.7 + pe);
            dirs.push([-Math.sin(yy) * Math.cos(pp), Math.sin(pp), -Math.cos(yy) * Math.cos(pp)]);
          }
          m.handleShoot(p, { d: dirs });
        }
      }
      // mitraillage latéral
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.3 + Math.random() * 0.6; if (Math.random() < 0.25) this.strafe = 0; }
      if (!wishX && !wishZ) { wishX = Math.cos(p.yaw) * this.strafe; wishZ = -Math.sin(p.yaw) * this.strafe; speed *= 0.5; }
      this.path = null;
    } else {
      this.target = null;
      if (w && WEAPONS[w.id].mag && w.mag < WEAPONS[w.id].mag * 0.4 && w.reserve > 0) m.handleReload(p);
      if (canMove) {
        const ng = this.chooseGoal();
        if (ng) { this.goal = ng.pos; this.goalKey = ng.key; this.path = null; this.reached = false; }
        if (this.goal && !this.path && !this.reached) {
          this.path = findPath(m.map, [p.pos[0], p.pos[2]], this.goal) || [];
          this.pathIdx = 0;
        }
        if (this.path && this.pathIdx < this.path.length) {
          const wp = this.path[this.pathIdx];
          const dx = wp[0] - p.pos[0], dz = wp[1] - p.pos[2];
          const dd = Math.hypot(dx, dz);
          if (dd < (this.pathIdx === this.path.length - 1 ? 0.6 : 1.4)) { this.pathIdx++; if (this.pathIdx >= this.path.length) this.reached = true; }
          else { wishX = dx / dd; wishZ = dz / dd; const yawT = Math.atan2(-dx, -dz); p.yaw += angDiff(yawT, p.yaw) * Math.min(1, 6 * dt); p.pitch *= 0.9; }
        } else if (this.reached) {
          // en position : balayage visuel, ou regard vers un bruit entendu
          this.scanT -= dt;
          if (this.heard) { this.lookYaw = Math.atan2(-(this.heard[0] - p.pos[0]), -(this.heard[2] - p.pos[2])); this.scanT = 0.8; }
          else if (this.scanT <= 0) { this.lookYaw = p.yaw + (Math.random() - 0.5) * 2.6; this.scanT = 1 + Math.random() * 2; }
          p.yaw += angDiff(this.lookYaw, p.yaw) * Math.min(1, 3 * dt);
          if (isFfa(m.mode)) this.reached = true;
        }
        // pose / désamorçage
        const cell = m.map.cellAt(p.pos[0], p.pos[2]);
        if (m.mode === 'assault') {
          if (m.side(p) === 'atk' && m.core.carrier === p.id && (cell === 'A' || cell === 'B') && m.phase === 'live' && (this.reached || cell === m.botSite)) { p.interact = true; wishX = wishZ = 0; if (!p.interactPos) p.interactPos = p.pos.slice(); }
          if (m.side(p) === 'def' && m.phase === 'planted' && Math.hypot(p.pos[0] - m.core.pos[0], p.pos[2] - m.core.pos[2]) < 1.8) { p.interact = true; wishX = wishZ = 0; }
        }
        if (isFfa(m.mode) && this.reached) { this.goal = null; }
      }
    }
    if (m.mode === 'br' && m.chests && p.alive && (this.chestT = (this.chestT || 0) - dt) <= 0) {
      this.chestT = 0.4;
      for (const c of m.chests) if (!c.open && Math.hypot(c.pos[0] - p.pos[0], c.pos[2] - p.pos[2]) < 2.2) { m.openChest(p, c.id); break; }
      if (p.hp < 100) for (const d of m.dispensers || []) if (Math.hypot(d.pos[0] - p.pos[0], d.pos[2] - p.pos[2]) < 2.2) { m.useDispenser(p, d.id); break; }
      if (p.hp <= 50 && (p.money || 0) >= 300 && !this.target) m.handleBuy(p, 'brHeal');
      if (p.slot === 3 && (p.weapons[1] || p.weapons[2])) p.slot = p.weapons[1] ? 1 : 2; // prend l'arme trouvée en main
    }
    if (m.mode === 'br' && p.pots && !this.target && !(p.drinkEnd > T)) { if (p.hp < 60 && p.pots.heal) m.drinkPotion(p, 'heal'); else if ((p.armor || 0) < 50 && p.pots.shield) m.drinkPotion(p, 'shield'); }
    if (!p.interact) p.interactPos = null;
    // en duel ou en mêlée, un bruit entendu attire le bot
    if (this.heard && !enemy && m.mode !== 'assault' && canMove && (!this.heardGoalT || T > this.heardGoalT)) {
      this.heardGoalT = T + 1.5; this.goal = [this.heard[0], this.heard[2]]; this.goalKey = 'heard' + T; this.path = null; this.reached = false;
    }
    this.physics(dt, wishX, wishZ, speed, enemy);
  }

  physics(dt, wishX, wishZ, speed, enemy) {
    const m = this.m, p = this.p;
    const ground = this.onGround !== false;
    const accel = ground ? 40 : 8;
    this.vel[0] += (wishX * speed - this.vel[0]) * Math.min(1, accel * dt / Math.max(speed, 1));
    this.vel[2] += (wishZ * speed - this.vel[2]) * Math.min(1, accel * dt / Math.max(speed, 1));
    if (this.dashT > 0 && this.dashDir) {
      this.dashT -= dt;
      const n = Math.hypot(this.dashDir[0], this.dashDir[1]) || 1;
      this.vel[0] = this.dashDir[0] / n * MOVE.dashSpeed; this.vel[2] = this.dashDir[1] / n * MOVE.dashSpeed;
      if (this.dashT <= 0) this.dashDir = null;
    }
    this.vel[1] -= MOVE.gravity * (m.opts?.lowGrav ? 0.45 : 1) * dt;
    this.onGround = collideMove(p.pos, this.vel, dt, m.allBoxes());
    // anti-blocage
    this.stuckT += dt;
    if (this.stuckT > 1.2) {
      const moved = Math.hypot(p.pos[0] - this.lastPos[0], p.pos[2] - this.lastPos[2]);
      if ((wishX || wishZ) && moved < 0.4 && !enemy) {
        if (this.onGround) this.vel[1] = MOVE.jump;
        this.path = null;
      }
      this.lastPos = p.pos.slice(); this.stuckT = 0;
    }
  }
}
