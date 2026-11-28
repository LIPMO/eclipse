// Modèles procéduraux : textures, armes (avec skins), personnages.
import * as THREE from 'three';
import { SKINS, AGENTS, OUTFITS } from '/shared/data.js';

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
// textures des cartes en haute définition (1.34) : dessinées au double de la taille, puis une couche de détail fin
// (grain, usure, rayures) ; désactivé en « PC faible »
let texHD = true;
export function setTextureQuality(hd) { if (texHD !== !!hd) { texHD = !!hd; for (const k of Object.keys(texCache)) delete texCache[k]; } }
function canvasTexHD(size, draw, repeat = 1) {
  if (!texHD) return canvasTex(size, draw, repeat);
  const k = 2, S = size * k;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.save(); g.scale(k, k); draw(g, size); g.restore();
  // grain fin
  for (let i = 0; i < S * S / 60; i++) { const v = Math.random() < 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.05})`; g.fillRect(Math.random() * S, Math.random() * S, 1, 1); }
  // petites rayures et taches d'usure
  g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`; const x = Math.random() * S, y = Math.random() * S, a = Math.random() * 6.28, l = 6 + Math.random() * 26; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  for (let i = 0; i < 14; i++) { const x = Math.random() * S, y = Math.random() * S, r = 8 + Math.random() * 30; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${0.05 + Math.random() * 0.06})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
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
// carte de normales calculée à partir d'une texture dessinée (relief des briques, dalles, planches…)
const normCache = new Map();
export function normalMapFor(tex, strength = 2.5) {
  const img = tex?.image; if (!img || !img.getContext) return null;
  const key = tex.uuid + strength;
  if (normCache.has(key)) return normCache.get(key);
  const s = img.width, src = img.getContext('2d').getImageData(0, 0, s, img.height).data, h = img.height;
  const lum = new Float32Array(s * h);
  for (let i = 0; i < s * h; i++) lum[i] = (src[i * 4] * 0.299 + src[i * 4 + 1] * 0.587 + src[i * 4 + 2] * 0.114) / 255;
  const c = document.createElement('canvas'); c.width = s; c.height = h;
  const g = c.getContext('2d'), out = g.createImageData(s, h), d = out.data;
  const L = (x, y) => lum[((y + h) % h) * s + ((x + s) % s)];
  for (let y = 0; y < h; y++) for (let x = 0; x < s; x++) {
    // filtre de Sobel (bords répétés pour une texture sans couture)
    const dx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x - 1, y) + L(x - 1, y + 1));
    const dy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x, y - 1) + L(x + 1, y - 1));
    let nx = -dx * strength, ny = dy * strength, nz = 1;
    const n = Math.hypot(nx, ny, nz); nx /= n; ny /= n; nz /= n;
    const i = (y * s + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.copy(tex.repeat); t.anisotropy = 4;
  normCache.set(key, t);
  return t;
}
export function envTexture(kind, accent = '#00e5ff') {
  const key = kind + accent;
  if (texCache[key]) return texCache[key];
  let t;
  switch (kind) {
    case 'sand': t = canvasTexHD(256, (g, s) => {
      g.fillStyle = '#c9a476'; g.fillRect(0, 0, s, s);
      noise(g, s, 0.08, 5000); noise(g, s, 0.08, 3000, false);
      g.strokeStyle = 'rgba(90,60,30,.35)'; g.lineWidth = 3;
      for (let y = 0; y < s; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
        const off = (y / 64) % 2 ? 64 : 0;
        for (let x = off; x < s; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } }
      g.fillStyle = 'rgba(255,240,210,.12)'; g.fillRect(0, 0, s, 8);
    }); break;
    case 'sandfloor': t = canvasTexHD(256, (g, s) => {
      g.fillStyle = '#d8b585'; g.fillRect(0, 0, s, s);
      noise(g, s, 0.1, 9000); noise(g, s, 0.07, 6000, false);
      g.strokeStyle = 'rgba(120,85,45,.25)'; g.lineWidth = 2;
      for (let i = 0; i <= s; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
    }); break;
    case 'neon': t = canvasTexHD(256, (g, s) => {
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
    case 'neonfloor': t = canvasTexHD(256, (g, s) => {
      g.fillStyle = '#15132b'; g.fillRect(0, 0, s, s);
      noise(g, s, 0.05, 4000);
      g.strokeStyle = 'rgba(0,229,255,.35)'; g.lineWidth = 2;
      for (let i = 0; i <= s; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
    }); break;
    case 'ice': t = canvasTexHD(256, (g, s) => {
      const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, '#e9f5ff'); gr.addColorStop(1, '#b7d6ee');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
      noise(g, s, 0.12, 3000);
      g.strokeStyle = 'rgba(80,130,180,.35)'; g.lineWidth = 1.5;
      for (let i = 0; i < 10; i++) { g.beginPath(); let x = rnd(0, s), y = rnd(0, s); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += rnd(-40, 40); y += rnd(-40, 40); g.lineTo(x, y); } g.stroke(); }
      g.strokeStyle = 'rgba(60,100,150,.4)'; g.lineWidth = 3;
      for (let y = 0; y <= s; y += 128) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    }); break;
    case 'snow': t = canvasTexHD(256, (g, s) => {
      g.fillStyle = '#eef6fc'; g.fillRect(0, 0, s, s);
      noise(g, s, 0.08, 9000, false); noise(g, s, 0.3, 3000);
    }); break;
    case 'temple': t = canvasTexHD(256, (g, s) => {
      g.fillStyle = '#7c8270'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 42) for (let x = ((y / 42) % 2) * 40; x < s + 80; x += 80) {
        g.fillStyle = shade('#868b77', rnd(0.8, 1.1)); g.fillRect(x - 78, y + 2, 76, 38);
      }
      noise(g, s, 0.1, 5000, false);
      for (let i = 0; i < 25; i++) { g.fillStyle = `rgba(70,120,50,${rnd(0.2, 0.5)})`; g.beginPath(); g.arc(rnd(0, s), rnd(0, s), rnd(4, 18), 0, 7); g.fill(); }
    }); break;
    case 'moss': t = canvasTexHD(256, (g, s) => {
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
      // ---- motifs ajoutés en 1.12 ----
      case 'digital': { // camouflage numérique (pixels)
        if (emissive) break;
        const cols = [A, skin.alt || shade(skin.body, 1.3), shade(skin.body, 0.75)];
        for (let i = 0; i < 26; i++) { const cx = rnd(0, s), cy = rnd(0, s), n = 3 + (Math.random() * 6 | 0); g.fillStyle = cols[i % 3]; for (let k = 0; k < n * 3; k++) g.fillRect(Math.floor((cx + rnd(-n, n) * 8) / 8) * 8, Math.floor((cy + rnd(-n, n) * 8) / 8) * 8, 8, 8); }
        break;
      }
      case 'checker':
        if (emissive) break;
        g.fillStyle = A;
        for (let y = 0; y < s; y += 32) for (let x = 0; x < s; x += 32) if (((x + y) / 32) % 2) g.fillRect(x, y, 32, 32);
        break;
      case 'dots':
        if (emissive) break;
        g.fillStyle = A;
        for (let y = 0; y < s + 16; y += 32) for (let x = 0; x < s + 16; x += 32) { g.beginPath(); g.arc(x + ((y / 32) % 2 ? 16 : 0), y, 8, 0, 7); g.fill(); }
        break;
      case 'fade': { // dégradé en diagonale de la couleur principale vers l'accent
        if (emissive) break;
        const gr = g.createLinearGradient(0, s, s, 0); gr.addColorStop(0, skin.body); gr.addColorStop(1, A);
        g.fillStyle = gr; g.fillRect(0, 0, s, s); noise(g, s, 0.04, 800);
        break;
      }
      case 'topo': // courbes de niveau
        g.strokeStyle = A; g.lineWidth = 1.6;
        for (let c = 0; c < 4; c++) { const cx = rnd(0, s), cy = rnd(0, s); for (let r = 10; r < 120; r += 12) { g.beginPath(); for (let a = 0; a <= 6.3; a += 0.2) { const rr = r + Math.sin(a * 3 + c) * r * 0.18; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8); } g.stroke(); } }
        break;
      case 'tiger':
        if (emissive) break;
        g.fillStyle = A;
        for (let i = 0; i < 12; i++) { const y = rnd(-20, s), w = rnd(6, 14); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + rnd(-25, 25), s * 0.6, y + rnd(-25, 25), rnd(s * 0.4, s), y + rnd(-15, 15)); g.bezierCurveTo(s * 0.6, y + w + rnd(-10, 10), s * 0.3, y + w, 0, y + w); g.fill(); }
        break;
      case 'splatter': {
        if (emissive) break;
        const cols = [A, skin.alt || '#ffffff', skin.alt2 || shade(A, 0.6)];
        for (let i = 0; i < 22; i++) { const x = rnd(0, s), y = rnd(0, s), r = rnd(5, 18); g.fillStyle = cols[i % 3]; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); for (let k = 0; k < 6; k++) { const a = rnd(0, 6.3), d = r + rnd(4, 22); g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rnd(1, 4), 0, 7); g.fill(); } }
        break;
      }
      case 'marble':
        if (emissive) break;
        for (let i = 0; i < 18; i++) { g.strokeStyle = i % 3 ? 'rgba(90,90,100,.35)' : A; g.lineWidth = i % 3 ? 1 : 2; g.beginPath(); let x = rnd(0, s), y = 0; g.moveTo(x, y); while (y < s) { x += rnd(-14, 14); y += rnd(8, 20); g.lineTo(x, y); } g.stroke(); }
        break;
      case 'scales': // écailles (dragon)
        g.strokeStyle = A; g.lineWidth = 2;
        for (let y = 0; y < s + 16; y += 14) for (let x = 0; x < s + 16; x += 20) {
          const ox = x + ((y / 14) % 2 ? 10 : 0);
          if (!emissive) { g.fillStyle = shade(skin.body, 0.85 + ((x * 7 + y) % 5) * 0.08); g.beginPath(); g.arc(ox, y, 10, 0, Math.PI); g.fill(); }
          g.beginPath(); g.arc(ox, y, 10, 0, Math.PI); g.stroke();
        }
        break;
      case 'hex': { // nid d'abeilles
        g.strokeStyle = A; g.lineWidth = 2.2; const r = 14, h = r * Math.sqrt(3);
        for (let row = -1; row < s / h + 1; row++) for (let col = -1; col < s / (r * 1.5) + 1; col++) {
          const cx = col * r * 1.5, cy = row * h + (col % 2 ? h / 2 : 0);
          g.beginPath(); for (let k = 0; k < 7; k++) { const a = Math.PI / 3 * k; g.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2)); } g.stroke();
        }
        break;
      }
      case 'circuit': // pistes de circuit imprimé
        g.strokeStyle = A; g.fillStyle = A; g.lineWidth = 2;
        for (let i = 0; i < 26; i++) {
          let x = Math.round(rnd(0, s) / 16) * 16, y = Math.round(rnd(0, s) / 16) * 16;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 4; k++) { if (Math.random() < 0.5) x += (Math.random() < 0.5 ? -1 : 1) * 16 * (1 + (Math.random() * 3 | 0)); else y += (Math.random() < 0.5 ? -1 : 1) * 16 * (1 + (Math.random() * 3 | 0)); g.lineTo(x, y); }
          g.stroke(); g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
        }
        break;
      case 'ice': // cristaux de glace
        g.strokeStyle = emissive ? A : 'rgba(255,255,255,.85)'; g.lineWidth = 1.5;
        for (let i = 0; i < 18; i++) { const cx = rnd(0, s), cy = rnd(0, s), r = rnd(10, 28); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k + rnd(-0.2, 0.2); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); } }
        if (!emissive) { g.strokeStyle = A; g.lineWidth = 1; for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(rnd(0, s), rnd(0, s)); g.lineTo(rnd(0, s), rnd(0, s)); g.stroke(); } }
        break;
      case 'flames': { // flammes qui montent depuis le bas
        const fl = (col, hgt) => { g.fillStyle = col; for (let x = -10; x < s + 10; x += rnd(14, 26)) { const top = s - rnd(hgt * 0.5, hgt); g.beginPath(); g.moveTo(x - 12, s); g.quadraticCurveTo(x - 10, (s + top) / 2, x + rnd(-6, 6), top); g.quadraticCurveTo(x + 10, (s + top) / 2, x + 12, s); g.fill(); } };
        fl(A, s * 0.9); if (!emissive) fl('#ffd34d', s * 0.45);
        break;
      }
      case 'grid': { // grille rétro (synthwave)
        g.strokeStyle = A; g.lineWidth = 2;
        for (let y = s * 0.35; y < s; y += (y - s * 0.3) * 0.22 + 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
        for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(s / 2 + i * 6, s * 0.35); g.lineTo(s / 2 + i * 48, s); g.stroke(); }
        if (!emissive) { const gr = g.createLinearGradient(0, 0, 0, s * 0.35); gr.addColorStop(0, '#ffb13d'); gr.addColorStop(1, '#ff3fd2'); g.fillStyle = gr; g.beginPath(); g.arc(s / 2, s * 0.35, s * 0.2, Math.PI, 0); g.fill(); }
        break;
      }
      case 'eclipse': { // couronne solaire autour d'un disque noir
        const cx = s / 2, cy = s / 2;
        const gr = g.createRadialGradient(cx, cy, s * 0.16, cx, cy, s * 0.5); gr.addColorStop(0, A); gr.addColorStop(0.35, emissive ? shade(A, 0.5) : 'rgba(255,140,40,.45)'); gr.addColorStop(1, emissive ? '#000' : skin.body);
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
        g.strokeStyle = A; g.lineWidth = 1.5;
        for (let i = 0; i < 60; i++) { const a = rnd(0, 6.3), r1 = s * 0.18, r2 = s * rnd(0.24, 0.48); g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke(); }
        g.fillStyle = emissive ? '#000' : skin.body; g.beginPath(); g.arc(cx, cy, s * 0.16, 0, 7); g.fill();
        break;
      }
      // ---- motifs ajoutés en 1.17 ----
      case 'stripes': { // rayures en diagonale
        g.save(); g.translate(s / 2, s / 2); g.rotate(-Math.PI / 4); g.fillStyle = A;
        for (let x = -s; x < s; x += 28) g.fillRect(x, -s, 11, s * 2);
        if (skin.alt && !emissive) { g.fillStyle = skin.alt; for (let x = -s + 16; x < s; x += 28) g.fillRect(x, -s, 3, s * 2); }
        g.restore(); break;
      }
      case 'zebra': // bandes ondulées
        g.fillStyle = A;
        for (let y = -10; y < s + 20; y += 26) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= s; x += 8) g.lineTo(x, y + Math.sin(x / 22 + y * 0.7) * 9); for (let x = s; x >= 0; x -= 8) g.lineTo(x, y + 9 + Math.sin(x / 19 + y) * 7); g.fill(); }
        break;
      case 'plaid': { // tartan
        if (emissive) break;
        const bands = [[A, 0.5, 22], [skin.alt || shade(A, 0.6), 0.45, 8], ['#000000', 0.25, 4]];
        for (const [c, a, w] of bands) { g.globalAlpha = a; g.fillStyle = c; for (let p = 0; p < s; p += 64) { g.fillRect(p + (w === 8 ? 30 : 0), 0, w, s); g.fillRect(0, p + (w === 8 ? 30 : 0), s, w); } }
        g.globalAlpha = 1; break;
      }
      case 'bubbles': // bulles
        g.strokeStyle = A; g.lineWidth = 2;
        for (let i = 0; i < 40; i++) { const x = rnd(0, s), y = rnd(0, s), r = rnd(4, 20); g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); if (!emissive) { g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, 7); g.fill(); } }
        break;
      case 'chevron': // zigzags
        g.strokeStyle = A; g.lineWidth = 7;
        for (let y = -20; y < s + 20; y += 30) { g.beginPath(); for (let x = 0, k = 0; x <= s + 20; x += 20, k++) g.lineTo(x, y + (k % 2 ? 12 : 0)); g.stroke(); }
        break;
      case 'rings': { // orbites concentriques
        g.strokeStyle = A; g.lineWidth = 1.8;
        for (let c = 0; c < 3; c++) { const cx = rnd(0, s), cy = rnd(0, s); for (let r = 8; r < 140; r += rnd(8, 16)) { g.beginPath(); g.ellipse(cx, cy, r, r * 0.55, 0.4, 0, 7); g.stroke(); } }
        break;
      }
      case 'shards': // éclats triangulaires
        for (let i = 0; i < 46; i++) { g.fillStyle = i % 3 === 0 ? A : emissive ? '#000' : shade(skin.body, 0.7 + (i % 5) * 0.12); const x = rnd(0, s), y = rnd(0, s), r = rnd(10, 34); g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r * rnd(0.4, 1), y + r * 0.6); g.lineTo(x - r * rnd(0.4, 1), y + r * rnd(0.2, 0.8)); g.fill(); }
        break;
      case 'leopard': // taches de léopard
        for (let i = 0; i < 42; i++) { const x = rnd(0, s), y = rnd(0, s), r = rnd(5, 11); if (!emissive) { g.fillStyle = skin.alt || shade(skin.body, 1.25); g.beginPath(); g.ellipse(x, y, r, r * 0.8, rnd(0, 3), 0, 7); g.fill(); } g.strokeStyle = A; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, rnd(0, 1), rnd(3.5, 6)); g.stroke(); }
        break;
      case 'glitch': // bandes décalées (écran qui saute)
        for (let i = 0; i < 34; i++) { const y = rnd(0, s), h = rnd(2, 12); g.fillStyle = i % 3 === 0 ? (skin.alt || '#ff2e88') : i % 3 === 1 ? A : (emissive ? '#000' : shade(skin.body, 1.5)); g.fillRect(rnd(-40, s * 0.6), y, rnd(30, s), h); }
        break;
      case 'web': { // toile d'araignée
        g.strokeStyle = A; g.lineWidth = 1.4; const cx = s * 0.35, cy = s * 0.35;
        for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * s * 1.2, cy + Math.sin(a) * s * 1.2); g.stroke(); }
        for (let r = 14; r < s * 1.2; r += 16) { g.beginPath(); for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI * 2; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.stroke(); }
        break;
      }
      default:
        if (!emissive) noise(g, s, 0.05, 1500);
    }
  });
  patternCache[key] = t;
  return t;
}

// motifs sans version lumineuse (le skin brille alors seulement par ses pièces d'accent)
const NO_GLOW_PATTERNS = new Set(['carbon', 'camo', 'petals', 'digital', 'checker', 'dots', 'fade', 'tiger', 'splatter', 'marble', 'plaid']);
export const animatedMaterials = new Set();
export function skinMaterials(skinId) {
  const skin = SKINS.find(s => s.id === skinId) || SKINS[0];
  const body = new THREE.MeshStandardMaterial({ color: skin.pattern ? '#ffffff' : skin.body, map: skin.pattern ? patternTex(skin, false) : null, metalness: skin.metal ?? 0.5, roughness: skin.rough ?? 0.5 });
  if (skin.glow && skin.pattern && !NO_GLOW_PATTERNS.has(skin.pattern)) {
    body.emissiveMap = patternTex(skin, true); body.emissive = new THREE.Color(skin.accent); body.emissiveIntensity = 0.8;
  }
  const accent = new THREE.MeshStandardMaterial({ color: skin.accent, metalness: 0.6, roughness: 0.35, emissive: skin.glow ? new THREE.Color(skin.accent) : new THREE.Color(0), emissiveIntensity: skin.glow ? 1.1 : 0 });
  const dark = new THREE.MeshStandardMaterial({ color: '#16181d', metalness: 0.3, roughness: 0.7 });
  if (skin.animated === 'hue') { body.userData.hue = true; accent.userData.hue = true; animatedMaterials.add(body); animatedMaterials.add(accent); }
  return { body, accent, dark };
}
// petite vignette (image) du motif d'un skin, pour la collection et la boutique
const swatchCache = {};
export function skinSwatch(skinId) {
  if (swatchCache[skinId]) return swatchCache[skinId];
  const skin = SKINS.find(s => s.id === skinId) || SKINS[0];
  let url = '';
  try {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    if (skin.pattern) g.drawImage(patternTex(skin, false).image, 0, 0, 256, 128, 0, 0, 128, 64);
    else { const gr = g.createLinearGradient(0, 0, 128, 64); gr.addColorStop(0, skin.body); gr.addColorStop(0.55, skin.body); gr.addColorStop(0.56, skin.accent); gr.addColorStop(1, skin.accent); g.fillStyle = gr; g.fillRect(0, 0, 128, 64); }
    if (skin.glow && skin.pattern && !NO_GLOW_PATTERNS.has(skin.pattern)) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.drawImage(patternTex(skin, true).image, 0, 0, 256, 128, 0, 0, 128, 64); }
    url = c.toDataURL('image/png');
  } catch { /* canvas indisponible : dégradé CSS */ }
  return (swatchCache[skinId] = url);
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

// ---------- viseurs (1.14) ----------
// Chaque viseur est posé sur le rail supérieur ; il renvoie le centre de sa fenêtre (alignée avec le centre de l'écran en visée).
const glassMat = () => new THREE.MeshBasicMaterial({ color: '#9fffe8', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
const dotMat = c => new THREE.MeshBasicMaterial({ color: c });
function addSight(g, type, baseY, z, mats) {
  const { dark, accent } = mats;
  const add = (...ms) => ms.forEach(m => g.add(m));
  if (type === 'reddot') { // viseur point rouge (réflexe) : fenêtre ouverte, point rouge au centre
    const w = 0.046, h = 0.034, cy = baseY + 0.006 + h / 2;
    add(box(0.044, 0.012, 0.06, dark, 0, baseY, z), box(0.006, h + 0.006, 0.03, dark, -w / 2, cy, z - 0.01), box(0.006, h + 0.006, 0.03, dark, w / 2, cy, z - 0.01),
      box(w + 0.006, 0.006, 0.03, accent, 0, cy + h / 2 + 0.003, z - 0.01));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.006, h), glassMat()); glass.position.set(0, cy, z - 0.02); add(glass);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 8, 6), dotMat('#ff2a2a')); dot.userData.sightDot = true; dot.position.set(0, cy, z - 0.021); add(dot);
    return Object.assign(new THREE.Vector3(0, cy, z - 0.02), { dist: 0.27 });
  }
  if (type === 'holo') { // viseur holographique : fenêtre rectangulaire, cercle et point au centre
    const w = 0.062, h = 0.042, cy = baseY + 0.006 + h / 2, d = 0.07;
    add(box(0.05, 0.012, 0.09, dark, 0, baseY, z), box(0.007, h + 0.008, d, dark, -w / 2, cy, z), box(0.007, h + 0.008, d, dark, w / 2, cy, z),
      box(w + 0.007, 0.008, d, dark, 0, cy + h / 2 + 0.004, z), box(w + 0.007, 0.004, 0.02, accent, 0, cy + h / 2 + 0.009, z + 0.02));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.007, h), glassMat()); glass.position.set(0, cy, z - d / 2 + 0.004); add(glass);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0085, 0.0007, 6, 32), dotMat('#ff4a2a')); ring.userData.sightDot = true; ring.position.set(0, cy, z - d / 2 + 0.003); add(ring);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0012, 8, 6), dotMat('#ff4a2a')); dot.userData.sightDot = true; dot.position.set(0, cy, z - d / 2 + 0.003); add(dot);
    return Object.assign(new THREE.Vector3(0, cy, z - d / 2), { dist: 0.34 });
  }
  // ACOG : lunette courte (tube creux), réticule rouge au fond
  const r = 0.021, len = 0.16, cy = baseY + 0.02 + r;
  add(box(0.03, 0.02, 0.08, dark, 0, baseY + 0.01, z));
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20, 1, true), new THREE.MeshStandardMaterial({ color: '#16181d', metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide }));
  tube.rotation.x = Math.PI / 2; tube.position.set(0, cy, z); add(tube);
  const ring = (zz, rr) => { const m = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.004, 6, 24), accent); m.position.set(0, cy, zz); add(m); };
  ring(z - len / 2, r + 0.002); ring(z + len / 2, r + 0.002);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 24), glassMat()); lens.position.set(0, cy, z - len / 2 + 0.002); add(lens);
  const chev = new THREE.Mesh(new THREE.ConeGeometry(0.0022, 0.004, 3), dotMat('#ff3030')); chev.userData.sightDot = true; chev.position.set(0, cy - 0.002, z - len / 2 + 0.003); add(chev);
  const post = box(0.0006, 0.012, 0.0006, dotMat('#ff3030'), 0, cy - 0.0105, z - len / 2 + 0.003); post.userData.sightDot = true; add(post);
  return Object.assign(new THREE.Vector3(0, cy, z + len / 2), { dist: 0.15 });
}

// L'arme pointe vers -Z. Origine ≈ poignée.
// 1.49 : modèles de couteau (cosmétiques), chacun avec son animation d'inspection
export const KNIVES = {
  tactique: { name: 'Tactique', desc: 'Le couteau de base' },
  papillon: { name: 'Papillon', desc: 'Les deux manches s\'ouvrent et se referment' },
  karambit: { name: 'Karambit', desc: 'Tourne autour du doigt grâce à son anneau' },
  baionnette: { name: 'Baïonnette', desc: 'Longue lame droite' },
  couronne: { name: 'Couronne', desc: 'Lame courbe et garde royale' },
  dague: { name: 'Dague', desc: 'Lame à double tranchant' },
  bowie: { name: 'Bowie', desc: 'Grande lame à contre-pointe' },
};
function knifeBlade(pts, depth, mat) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { const q = pts[i]; if (q.length === 4) sh.quadraticCurveTo(q[0], q[1], q[2], q[3]); else sh.lineTo(q[0], q[1]); }
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.002, bevelSegments: 1 }), mat);
  m.rotation.y = Math.PI / 2; m.position.x = -depth / 2; return m;
}
function buildKnifeVariant(g, v, { body, accent, dark }) {
  const add = (...ms) => ms.forEach(m => { m.castShadow = true; g.add(m); });
  const metal = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.95, roughness: 0.22 });
  switch (v) {
    case 'papillon': {
      add(knifeBlade([[0, 0], [0.24, 0.004], [0.27, 0.03], [0.02, 0.04], [0, 0.03]], 0.007, body));
      g.children.at(-1).position.set(-0.0035, 0.005, -0.01);
      // deux manches qui pivotent (animation d'inspection)
      for (const [side, x] of [['h1', -0.012], ['h2', 0.012]]) {
        const piv = new THREE.Group(); piv.position.set(x, 0.022, 0.0);
        const hm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.15), side === 'h1' ? dark : accent); hm.position.z = 0.075; piv.add(hm);
        for (let k = 0; k < 4; k++) { const hole = new THREE.Mesh(new THREE.BoxGeometry(0.013, 0.012, 0.012), metal); hole.position.z = 0.03 + k * 0.03; piv.add(hole); }
        g.add(piv); g.userData[side] = piv;
      }
      break;
    }
    case 'karambit': {
      // pivot sur l'anneau : le couteau tourne autour du doigt
      const spin = new THREE.Group(); spin.position.set(0, 0.02, 0.16); g.add(spin); g.userData.spin = spin;
      const inner = new THREE.Group(); inner.position.set(0, -0.02, -0.16); spin.add(inner);
      const bl = knifeBlade([[0, 0], [0.06, -0.01, 0.15, 0.03], [0.2, 0.1, 0.17, 0.13], [0.12, 0.06, 0.03, 0.045]], 0.007, body);
      bl.position.set(-0.0035, 0.01, -0.0); inner.add(bl);
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.034, 0.13), dark); h.position.set(0, 0.025, 0.07); h.rotation.x = -0.15; inner.add(h);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 8, 18), accent); ring.rotation.y = Math.PI / 2; ring.position.set(0, 0.02, 0.16); inner.add(ring);
      break;
    }
    case 'baionnette': {
      add(knifeBlade([[0, 0], [0.33, 0.006], [0.37, 0.025], [0.33, 0.042], [0, 0.045]], 0.008, body));
      g.children.at(-1).position.set(-0.004, 0.0, -0.02);
      add(box(0.006, 0.006, 0.26, metal, 0, 0.022, -0.17), box(0.09, 0.016, 0.022, accent, 0, 0.022, 0.0), cyl(0.019, 0.15, dark, 0, 0.022, 0.085));
      for (let k = 0; k < 5; k++) add(cyl(0.021, 0.006, accent, 0, 0.022, 0.03 + k * 0.025));
      break;
    }
    case 'couronne': {
      add(knifeBlade([[0, 0], [0.12, -0.02, 0.27, 0.025], [0.3, 0.05], [0.12, 0.03, 0.0, 0.045]], 0.008, body));
      g.children.at(-1).position.set(-0.004, 0.0, -0.02);
      const gold = new THREE.MeshStandardMaterial({ color: '#ffcf5a', metalness: 0.9, roughness: 0.25, emissive: '#5a3a00', emissiveIntensity: 0.4 });
      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.008, 6, 16), gold); crown.position.set(0, 0.022, 0.0); add(crown);
      for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.03, 4), gold); c.position.set(Math.cos(a) * 0.034, 0.022 + Math.sin(a) * 0.034, 0.0); c.rotation.x = Math.PI / 2; add(c); }
      add(cyl(0.018, 0.14, dark, 0, 0.022, 0.08), new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), gold));
      g.children.at(-1).position.set(0, 0.022, 0.16);
      break;
    }
    case 'dague': {
      add(knifeBlade([[0, 0], [0.28, 0.024], [0, 0.048]], 0.009, body));
      g.children.at(-1).position.set(-0.0045, -0.002, -0.02);
      add(box(0.004, 0.004, 0.24, metal, 0, 0.022, -0.15), box(0.12, 0.018, 0.02, accent, 0, 0.022, 0.0), box(0.03, 0.03, 0.13, dark, 0, 0.022, 0.075), new THREE.Mesh(new THREE.OctahedronGeometry(0.02), accent));
      g.children.at(-1).position.set(0, 0.022, 0.15);
      break;
    }
    case 'bowie': {
      add(knifeBlade([[0, 0], [0.26, -0.004], [0.32, 0.02], [0.27, 0.045], [0.2, 0.06], [0, 0.06]], 0.009, body));
      g.children.at(-1).position.set(-0.0045, -0.006, -0.02);
      const brass = new THREE.MeshStandardMaterial({ color: '#c9a050', metalness: 0.85, roughness: 0.3 });
      add(box(0.11, 0.024, 0.022, brass, 0, 0.022, 0.0), box(0.034, 0.042, 0.14, dark, 0, 0.018, 0.08), box(0.038, 0.046, 0.02, brass, 0, 0.018, 0.155));
      break;
    }
  }
}
export function buildWeapon(model, skinId, knifeVariant = null) {
  const g = new THREE.Group();
  const { body, accent, dark } = skinMaterials(skinId);
  const add = (...ms) => ms.forEach(m => { m.castShadow = true; g.add(m); });
  let muzzle = new THREE.Vector3(0, 0.05, -0.4);
  switch (model) {
    case 'knife': {
      if (knifeVariant && knifeVariant !== 'tactique' && KNIVES[knifeVariant]) { buildKnifeVariant(g, knifeVariant, { body, accent, dark }); g.userData.knife = knifeVariant; muzzle.set(0, 0.03, -0.35); break; }
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
        box(0.045, 0.12, 0.06, dark, 0, -0.07, 0.04), box(0.03, 0.05, 0.22, body, 0, 0.03, 0.18), box(0.074, 0.015, 0.3, accent, 0, 0.098, -0.12));
      g.children[3].rotation.x = 0.2; muzzle.set(0, 0.05, -0.45);
      g.userData.sight = addSight(g, 'reddot', 0.112, -0.05, { dark, accent });
      break;
    case 'shotgun':
      add(box(0.075, 0.09, 0.55, body, 0, 0.05, -0.2), cyl(0.024, 0.32, dark, 0, 0.075, -0.6), cyl(0.026, 0.28, accent, 0, 0.02, -0.5),
        box(0.045, 0.12, 0.06, dark, 0, -0.06, 0.05), box(0.06, 0.1, 0.28, body, 0, 0.02, 0.2), box(0.078, 0.012, 0.4, accent, 0, 0.1, -0.2));
      g.children[3].rotation.x = 0.25; muzzle.set(0, 0.075, -0.78);
      g.userData.sight = addSight(g, 'reddot', 0.112, -0.16, { dark, accent });
      break;
    case 'dmr':
      add(box(0.07, 0.1, 0.5, body, 0, 0.05, -0.15), cyl(0.017, 0.38, dark, 0, 0.065, -0.58), box(0.06, 0.07, 0.26, accent, 0, 0.04, -0.42),
        box(0.045, 0.15, 0.06, dark, 0, -0.08, -0.1), box(0.045, 0.12, 0.06, dark, 0, -0.07, 0.06), box(0.05, 0.09, 0.3, body, 0, 0.03, 0.26),
        box(0.074, 0.012, 0.4, accent, 0, 0.102, -0.1));
      g.children[4].rotation.x = 0.2; muzzle.set(0, 0.065, -0.78);
      g.userData.sight = addSight(g, 'acog', 0.108, -0.1, { dark, accent });
      break;
    case 'rifle':
      add(box(0.075, 0.11, 0.48, body, 0, 0.05, -0.14), cyl(0.018, 0.34, dark, 0, 0.07, -0.56), box(0.07, 0.085, 0.24, accent, 0, 0.05, -0.42),
        box(0.05, 0.19, 0.075, dark, 0, -0.1, -0.12), box(0.045, 0.12, 0.06, dark, 0, -0.07, 0.06), box(0.055, 0.1, 0.3, body, 0, 0.03, 0.26),
        box(0.079, 0.014, 0.36, accent, 0, 0.11, -0.12), box(0.012, 0.03, 0.012, accent, 0, 0.1, -0.68));
      g.children[3].rotation.x = -0.18; g.children[4].rotation.x = 0.2; muzzle.set(0, 0.07, -0.74);
      g.userData.sight = addSight(g, 'holo', 0.123, -0.1, { dark, accent });
      break;
    case 'sniper':
      add(box(0.08, 0.11, 0.55, body, 0, 0.05, -0.12), cyl(0.02, 0.6, dark, 0, 0.065, -0.68), cyl(0.032, 0.12, accent, 0, 0.065, -0.96),
        box(0.045, 0.12, 0.06, dark, 0, -0.07, 0.06), box(0.06, 0.12, 0.36, body, 0, 0.02, 0.3), cyl(0.04, 0.32, dark, 0, 0.16, -0.12, 14),
        cyl(0.046, 0.04, accent, 0, 0.16, -0.29, 14), cyl(0.046, 0.04, accent, 0, 0.16, 0.05, 14), box(0.05, 0.11, 0.06, dark, 0, -0.08, -0.14), box(0.084, 0.014, 0.4, accent, 0, 0.108, -0.1));
      g.children[3].rotation.x = 0.2; muzzle.set(0, 0.065, -1.02);
      break;
  }
  if (model !== 'knife') detailWeapon(g, model, muzzle, { body, accent, dark });
  g.userData.muzzle = muzzle;
  g.userData.materials = { body, accent, dark };
  return g;
}

// 1.37 : détails des armes (rail, fenêtre d'éjection, cache-flamme, pontet, vis, levier d'armement, voyant lumineux)
const DETAIL = {
  // demi-largeur, dessus du corps, z de la fenêtre d'éjection, z du pontet, rail [début, fin] (null = pas de rail), y de la poignée
  pistol: [0.025, 0.09, -0.04, -0.015, null, -0.005], heavypistol: [0.03, 0.102, -0.05, -0.01, null, -0.01],
  smg: [0.035, 0.0975, -0.1, -0.02, [-0.24, 0.02], -0.01], shotgun: [0.0375, 0.095, -0.08, -0.01, [-0.34, -0.06], 0.0],
  dmr: [0.035, 0.1, -0.08, 0.0, [-0.3, 0.06], -0.0], rifle: [0.0375, 0.105, -0.08, 0.0, [-0.3, 0.06], -0.0], sniper: [0.04, 0.105, -0.05, 0.0, null, -0.0],
};
let metalMat = null, ledMats = new Map();
function detailWeapon(g, model, muzzle, { accent, dark }) {
  const d = DETAIL[model]; if (!d) return;
  const [hw, top, portZ, guardZ, rail] = d;
  metalMat ||= new THREE.MeshStandardMaterial({ color: '#8a919c', metalness: 0.95, roughness: 0.28 });
  const add = m => { m.castShadow = false; g.add(m); return m; };
  // rail Picatinny : petites dents régulières
  if (rail) for (let z = rail[0]; z <= rail[1]; z += 0.022) add(box(hw * 1.15, 0.008, 0.011, metalMat, 0, top + 0.004, z));
  // fenêtre d'éjection (côté droit) + culasse visible
  add(box(0.004, 0.026, 0.07, dark, hw + 0.001, top - 0.035, portZ));
  add(box(0.003, 0.014, 0.05, metalMat, hw + 0.003, top - 0.035, portZ));
  // vis sur les flancs
  for (const sx of [-1, 1]) for (const z of [portZ + 0.07, portZ - 0.09]) { const v = add(cyl(0.006, 0.004, metalMat, sx * (hw + 0.002), top - 0.06, z, 8)); v.rotation.set(0, 0, Math.PI / 2); }
  // pontet (protection de la détente) et détente
  add(box(0.008, 0.006, 0.07, dark, 0, top - 0.155 + (model.includes('pistol') ? 0.05 : 0), guardZ - 0.005));
  add(box(0.006, 0.03, 0.006, metalMat, 0, top - 0.13 + (model.includes('pistol') ? 0.05 : 0), guardZ + 0.005)).rotation.x = 0.3;
  // cache-flamme à fentes au bout du canon
  const fh = new THREE.Group(); fh.position.copy(muzzle);
  for (let i = 0; i < 3; i++) { const r = cyl(model === 'shotgun' || model === 'sniper' ? 0.03 : 0.022, 0.012, metalMat, 0, 0, 0.01 + i * 0.02, 12); fh.add(r); }
  fh.add(cyl(model === 'shotgun' || model === 'sniper' ? 0.026 : 0.018, 0.06, dark, 0, 0, 0.03, 12));
  g.add(fh);
  // levier d'armement à l'arrière, voyant lumineux (couleur du skin) sur le côté gauche
  if (!model.includes('pistol')) add(box(0.05, 0.012, 0.018, metalMat, -0.01, top - 0.01, portZ + 0.16));
  const col = '#' + (accent.color?.getHexString?.() || 'a259ff');
  if (!ledMats.has(col)) ledMats.set(col, new THREE.MeshBasicMaterial({ color: col, toneMapped: false }));
  add(box(0.003, 0.008, 0.045, ledMats.get(col), -hw - 0.002, top - 0.03, portZ - 0.02));
}

// ---------- personnages ----------
export function buildCharacter(agentId, teamColor, outfitId = null) {
  const agent = AGENTS[agentId] || AGENTS.ignis;
  const col = new THREE.Color(agent.color);
  const of = OUTFITS[outfitId] && outfitId !== 'base' ? OUTFITS[outfitId] : null; // tenue (1.19)
  const glowC = of?.glow || agent.color;
  const mats = {
    suit: new THREE.MeshStandardMaterial({ color: of?.suit || '#4b5366', roughness: 0.7, metalness: 0.15 }),
    armor: new THREE.MeshStandardMaterial({ color: of?.armor ? new THREE.Color(of.armor) : col.clone().multiplyScalar(0.85), roughness: of ? 0.3 : 0.45, metalness: of ? 0.6 : 0.35 }),
    glow: new THREE.MeshStandardMaterial({ color: glowC, emissive: glowC, emissiveIntensity: 1.4 }),
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
  arms[0].rotation.x = 1.2; arms[1].rotation.x = 1.35; // 1.47 : l'avant est vers -Z, les bras tournent donc dans le sens positif (avant : vers l'arrière) arms[0].rotation.z = -0.35; arms[1].rotation.z = 0.15;
  // accessoire signature
  switch (agentId) {
    case 'ignis': for (let i = 0; i < 4; i++) { const c = mesh(new THREE.ConeGeometry(0.045, 0.2, 6), mats.glow, -0.09 + i * 0.06, 0.18, 0.02 + (i % 2) * 0.04, head); c.rotation.x = 0.4; } break;
    case 'nimbus': { const r = mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 24), mats.glow, 0, 0.25, 0, head); r.rotation.x = Math.PI / 2; break; }
    case 'oracle': mesh(new THREE.SphereGeometry(0.07, 12, 10), mats.glow, 0, 0.03, -0.14, head); mesh(new THREE.BoxGeometry(0.36, 0.03, 0.03), mats.armor, 0, 0.1, -0.05, head); break;
    case 'bastion': mesh(new THREE.BoxGeometry(0.2, 0.1, 0.24), mats.armor, -0.34, 0.5, 0, upper); mesh(new THREE.BoxGeometry(0.2, 0.1, 0.24), mats.armor, 0.34, 0.5, 0, upper); mesh(new THREE.BoxGeometry(0.34, 0.08, 0.04), mats.glow, 0, 0.18, -0.165, upper); break;
    case 'spectre': { const hood = mesh(new THREE.ConeGeometry(0.22, 0.42, 10, 1, true), mats.armor, 0, 0.05, 0.03, head); hood.material = hood.material.clone(); hood.material.side = THREE.DoubleSide; all.push(hood.material); break; }
    case 'volta': [-0.1, 0.1].forEach(x => { mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.26), mats.suit, x, 0.24, 0.05, head); mesh(new THREE.SphereGeometry(0.03, 8, 6), mats.glow, x, 0.38, 0.05, head); }); break;
    // 1.17 : accessoires des autres agents
    case 'kairo': { const v = mesh(new THREE.BoxGeometry(0.3, 0.05, 0.05), mats.glow, 0, 0.04, -0.15, head); v.rotation.z = 0.05; mesh(new THREE.ConeGeometry(0.03, 0.22, 6), mats.armor, 0.08, 0.2, 0.06, head).rotation.z = -0.5; break; }
    case 'borea': [-0.3, 0.3].forEach(x => { for (let i = 0; i < 3; i++) { const c = mesh(new THREE.ConeGeometry(0.03, 0.16 + i * 0.04, 5), mats.glow, x + (x > 0 ? 1 : -1) * i * 0.035, 0.58, -0.04 + i * 0.04, upper); c.rotation.z = (x > 0 ? -1 : 1) * 0.25; } }); break;
    case 'vesper': { mesh(new THREE.BoxGeometry(0.34, 0.06, 0.04), mats.glow, 0, 0.05, -0.15, head); [-0.13, 0.13].forEach(x => { const w = mesh(new THREE.ConeGeometry(0.04, 0.2, 4), mats.armor, x, 0.16, 0.02, head); w.rotation.z = x > 0 ? -0.6 : 0.6; }); break; }
    case 'aegis': { const sh = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 6), mats.armor, 0, 0.3, 0.2, upper); sh.rotation.x = Math.PI / 2; mesh(new THREE.TorusGeometry(0.2, 0.015, 6, 6), mats.glow, 0, 0.3, 0.225, upper); break; }
    case 'sol': { const r = mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 32), mats.glow, 0, 0.05, 0.12, head); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const s = mesh(new THREE.ConeGeometry(0.02, 0.08, 4), mats.glow, Math.cos(a) * 0.25, 0.05 + Math.sin(a) * 0.25, 0.12, head); s.rotation.z = a - Math.PI / 2; } r.rotation.y = 0; break; }
    case 'nyx': { const c = mesh(new THREE.TorusGeometry(0.12, 0.025, 8, 24, Math.PI * 1.2), mats.glow, 0, 0.24, 0, head); c.rotation.z = -0.3; break; }
    case 'helia': { mesh(new THREE.BoxGeometry(0.04, 0.12, 0.02), mats.glow, 0, 0.1, -0.16, head); mesh(new THREE.BoxGeometry(0.12, 0.04, 0.02), mats.glow, 0, 0.1, -0.16, head); break; }
    case 'orion': for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; mesh(new THREE.SphereGeometry(0.035, 8, 6), mats.glow, Math.cos(a) * 0.2, 0.28, Math.sin(a) * 0.2, head); } mesh(new THREE.TorusGeometry(0.2, 0.008, 6, 32), mats.glow, 0, 0.28, 0, head).rotation.x = Math.PI / 2; break;
    case 'marea': { const fin = mesh(new THREE.TorusGeometry(0.16, 0.03, 8, 20, Math.PI), mats.glow, 0, 0.12, 0.02, head); fin.rotation.y = Math.PI / 2; break; }
    case 'vanta': [-0.09, 0.09].forEach(x => { const h = mesh(new THREE.ConeGeometry(0.035, 0.24, 6), mats.glow, x, 0.2, 0.08, head); h.rotation.x = 0.7; h.rotation.z = x > 0 ? -0.3 : 0.3; }); break;
    case 'kora': { mesh(new THREE.BoxGeometry(0.4, 0.12, 0.08), mats.armor, 0, 0.62, 0.17, upper); mesh(new THREE.BoxGeometry(0.3, 0.035, 0.03), mats.glow, 0, 0.62, 0.215, upper); mesh(new THREE.BoxGeometry(0.32, 0.05, 0.05), mats.glow, 0, 0.13, -0.13, head); break; }
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
