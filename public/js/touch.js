// Commandes tactiles (téléphone / tablette) : joystick de déplacement à gauche, glisser pour viser à droite,
// boutons d'action. Activées automatiquement sur un écran tactile sans souris.
import { profile } from './store.js';

const ST = () => profile.settings;
export const isTouchDevice = () => {
  try { return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches); } catch { return false; }
};

const BTN = [
  // [action, libellé, classe] — la position est gérée par le CSS
  ['fire', '◉', 'b-fire'], ['fire', '◉', 'b-fire2'], ['jump', '⤒', 'b-jump'], ['crouch', '⤓', 'b-crouch'], ['reload', '↻', 'b-reload'],
  ['scope', '⌖', 'b-scope'], ['abilityQ', 'Q', 'b-q'], ['abilityE', 'E', 'b-e'], ['ult', 'X', 'b-x'],
  ['cycle', '⇄', 'b-cycle'], ['interact', 'F', 'b-use'], ['mark', '◆', 'b-mark'],
  ['emote', '☺', 'b-emote'], ['buy', '$', 'b-buy'], ['scoreboard', '☰', 'b-score'], ['chat', '✎', 'b-chat'], ['pause', 'II', 'b-pause'],
];
const TOGGLE = new Set(['crouch', 'scoreboard']); // appui = bascule

export class TouchControls {
  constructor(game) {
    this.g = game;
    this.move = null;       // { x, y } dans [-1, 1]
    this.stick = null;      // doigt du joystick
    this.looks = new Map(); // doigts qui visent : id → dernière position
    this.toggled = new Set();
    const root = this.root = document.createElement('div');
    root.id = 'touch-ui';
    root.innerHTML = `<div class="t-look"></div><div class="t-stick-zone"><div class="t-stick"><div class="t-knob"></div></div></div>
      ${BTN.map(([a, l, c]) => `<button class="t-btn ${c}" data-a="${a}">${l}</button>`).join('')}
      <div id="rotate-hint"><div>⟳</div>Tourne ton téléphone en mode paysage pour jouer.</div>`;
    document.getElementById('hud').appendChild(root);
    document.body.classList.add('touch-game');
    this.applyScale();
    this.knob = root.querySelector('.t-knob');
    this.stickEl = root.querySelector('.t-stick');
    const opt = { passive: false };
    this._ts = e => this.onStart(e); this._tm = e => this.onMove(e); this._te = e => this.onEnd(e);
    root.addEventListener('touchstart', this._ts, opt);
    window.addEventListener('touchmove', this._tm, opt);
    window.addEventListener('touchend', this._te, opt);
    window.addEventListener('touchcancel', this._te, opt);
    // empêche le zoom par pincement et le menu « appui long » pendant la partie
    this._gs = e => e.preventDefault();
    document.addEventListener('gesturestart', this._gs, opt);
  }

  applyScale() { this.root.style.setProperty('--ts', String(ST().touchSize || 1)); this.root.style.setProperty('--to', String(ST().touchOpacity ?? 0.55)); this.root.classList.toggle('lefty', !!ST().touchLeft); }
  get mirror() { return !!ST().touchLeft; }

  onStart(e) {
    for (const t of e.changedTouches) {
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const btn = el?.closest?.('.t-btn');
      if (btn) {
        e.preventDefault();
        const a = btn.dataset.a;
        btn.classList.add('on');
        this.looks.set(t.identifier, { x: t.clientX, y: t.clientY, btn, a });
        this.pressBtn(a, btn);
        continue;
      }
      if (el?.closest?.('.t-stick-zone') && this.stick == null) {
        e.preventDefault();
        this.stick = { id: t.identifier, ox: t.clientX, oy: t.clientY };
        this.stickEl.style.left = (this.mirror ? innerWidth - t.clientX : t.clientX) + 'px'; this.stickEl.style.top = t.clientY + 'px';
        this.stickEl.classList.add('on');
        this.move = { x: 0, y: 0 };
        continue;
      }
      if (el?.closest?.('.t-look')) { e.preventDefault(); this.looks.set(t.identifier, { x: t.clientX, y: t.clientY }); }
    }
  }

  onMove(e) {
    let used = false;
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) {
        used = true;
        const R = 55 * (ST().touchSize || 1);
        let dx = t.clientX - this.stick.ox, dy = t.clientY - this.stick.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        this.knob.style.transform = `translate(${this.mirror ? -dx : dx}px, ${dy}px)`;
        this.move = { x: dx / R, y: dy / R };
        continue;
      }
      const l = this.looks.get(t.identifier);
      if (l) {
        used = true;
        const mx = t.clientX - l.x, my = t.clientY - l.y;
        l.x = t.clientX; l.y = t.clientY;
        // les boutons de tir visent aussi : on peut tirer et suivre la cible du même doigt
        if (!l.btn || l.a === 'fire' || l.a === 'scope') this.g.touchLook(mx, my);
      }
    }
    if (used) e.preventDefault();
  }

  onEnd(e) {
    for (const t of e.changedTouches) {
      if (this.stick && t.identifier === this.stick.id) {
        this.stick = null; this.move = null;
        this.knob.style.transform = ''; this.stickEl.classList.remove('on');
        continue;
      }
      const l = this.looks.get(t.identifier);
      if (l) {
        this.looks.delete(t.identifier);
        if (l.btn) { l.btn.classList.remove('on'); this.releaseBtn(l.a, l.btn); }
      }
    }
  }

  pressBtn(a, btn) {
    const g = this.g;
    if (a === 'pause') { g.releaseAll(); g.showPause(true); return; }
    if (a === 'cycle') { g.cycleWeapon(); return; }
    if (a === 'chat') { g.openChat(false); return; }
    if (a === 'emote') { g.toggleEmote(); return; }
    if (TOGGLE.has(a)) {
      if (this.toggled.has(a)) { this.toggled.delete(a); btn.classList.remove('lit'); g.releaseAction(a); }
      else { this.toggled.add(a); btn.classList.add('lit'); g.pressAction(a); }
      return;
    }
    g.pressAction(a);
  }
  releaseBtn(a) {
    if (a === 'pause' || a === 'cycle' || a === 'chat' || a === 'emote' || TOGGLE.has(a)) return;
    this.g.releaseAction(a);
  }

  reset() {
    this.stick = null; this.move = null; this.looks.clear();
    for (const a of this.toggled) this.g.releaseAction(a);
    this.toggled.clear();
    this.root.querySelectorAll('.t-btn').forEach(b => b.classList.remove('on', 'lit'));
    if (this.knob) this.knob.style.transform = '';
  }

  // n'affiche que les boutons utiles selon le mode et l'état du joueur
  update(state) {
    const r = this.root;
    r.classList.toggle('dead', !state.alive);
    r.classList.toggle('no-buy', !state.canBuy);
    r.classList.toggle('no-use', !state.assault);
    r.classList.toggle('has-scope', !!state.scope);
  }

  destroy() {
    this.root.removeEventListener('touchstart', this._ts);
    window.removeEventListener('touchmove', this._tm);
    window.removeEventListener('touchend', this._te);
    window.removeEventListener('touchcancel', this._te);
    document.removeEventListener('gesturestart', this._gs);
    this.root.remove();
    document.body.classList.remove('touch-game');
  }
}
