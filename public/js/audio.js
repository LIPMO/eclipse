// Sons synthétisés (WebAudio), spatialisés simplement (atténuation + panoramique)
let ctx = null, master = null, noiseBuf = null;
let volume = 0.6;
// volumes par catégorie (Paramètres → Audio)
const CATS = ['weapons', 'steps', 'abilities', 'ui', 'notif'];
const catVol = { weapons: 1, steps: 1, abilities: 1, ui: 1, notif: 1 };
const catNode = {};
const C = name => catNode[name] || master;
export function setCategoryVolume(name, v) { catVol[name] = v; if (catNode[name]) catNode[name].gain.value = v; }
const listener = { x: 0, y: 0, z: 0, yaw: 0 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = muted ? 0 : volume; master.connect(ctx.destination);
  for (const n of CATS) { catNode[n] = ctx.createGain(); catNode[n].gain.value = catVol[n]; catNode[n].connect(master); }
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolume(v) { volume = v; if (master) master.gain.value = muted ? 0 : v; }
// touche « couper tout le son » (1.15) : coupe le volume général sans toucher au réglage
let muted = false;
export function toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : volume; if (muted && typeof speechSynthesis !== 'undefined') try { speechSynthesis.cancel(); } catch { /* */ } return muted; }
export const isMuted = () => muted;
export function setListener(p, yaw) { listener.x = p[0]; listener.y = p[1]; listener.z = p[2]; listener.yaw = yaw; }

function out(pos, maxDist = 60, cat = 'weapons') {
  const g = ctx.createGain();
  const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (pos) {
    const dx = pos[0] - listener.x, dz = pos[2] - listener.z;
    const d = Math.hypot(dx, dz, (pos[1] || 0) - listener.y);
    g.gain.value = Math.max(0, 1 - d / maxDist) ** 1.6;
    if (pan) {
      const ang = Math.atan2(dx, -dz) + listener.yaw; // angle relatif
      pan.pan.value = Math.max(-1, Math.min(1, Math.sin(ang) * Math.min(1, d / 3)));
    }
  }
  if (pan) { g.connect(pan); pan.connect(C(cat)); } else g.connect(C(cat));
  return g;
}
function noise(dest, t, dur, freq, q = 1, type = 'bandpass', gain = 1, decay = 4) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(dest);
  src.start(t, Math.random()); src.stop(t + dur + 0.05);
  return f;
}
function tone(dest, t, dur, f0, f1, type = 'sine', gain = 0.5) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
}

const SHOT = {
  pistol: { f: 1800, d: 0.18, thump: 140, g: 0.7 },
  smg: { f: 2200, d: 0.12, thump: 160, g: 0.55 },
  shotgun: { f: 900, d: 0.4, thump: 90, g: 1 },
  rifle: { f: 1400, d: 0.22, thump: 110, g: 0.8 },
  sniper: { f: 700, d: 0.7, thump: 60, g: 1.1 },
  melee: { f: 3500, d: 0.08, thump: 0, g: 0.3 },
};
export function playShot(type, pos) {
  if (!ctx) return;
  const s = SHOT[type] || SHOT.rifle;
  const t = ctx.currentTime;
  const o = out(pos, type === 'sniper' ? 140 : 100);
  noise(o, t, s.d, s.f, 0.8, 'bandpass', s.g * 1.4);
  noise(o, t, s.d * 0.4, 5000, 0.5, 'highpass', s.g * 0.5);
  if (s.thump) tone(o, t, s.d * 0.7, s.thump * 2, s.thump * 0.5, 'triangle', s.g * 0.8);
}
export function playStep(pos, self = false) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(pos, 32, 'steps');
  noise(o, t, 0.09, self ? 500 : 650, 1.5, 'lowpass', self ? 0.18 : 0.6);
}
export function playHit(head, kill) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (kill) { tone(C('ui'), t, 0.25, 900, 1400, 'square', 0.12); tone(C('ui'), t + 0.08, 0.3, 1400, 1800, 'sine', 0.2); }
  else if (head) tone(C('ui'), t, 0.12, 2400, 2000, 'sine', 0.25);
  else noise(C('ui'), t, 0.05, 3000, 2, 'bandpass', 0.35);
}
// son d'élimination au choix (1.15)
export function playKillSound(kind) {
  if (!ctx) return; const t = ctx.currentTime, o = C('ui');
  if (kind === 'ding') { tone(o, t, 0.5, 1760, 1760, 'sine', 0.22); tone(o, t, 0.5, 2637, 2637, 'sine', 0.08); }
  else if (kind === 'coin') { tone(o, t, 0.09, 988, 988, 'square', 0.1); tone(o, t + 0.08, 0.35, 1319, 1319, 'square', 0.1); }
  else if (kind === 'bell') { [1047, 1568, 2093].forEach((f, i) => tone(o, t, 0.9 - i * 0.2, f, f * 0.995, 'sine', 0.12 / (i + 1))); }
  else if (kind === 'laser') { tone(o, t, 0.25, 2400, 300, 'sawtooth', 0.09); }
}
export function playHurt() { if (!ctx) return; noise(C('weapons'), ctx.currentTime, 0.15, 300, 1, 'lowpass', 0.6); }
export function playReload() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(C('weapons'), t, 0.05, 2500, 3, 'bandpass', 0.3);
  noise(C('weapons'), t + 0.35, 0.06, 1800, 3, 'bandpass', 0.35);
}
export function playClick() { if (!ctx) return; noise(C('weapons'), ctx.currentTime, 0.03, 4000, 4, 'bandpass', 0.2); }
export function playAbility(kind, pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(pos, 50, 'abilities');
  switch (kind) {
    case 'dash': case 'blink': noise(o, t, 0.3, 800, 0.6, 'bandpass', 0.6); tone(o, t, 0.25, 300, 1200, 'sine', 0.2); break;
    case 'heal': case 'fortress': tone(o, t, 0.5, 500, 900, 'sine', 0.25); tone(o, t + 0.1, 0.5, 750, 1300, 'sine', 0.15); break;
    case 'recon': case 'hunt': for (let i = 0; i < 3; i++) tone(o, t + i * 0.12, 0.2, 1500, 1500, 'sine', 0.25); break;
    case 'wall': noise(o, t, 0.6, 2500, 0.5, 'highpass', 0.5); tone(o, t, 0.4, 200, 80, 'sawtooth', 0.15); break;
    case 'shield': tone(o, t, 0.35, 400, 800, 'triangle', 0.3); break;
    case 'invis': case 'phantom': tone(o, t, 0.6, 900, 200, 'sine', 0.25); break;
    case 'overdrive': tone(o, t, 0.6, 120, 600, 'sawtooth', 0.2); noise(o, t, 0.5, 600, 1, 'bandpass', 0.4); break;
    case 'haste': tone(o, t, 0.35, 250, 1100, 'sawtooth', 0.12); noise(o, t, 0.35, 1800, 0.8, 'bandpass', 0.35); break;
    case 'cryo': case 'blizzard': tone(o, t, 0.5, 2400, 900, 'sine', 0.2); noise(o, t, 0.6, 6000, 0.6, 'highpass', 0.35); break;
    case 'smoke': case 'megasmoke': case 'molotov': case 'flash': case 'firestorm': noise(o, t, 0.12, 2200, 2, 'bandpass', 0.35); tone(o, t, 0.1, 500, 300, 'triangle', 0.15); break;
    default: noise(o, t, 0.2, 1200, 1, 'bandpass', 0.4);
  }
}
export function playFlashBang(pos) { if (!ctx) return; const t = ctx.currentTime; const o = out(pos, 80, 'abilities'); noise(o, t, 0.5, 3000, 0.5, 'highpass', 1); tone(o, t, 0.3, 2000, 1500, 'sine', 0.3); }
export function playSmoke(pos) { if (!ctx) return; noise(out(pos, 50, 'abilities'), ctx.currentTime, 1.2, 900, 0.4, 'lowpass', 0.5); }
export function playFire(pos) { if (!ctx) return; noise(out(pos, 40, 'abilities'), ctx.currentTime, 0.8, 400, 0.4, 'lowpass', 0.6); }
export function playExplosion(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(pos, 200, 'abilities');
  noise(o, t, 2.2, 300, 0.5, 'lowpass', 1.5);
  tone(o, t, 1.5, 90, 30, 'sine', 1);
}
export function playBeep(pitch = 1) { if (!ctx) return; tone(C('ui'), ctx.currentTime, 0.08, 1800 * pitch, 1800 * pitch, 'square', 0.06); }
export function playUI(kind) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (kind === 'buy') tone(C('ui'), t, 0.1, 900, 1200, 'triangle', 0.2);
  else if (kind === 'roundStart') { tone(C('ui'), t, 0.25, 440, 440, 'triangle', 0.25); tone(C('ui'), t + 0.25, 0.4, 660, 660, 'triangle', 0.25); }
  else if (kind === 'win') [523, 659, 784].forEach((f, i) => tone(C('ui'), t + i * 0.12, 0.4, f, f, 'triangle', 0.25));
  else if (kind === 'lose') [392, 330, 262].forEach((f, i) => tone(C('ui'), t + i * 0.15, 0.45, f, f, 'triangle', 0.25));
  else if (kind === 'plant') { tone(C('ui'), t, 0.6, 300, 900, 'sawtooth', 0.12); }
  else tone(C('ui'), t, 0.06, 1200, 1200, 'sine', 0.12);
}

// ---- petits effets sonores supplémentaires ----
export function playFrost(pos) { if (!ctx) return; const t = ctx.currentTime; const o = out(pos, 45, 'abilities'); noise(o, t, 1, 7000, 0.5, 'highpass', 0.35); [2100, 2800, 3500].forEach((f, i) => tone(o, t + i * 0.07, 0.25, f, f * 0.9, 'sine', 0.08)); }
// marqueur de position (clic molette)
export function playPing(pos, danger = false) {
  if (!ctx) return; const t = ctx.currentTime; const o = pos ? out(pos, 400, 'notif') : C('notif');
  if (danger) { tone(o, t, 0.12, 1300, 1300, 'square', 0.1); tone(o, t + 0.14, 0.12, 1300, 1300, 'square', 0.1); }
  else { tone(o, t, 0.12, 1050, 1050, 'sine', 0.3); tone(o, t + 0.09, 0.22, 1570, 1570, 'sine', 0.25); }
}
// série d'éliminations : plus aigu à chaque kill
export function playStreak(n) {
  if (!ctx) return; const t = ctx.currentTime;
  const base = [0, 660, 784, 880, 1047, 1319][Math.min(5, n)] || 1319;
  for (let i = 0; i < Math.min(n, 5); i++) tone(C('ui'), t + i * 0.07, 0.18, base * (1 + i * 0.12), base * (1 + i * 0.12), 'triangle', 0.16);
}
// blague « coin-coin » : un tir qui cancane
export function playQuack(pos) {
  if (!ctx) return; const t = ctx.currentTime, o = pos ? out(pos, 60, 'weapons') : C('weapons');
  const osc = ctx.createOscillator(); osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(820, t); osc.frequency.exponentialRampToValueAtTime(420, t + 0.16);
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 3;
  const g = ctx.createGain(); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  osc.connect(f); f.connect(g); g.connect(o); osc.start(t); osc.stop(t + 0.22);
}
export function playEmpty() { if (!ctx) return; const t = ctx.currentTime; noise(C('weapons'), t, 0.025, 5000, 6, 'bandpass', 0.3); noise(C('weapons'), t + 0.05, 0.02, 3500, 6, 'bandpass', 0.2); }
export function playSwitch() { if (!ctx) return; const t = ctx.currentTime; noise(C('weapons'), t, 0.04, 2200, 3, 'bandpass', 0.22); noise(C('weapons'), t + 0.08, 0.05, 1400, 3, 'bandpass', 0.18); }
export function playJump(self = true) { if (!ctx) return; noise(C('steps'), ctx.currentTime, 0.08, 400, 1, 'lowpass', self ? 0.18 : 0.1); }
// glissade : frottement au sol (le sien, ou celui d'un autre joueur à sa position)
export function playSlide(pos = null) {
  if (!ctx) return;
  const t = ctx.currentTime, o = pos ? out(pos, 30, 'steps') : C('steps');
  noise(o, t, 0.55, 700, 0.6, 'bandpass', pos ? 0.35 : 0.3, 2.5);
  noise(o, t, 0.4, 2400, 0.8, 'highpass', pos ? 0.12 : 0.1, 3);
}
export function playLand(hard = false) { if (!ctx) return; const t = ctx.currentTime; noise(C('steps'), t, hard ? 0.18 : 0.1, 260, 1, 'lowpass', hard ? 0.55 : 0.28); }
export function playHeartbeat() { if (!ctx) return; const t = ctx.currentTime; tone(C('ui'), t, 0.12, 60, 40, 'sine', 0.5); tone(C('ui'), t + 0.18, 0.12, 55, 38, 'sine', 0.35); }
export function playLevelUp() { if (!ctx) return; const t = ctx.currentTime; [523, 659, 784, 1047].forEach((f, i) => tone(C('ui'), t + i * 0.09, 0.35, f, f, 'triangle', 0.22)); tone(C('ui'), t + 0.36, 0.6, 1568, 1568, 'sine', 0.12); }
// compte à rebours du salon de groupe (1.15)
export function playCountdown(go) { if (!ctx) return; const t = ctx.currentTime; tone(C('ui'), t, go ? 0.45 : 0.15, go ? 1320 : 880, go ? 1320 : 880, 'square', 0.08); }
export function playNotify() { if (!ctx) return; const t = ctx.currentTime; tone(C('notif'), t, 0.12, 880, 880, 'sine', 0.18); tone(C('notif'), t + 0.1, 0.18, 1320, 1320, 'sine', 0.15); }
export function playPromote() { if (!ctx) return; const t = ctx.currentTime; tone(C('ui'), t, 0.15, 600, 1200, 'square', 0.08); tone(C('ui'), t + 0.12, 0.25, 1200, 1200, 'triangle', 0.18); }
export function playWhoosh() { if (!ctx) return; const t = ctx.currentTime; noise(C('ui'), t, 0.6, 900, 0.7, 'bandpass', 0.5); tone(C('ui'), t, 0.5, 200, 60, 'sine', 0.25); }
export function playTick(last = false) { if (!ctx) return; tone(C('ui'), ctx.currentTime, 0.07, last ? 1400 : 1000, last ? 1400 : 1000, 'sine', 0.15); }
