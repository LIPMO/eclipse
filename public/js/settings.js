// Menu de paramètres complet (utilisé dans le lobby et en jeu depuis le menu pause).
import { profile, save, DEFAULT_SETTINGS, DEFAULT_KEYS } from './store.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = () => profile.settings;

// ---------- noms des touches ----------
let layoutMap = null;
if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(m => { layoutMap = m; }).catch(() => {});
const SPECIAL = {
  Space: 'Espace', ShiftLeft: 'Maj G', ShiftRight: 'Maj D', ControlLeft: 'Ctrl G', ControlRight: 'Ctrl D', AltLeft: 'Alt', AltRight: 'Alt Gr',
  Tab: 'Tab', Enter: 'Entrée', Backspace: 'Retour', CapsLock: 'Verr. Maj', Escape: 'Échap', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Mouse0: 'Clic gauche', Mouse1: 'Clic molette', Mouse2: 'Clic droit', Mouse3: 'Souris 4', Mouse4: 'Souris 5', Backquote: '²',
};
export function keyName(code) {
  if (!code) return '—';
  if (SPECIAL[code]) return SPECIAL[code];
  const ch = layoutMap && layoutMap.get(code);
  if (ch) return ch.toUpperCase();
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Pavé ');
}

export const ACTIONS = [
  ['forward', 'Avancer'], ['back', 'Reculer'], ['left', 'Gauche'], ['right', 'Droite'],
  ['jump', 'Sauter'], ['crouch', 'S\'accroupir'], ['walk', 'Marcher (silencieux)'],
  ['fire', 'Tirer'], ['scope', 'Lunette'], ['reload', 'Recharger'],
  ['slot1', 'Arme principale'], ['slot2', 'Arme secondaire'], ['slot3', 'Couteau'],
  ['abilityQ', 'Capacité 1'], ['abilityE', 'Capacité 2'], ['ult', 'Ultime'],
  ['interact', 'Poser / désamorcer'], ['buy', 'Menu d\'achat'], ['scoreboard', 'Tableau des scores'], ['chat', 'Chat (tous)'],
  ['teamChat', 'Chat d\'équipe'], ['radio', 'Messages radio'], ['mark', 'Marquer une position (ping)'],
];

// ---------- viseur ----------
export function applyCrosshair(el, s = S(), extraGap = 0) {
  const [t, b, l, r, d] = ['.c-t', '.c-b', '.c-l', '.c-r', '.c-d'].map(q => el.querySelector(q));
  const len = Math.round(s.chLen), th = Math.max(1, Math.round(s.chThick));
  const gap = Math.round(s.chGap + (s.chDynamic ? extraGap : 0));
  const half = Math.floor(th / 2);
  const shadow = s.chOutline ? `0 0 0 ${s.chOutlineW}px rgba(0,0,0,${s.chOutlineOp})` : 'none';
  const show = s.chInner && len > 0;
  const common = (e, vis) => { e.style.background = s.chColor; e.style.opacity = s.chOp; e.style.boxShadow = shadow; e.style.display = vis ? 'block' : 'none'; };
  for (const e of [t, b]) { common(e, show); e.style.width = th + 'px'; e.style.height = len + 'px'; e.style.left = -half + 'px'; e.style.top = e.style.bottom = ''; }
  t.style.top = -(gap + len) + 'px';
  b.style.top = gap + 'px';
  if (s.chT) t.style.display = 'none';
  for (const e of [l, r]) { common(e, show); e.style.height = th + 'px'; e.style.width = len + 'px'; e.style.top = -half + 'px'; e.style.left = e.style.right = ''; }
  l.style.left = -(gap + len) + 'px';
  r.style.left = gap + 'px';
  const ds = Math.max(1, Math.round(s.chDotSize));
  common(d, s.chDot);
  d.style.width = d.style.height = ds + 'px';
  d.style.left = d.style.top = -Math.floor(ds / 2) + 'px';
}

const CH_KEYS = ['chColor', 'chOp', 'chOutline', 'chOutlineOp', 'chOutlineW', 'chDot', 'chDotSize', 'chInner', 'chLen', 'chThick', 'chGap', 'chT', 'chDynamic'];
const PRESETS = {
  'Par défaut': {},
  'Point': { chInner: false, chDot: true, chDotSize: 4, chColor: '#ffffff' },
  'Croix fine': { chLen: 5, chThick: 1, chGap: 3, chColor: '#00ff66', chOutline: false },
  'Grande croix': { chLen: 12, chThick: 3, chGap: 6, chColor: '#ffe500' },
  'Style T': { chT: true, chLen: 8, chGap: 3, chColor: '#ff4fd8', chDot: true, chDotSize: 2 },
  'Collé': { chLen: 4, chThick: 2, chGap: 0, chColor: '#00e5ff', chDynamic: false },
};
function crosshairCode() {
  const o = {}; for (const k of CH_KEYS) o[k] = S()[k];
  return 'ECL1-' + btoa(JSON.stringify(o));
}
function importCode(code) {
  try {
    const o = JSON.parse(atob(String(code).trim().replace(/^ECL1-/, '')));
    for (const k of CH_KEYS) if (k in o && typeof o[k] === typeof DEFAULT_SETTINGS[k]) S()[k] = o[k];
    return true;
  } catch { return false; }
}

// ---------- description des sections ----------
const SECTIONS = [
  { id: 'mouse', title: 'Souris', items: [
    { k: 'sens', t: 'range', label: 'Sensibilité', min: 0.05, max: 5, step: 0.01, num: true },
    { k: 'scopeSens', t: 'range', label: 'Multiplicateur en lunette', min: 0.2, max: 2, step: 0.05, num: true, hint: '1 = même vitesse de visée qu\'en vue normale (corrigée du zoom)' },
    { k: 'invertY', t: 'toggle', label: 'Inverser l\'axe vertical' },
  ] },
  { id: 'keys', title: 'Touches', custom: 'keys' },
  { id: 'crosshair', title: 'Viseur', custom: 'crosshair', items: [
    { k: 'chColor', t: 'color', label: 'Couleur' },
    { k: 'chOp', t: 'range', label: 'Opacité', min: 0.1, max: 1, step: 0.05, pct: true },
    { k: 'chInner', t: 'toggle', label: 'Afficher les traits' },
    { k: 'chLen', t: 'range', label: 'Longueur des traits', min: 1, max: 20, step: 1, unit: ' px' },
    { k: 'chThick', t: 'range', label: 'Épaisseur', min: 1, max: 8, step: 1, unit: ' px' },
    { k: 'chGap', t: 'range', label: 'Écart au centre', min: 0, max: 20, step: 1, unit: ' px' },
    { k: 'chT', t: 'toggle', label: 'Style T (sans trait du haut)' },
    { k: 'chDot', t: 'toggle', label: 'Point central' },
    { k: 'chDotSize', t: 'range', label: 'Taille du point', min: 1, max: 8, step: 1, unit: ' px' },
    { k: 'chOutline', t: 'toggle', label: 'Contour' },
    { k: 'chOutlineW', t: 'range', label: 'Épaisseur du contour', min: 1, max: 3, step: 1, unit: ' px' },
    { k: 'chOutlineOp', t: 'range', label: 'Opacité du contour', min: 0.1, max: 1, step: 0.05, pct: true },
    { k: 'chDynamic', t: 'toggle', label: 'Viseur dynamique (s\'écarte en mouvement et en rafale)' },
  ] },
  { id: 'video', title: 'Vidéo', items: [
    { k: 'fov', t: 'range', label: 'Champ de vision horizontal', min: 80, max: 120, step: 1, unit: '°', num: true },
    { k: 'vmFov', t: 'range', label: 'Champ de vision de l\'arme', min: 45, max: 85, step: 1, unit: '°' },
    { k: 'renderScale', t: 'range', label: 'Résolution de rendu', min: 0.5, max: 1, step: 0.05, pct: true, hint: 'Baisse-la pour gagner des FPS' },
    { k: 'brightness', t: 'range', label: 'Luminosité', min: 0.6, max: 1.6, step: 0.05, pct: true },
    { k: 'quality', t: 'select', label: 'Qualité graphique', opts: [['high', 'Haute (ombres)'], ['low', 'Basse (sans ombres)']], hint: 'Appliquée à la prochaine partie' },
  ] },
  { id: 'hud', title: 'Interface', items: [
    { k: 'minimap', t: 'toggle', label: 'Afficher la mini-carte' },
    { k: 'hitmarker', t: 'toggle', label: 'Marqueur de touche' },
    { k: 'killcam', t: 'toggle', label: 'Killcam (revoir les 3 dernières secondes avant ta mort)' },
    { k: 'fps', t: 'toggle', label: 'Afficher les FPS' },
    { k: 'bob', t: 'toggle', label: 'Balancement de l\'arme en marchant' },
    { k: 'leftHand', t: 'toggle', label: 'Arme à gauche' },
    { k: 'enemyColor', t: 'select', label: 'Couleur des ennemis', opts: [['#ff4f6d', 'Rouge'], ['#ffd400', 'Jaune (daltonisme)'], ['#c04dff', 'Violet (daltonisme)']] },
  ] },
  { id: 'audio', title: 'Audio', items: [
    { k: 'vol', t: 'range', label: 'Volume général', min: 0, max: 1, step: 0.05, pct: true },
    { k: 'hitSound', t: 'toggle', label: 'Son de touche' },
  ] },
  { id: 'touch', title: 'Tactile', items: [
    { k: 'touchSens', t: 'range', label: 'Sensibilité de la visée au doigt', min: 0.2, max: 3, step: 0.05, num: true, hint: 'Téléphone et tablette' },
    { k: 'touchSize', t: 'range', label: 'Taille des boutons', min: 0.7, max: 1.4, step: 0.05, pct: true },
    { k: 'touchOpacity', t: 'range', label: 'Opacité des boutons', min: 0.2, max: 1, step: 0.05, pct: true },
  ] },
];

function changed(key) {
  save();
  document.dispatchEvent(new CustomEvent('settings-changed', { detail: { key } }));
}

function fmt(it, v) {
  if (it.pct) return Math.round(v * 100) + ' %';
  return (it.step < 1 ? Number(v).toFixed(it.step < 0.1 ? 2 : 1) : v) + (it.unit || '');
}

function itemHTML(it) {
  const v = S()[it.k];
  const hint = it.hint ? `<small>${esc(it.hint)}</small>` : '';
  let ctrl = '';
  if (it.t === 'range') ctrl = `<input type="range" data-k="${it.k}" min="${it.min}" max="${it.max}" step="${it.step}" value="${v}">` +
    (it.num ? `<input type="number" class="num" data-num="${it.k}" min="${it.min}" max="${it.max}" step="${it.step}" value="${v}">` : `<span class="val" data-val="${it.k}">${fmt(it, v)}</span>`);
  else if (it.t === 'toggle') ctrl = `<label class="switch"><input type="checkbox" data-k="${it.k}" ${v ? 'checked' : ''}><i></i></label>`;
  else if (it.t === 'color') ctrl = `<input type="color" data-k="${it.k}" value="${v}"><span class="val">${v}</span>`;
  else if (it.t === 'select') ctrl = `<select data-k="${it.k}">${it.opts.map(([o, l]) => `<option value="${o}" ${o === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="set-row"><div class="set-label">${esc(it.label)}${hint}</div><div class="set-ctrl">${ctrl}</div></div>`;
}

// ---------- montage ----------
let root = null, current = 'mouse', rebinding = null;

export function mountSettings(container) {
  if (!root) {
    root = document.createElement('div');
    root.className = 'settings';
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('click', onClick);
  }
  container.appendChild(root);
  render();
}
export function isRebinding() { return !!rebinding; }

function render() {
  const sec = SECTIONS.find(s => s.id === current);
  let body = '';
  if (sec.custom === 'keys') body = keysHTML();
  else if (sec.custom === 'crosshair') body = crosshairHTML(sec);
  else body = sec.items.map(itemHTML).join('');
  root.innerHTML = `<nav class="set-nav">${SECTIONS.map(s => `<button data-sec="${s.id}" class="${s.id === current ? 'active' : ''}">${s.title.toUpperCase()}</button>`).join('')}</nav>
    <div class="set-body"><div class="set-head"><h2>${sec.title.toUpperCase()}</h2><button class="btn ghost small" data-reset="${sec.id}">RÉINITIALISER</button></div>${body}</div>`;
  const prev = root.querySelector('#ch-preview .xhair');
  if (prev) applyCrosshair(prev);
}

function keysHTML() {
  const k = S().keys;
  return `<p class="set-note">Clique sur une commande puis appuie sur une touche ou un bouton de souris (Échap pour annuler). Si la touche est déjà utilisée, les deux commandes sont échangées.</p>
    <div class="keys-grid">${ACTIONS.map(([a, label]) => `<div class="set-row"><div class="set-label">${label}</div><div class="set-ctrl"><button class="keybtn ${rebinding === a ? 'wait' : ''}" data-bind="${a}">${rebinding === a ? 'Appuie sur une touche…' : esc(keyName(k[a]))}</button></div></div>`).join('')}</div>
    <p class="set-note warn">Attention : dans un navigateur, Ctrl + W ferme l'onglet. Évite Ctrl pour s'accroupir si tu avances avec W.</p>`;
}

function crosshairHTML(sec) {
  return `<div class="ch-top">
      <div id="ch-preview" class="ch-preview bg-0"><div class="xhair"><i class="c-t"></i><i class="c-b"></i><i class="c-l"></i><i class="c-r"></i><i class="c-d"></i></div>
        <div class="ch-bgs"><button data-bg="0" title="Fond sombre"></button><button data-bg="1" title="Fond clair"></button><button data-bg="2" title="Fond désert"></button><button data-bg="3" title="Fond néon"></button></div></div>
      <div class="ch-side">
        <div class="set-label">Modèles</div>
        <div class="ch-presets">${Object.keys(PRESETS).map(n => `<button class="btn ghost small" data-preset="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        <div class="set-label">Code du viseur</div>
        <div class="ch-code"><input id="ch-code" value="${crosshairCode()}" spellcheck="false"><button class="btn small" data-copy>COPIER</button><button class="btn small" data-import>IMPORTER</button></div>
      </div>
    </div>${sec.items.map(itemHTML).join('')}`;
}

function onInput(e) {
  const el = e.target;
  const k = el.dataset.k || el.dataset.num;
  if (!k) return;
  const it = SECTIONS.flatMap(s => s.items || []).find(i => i.k === k);
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'range' || el.type === 'number') { v = parseFloat(el.value); if (!Number.isFinite(v)) return; v = Math.min(it.max, Math.max(it.min, v)); }
  else v = el.value;
  S()[k] = v;
  if (el.dataset.num) { const r = root.querySelector(`input[type=range][data-k="${k}"]`); if (r) r.value = v; }
  else if (it?.num) { const n = root.querySelector(`[data-num="${k}"]`); if (n && document.activeElement !== n) n.value = v; }
  const val = root.querySelector(`[data-val="${k}"]`); if (val) val.textContent = fmt(it, v);
  if (el.type === 'color') el.nextElementSibling.textContent = v;
  if (k.startsWith('ch')) { applyCrosshair(root.querySelector('#ch-preview .xhair')); const c = root.querySelector('#ch-code'); if (c) c.value = crosshairCode(); }
  changed(k);
}

function onClick(e) {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.sec) { current = t.dataset.sec; rebinding = null; render(); return; }
  if (t.dataset.reset) {
    const sec = SECTIONS.find(s => s.id === t.dataset.reset);
    if (sec.id === 'keys') S().keys = { ...DEFAULT_KEYS };
    for (const it of sec.items || []) S()[it.k] = DEFAULT_SETTINGS[it.k];
    render(); changed('*'); return;
  }
  if (t.dataset.preset) {
    for (const k of CH_KEYS) S()[k] = DEFAULT_SETTINGS[k];
    Object.assign(S(), PRESETS[t.dataset.preset]);
    render(); changed('chColor'); return;
  }
  if (t.dataset.bg !== undefined) { root.querySelector('#ch-preview').className = 'ch-preview bg-' + t.dataset.bg; return; }
  if (t.dataset.copy !== undefined) {
    const inp = root.querySelector('#ch-code');
    inp.select();
    (navigator.clipboard?.writeText(inp.value) || Promise.reject()).then(() => { t.textContent = 'COPIÉ ✓'; }).catch(() => { document.execCommand('copy'); t.textContent = 'COPIÉ ✓'; });
    setTimeout(() => { t.textContent = 'COPIER'; }, 1500);
    return;
  }
  if (t.dataset.import !== undefined) {
    const ok = importCode(root.querySelector('#ch-code').value);
    if (ok) { render(); changed('chColor'); } else { t.textContent = 'CODE INVALIDE'; setTimeout(() => { t.textContent = 'IMPORTER'; }, 1500); }
    return;
  }
  if (t.dataset.bind) startRebind(t.dataset.bind);
}

function startRebind(action) {
  rebinding = action;
  render();
  const finish = code => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('mousedown', onMouse, true);
    if (code) {
      const keys = S().keys;
      const other = Object.keys(keys).find(a => a !== action && keys[a] === code);
      if (other) keys[other] = keys[action];
      keys[action] = code;
      changed('keys');
    }
    rebinding = null;
    render();
  };
  const onKey = e => {
    e.preventDefault(); e.stopImmediatePropagation();
    finish(e.code === 'Escape' ? null : e.code);
  };
  const onMouse = e => {
    e.preventDefault(); e.stopImmediatePropagation();
    finish('Mouse' + e.button);
  };
  // le clic qui a lancé la réassignation est déjà terminé : on écoute tout de suite
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('mousedown', onMouse, true);
}
