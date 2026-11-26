// Objets interactifs et parcours (1.28) : calculés à partir de la grille de la carte,
// identiques sur le serveur et chez chaque joueur (aucune donnée à envoyer).
import { CELL, WALL_H } from './maps.js';

const SPECIAL = new Set(['T', 'D', 'A', 'B']);
const cache = new Map();
const memo = (map, key, fn) => { const k = map.id + ':' + key; if (!cache.has(k)) cache.set(k, fn()); return cache.get(k); };
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// cellules d'apparition et de sites (on n'y met ni porte ni départ de parcours)
function specialCells(map) {
  const out = [];
  for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) if (SPECIAL.has(map.grid[j][i])) out.push([(i + 0.5) * CELL, (j + 0.5) * CELL]);
  return out;
}

// ---------- portes coulissantes ----------
// Placées en travers d'un couloir étroit (1 ou 2 cases entre deux murs) qui continue des deux côtés.
// Chaque porte est faite de deux battants qui rentrent dans les murs quand elle s'ouvre.
export const DOOR = { thick: 0.3, reach: 2.4, cooldown: 0.6, max: 3, minGap: 16, spawnGap: 12 };
export function doorsFor(map) {
  return memo(map, 'doors', () => {
    const walk = (i, j) => map.walkable(i, j) && map.grid[j][i] === '.';
    const free = (i, j) => map.walkable(i, j) || map.grid[j]?.[i] === 'c' || map.grid[j]?.[i] === 'C';
    const cand = [];
    for (const axis of ['x', 'z']) {
      // axis 'x' : la porte s'étend le long de x (couloir orienté nord-sud)
      const W = axis === 'x' ? map.w : map.h, Hh = axis === 'x' ? map.h : map.w;
      const at = (u, v) => axis === 'x' ? [u, v] : [v, u];
      for (let v = 2; v < Hh - 2; v++) {
        let u = 1;
        while (u < W - 1) {
          if (!walk(...at(u, v)) || walk(...at(u - 1, v))) { u++; continue; }
          let u2 = u; while (u2 + 1 < W && walk(...at(u2 + 1, v))) u2++;
          const len = u2 - u + 1;
          const closed = !map.walkable(...at(u - 1, v)) && !free(...at(u - 1, v)) && !map.walkable(...at(u2 + 1, v)) && !free(...at(u2 + 1, v));
          let corridor = closed && len <= 2;
          for (let k = u; k <= u2 && corridor; k++) for (const dv of [-2, -1, 1, 2]) if (!map.walkable(...at(k, v + dv))) corridor = false;
          if (corridor) {
            const a = u * CELL, b = (u2 + 1) * CELL, c = (v + 0.5) * CELL;
            const center = axis === 'x' ? [(a + b) / 2, c] : [c, (a + b) / 2];
            cand.push({ axis, a, b, c, center });
          }
          u = u2 + 1;
        }
      }
    }
    const spec = specialCells(map);
    const mid = [map.size[0] / 2, map.size[1] / 2];
    const ok = cand.filter(d => spec.every(s => dist2(s, d.center) >= DOOR.spawnGap))
      .sort((p, q) => dist2(p.center, mid) - dist2(q.center, mid) || p.center[0] - q.center[0] || p.center[1] - q.center[1]);
    const chosen = [];
    for (const d of ok) {
      if (chosen.length >= DOOR.max) break;
      if (chosen.every(o => dist2(o.center, d.center) >= DOOR.minGap)) chosen.push(d);
    }
    return chosen.map((d, i) => {
      const t = DOOR.thick / 2;
      const box = d.axis === 'x'
        ? { min: [d.a, 0, d.c - t], max: [d.b, WALL_H, d.c + t] }
        : { min: [d.c - t, 0, d.a], max: [d.c + t, WALL_H, d.b] };
      return { i, axis: d.axis, center: d.center, width: d.b - d.a, box: { ...box, kind: 'door', doorId: i } };
    });
  });
}

// ---------- lampes murales (on peut les casser d'une balle) ----------
export const LAMP = { y: 3.6, r: 0.32, max: 10, minGap: 13 };
export function lightsFor(map) {
  return memo(map, 'lights', () => {
    const cand = [];
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (let j = 1; j < map.h - 1; j++) for (let i = 1; i < map.w - 1; i++) {
      if (!map.walkable(i, j)) continue;
      for (const [di, dj] of dirs) {
        const c = map.grid[j + dj]?.[i + di];
        if (c !== '#') continue;
        // lampe collée au mur, au milieu de la case, tournée vers la case
        const x = (i + 0.5) * CELL + di * (CELL / 2 - 0.22), z = (j + 0.5) * CELL + dj * (CELL / 2 - 0.22);
        cand.push({ p: [x, LAMP.y, z], n: [-di, 0, -dj], h: ((i * 73856093) ^ (j * 19349663) ^ ((di + 2) * 83492791)) >>> 0 });
      }
    }
    cand.sort((a, b) => a.h - b.h);
    const out = [];
    for (const c of cand) {
      if (out.length >= LAMP.max) break;
      if (out.every(o => Math.hypot(o.p[0] - c.p[0], o.p[2] - c.p[2]) >= LAMP.minGap)) out.push(c);
    }
    return out.map((c, i) => ({ i, p: c.p.map(v => Math.round(v * 100) / 100), n: c.n }));
  });
}

// ---------- parcours de mouvement chronométré (champ de tir) ----------
// Une suite de balises : au sol ou au sommet des caisses (escalade). Départ dans la zone d'apparition.
export const COURSE = { count: 9, near: 9, far: 24, r: 1.7, countdown: 3 };
export function courseFor(map) {
  return memo(map, 'course', () => {
    const sp = map.spawns.atk[0] || map.spawns.def[0] || [(map.floor[0][0] + 0.5) * CELL, (map.floor[0][1] + 0.5) * CELL];
    const start = [sp[0], 0, sp[1]];
    const cands = [];
    for (const c of map.crates) {
      const cx = (c.min[0] + c.max[0]) / 2, cz = (c.min[2] + c.max[2]) / 2;
      cands.push({ p: [cx, c.max[1], cz], top: true });
    }
    // cases dégagées : la case et ses 4 voisines sont du sol
    for (const [i, j] of map.floor) {
      if (map.grid[j][i] !== '.') continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => map.walkable(i + a, j + b))) cands.push({ p: [(i + 0.5) * CELL, 0, (j + 0.5) * CELL], top: false });
    }
    const used = new Set();
    const cps = [];
    let cur = start;
    for (let n = 0; n < COURSE.count; n++) {
      const wantTop = n % 2 === 0; // une balise sur deux en hauteur (si possible)
      let best = null, bs = Infinity;
      for (const far of [COURSE.far, COURSE.far * 1.8]) {
      if (best != null) break;
      for (let k = 0; k < cands.length; k++) {
        if (used.has(k)) continue;
        const c = cands[k];
        const d = Math.hypot(c.p[0] - cur[0], c.p[2] - cur[2]);
        if (d < COURSE.near || d > far) continue;
        if (cps.some(o => Math.hypot(o.p[0] - c.p[0], o.p[2] - c.p[2]) < COURSE.near)) continue;
        const score = Math.abs(d - 16) + (c.top === wantTop ? 0 : 8) + (Math.hypot(c.p[0] - start[0], c.p[2] - start[2]) < 8 ? 20 : 0);
        if (score < bs) { bs = score; best = k; }
      }
      }
      if (best == null) break;
      used.add(best);
      const c = cands[best];
      cps.push({ p: c.p.map(v => Math.round(v * 100) / 100), top: c.top });
      cur = c.p;
    }
    return { id: map.id, start, yaw: cps.length ? Math.atan2(-(cps[0].p[0] - start[0]), -(cps[0].p[2] - start[2])) : 0, cps };
  });
}
// la position (pieds) valide-t-elle la balise ?
export function atCheckpoint(cp, pos) {
  if (Math.hypot(pos[0] - cp.p[0], pos[2] - cp.p[2]) > COURSE.r) return false;
  return cp.top ? pos[1] >= cp.p[1] - 0.25 : pos[1] < 1.5;
}
