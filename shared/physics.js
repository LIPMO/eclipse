// Physique et lancer de rayons partagés (client + serveur)
import { PLAYER } from './data.js';

export function overlaps(p, hw, h, b) {
  return p[0] + hw > b.min[0] && p[0] - hw < b.max[0] &&
         p[1] + h > b.min[1] && p[1] < b.max[1] &&
         p[2] + hw > b.min[2] && p[2] - hw < b.max[2];
}

// Déplace pos (vec3, pieds) selon vel*dt avec collisions AABB. Retourne onGround.
export function collideMove(pos, vel, dt, boxes, hw = PLAYER.hw, h = PLAYER.h) {
  const speed = Math.hypot(vel[0], vel[1], vel[2]);
  const steps = Math.max(1, Math.ceil((speed * dt) / 0.3));
  const sdt = dt / steps;
  let onGround = false;
  for (let s = 0; s < steps; s++) {
    for (let axis of [0, 2, 1]) {
      const d = vel[axis] * sdt;
      if (!d) continue;
      pos[axis] += d;
      for (const b of boxes) {
        if (!overlaps(pos, hw, h, b)) continue;
        if (axis === 1) {
          if (d < 0) { pos[1] = b.max[1]; onGround = true; } else pos[1] = b.min[1] - h;
          vel[1] = 0;
        } else {
          // petite marche : on monte automatiquement les rebords < 0.35
          if (b.max[1] - pos[1] <= 0.35 && b.max[1] - pos[1] > 0) {
            const old = pos[1]; pos[1] = b.max[1];
            if (boxes.some(o => overlaps(pos, hw, h, o))) pos[1] = old; else continue;
          }
          const ext = hw + 1e-4;
          pos[axis] = d > 0 ? b.min[axis] - ext : b.max[axis] + ext;
          vel[axis] = 0;
        }
      }
    }
    if (pos[1] <= 0) { pos[1] = 0; if (vel[1] < 0) vel[1] = 0; onGround = true; }
  }
  // détection du sol quand immobile verticalement
  if (!onGround) {
    const probe = [pos[0], pos[1] - 0.05, pos[2]];
    if (pos[1] <= 0.001) onGround = true;
    else for (const b of boxes) if (overlaps(probe, hw, h, b)) { onGround = true; break; }
  }
  return onGround;
}

// Expulse un joueur coincé dans une boîte (ex. mur posé sur lui)
export function depenetrate(pos, boxes, hw = PLAYER.hw, h = PLAYER.h) {
  for (const b of boxes) {
    if (!overlaps(pos, hw, h, b)) continue;
    const opts = [
      [0, b.min[0] - hw - 0.01], [0, b.max[0] + hw + 0.01],
      [2, b.min[2] - hw - 0.01], [2, b.max[2] + hw + 0.01],
      [1, b.max[1]],
    ];
    let best = null, bd = Infinity;
    for (const [ax, v] of opts) { const dd = Math.abs(pos[ax] - v); if (dd < bd) { bd = dd; best = [ax, v]; } }
    pos[best[0]] = best[1];
  }
}

export function rayAABB(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return Infinity;
    } else {
      let t1 = (min[a] - o[a]) / d[a], t2 = (max[a] - o[a]) / d[a];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  if (tmax < 0) return Infinity;
  return tmin >= 0 ? tmin : 0;
}

export function raycastBoxes(o, d, maxT, boxes) {
  let best = maxT, hit = null;
  for (const b of boxes) {
    const t = rayAABB(o, d, b.min, b.max);
    if (t < best) { best = t; hit = b; }
  }
  // sol
  if (d[1] < 0) { const t = -o[1] / d[1]; if (t >= 0 && t < best) { best = t; hit = { kind: 'floor' }; } }
  return { t: best, box: hit };
}

export function raySphere(o, d, c, r) {
  const ox = o[0] - c[0], oy = o[1] - c[1], oz = o[2] - c[2];
  const b = ox * d[0] + oy * d[1] + oz * d[2];
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return Infinity;
  const s = Math.sqrt(disc);
  const t = -b - s;
  if (t >= 0) return t;
  if (-b + s >= 0) return 0;
  return Infinity;
}

export function hitboxes(p, crouch) {
  const h = crouch ? PLAYER.hCrouch : PLAYER.h;
  const x = p[0], y = p[1], z = p[2];
  return [
    { zone: 'head', min: [x - 0.2, y + h - 0.36, z - 0.2], max: [x + 0.2, y + h, z + 0.2] },
    { zone: 'body', min: [x - 0.36, y + h * 0.45, z - 0.36], max: [x + 0.36, y + h - 0.36, z + 0.36] },
    { zone: 'legs', min: [x - 0.3, y, z - 0.3], max: [x + 0.3, y + h * 0.45, z + 0.3] },
  ];
}

export function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

export function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function groundHeight(x, z, y, boxes) {
  let g = 0;
  for (const b of boxes) {
    if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] <= y + 0.2 && b.max[1] > g) g = b.max[1];
  }
  return g;
}
