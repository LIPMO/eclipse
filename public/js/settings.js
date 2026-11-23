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
  ['teamChat', 'Chat d\'équipe'], ['radio', 'Messages radio'], ['mark', 'Marquer une position (ping)'], ['emote', 'Émotes'], ['inspect', 'Inspecter l\'arme'],
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
    { k: 'sensY', t: 'range', label: 'Multiplicateur vertical', min: 0.3, max: 2, step: 0.05, num: true, hint: '1 = même vitesse à la verticale qu\'à l\'horizontale' },
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
    { k: 'gfxPreset', t: 'select', label: 'Préréglage graphique', opts: [['custom', 'Personnalisé'], ['low', 'PC faible (le plus fluide)'], ['medium', 'Moyen'], ['high', 'Haut'], ['ultra', 'Ultra']], hint: 'Règle d\'un coup la qualité, la résolution et les effets' },
    { k: 'fpsCap', t: 'select', label: 'Limite d\'images par seconde', opts: [['0', 'Illimitée'], ['30', '30 FPS'], ['60', '60 FPS'], ['90', '90 FPS'], ['120', '120 FPS'], ['144', '144 FPS']], hint: 'Économise la batterie et réduit la chauffe' },
    { k: 'lowFpsTip', t: 'toggle', label: 'Proposer le préréglage « PC faible » si le jeu rame' },
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
    { k: 'allyColor', t: 'select', label: 'Couleur des alliés', opts: [['#19e3c4', 'Turquoise'], ['#3d8bff', 'Bleu'], ['#7dff6b', 'Vert'], ['#ffffff', 'Blanc']], hint: 'Appliquée à la prochaine partie' },
    { k: 'hudScale', t: 'range', label: 'Taille de l\'interface en partie', min: 0.7, max: 1.3, step: 0.05, pct: true },
    { k: 'damageNumbers', t: 'toggle', label: 'Afficher les dégâts infligés (chiffres)' },
    { k: 'netGraph', t: 'toggle', label: 'Graphique réseau (ping et FPS)' },
    { k: 'confirmQuit', t: 'toggle', label: 'Demander confirmation avant de quitter une partie' },
  ] },
  { id: 'chat', title: 'Chat', items: [
    { k: 'chatMode', t: 'select', label: 'Messages affichés en partie', opts: [['all', 'Tous'], ['team', 'Mon équipe uniquement'], ['off', 'Aucun (chat masqué)']], hint: 'Les messages du système et de la modération restent affichés' },
    { k: 'chatSize', t: 'range', label: 'Taille du texte du chat', min: 0.8, max: 1.5, step: 0.05, pct: true },
  ] },
  { id: 'access', title: 'Accessibilité', items: [
    { k: 'colorblind', t: 'select', label: 'Filtre daltonien', opts: [['none', 'Aucun'], ['protan', 'Protanopie (rouge)'], ['deutan', 'Deutéranopie (vert)'], ['tritan', 'Tritanopie (bleu)']], hint: 'Corrige les couleurs du jeu pour mieux distinguer alliés et ennemis' },
    { k: 'reduceMotion', t: 'toggle', label: 'Réduire les mouvements', hint: 'Sans secousses de caméra, sans balancement de l\'arme et avec moins d\'animations' },
    { k: 'uiFont', t: 'range', label: 'Taille du texte des menus', min: 0.85, max: 1.4, step: 0.05, pct: true, hint: 'Agrandit tous les textes et boutons du menu principal' },
    { k: 'highContrast', t: 'toggle', label: 'Contraste élevé', hint: 'Textes plus clairs, bordures plus visibles et image de jeu plus contrastée' },
    { k: 'subtitles', t: 'toggle', label: 'Sous-titres des sons importants', hint: 'Affiche « Pas ennemis → », « Tir ennemi ← », explosions, capacités… avec leur direction' },
    { k: 'shakeAmount', t: 'range', label: 'Intensité des secousses de caméra', min: 0, max: 1, step: 0.05, pct: true, hint: '0 % = aucune secousse' },
    { k: 'noFlash', t: 'toggle', label: 'Atténuer les flashs lumineux', hint: 'Les aveuglements deviennent un voile sombre au lieu d\'un écran blanc' },
    { k: 'streamer', t: 'toggle', label: 'Mode streamer', hint: 'Masque les pseudos des autres joueurs et les codes de salon' },
  ] },
  { id: 'notifs', title: 'Notifications', items: [
    { k: 'notifFriends', t: 'toggle', label: 'Amis (demandes et messages privés)' },
    { k: 'notifFriendOnline', t: 'toggle', label: 'Quand un ami se connecte' },
    { k: 'notifInvite', t: 'toggle', label: 'Invitations dans un salon' },
    { k: 'notifClan', t: 'toggle', label: 'Clan (invitations)' },
    { k: 'notifTour', t: 'toggle', label: 'Nouveaux tournois', hint: 'L\'avis « ton match est prêt » reste toujours affiché' },
    { k: 'notifSound', t: 'toggle', label: 'Son des notifications' },
  ] },
  { id: 'audio', title: 'Audio', items: [
    { k: 'vol', t: 'range', label: 'Volume général', min: 0, max: 1, step: 0.05, pct: true },
    { k: 'hitSound', t: 'toggle', label: 'Son de touche' },
    { k: 'volWeapons', t: 'range', label: 'Volume : armes et dégâts', min: 0, max: 1.5, step: 0.05, pct: true },
    { k: 'volSteps', t: 'range', label: 'Volume : pas et déplacements', min: 0, max: 1.5, step: 0.05, pct: true },
    { k: 'volAbilities', t: 'range', label: 'Volume : capacités et explosions', min: 0, max: 1.5, step: 0.05, pct: true },
    { k: 'volUi', t: 'range', label: 'Volume : interface (manches, séries, niveaux)', min: 0, max: 1.5, step: 0.05, pct: true },
    { k: 'volNotif', t: 'range', label: 'Volume : notifications et marqueurs', min: 0, max: 1.5, step: 0.05, pct: true },
  ] },
  { id: 'touch', title: 'Tactile', items: [
    { k: 'touchSens', t: 'range', label: 'Sensibilité de la visée au doigt', min: 0.2, max: 3, step: 0.05, num: true, hint: 'Téléphone et tablette' },
    { k: 'touchSize', t: 'range', label: 'Taille des boutons', min: 0.7, max: 1.4, step: 0.05, pct: true },
    { k: 'touchOpacity', t: 'range', label: 'Opacité des boutons', min: 0.2, max: 1, step: 0.05, pct: true },
    { k: 'touchLeft', t: 'toggle', label: 'Mode gaucher (joystick à droite, boutons à gauche)' },
  ] },
  { id: 'profiles', title: 'Profils', custom: 'profiles', items: [
    { k: 'syncAccount', t: 'toggle', label: 'Sauvegarder mes paramètres sur mon compte', hint: 'Tu les retrouves sur n\'importe quel appareil en te connectant' },
  ] },
];
const GFX = {
  low: { quality: 'low', renderScale: 0.7, fpsCap: 0, bob: false },
  medium: { quality: 'low', renderScale: 0.9 },
  high: { quality: 'high', renderScale: 1 },
  ultra: { quality: 'high', renderScale: 1, fpsCap: 0 },
};
export function applyPreset(name) { if (GFX[name]) { Object.assign(S(), GFX[name]); S().gfxPreset = name; save(); document.dispatchEvent(new CustomEvent('settings-changed', { detail: { key: '*' } })); } }
// export / import de tous les réglages (code texte)
function settingsCode() { const o = { ...S() }; return 'ECLS1-' + btoa(unescape(encodeURIComponent(JSON.stringify(o)))); }
export function sanitizeSettings(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const [k, v] of Object.entries(o)) {
    if (k === 'keys' && v && typeof v === 'object') { out.keys = {}; for (const [a, c] of Object.entries(v)) if (a in DEFAULT_KEYS && typeof c === 'string' && c.length <= 24) out.keys[a] = c; continue; }
    if (!(k in DEFAULT_SETTINGS) || k === 'keys') continue;
    if (typeof v !== typeof DEFAULT_SETTINGS[k]) continue;
    if (typeof v === 'string' && v.length > 40) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    out[k] = v;
  }
  return out;
}
function importSettings(code) {
  try {
    const o = JSON.parse(decodeURIComponent(escape(atob(String(code).trim().replace(/^ECLS1-/, '')))));
    const clean = sanitizeSettings(o);
    if (!Object.keys(clean).length) return false;
    const keys = clean.keys; delete clean.keys;
    Object.assign(S(), clean); if (keys) Object.assign(S().keys, keys);
    return true;
  } catch { return false; }
}
function slots() { profile.settingsSlots ||= [null, null, null]; return profile.settingsSlots; }

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
  else if (it.t === 'select') ctrl = `<select data-k="${it.k}">${it.opts.map(([o, l]) => `<option value="${o}" ${String(o) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<div class="set-row"><div class="set-label">${esc(it.label)}${hint}</div><div class="set-ctrl">${ctrl}</div></div>`;
}

// ---------- montage ----------
let root = null, current = 'mouse', rebinding = null, search = '';

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
// raccourcis : « / » ou Ctrl+F place le curseur dans la recherche, Échap l'efface
document.addEventListener('keydown', e => {
  if (!root || !root.isConnected || rebinding || !root.offsetParent) return;
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if ((e.key === '/' && !inField) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
    e.preventDefault(); const si = root.querySelector('#set-search'); si?.focus(); si?.select(); return;
  }
  if (e.key === 'Escape' && document.activeElement?.id === 'set-search' && search) { e.preventDefault(); e.stopPropagation(); search = ''; render(); }
}, true);

function render() {
  const sec = SECTIONS.find(s => s.id === current);
  let body = '';
  if (search) body = searchHTML();
  else if (sec.custom === 'keys') body = keysHTML();
  else if (sec.custom === 'profiles') body = profilesHTML(sec);
  else if (sec.custom === 'crosshair') body = crosshairHTML(sec);
  else body = sec.items.map(itemHTML).join('');
  root.innerHTML = `<nav class="set-nav"><input class="set-search" id="set-search" placeholder="🔍 Rechercher… (touche /)" title="Raccourci : / ou Ctrl+F pour chercher, Échap pour effacer" value="${esc(search)}" maxlength="30">${SECTIONS.map(s => `<button data-sec="${s.id}" class="${s.id === current && !search ? 'active' : ''}">${s.title.toUpperCase()}</button>`).join('')}</nav>
    <div class="set-body"><div class="set-head"><h2>${search ? 'RÉSULTATS' : sec.title.toUpperCase()}</h2>${search ? '' : `<button class="btn ghost small" data-reset="${sec.id}">RÉINITIALISER</button>`}</div>${body}</div>`;
  if (search) { const si = root.querySelector('#set-search'); si.focus(); si.setSelectionRange(si.value.length, si.value.length); }
  const prev = root.querySelector('#ch-preview .xhair');
  if (prev) applyCrosshair(prev);
}

function searchHTML() {
  const q = search.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const norm = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const hits = SECTIONS.flatMap(s => (s.items || []).filter(i => norm(i.label + ' ' + (i.hint || '') + ' ' + s.title).includes(q)).map(i => ({ ...i, sec: s.title })));
  const keyHits = ACTIONS.filter(([, l]) => norm(l).includes(q));
  return (hits.map(i => itemHTML(i).replace('<div class="set-label">', `<div class="set-label"><span class="set-sec">${esc(i.sec)} ›</span> `)).join('') || '')
    + (keyHits.length ? `<p class="set-note">Touches correspondantes (clique pour changer) :</p>${keyHits.map(([a, l]) => `<div class="set-row"><div class="set-label"><span class="set-sec">Touches ›</span> ${esc(l)}</div><div class="set-ctrl"><button class="keybtn ${rebinding === a ? 'wait' : ''}" data-bind="${a}">${rebinding === a ? 'Appuie sur une touche…' : esc(keyName(S().keys[a]))}</button></div></div>`).join('')}` : '')
    || '<p class="set-note">Aucun réglage ne correspond.</p>';
}
function profilesHTML(sec) {
  const sl = slots();
  return `<p class="set-note">Enregistre jusqu'à 3 profils (par exemple « Compétitif », « Détente », « Portable ») et passe de l'un à l'autre en un clic.</p>
    <div class="prof-slots">${sl.map((p, i) => `<div class="prof-slot"><b>${p ? esc(p.name) : `Emplacement ${i + 1}`}</b><span class="muted small">${p ? 'enregistré le ' + new Date(p.t).toLocaleDateString('fr-FR') : 'vide'}</span>
      <div class="prof-acts"><button class="btn small" data-slot-save="${i}">ENREGISTRER ICI</button>${p ? `<button class="btn small primary" data-slot-load="${i}">CHARGER</button><button class="btn small ghost" data-slot-del="${i}">✕</button>` : ''}</div></div>`).join('')}</div>
    <div class="set-label" style="margin-top:18px">Code de tous mes réglages</div>
    <div class="ch-code"><input id="set-code" value="${settingsCode()}" spellcheck="false"><button class="btn small" data-scopy>COPIER</button><button class="btn small" data-simport>IMPORTER</button></div>
    <p class="set-note">Partage ce code ou colle celui d'un ami pour reprendre ses réglages (touches, viseur, sensibilité, graphismes…).</p>
    ${sec.items.map(itemHTML).join('')}`;
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
  if (el.id === 'set-search') { search = el.value.trim(); render(); return; }
  const k = el.dataset.k || el.dataset.num;
  if (!k) return;
  const it = SECTIONS.flatMap(s => s.items || []).find(i => i.k === k);
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'range' || el.type === 'number') { v = parseFloat(el.value); if (!Number.isFinite(v)) return; v = Math.min(it.max, Math.max(it.min, v)); }
  else v = el.value;
  if (k === 'fpsCap') v = Number(v) || 0;
  if (k === 'gfxPreset') { if (v !== 'custom') { applyPreset(v); render(); } else { S().gfxPreset = 'custom'; changed(k); } return; }
  if (['quality', 'renderScale'].includes(k)) S().gfxPreset = 'custom';
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
  if (t.dataset.sec) { current = t.dataset.sec; search = ''; rebinding = null; render(); return; }
  if (t.dataset.slotSave !== undefined) {
    const i = +t.dataset.slotSave, sl = slots();
    const name = (prompt('Nom du profil :', sl[i]?.name || `Profil ${i + 1}`) || '').replace(/[<>]/g, '').trim().slice(0, 24);
    if (!name) return;
    sl[i] = { name, t: Date.now(), data: structuredClone(S()) }; save(); render(); return;
  }
  if (t.dataset.slotLoad !== undefined) {
    const p = slots()[+t.dataset.slotLoad]; if (!p) return;
    const clean = sanitizeSettings(p.data); const keys = clean.keys; delete clean.keys;
    Object.assign(S(), clean); if (keys) Object.assign(S().keys, keys);
    render(); changed('*'); return;
  }
  if (t.dataset.slotDel !== undefined) { slots()[+t.dataset.slotDel] = null; save(); render(); return; }
  if (t.dataset.scopy !== undefined) { const inp = root.querySelector('#set-code'); inp.select(); (navigator.clipboard?.writeText(inp.value) || Promise.reject()).then(() => { t.textContent = 'COPIÉ ✓'; }).catch(() => { document.execCommand('copy'); t.textContent = 'COPIÉ ✓'; }); setTimeout(() => { t.textContent = 'COPIER'; }, 1500); return; }
  if (t.dataset.simport !== undefined) {
    if (importSettings(root.querySelector('#set-code').value)) { render(); changed('*'); }
    else { t.textContent = 'CODE INVALIDE'; setTimeout(() => { t.textContent = 'IMPORTER'; }, 1500); }
    return;
  }
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
