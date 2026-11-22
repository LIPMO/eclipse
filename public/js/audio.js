// Sons synthétisés (WebAudio), spatialisés simplement (atténuation + panoramique)
let ctx = null, master = null, noiseBuf = null;
let volume = 0.6;
const listener = { x: 0, y: 0, z: 0, yaw: 0 };

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }
export function setListener(p, yaw) { listener.x = p[0]; listener.y = p[1]; listener.z = p[2]; listener.yaw = yaw; }

function out(pos, maxDist = 60) {
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
  if (pan) { g.connect(pan); pan.connect(master); } else g.connect(master);
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
  const o = out(pos, 32);
  noise(o, t, 0.09, self ? 500 : 650, 1.5, 'lowpass', self ? 0.18 : 0.6);
}
export function playHit(head, kill) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (kill) { tone(master, t, 0.25, 900, 1400, 'square', 0.12); tone(master, t + 0.08, 0.3, 1400, 1800, 'sine', 0.2); }
  else if (head) tone(master, t, 0.12, 2400, 2000, 'sine', 0.25);
  else noise(master, t, 0.05, 3000, 2, 'bandpass', 0.35);
}
export function playHurt() { if (!ctx) return; noise(master, ctx.currentTime, 0.15, 300, 1, 'lowpass', 0.6); }
export function playReload() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noise(master, t, 0.05, 2500, 3, 'bandpass', 0.3);
  noise(master, t + 0.35, 0.06, 1800, 3, 'bandpass', 0.35);
}
export function playClick() { if (!ctx) return; noise(master, ctx.currentTime, 0.03, 4000, 4, 'bandpass', 0.2); }
export function playAbility(kind, pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(pos, 50);
  switch (kind) {
    case 'dash': case 'blink': noise(o, t, 0.3, 800, 0.6, 'bandpass', 0.6); tone(o, t, 0.25, 300, 1200, 'sine', 0.2); break;
    case 'heal': case 'fortress': tone(o, t, 0.5, 500, 900, 'sine', 0.25); tone(o, t + 0.1, 0.5, 750, 1300, 'sine', 0.15); break;
    case 'recon': case 'hunt': for (let i = 0; i < 3; i++) tone(o, t + i * 0.12, 0.2, 1500, 1500, 'sine', 0.25); break;
    case 'wall': noise(o, t, 0.6, 2500, 0.5, 'highpass', 0.5); tone(o, t, 0.4, 200, 80, 'sawtooth', 0.15); break;
    case 'shield': tone(o, t, 0.35, 400, 800, 'triangle', 0.3); break;
    case 'invis': case 'phantom': tone(o, t, 0.6, 900, 200, 'sine', 0.25); break;
    case 'overdrive': tone(o, t, 0.6, 120, 600, 'sawtooth', 0.2); noise(o, t, 0.5, 600, 1, 'bandpass', 0.4); break;
    default: noise(o, t, 0.2, 1200, 1, 'bandpass', 0.4);
  }
}
export function playFlashBang(pos) { if (!ctx) return; const t = ctx.currentTime; const o = out(pos, 80); noise(o, t, 0.5, 3000, 0.5, 'highpass', 1); tone(o, t, 0.3, 2000, 1500, 'sine', 0.3); }
export function playSmoke(pos) { if (!ctx) return; noise(out(pos, 50), ctx.currentTime, 1.2, 900, 0.4, 'lowpass', 0.5); }
export function playFire(pos) { if (!ctx) return; noise(out(pos, 40), ctx.currentTime, 0.8, 400, 0.4, 'lowpass', 0.6); }
export function playExplosion(pos) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = out(pos, 200);
  noise(o, t, 2.2, 300, 0.5, 'lowpass', 1.5);
  tone(o, t, 1.5, 90, 30, 'sine', 1);
}
export function playBeep(pitch = 1) { if (!ctx) return; tone(master, ctx.currentTime, 0.08, 1800 * pitch, 1800 * pitch, 'square', 0.06); }
export function playUI(kind) {
  if (!ctx) return;
  const t = ctx.currentTime;
  if (kind === 'buy') tone(master, t, 0.1, 900, 1200, 'triangle', 0.2);
  else if (kind === 'roundStart') { tone(master, t, 0.25, 440, 440, 'triangle', 0.25); tone(master, t + 0.25, 0.4, 660, 660, 'triangle', 0.25); }
  else if (kind === 'win') [523, 659, 784].forEach((f, i) => tone(master, t + i * 0.12, 0.4, f, f, 'triangle', 0.25));
  else if (kind === 'lose') [392, 330, 262].forEach((f, i) => tone(master, t + i * 0.15, 0.45, f, f, 'triangle', 0.25));
  else if (kind === 'plant') { tone(master, t, 0.6, 300, 900, 'sawtooth', 0.12); }
  else tone(master, t, 0.06, 1200, 1200, 'sine', 0.12);
}
