// Manette (API Gamepad du navigateur) : jeu complet + navigation dans les menus.
// Disposition standard (Xbox / PlayStation / Switch Pro) : voir PAD_LAYOUT dans settings.js.
import { profile } from './store.js';

const ST = () => profile.settings;
// boutons de la disposition « standard »
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
// bouton → action du jeu (maintenue tant que le bouton est enfoncé)
const GAME_MAP = { [B.A]: 'jump', [B.B]: 'crouch', [B.X]: 'reload', [B.LB]: 'abilityQ', [B.RB]: 'abilityE', [B.RT]: 'fire', [B.LT]: 'scope',
  [B.LS]: 'walk', [B.RS]: 'mark', [B.UP]: 'ult', [B.DOWN]: 'interact', [B.LEFT]: 'drop', [B.RIGHT]: 'buy', [B.BACK]: 'scoreboard' };
const FOCUSABLE = 'button, a[href], select, input, .buy-item:not(.locked), .room-item, [data-tab], .tab-btn';

class Pad {
  constructor() {
    this.prev = []; this.game = null; this.active = false; this.cur = null;
    this.repeatDir = null; this.repeatAt = 0; this.lastT = performance.now();
    this.held = new Set();
    window.addEventListener('gamepadconnected', e => { this.notify(`🎮 Manette connectée : ${String(e.gamepad.id).replace(/\(.*\)/, '').trim() || 'manette'}`); });
    window.addEventListener('gamepaddisconnected', () => { this.notify('🎮 Manette déconnectée'); this.releaseGame(); });
    // la souris ou le clavier reprennent la main : on quitte le mode manette
    window.addEventListener('mousemove', e => { if (this.active && (Math.abs(e.movementX) + Math.abs(e.movementY) > 6)) this.setActive(false); });
    window.addEventListener('keydown', e => { if (this.active && e.isTrusted) this.setActive(false); });
    const loop = t => { try { this.poll(t); } catch (e) { console.warn('manette', e); } requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  notify(text) { const t = document.getElementById('toast'); if (!t) return; t.textContent = text; t.classList.add('show'); clearTimeout(this.nt); this.nt = setTimeout(() => t.classList.remove('show'), 2500); }
  setActive(v) {
    if (this.active === v) return;
    this.active = v;
    document.body.classList.toggle('pad-mode', v);
    if (this.game) this.game.padActive = v;
    if (!v) { this.releaseGame(); this.cur?.classList.remove('gp-focus'); this.cur = null; }
  }
  attach(game) { this.game = game; if (game) { game.pad = this; game.padActive = this.active; } this.held.clear(); }
  pad() { for (const g of navigator.getGamepads?.() || []) if (g && g.connected !== false) return g; return null; }
  rumble(strength = 0.3, ms = 80) {
    if (!this.active || !ST().gpVibration) return;
    const g = this.pad(); const v = g?.vibrationActuator;
    try { v?.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 0.6) })?.catch?.(() => {}); } catch { /* non pris en charge */ }
  }
  releaseGame() {
    const g = this.game;
    if (g && !g.destroyed) for (const a of this.held) g.releaseAction(a);
    this.held.clear();
    if (g) g.padMove = null;
  }
  axis(v) { const dz = ST().gpDeadzone ?? 0.15; const a = Math.abs(v); return a < dz ? 0 : Math.sign(v) * (a - dz) / (1 - dz); }
  // une partie est en cours et aucun menu n'est ouvert : la manette pilote le joueur
  playing() {
    const g = this.game;
    return g && !g.destroyed && !g.ended && !g.spec && !g.buyOpen && !g.paused && !g.settingsOpen && !g.chatOpen && !g.reportOpen;
  }

  poll(t) {
    const dt = Math.min(0.1, (t - this.lastT) / 1000); this.lastT = t;
    const gp = this.pad();
    if (!gp) return;
    const btn = i => { const b = gp.buttons[i]; return !!b && (b.pressed || b.value > 0.35); };
    const now = gp.buttons.map((_, i) => btn(i));
    const edge = i => now[i] && !this.prev[i];
    const ax = gp.axes.map(v => this.axis(v || 0));
    const anyInput = now.some(Boolean) || ax.some(v => v !== 0);
    if (anyInput && !this.active) this.setActive(true);
    if (!this.active) { this.prev = now; return; }
    if (this.game?.destroyed) this.attach(null);

    if (this.playing()) {
      const g = this.game;
      if (this.cur) { this.cur.classList.remove('gp-focus'); this.cur = null; }
      g.padActive = true;
      g.padMove = { x: ax[0] || 0, y: ax[1] || 0 };
      // visée : courbe progressive (précision au centre, vitesse en bout de course)
      const rx = ax[2] || 0, ry = ax[3] || 0;
      if (rx || ry) {
        let k = 3.4 * (ST().gpSens || 1) * dt;
        if (ST().gpAimAssist && g.enemyUnderCrosshair?.()) k *= 0.5;
        g.padLook(rx * Math.abs(rx) * k, ry * Math.abs(ry) * k * (ST().gpSensY || 1) * (ST().gpInvert ? -1 : 1));
      }
      for (const [i, a] of Object.entries(GAME_MAP)) {
        if (now[i] && !this.prev[i]) { this.held.add(a); g.pressAction(a); if (a === 'buy' || !this.playing()) break; }
        else if (!now[i] && this.prev[i] && this.held.has(a)) { this.held.delete(a); g.releaseAction(a); }
      }
      if (edge(B.Y)) g.cycleWeapon(1);
      if (edge(B.START)) { this.releaseGame(); g.showPause(true); }
    } else {
      // relâche ce que la manette tenait en jeu (ouverture d'un menu en pleine action)
      if (this.held.size) this.releaseGame();
      this.navigate(now, ax, edge, t);
    }
    this.prev = now;
  }

  // ---------- menus ----------
  container() {
    const vis = id => { const el = document.getElementById(id); return el && el.classList.contains('show') ? el : null; };
    const g = this.game && !this.game.destroyed ? this.game : null;
    if (g) return vis('settings-overlay') || vis('report-overlay') || vis('buy-menu') || vis('end-screen') || vis('pause-menu') || document.getElementById('hud');
    return vis('mmodal') || document.querySelector('#menu .overlay.show, .modal.show') || document.getElementById('menu') || document.body;
  }
  items(root) {
    return [...root.querySelectorAll(FOCUSABLE)].filter(el => !el.disabled && el.offsetParent !== null && el.type !== 'hidden' && !el.closest('[hidden]'))
      .filter(el => { const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight; });
  }
  focus(el) {
    if (this.cur === el) return;
    this.cur?.classList.remove('gp-focus');
    this.cur = el;
    if (!el) return;
    el.classList.add('gp-focus');
    if (/^(BUTTON|A|SELECT|INPUT)$/.test(el.tagName)) el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  move(dir, list) {
    if (!list.length) return;
    if (!this.cur || !list.includes(this.cur)) { this.focus(list[0]); return; }
    const c = this.cur.getBoundingClientRect(), cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    let best = null, bestS = Infinity;
    for (const el of list) {
      if (el === this.cur) continue;
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      const dx = x - cx, dy = y - cy;
      const main = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
      const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (main <= 4) continue;
      const sc = main + side * 2.2;
      if (sc < bestS) { bestS = sc; best = el; }
    }
    if (best) this.focus(best);
  }
  navigate(now, ax, edge, t) {
    const root = this.container();
    const list = this.items(root);
    if (this.cur && (!this.cur.isConnected || !list.includes(this.cur))) this.focus(null);
    const dir = now[B.UP] || ax[1] < -0.6 ? 'up' : now[B.DOWN] || ax[1] > 0.6 ? 'down' : now[B.LEFT] || ax[0] < -0.6 ? 'left' : now[B.RIGHT] || ax[0] > 0.6 ? 'right' : null;
    const el = this.cur;
    // curseur ou liste déroulante sélectionnés : gauche / droite changent la valeur
    const adjustable = el && ((el.tagName === 'INPUT' && el.type === 'range') || el.tagName === 'SELECT');
    if (dir !== this.repeatDir) { this.repeatDir = dir; this.repeatAt = t + 320; if (dir) this.step(dir, adjustable, list); }
    else if (dir && t >= this.repeatAt) { this.repeatAt = t + 110; this.step(dir, adjustable, list); }
    if (edge(B.A) && this.cur) {
      const c = this.cur;
      if (c.tagName === 'INPUT' && c.type === 'checkbox') { c.checked = !c.checked; c.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (c.tagName === 'INPUT' && c.type !== 'range') c.focus();
      else c.click();
    }
    if (edge(B.X) && this.cur?.classList.contains('buy-item') && this.cur.classList.contains('owned')) this.game?.sellItem(this.cur.dataset.item);
    if (edge(B.B) || (edge(B.START) && this.game)) this.back(edge(B.START));
    if (edge(B.Y) && this.game?.buyOpen) this.game.rebuy();
  }
  step(dir, adjustable, list) {
    const el = this.cur;
    if (adjustable && (dir === 'left' || dir === 'right')) {
      const d = dir === 'right' ? 1 : -1;
      if (el.tagName === 'SELECT') { el.selectedIndex = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + d)); el.dispatchEvent(new Event('change', { bubbles: true })); }
      else { const st = parseFloat(el.step) || 1; el.value = Math.max(+el.min, Math.min(+el.max, parseFloat(el.value) + d * st)); el.dispatchEvent(new Event('input', { bubbles: true })); }
      return;
    }
    this.move(dir, list);
  }
  back(start) {
    const g = this.game && !this.game.destroyed ? this.game : null;
    if (g) {
      if (g.settingsOpen) return g.closeSettings();
      if (g.reportOpen) return document.getElementById('rp-close')?.click();
      if (g.buyOpen) return g.toggleBuy(false);
      if (g.paused) { g.showPause(false); return; }
      if (start && !g.ended) { g.showPause(true); return; }
      return;
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    const m = document.getElementById('mmodal'); if (m?.classList.contains('show')) m.querySelector('[data-close]')?.click();
  }
}

export const pad = new Pad();
