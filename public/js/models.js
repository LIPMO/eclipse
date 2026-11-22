// Modèles procéduraux : textures, armes (avec skins), personnages.
import * as THREE from 'three';
import { SKINS, AGENTS } from '/shared/data.js';

// ---------- utilitaires canvas ----------
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);
function noise(g, s, alpha, n = 3000, light = true) {
  for (let i = 0; i < n; i++) {
    const v = light ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * alpha})`;
    g.fillRect(Math.random() * s, Math.random() * s, rnd(1, 3), rnd(1, 3));
  }
}
function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return '#' + c.getHexString();
}

// ---------- textures d'environnement ----------
const texCache = {};
export function envTexture(kind, accent = '#00e5ff') {
  const key = kind + accent;
  if (texCache[key]) return texCache[key];
  let t;
  switch (kind) {
    case 'sand': t = canvasTex(256, (g, s) => {
      g.fillStyle = '#c9a476'; g.fillRect(0, 0, s, s);
      noise(g, s, 0.08, 5000); noise(g, s, 0.08, 3000, false);
      g.strokeStyle = 'rgba(90,60,30,.35)'; g.lineWidth = 3;
      for (let y = 0; y < s; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
        const off = (y / 64) % 2 ? 64 : 0;
        for (let x = off; x < s; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } }
      g.fillStyle = 'rgba(255,240,210,.12)'; g.fillRect(0, 0, s, 8);
    }); break;
    case 'sandfloor': t = canvasTex(256, (g, s) => {
      g.fillStyle = '#d8b585'; g.fillRect(0, 0, s, s);
      noise(g, s, 0.1, 9000); noise(g, s, 0.07, 6000, false);
      g.strokeStyle = 'rgba(120,85,45,.25)'; g.lineWidth = 2;
      for (let i = 0; i <= s; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
    }); break;
    case 'neon': t = canvasTex(256, (g, s) => {
      g.fillStyle = '#1a1838'; g.fillRect(0, 0, s, s);
      noise(g, s, 0.05, 2000);
      g.strokeStyle = '#0c0b1f'; g.lineWidth = 4;
      for (let i = 0; i <= s; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke(); }
      g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.05)';
      for (let i = 0; i < 12; i++) g.fillRect(rnd(0, s), rnd(0, s), rnd(10, 40), 4);
    }); break;
    case 'neonEmissive': t = canvasTex(256, (g, s) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
      g.fillStyle = accent; g.fillRect(0, s - 10, s, 3);
      g.fillStyle = '#ff3fa4'; g.fillRect(0, 20, s, 2);
      for (let i = 0; i < 4; i++) { g.fillStyle = Math.random() < 0.5 ? accent : '#ff3fa4'; g.fillRect(rnd(0, s), rnd(40, s - 40), rnd(20, 60), 3); }
    }); break;
    case 'neonfloor': t = canvasTex(256, (g, s) => {
      g.fillStyle = '#15132b'; g.fillRect(0, 0, s, s);
      noise(g, s, 0.05, 4000);
      g.strokeStyle = 'rgba(0,229,255,.35)'; g.lineWidth = 2;
      for (let i = 0; i <= s; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
    }); break;
    case 'ice': t = canvasTex(256, (g, s) => {
      const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#e9f5ff'); gr.addColorStop(1, '#b7d6ee');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      noise(g, s, 0.12, 3000);
      g.strokeStyle = 'rgba(80,130,180,.35)'; g.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) { g.beginPath(); let x = rnd(0, s), y = rnd(0, s); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += rnd(-40, 40); y += rnd(-40, 40); g.lineTo(x, y); } g.stroke(); }
      g.strokeStyle = 'rgba(60,100,150,.4)'; g.lineWidth = 3;
      for (let y = 0; y <= s; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    }); break;
    case 'snow': t = canvasTex(256, (g, s) => {
      g.fillStyle = '#eef6fc'; g.fillRect(0, 0, s, s);
      noise(g, s, 0.08, 9000, false); noise(g, s, 0.3, 3000);
    }); break;
    case 'temple': t = canvasTex(256, (g, s) => {
      g.fillStyle = '#7c8270'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 42) for (let x = ((y / 42) % 2) * 40; x < s + 80; x += 80) {
        g.fillStyle = shade('#868b77', rnd(0.8, 1.1)); g.fillRect(x - 78, y + 2, 76, 38);
      }
      noise(g, s, 0.1, 5000, false);
      for (let i = 0; i < 25; i++) { g.fillStyle = `rgba(70,120,50,${rnd(0.2, 0.5)})`; g.beginPath(); g.arc(rnd(0, s), rnd(0, s), rnd(4, 18), 0, 7); g.fill(); }
    }); break;
    case 'moss': t = canvasTex(256, (g, s) => {
      g.fillStyle = '#6f7a5a'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 64) for (let x = 0; x < s; x += 64) { g.fillStyle = shade('#7b8466', rnd(0.85, 1.1)); g.fillRect(x + 2, y + 2, 60, 60); }
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,110,40,${rnd(0.2, 0.5)})`; g.beginPath(); g.arc(rnd(0, s), rnd(0, s), rnd(3, 14), 0, 7); g.fill(); }
      noise(g, s, 0.08, 4000, false);
    }); break;
    case 'crate': case 'neoncrate': case 'icecrate': case 'stonecrate': {
      const base = { crate: '#8a6238', neoncrate: '#26244a', icecrate: '#9cc6e3', stonecrate: '#6c705e' }[kind];
      t = canvasTex(128, (g, s) => {
        g.fillStyle = base; g.fillRect(0, 0, s, s);
        noise(g, s, 0.1, 1500, false);
        g.strokeStyle = shade(base, 0.6); g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8);
        g.lineWidth = 6; g.beginPath(); g.moveTo(8, 8); g.lineTo(s - 8, s - 8); g.stroke();
        if (kind === 'neoncrate') { g.strokeStyle = accent; g.lineWidth = 2; g.strokeRect(10, 10, s - 20, s - 20); }
      });
      break;
    }
  }
  texCache[key] = t;
  return t;
}

// ---------- skins d'armes ----------
const patternCache = {};
function patternTex(skin, emissive) {
  const key = skin.id + (emissive ? 'e' : '');
  if (patternCache[key]) return patternCache[key];
  const t = canvasTex(256, (g, s) => {
    g.fillStyle = emissive ? '#000' : skin.body; g.fillRect(0, 0, s, s);
    const A = skin.accent;
    switch (skin.pattern) {
      case 'carbon':
        if (emissive) break;
        for (let y = 0; y < s; y += 16) for (let x = 0; x < s; x += 16) { g.fillStyle = ((x + y) / 16) % 2 ? '#24262c' : '#121317'; g.fillRect(x, y, 16, 8); g.fillStyle = ((x + y) / 16) % 2 ? '#121317' : '#24262c'; g.fillRect(x, y + 8, 16, 8); }
        break;
      case 'camo':
        if (emissive) break;
        for (let i = 0; i < 40; i++) { g.fillStyle = [A, shade(skin.body, 0.8), '#8c7a55'][i % 3]; g.beginPath(); g.ellipse(rnd(0, s), rnd(0, s), rnd(10, 30), rnd(6, 18), rnd(0, 3), 0, 7); g.fill(); }
        break;
      case 'petals':
        if (emissive) break;
        for (let i = 0; i < 30; i++) { g.save(); g.translate(rnd(0, s), rnd(0, s)); g.rotate(rnd(0, 6)); g.fillStyle = i % 2 ? A : '#fff'; g.beginPath(); g.ellipse(0, 0, 9, 4, 0, 0, 7); g.fill(); g.restore(); }
        break;
      case 'lines':
        g.strokeStyle = A; g.lineWidth = 3; g.shadowColor = A; g.shadowBlur = emissive ? 0 : 6;
        for (let i = 0; i < 9; i++) { g.beginPath(); let x = 0, y = rnd(0, s); g.moveTo(x, y); while (x < s) { x += rnd(20, 60); if (Math.random() < 0.5) y += rnd(-30, 30); g.lineTo(x, y); } g.stroke(); }
        break;
      case 'cracks':
        g.strokeStyle = A; g.lineWidth = 3;
        for (let i = 0; i < 14; i++) { g.beginPath(); let x = rnd(0, s), y = rnd(0, s); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rnd(-30, 30); y += rnd(-30, 30); g.lineTo(x, y); } g.stroke(); }
        break;
      case 'waves':
        g.strokeStyle = A; g.lineWidth = 2.5;
        for (let y = 10; y < s; y += 22) { g.beginPath(); for (let x = 0; x <= s; x += 4) g.lineTo(x, y + Math.sin(x / 18 + y) * 6); g.stroke(); }
        break;
      case 'filigree':
        g.strokeStyle = emissive ? '#000' : shade(skin.body, 0.65); g.lineWidth = 2;
        for (let i = 0; i < 16; i++) { g.beginPath(); g.arc(rnd(0, s), rnd(0, s), rnd(8, 24), rnd(0, 3), rnd(3, 6)); g.stroke(); }
        break;
      case 'stars':
        for (let i = 0; i < 120; i++) { g.fillStyle = Math.random() < 0.3 ? A : '#ffffff'; const r = rnd(0.5, 2.2); g.beginPath(); g.arc(rnd(0, s), rnd(0, s), r, 0, 7); g.fill(); }
        if (!emissive) { const gr = g.createRadialGradient(s * 0.6, s * 0.4, 0, s * 0.6, s * 0.4, s * 0.5); gr.addColorStop(0, 'rgba(162,89,255,.35)'); gr.addColorStop(1, 'transparent'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
        break;
      default:
        if (!emissive) noise(g, s, 0.05, 1500);
    }
  });
  patternCache[key] = t;
  return t;
}

export const animatedMaterials = new Set();
export function skinMaterials(skinId) {
  const skin = SKINS.find(s => s.id === skinId) || SKINS[0];
  const body = new THREE.MeshStandardMaterial({ color: skin.pattern ? '#ffffff' : skin.body, map: skin.pattern ? patternTex(skin, false) : null, metalness: skin.metal ?? 0.5, roughness: skin.rough ?? 0.5 });
  if (skin.glow && skin.pattern && !['carbon', 'camo', 'petals'].includes(skin.pattern)) {
    body.emissiveMap = patternTex(skin, true); body.emissive = new THREE.Color(skin.accent); body.emissiveIntensity = 0.8;
  }
  const accent = new THREE.MeshStandardMaterial({ color: skin.accent, metalness: 0.6, roughness: 0.35, emissive: skin.glow ? new THREE.Color(skin.accent) : new THREE.Color(0), emissiveIntensity: skin.glow ? 1.1 : 0 });
  const dark = new THREE.MeshStandardMaterial({ color: '#16181d', metalness: 0.3, roughness: 0.7 });
  if (skin.animated === 'hue') { body.userData.hue = true; accent.userData.hue = true; animatedMaterials.add(body); animatedMaterials.add(accent); }
  return { body, accent, dark };
}
export function animateSkins(t) {
  for (const m of animatedMaterials) {
    const c = new THREE.Color().setHSL((t * 0.15) % 1, 0.9, 0.6);
    if (m.emissive) m.emissive.copy(c);
    if (m.map) m.color.setHSL((t * 0.15 + 0.5) % 1, 0.4, 0.85);
    else m.color.copy(c);
  }
}

// ---------- armes ----------
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); return m;
}
function cyl(r, len, mat, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.x = Math.PI / 2; m.position.set(x, y, z); return m;
}

// L'arme pointe vers -Z. Origine ≈ poignée.
export function buildWeapon(model, skinId) {
  const g = new THREE.Group();
  const { body, accent, dark } = skinMaterials(skinId);
  const add = (...ms) => ms.forEach(m => { m.castShadow = true; g.add(m); });
  let muzzle = new THREE.Vector3(0, 0.05, -0.4);
  switch (model) {
    case 'knife': {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(0.3, 0.005); shape.quadraticCurveTo(0.34, 0.02, 0.36, 0.045); shape.lineTo(0.04, 0.05); shape.lineTo(0, 0.04); shape.lineTo(0, 0);
      const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.008, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 1 }), body);
      blade.rotation.y = Math.PI / 2; blade.position.set(-0.004, 0.0, -0.02);
      add(blade, box(0.05, 0.075, 0.02, accent, 0, 0.025, -0.01), cyl(0.018, 0.13, dark, 0, 0.022, 0.06), box(0.03, 0.035, 0.012, accent, 0, 0.022, 0.13));
      muzzle.set(0, 0.03, -0.35);
      break;
    }
    case 'pistol':
      add(box(0.05, 0.06, 0.26, body, 0, 0.06, -0.08), box(0.045, 0.04, 0.22, dark, 0, 0.015, -0.07),
        box(0.042, 0.13, 0.065, dark, 0, -0.05, 0.02), box(0.052, 0.012, 0.2, accent, 0, 0.095, -0.08), box(0.02, 0.02, 0.02, accent, 0, 0.1, 0.03));
      g.children[2].rotation.x = 0.22; muzzle.set(0, 0.06, -0.22);
      break;
    case 'heavypistol':
      add(box(0.06, 0.075, 0.3, body, 0, 0.065, -0.1), cyl(0.022, 0.08, accent, 0, 0.065, -0.29), box(0.05, 0.045, 0.24, dark, 0, 0.01, -0.08),
        box(0.05, 0.14, 0.075, dark, 0, -0.06, 0.03), box(0.064, 0.012, 0.18, accent, 0, 0.108, -0.1));
      g.children[3].rotation.x = 0.2; muzzle.set(0, 0.065, -0.34);
      break;
    case 'smg':
      add(box(0.07, 0.1, 0.38, body, 0, 0.04, -0.12), cyl(0.018, 0.14, dark, 0, 0.05, -0.37), box(0.045, 0.2, 0.05, dark, 0, -0.1, -0.12),
        box(0.045, 0.12, 0.06, dark, 0, -0.07, 0.04), box(0.03, 0.05, 0.22, body, 0, 0.03, 0.18), box(0.074, 0.015, 0.3, accent, 0, 0.098, -0.12), box(0.02, 0.04, 0.03, accent, 0, 0.12, -0.02));
      g.children[3].rotation.x = 0.2; muzzle.set(0, 0.05, -0.45);
      break;
    case 'shotgun':
      add(box(0.075, 0.09, 0.55, body, 0, 0.05, -0.2), cyl(0.024, 0.32, dark, 0, 0.075, -0.6), cyl(0.026, 0.28, accent, 0, 0.02, -0.5),
        box(0.045, 0.12, 0.06, dark, 0, -0.06, 0.05), box(0.06, 0.1, 0.28, body, 0, 0.02, 0.2), box(0.078, 0.012, 0.4, accent, 0, 0.1, -0.2));
      g.children[3].rotation.x = 0.25; muzzle.set(0, 0.075, -0.78);
      break;
    case 'dmr':
      add(box(0.07, 0.1, 0.5, body, 0, 0.05, -0.15), cyl(0.017, 0.38, dark, 0, 0.065, -0.58), box(0.06, 0.07, 0.26, accent, 0, 0.04, -0.42),
        box(0.045, 0.15, 0.06, dark, 0, -0.08, -0.1), box(0.045, 0.12, 0.06, dark, 0, -0.07, 0.06), box(0.05, 0.09, 0.3, body, 0, 0.03, 0.26),
        cyl(0.028, 0.18, dark, 0, 0.14, -0.12), box(0.074, 0.012, 0.4, accent, 0, 0.102, -0.1));
      g.children[4].rotation.x = 0.2; muzzle.set(0, 0.065, -0.78);
      break;
    case 'rifle':
      add(box(0.075, 0.11, 0.48, body, 0, 0.05, -0.14), cyl(0.018, 0.34, dark, 0, 0.07, -0.56), box(0.07, 0.085, 0.24, accent, 0, 0.05, -0.42),
        box(0.05, 0.19, 0.075, dark, 0, -0.1, -0.12), box(0.045, 0.12, 0.06, dark, 0, -0.07, 0.06), box(0.055, 0.1, 0.3, body, 0, 0.03, 0.26),
        box(0.03, 0.05, 0.08, dark, 0, 0.13, -0.1), box(0.079, 0.014, 0.36, accent, 0, 0.11, -0.12), box(0.012, 0.03, 0.012, accent, 0, 0.1, -0.68));
      g.children[3].rotation.x = -0.18; g.children[4].rotation.x = 0.2; muzzle.set(0, 0.07, -0.74);
      break;
    case 'sniper':
      add(box(0.08, 0.11, 0.55, body, 0, 0.05, -0.12), cyl(0.02, 0.6, dark, 0, 0.065, -0.68), cyl(0.032, 0.12, accent, 0, 0.065, -0.96),
        box(0.045, 0.12, 0.06, dark, 0, -0.07, 0.06), box(0.06, 0.12, 0.36, body, 0, 0.02, 0.3), cyl(0.04, 0.32, dark, 0, 0.16, -0.12, 14),
        cyl(0.046, 0.04, accent, 0, 0.16, -0.29, 14), cyl(0.046, 0.04, accent, 0, 0.16, 0.05, 14), box(0.05, 0.11, 0.06, dark, 0, -0.08, -0.14), box(0.084, 0.014, 0.4, accent, 0, 0.108, -0.1));
      g.children[3].rotation.x = 0.2; muzzle.set(0, 0.065, -1.02);
      break;
  }
  g.userData.muzzle = muzzle;
  g.userData.materials = { body, accent, dark };
  return g;
}

// ---------- personnages ----------
export function buildCharacter(agentId, teamColor) {
  const agent = AGENTS[agentId] || AGENTS.ignis;
  const col = new THREE.Color(agent.color);
  const mats = {
    suit: new THREE.MeshStandardMaterial({ color: '#4b5366', roughness: 0.7, metalness: 0.15 }),
    armor: new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.85), roughness: 0.45, metalness: 0.35 }),
    glow: new THREE.MeshStandardMaterial({ color: agent.color, emissive: agent.color, emissiveIntensity: 1.4 }),
    skin: new THREE.MeshStandardMaterial({ color: '#59607a', roughness: 0.55 }),
    team: new THREE.MeshStandardMaterial({ color: teamColor, emissive: teamColor, emissiveIntensity: 0.9 }),
  };
  const all = Object.values(mats);
  const root = new THREE.Group();
  const lower = new THREE.Group(); root.add(lower);
  const upper = new THREE.Group(); upper.position.y = 0.9; root.add(upper);
  const mesh = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  // jambes (pivot à la hanche)
  const legs = [-0.13, 0.13].map(x => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.88, 0); lower.add(pivot);
    mesh(new THREE.BoxGeometry(0.17, 0.48, 0.2), mats.suit, 0, -0.24, 0, pivot);
    mesh(new THREE.BoxGeometry(0.15, 0.42, 0.17), mats.suit, 0, -0.66, 0, pivot);
    mesh(new THREE.BoxGeometry(0.18, 0.12, 0.28), mats.armor, 0, -0.84, -0.04, pivot);
    mesh(new THREE.BoxGeometry(0.18, 0.14, 0.05), mats.armor, 0, -0.45, -0.11, pivot);
    return pivot;
  });
  // torse
  mesh(new THREE.BoxGeometry(0.44, 0.18, 0.26), mats.suit, 0, 0.05, 0, upper);
  const chest = mesh(new THREE.BoxGeometry(0.5, 0.36, 0.3), mats.armor, 0, 0.32, 0, upper);
  mesh(new THREE.BoxGeometry(0.3, 0.04, 0.02), mats.team, 0, 0.36, -0.16, upper);
  mesh(new THREE.BoxGeometry(0.34, 0.34, 0.14), mats.suit, 0, 0.3, 0.2, upper); // sac
  mesh(new THREE.BoxGeometry(0.06, 0.2, 0.02), mats.glow, 0.1, 0.3, 0.275, upper);
  // tête
  const head = new THREE.Group(); head.position.set(0, 0.68, 0); upper.add(head);
  mesh(new THREE.SphereGeometry(0.16, 16, 12), mats.skin, 0, 0, 0, head);
  mesh(new THREE.BoxGeometry(0.26, 0.07, 0.08), mats.glow, 0, 0.01, -0.13, head);
  // bras
  const arms = [-0.31, 0.31].map(x => {
    const pivot = new THREE.Group(); pivot.position.set(x, 0.46, 0); upper.add(pivot);
    mesh(new THREE.BoxGeometry(0.14, 0.32, 0.15), mats.armor, 0, -0.14, 0, pivot);
    mesh(new THREE.BoxGeometry(0.12, 0.3, 0.13), mats.suit, 0, -0.42, 0, pivot);
    return pivot;
  });
  arms[0].rotation.x = -1.2; arms[1].rotation.x = -1.35; arms[0].rotation.z = -0.35; arms[1].rotation.z = 0.15;
  // accessoire signature
  switch (agentId) {
    case 'ignis': for (let i = 0; i < 4; i++) { const c = mesh(new THREE.ConeGeometry(0.045, 0.2, 6), mats.glow, -0.09 + i * 0.06, 0.18, 0.02 + (i % 2) * 0.04, head); c.rotation.x = 0.4; } break;
    case 'nimbus': { const r = mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 24), mats.glow, 0, 0.25, 0, head); r.rotation.x = Math.PI / 2; break; }
    case 'oracle': mesh(new THREE.SphereGeometry(0.07, 12, 10), mats.glow, 0, 0.03, -0.14, head); mesh(new THREE.BoxGeometry(0.36, 0.03, 0.03), mats.armor, 0, 0.1, -0.05, head); break;
    case 'bastion': mesh(new THREE.BoxGeometry(0.2, 0.1, 0.24), mats.armor, -0.34, 0.5, 0, upper); mesh(new THREE.BoxGeometry(0.2, 0.1, 0.24), mats.armor, 0.34, 0.5, 0, upper); mesh(new THREE.BoxGeometry(0.34, 0.08, 0.04), mats.glow, 0, 0.18, -0.165, upper); break;
    case 'spectre': { const hood = mesh(new THREE.ConeGeometry(0.22, 0.42, 10, 1, true), mats.armor, 0, 0.05, 0.03, head); hood.material = hood.material.clone(); hood.material.side = THREE.DoubleSide; all.push(hood.material); break; }
    case 'volta': [-0.1, 0.1].forEach(x => { mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.26), mats.suit, x, 0.24, 0.05, head); mesh(new THREE.SphereGeometry(0.03, 8, 6), mats.glow, x, 0.38, 0.05, head); }); break;
  }
  // arme tenue
  const hand = new THREE.Group(); hand.position.set(0.12, 0.3, -0.42); upper.add(hand);
  // silhouette rayons X (révélation)
  const xmat = new THREE.MeshBasicMaterial({ color: '#ff3355', transparent: true, opacity: 0.55, depthTest: false });
  const xray = new THREE.Group();
  const xb = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 8), xmat); xb.position.y = 0.85; xray.add(xb);
  const xh = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), xmat); xh.position.y = 1.62; xray.add(xh);
  xray.renderOrder = 999; xb.renderOrder = 999; xh.renderOrder = 999;
  xray.visible = false;
  root.add(xray);
  return { root, upper, lower, legs, arms, head, hand, chest, mats: all, xray, xmat, teamMat: mats.team, weapon: null, weaponId: null };
}

export function setCharacterOpacity(ch, op) {
  for (const m of ch.mats) {
    m.transparent = op < 1; m.opacity = op; m.depthWrite = op >= 1;
  }
  if (ch.weapon) ch.weapon.traverse(o => { if (o.material) { o.material.transparent = op < 1; o.material.opacity = op; } });
}

// Portrait d'agent (pour HUD et menus)
export function agentIconHTML(agentId, cls = '') {
  const a = AGENTS[agentId] || AGENTS.ignis;
  return `<div class="agent-icon ${cls}" style="--c:${a.color}">${a.name[0]}</div>`;
}

// Mini-carte : rendu de la grille dans un canvas
export function drawMapPreview(canvas, map, opts = {}) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const s = Math.min(W / map.w, H / map.h);
  const ox = (W - map.w * s) / 2, oy = (H - map.h * s) / 2;
  g.clearRect(0, 0, W, H);
  const colors = { '.': '#3b4256', c: '#5b5240', C: '#6d6044', A: '#5a3a52', B: '#3a4a62', T: '#1f4d47', D: '#4d2232' };
  for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) {
    const c = map.grid[j][i];
    const col = colors[c];
    if (!col) continue;
    g.fillStyle = col;
    g.fillRect(ox + i * s, oy + j * s, s + 0.5, s + 0.5);
  }
  if (opts.labels !== false) {
    g.font = `bold ${Math.max(10, s * 1.6)}px Chakra Petch, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const k of ['A', 'B']) {
      if (!map.sites[k].center) continue;
      const [x, z] = map.sites[k].center;
      g.fillStyle = '#ffffffcc';
      g.fillText(k, ox + (x / 4) * s, oy + (z / 4) * s);
    }
  }
  return { s, ox, oy };
}
