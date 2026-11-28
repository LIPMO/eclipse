// Effets visuels (1.34) : éclairage des cartes, ombres de contact, ciel animé, particules d'ambiance,
// impacts de balles, douilles, effets de capacités. Tout est réglé selon le préréglage graphique :
// « PC faible » garde l'essentiel (pas de lumières dynamiques, moins de particules).
import * as THREE from 'three';
import { CELL } from '/shared/maps.js';
import { raycastBoxes } from '/shared/physics.js';
import { profile } from './store.js';

const ST = () => profile.settings;
const tier = () => (ST().gfxPreset === 'low' || ST().quality === 'low' ? 0 : ST().quality === 'high' || ST().gfxPreset === 'ultra' ? 2 : 1);

function gradTex(draw, w = 64, h = 64) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// normale de la face d'une boîte la plus proche d'un point
function boxNormal(pt, b) {
  if (!b || !b.min) return [0, 1, 0];
  const d = [[pt[0] - b.min[0], [-1, 0, 0]], [b.max[0] - pt[0], [1, 0, 0]], [pt[1] - b.min[1], [0, -1, 0]], [b.max[1] - pt[1], [0, 1, 0]], [pt[2] - b.min[2], [0, 0, -1]], [b.max[2] - pt[2], [0, 0, 1]]];
  let best = d[0]; for (const x of d) if (Math.abs(x[0]) < Math.abs(best[0])) best = x;
  return best[1];
}

// style d'éclairage et d'ambiance de chaque thème de carte
const THEMES = {
  sand:   { lamp: 'lantern', colors: ['#ffb35c', '#ffcf7a'], pool: 0.22, dust: { color: '#e8cfa0', size: 0.06, opacity: 0.5, add: false, wind: [0.9, 0.05, 0.3], vy: -0.02, n: 420 }, clouds: 0.55 },
  neon:   { lamp: 'tube', colors: null, pool: 0.38, dust: { color: null, size: 0.14, opacity: 0.8, add: true, wind: [0.1, 0, 0.1], vy: 0.05, n: 360 }, clouds: 0, stars: true, rain: true },
  ice:    { lamp: 'crystal', colors: ['#9fe8ff', '#cfe9ff'], pool: 0.25, dust: { color: '#ffffff', size: 0.1, opacity: 0.85, add: false, wind: [0.35, 0, 0.15], vy: -0.9, n: 700 }, clouds: 0.8 },
  temple: { lamp: 'torch', colors: ['#ff8a2a', '#ffb347'], pool: 0.3, dust: { color: '#ff9a3c', size: 0.07, opacity: 0.9, add: true, wind: [0.1, 0, 0.1], vy: 0.35, n: 260 }, clouds: 0.45, fireflies: true },
};
export const themeOf = th => THEMES[th.wall] || THEMES.sand;

export class Fx {
  constructor(game) {
    this.g = game; this.S = game.scene; this.th = game.map.theme; this.style = themeOf(this.th);
    this.fixtures = []; this.lights = []; this.decals = []; this.sparks = []; this.puffs = []; this.casings = []; this.flick = [];
    this.t = 0;
  }
  build() {
    const lvl = tier();
    this.buildContactShadows();
    this.buildFixtures(lvl);
    this.buildSky(lvl);
    // textures partagées
    this.holeTex = gradTex((g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(0,0,0,.95)'); r.addColorStop(0.35, 'rgba(10,8,6,.85)'); r.addColorStop(0.6, 'rgba(30,25,20,.35)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
    this.holeMat = new THREE.MeshBasicMaterial({ map: this.holeTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.holeGeo = new THREE.PlaneGeometry(0.24, 0.24);
    this.casingMat = { brass: new THREE.MeshStandardMaterial({ color: '#d4a64a', metalness: 0.9, roughness: 0.3 }), red: new THREE.MeshStandardMaterial({ color: '#b3262e', metalness: 0.2, roughness: 0.5 }) };
    this.casingGeo = { small: new THREE.CylinderGeometry(0.006, 0.006, 0.024, 6), rifle: new THREE.CylinderGeometry(0.007, 0.007, 0.04, 6), big: new THREE.CylinderGeometry(0.009, 0.009, 0.06, 6), shell: new THREE.CylinderGeometry(0.012, 0.012, 0.045, 8) };
    // étincelles : un nuage de points réutilisé
    const N = 160; this.sparkPos = new Float32Array(N * 3).fill(-999); this.sparkVel = new Float32Array(N * 3); this.sparkLife = new Float32Array(N); this.sparkN = N; this.sparkI = 0;
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkPts = new THREE.Points(sg, new THREE.PointsMaterial({ map: this.g.softTex, color: '#ffcf7a', size: 0.06, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparkPts.frustumCulled = false; this.S.add(this.sparkPts);
  }

  // ---------- 2 : ombres de contact au pied des murs et des caisses ----------
  buildContactShadows() {
    const tex = gradTex((g, w, h) => { const r = g.createLinearGradient(0, 0, 0, h); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(0.55, 'rgba(0,0,0,.25)'); r.addColorStop(1, 'rgba(0,0,0,.75)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, 4, 64);
    const pos = [], uv = [], idx = [];
    const quad = (x0, z0, x1, z1, nx, nz, d, y) => {
      const i = pos.length / 3;
      pos.push(x0, y, z0, x1, y, z1, x1 + nx * d, y, z1 + nz * d, x0 + nx * d, y, z0 + nz * d);
      uv.push(0, 1, 1, 1, 1, 0, 0, 0);
      idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
    };
    for (const b of this.g.map.boxes) {
      const crate = b.kind !== 'wall', d = crate ? 0.7 : 1.1, y = 0.012;
      quad(b.min[0], b.min[2], b.max[0], b.min[2], 0, -1, d, y);
      quad(b.max[0], b.max[2], b.min[0], b.max[2], 0, 1, d, y);
      quad(b.min[0], b.max[2], b.min[0], b.min[2], -1, 0, d, y);
      quad(b.max[0], b.min[2], b.max[0], b.max[2], 1, 0, d, y);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: this.th.night ? 0.7 : 0.55, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.renderOrder = 1; this.S.add(m);
  }

  // ---------- 1 : lampes, néons et torches, avec halo au sol et sur le mur ----------
  buildFixtures(lvl) {
    const map = this.g.map, st = this.style;
    const cand = [];
    for (let j = 1; j < map.h - 1; j++) for (let i = 1; i < map.w - 1; i++) {
      if (!map.walkable(i, j)) continue;
      for (const [di, dj] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        if (map.grid[j + dj]?.[i + di] !== '#') continue;
        const h = ((i * 73856093) ^ (j * 19349663) ^ ((di + 2) * 83492791) ^ ((dj + 2) * 2654435761)) >>> 0;
        cand.push({ x: (i + 0.5) * CELL + di * (CELL / 2 - 0.12), z: (j + 0.5) * CELL + dj * (CELL / 2 - 0.12), nx: -di, nz: -dj, h });
      }
    }
    cand.sort((a, b) => a.h - b.h);
    const max = 16, gap = 11, out = [];
    for (const c of cand) { if (out.length >= max) break; if (out.every(o => Math.hypot(o.x - c.x, o.z - c.z) >= gap)) out.push(c); }
    const poolTex = gradTex((g, w) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, w); });
    const flameTex = gradTex((g, w, h) => { const r = g.createRadialGradient(w / 2, h * 0.7, 0, w / 2, h * 0.6, w / 2); r.addColorStop(0, 'rgba(255,255,220,1)'); r.addColorStop(0.3, 'rgba(255,190,80,.9)'); r.addColorStop(0.7, 'rgba(255,90,20,.5)'); r.addColorStop(1, 'rgba(255,40,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }, 64, 96);
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2622', metalness: 0.6, roughness: 0.5 });
    out.forEach((c, n) => {
      const col = st.colors ? st.colors[n % st.colors.length] : (n % 2 ? '#ff3fa4' : this.th.accent);
      const grp = new THREE.Group(); grp.position.set(c.x, 0, c.z); grp.rotation.y = Math.atan2(c.nx, c.nz);
      const y = st.lamp === 'tube' ? 2.2 : 2.6;
      if (st.lamp === 'tube') {
        const tube = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.1), new THREE.MeshBasicMaterial({ color: col }));
        tube.position.set(0, y, 0.06); grp.add(tube);
      } else if (st.lamp === 'torch') {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.6, 6), dark); stick.position.set(0, y - 0.25, 0.12); stick.rotation.x = 0.35; grp.add(stick);
        const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        fl.position.set(0, y + 0.15, 0.22); fl.scale.set(0.35, 0.55, 1); grp.add(fl); this.flick.push({ sp: fl, ph: Math.random() * 10 });
      } else if (st.lamp === 'crystal') {
        const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshBasicMaterial({ color: col })); cr.position.set(0, y, 0.18); cr.scale.y = 1.6; grp.add(cr);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.25), dark); base.position.set(0, y - 0.25, 0.1); grp.add(base);
      } else {
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.22), dark); box.position.set(0, y, 0.13); grp.add(box);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.24, 0.18), new THREE.MeshBasicMaterial({ color: col })); glass.position.set(0, y, 0.15); grp.add(glass);
      }
      // halo sur le mur et flaque de lumière au sol
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.6), new THREE.MeshBasicMaterial({ map: poolTex, color: col, transparent: true, opacity: st.pool * 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      wall.position.set(0, y, 0.02); grp.add(wall);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), new THREE.MeshBasicMaterial({ map: poolTex, color: col, transparent: true, opacity: st.pool, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.03, 1.6); grp.add(pool);
      this.S.add(grp);
      this.fixtures.push({ x: c.x + c.nx * 0.5, y, z: c.z + c.nz * 0.5, col: new THREE.Color(col), torch: st.lamp === 'torch', pool });
    });
    // lumières dynamiques : nombre fixe (pas de recompilation), placées sur les lampes les plus proches du joueur
    const nLights = lvl >= 2 ? 6 : lvl === 1 ? 3 : 0;
    for (let i = 0; i < nLights; i++) { const l = new THREE.PointLight('#ffffff', 0, 13, 2); this.S.add(l); this.lights.push(l); }
    this.lightT = 0;
  }
  placeLights() {
    if (!this.lights.length) return;
    const cp = this.g.camera.position;
    const near = this.fixtures.map(f => ({ f, d: (f.x - cp.x) ** 2 + (f.z - cp.z) ** 2 })).sort((a, b) => a.d - b.d);
    this.lights.forEach((l, i) => {
      const f = near[i]?.f;
      if (!f) { l.intensity = 0; return; }
      l.position.set(f.x, f.y, f.z); l.color.copy(f.col); l.userData.f = f;
      l.userData.base = this.th.night ? 7 : 5;
    });
  }

  // ---------- 6 : ciel animé (nuages, soleil et halo ; étoiles et lune la nuit) ----------
  buildSky(lvl) {
    const th = this.th, st = this.style, cx = this.g.map.size[0] / 2, cz = this.g.map.size[1] / 2;
    this.sky = new THREE.Group(); this.sky.position.set(cx, 0, cz); this.S.add(this.sky);
    const sunDir = new THREE.Vector3(-50, 90, -35).normalize();
    if (!th.night) {
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.softTex, color: th.sun || '#fff4d6', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.85 }));
      halo.position.copy(sunDir.clone().multiplyScalar(320)); halo.scale.setScalar(120); this.sky.add(halo);
      const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.softTex, color: '#ffffff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      core.position.copy(halo.position); core.scale.setScalar(28); this.sky.add(core);
      this.sunHalo = halo;
    } else {
      const N = lvl ? 900 : 400, p = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { const u = Math.random() * Math.PI * 2, v = Math.random() * 0.45 + 0.08; p[i * 3] = Math.cos(u) * Math.cos(v) * 330; p[i * 3 + 1] = Math.sin(v) * 330; p[i * 3 + 2] = Math.sin(u) * Math.cos(v) * 330; }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
      this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
      this.sky.add(this.stars);
      const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.softTex, color: '#dfe6ff', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      moon.position.copy(sunDir.clone().multiplyScalar(320)); moon.scale.setScalar(40); this.sky.add(moon);
    }
    if (st.clouds > 0) {
      const tex = gradTex((g, w) => {
        g.clearRect(0, 0, w, w);
        for (let k = 0; k < 70; k++) { const x = Math.random() * w, y = Math.random() * w, r = 14 + Math.random() * 46; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; for (const [ox, oy] of [[0, 0], [w, 0], [-w, 0], [0, w], [0, -w]]) { g.save(); g.translate(ox, oy); g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.restore(); } }
      }, 512, 512);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3, 3);
      this.cloudTex = tex;
      const cl = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: st.clouds, depthWrite: false, fog: false, color: new THREE.Color(th.sky).lerp(new THREE.Color('#ffffff'), 0.7) }));
      cl.rotation.x = Math.PI / 2; cl.position.y = 70; this.sky.add(cl);
    }
  }

  // ---------- 5 : réglage des particules d'ambiance de la carte ----------
  dustStyle() { const d = this.style.dust; return { ...d, color: d.color || this.th.accent }; }

  // ---------- 3 : impacts de balles ----------
  impact(origin, end, hitPlayer) {
    if (hitPlayer) return;
    const lvl = tier();
    const d = [end[0] - origin[0], end[1] - origin[1], end[2] - origin[2]], len = Math.hypot(...d) || 1;
    const dir = d.map(v => v / len);
    const r = raycastBoxes(origin, dir, len + 0.3, this.g.boxes);
    if (!r.box || Math.abs(r.t - len) > 0.25) return; // la balle s'est arrêtée sur un joueur, pas sur un mur
    const n = end[1] < 0.03 || r.box?.kind === 'floor' ? [0, 1, 0] : boxNormal(end, r.box);
    // étincelles qui rebondissent
    const nSp = lvl ? 7 : 3;
    for (let k = 0; k < nSp; k++) {
      const i = this.sparkI; this.sparkI = (this.sparkI + 1) % this.sparkN;
      this.sparkPos.set([end[0] + n[0] * 0.03, end[1] + n[1] * 0.03, end[2] + n[2] * 0.03], i * 3);
      const s = 2 + Math.random() * 3;
      this.sparkVel.set([(n[0] + (Math.random() - 0.5) * 1.4) * s, (n[1] + Math.random() * 0.9) * s, (n[2] + (Math.random() - 0.5) * 1.4) * s], i * 3);
      this.sparkLife[i] = 0.25 + Math.random() * 0.25;
    }
    // nuage de poussière
    if (lvl) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.softTex, color: this.style.dust.color && !this.style.dust.add ? this.style.dust.color : '#c8c0b0', transparent: true, depthWrite: false, opacity: 0.55 }));
      sp.position.set(end[0] + n[0] * 0.08, end[1] + n[1] * 0.08, end[2] + n[2] * 0.08); sp.scale.setScalar(0.15);
      this.S.add(sp); this.puffs.push({ sp, t: 0, life: 0.6, vel: n.map(v => v * 0.6) });
    }
    // trou de balle (reste 10 s, disparaît en fondu)
    {
      const m = new THREE.Mesh(this.holeGeo, this.holeMat.clone());
      m.position.set(end[0] + n[0] * 0.012, end[1] + n[1] * 0.012, end[2] + n[2] * 0.012);
      m.lookAt(m.position.x + n[0], m.position.y + n[1], m.position.z + n[2]); m.rotateZ(Math.random() * 6.28);
      m.scale.setScalar(0.7 + Math.random() * 0.5);
      this.S.add(m); this.decals.push({ m, t: 0 });
      if (this.decals.length > (lvl ? 90 : 30)) { const o = this.decals.shift(); this.S.remove(o.m); o.m.material.dispose(); }
    }
  }

  // ---------- 4 : douilles éjectées (vue à la première personne) ----------
  casing(def) {
    if (!def || def.type === 'melee') return;
    const kind = def.type === 'shotgun' ? 'shell' : def.type === 'sniper' ? 'big' : def.type === 'pistol' ? 'small' : 'rifle';
    const m = new THREE.Mesh(this.casingGeo[kind], kind === 'shell' ? this.casingMat.red : this.casingMat.brass);
    const vm = this.g.vm;
    m.position.set(vm.position.x + 0.05, vm.position.y + 0.04, vm.position.z - 0.12);
    m.rotation.set(Math.random(), Math.random(), Math.PI / 2);
    this.g.vmScene.add(m);
    this.casings.push({ m, t: 0, v: [1.1 + Math.random() * 0.6, 1.3 + Math.random() * 0.6, 0.25 + Math.random() * 0.3], w: [8 + Math.random() * 8, 5 + Math.random() * 6] });
    if (this.casings.length > 14) { const o = this.casings.shift(); this.g.vmScene.remove(o.m); }
  }

  // ---------- 9 : effets de capacités plus riches ----------
  decorateSmoke(g, sm) {
    if (!tier()) return;
    const puffs = [];
    for (let k = 0; k < 14; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.softTex, color: '#c9cee4', transparent: true, depthWrite: false, opacity: 0 }));
      const a = Math.random() * 6.28, r = Math.random() * sm.r * 0.9;
      sp.position.set(Math.cos(a) * r, (Math.random() - 0.2) * sm.r * 0.7, Math.sin(a) * r);
      sp.scale.setScalar(sm.r * (0.9 + Math.random() * 0.7)); sp.userData = { a, r, sp: (Math.random() - 0.5) * 0.25, ph: Math.random() * 6 };
      g.add(sp); puffs.push(sp);
    }
    g.userData.puffs = puffs;
  }
  decorateFire(g, f) {
    if (!tier()) return;
    const col = f.k === 'shock' ? '#7fe4ff' : f.k === 'frost' ? '#d6f6ff' : '#ffb04a';
    const embers = [];
    for (let k = 0; k < Math.round(f.r * 5); k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.softTex, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      sp.scale.setScalar(0.08 + Math.random() * 0.06); sp.userData = { a: Math.random() * 6.28, r: Math.random() * f.r, y: Math.random() * 2.5, v: 0.6 + Math.random() * 0.9 };
      g.add(sp); embers.push(sp);
    }
    g.userData.embers = embers;
    // une vraie lumière qui vacille (meilleure qualité, 2 à la fois au plus)
    if (tier() >= 2 && (this.fireLights = (this.fireLights || 0) + 1) <= 2) {
      const l = new THREE.PointLight(f.k === 'shock' ? '#3fd0ff' : f.k === 'frost' ? '#9ee7ff' : '#ff6a1f', 3, f.r * 3.5, 2); l.position.y = 0.8; g.add(l); g.userData.light = l;
      g.addEventListener('removed', () => { this.fireLights--; });
    }
  }
  shockwave(p, color = '#ffffff', size = 6) {
    if (!tier()) return;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(p[0], (p[1] || 0) + 0.1, p[2]);
    this.S.add(ring); this.puffs.push({ sp: ring, t: 0, life: 0.55, ring: size });
  }
  trail(p, color = '#ffffff') {
    if (!tier()) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.g.softTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }));
    sp.position.set(p[0], p[1], p[2]); sp.scale.setScalar(0.18);
    this.S.add(sp); this.puffs.push({ sp, t: 0, life: 0.35, vel: [0, 0.1, 0], op: 0.6 });
  }

  // ---------- mise à jour à chaque image ----------
  update(dt, now) {
    this.t += dt;
    // lumières des lampes (et vacillement des torches)
    if ((this.lightT -= dt) <= 0) { this.lightT = 0.5; this.placeLights(); }
    for (const l of this.lights) { const f = l.userData.f; if (!f) continue; l.intensity = l.userData.base * (f.torch ? 0.85 + Math.sin(now * 13 + f.x) * 0.1 + Math.sin(now * 7.3 + f.z) * 0.08 : 1); }
    for (const fl of this.flick) { const k = 1 + Math.sin(now * 14 + fl.ph) * 0.12 + Math.sin(now * 23 + fl.ph * 2) * 0.06; fl.sp.scale.set(0.35 * k, 0.55 * (2 - k), 1); }
    // ciel
    if (this.cloudTex) { this.cloudTex.offset.x += dt * 0.004; this.cloudTex.offset.y += dt * 0.0015; }
    if (this.stars) this.stars.material.opacity = 0.75 + Math.sin(now * 0.7) * 0.1;
    if (this.sky) { this.sky.position.x = this.g.camera.position.x; this.sky.position.z = this.g.camera.position.z; }
    // étincelles
    let alive = false;
    for (let i = 0; i < this.sparkN; i++) {
      if (this.sparkLife[i] <= 0) continue;
      alive = true; this.sparkLife[i] -= dt;
      if (this.sparkLife[i] <= 0) { this.sparkPos[i * 3 + 1] = -999; continue; }
      this.sparkVel[i * 3 + 1] -= 9.8 * dt;
      for (let a = 0; a < 3; a++) this.sparkPos[i * 3 + a] += this.sparkVel[i * 3 + a] * dt;
      if (this.sparkPos[i * 3 + 1] < 0.02) { this.sparkPos[i * 3 + 1] = 0.02; this.sparkVel[i * 3 + 1] *= -0.4; }
    }
    if (alive || this.sparkWasAlive) this.sparkPts.geometry.attributes.position.needsUpdate = true;
    this.sparkWasAlive = alive;
    // poussière d'impact, ondes de choc, traînées
    for (const p of this.puffs) {
      p.t += dt; const k = p.t / p.life;
      if (p.ring) { p.sp.scale.setScalar(1 + k * p.ring); p.sp.material.opacity = 0.8 * (1 - k); continue; }
      p.sp.scale.setScalar(p.sp.scale.x + dt * 0.9); p.sp.material.opacity = (p.op ?? 0.55) * (1 - k);
      if (p.vel) p.sp.position.add(new THREE.Vector3(...p.vel).multiplyScalar(dt));
    }
    this.puffs = this.puffs.filter(p => { if (p.t < p.life) return true; this.S.remove(p.sp); p.sp.material.dispose(); if (p.ring) p.sp.geometry.dispose(); return false; });
    // trous de balle : fondu sur les 2 dernières secondes
    for (const d of this.decals) { d.t += dt; if (d.t > 8) d.m.material.opacity = Math.max(0, 1 - (d.t - 8) / 2); }
    this.decals = this.decals.filter(d => { if (d.t < 10) return true; this.S.remove(d.m); d.m.material.dispose(); return false; });
    // douilles
    for (const c of this.casings) {
      c.t += dt; c.v[1] -= 9 * dt;
      c.m.position.x += c.v[0] * dt * 0.25; c.m.position.y += c.v[1] * dt * 0.25; c.m.position.z += c.v[2] * dt * 0.25;
      c.m.rotation.x += c.w[0] * dt; c.m.rotation.y += c.w[1] * dt;
    }
    this.casings = this.casings.filter(c => { if (c.t < 0.7) return true; this.g.vmScene.remove(c.m); return false; });
    // fumées qui tourbillonnent, braises qui montent
    for (const g of this.g.smokeMeshes?.values() || []) {
      const ps = g.userData.puffs; if (!ps) continue;
      const op = g.userData.mat?.opacity ?? 0.8;
      for (const s of ps) { const u = s.userData; u.a += u.sp * dt; s.position.x = Math.cos(u.a) * u.r; s.position.z = Math.sin(u.a) * u.r; s.position.y += Math.sin(now * 0.6 + u.ph) * 0.05 * dt; s.material.opacity = op * 0.55; s.material.rotation += u.sp * dt; }
    }
    for (const g of this.g.fireMeshes?.values() || []) {
      const em = g.userData.embers;
      if (em) for (const s of em) { const u = s.userData; u.y += u.v * dt; if (u.y > 2.6) { u.y = 0; u.a = Math.random() * 6.28; } s.position.set(Math.cos(u.a) * u.r + Math.sin(now * 2 + u.a) * 0.1, u.y, Math.sin(u.a) * u.r); s.material.opacity = 1 - u.y / 2.6; }
      if (g.userData.light) g.userData.light.intensity = 2.6 + Math.sin(now * 17) * 0.6 + Math.sin(now * 29) * 0.4;
    }
  }
}
