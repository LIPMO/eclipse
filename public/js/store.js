// Profil local (pseudo, Éclats, skins possédés/équipés, paramètres)
import { SKINNABLE } from '/shared/data.js';
const KEY = 'eclipse_profile_v1';
export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'KeyC', walk: 'ShiftLeft',
  fire: 'Mouse0', scope: 'Mouse2', reload: 'KeyR', slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3',
  abilityQ: 'KeyQ', abilityE: 'KeyE', ult: 'KeyX', interact: 'KeyF', buy: 'KeyB', scoreboard: 'Tab', chat: 'Enter',
  teamChat: 'KeyY', radio: 'KeyT',
};
export const DEFAULT_SETTINGS = {
  // souris
  sens: 1, scopeSens: 1, invertY: false,
  // vidéo
  fov: 100, vmFov: 62, renderScale: 1, brightness: 1.05, quality: 'high',
  // interface
  fps: false, minimap: true, hitmarker: true, bob: true, leftHand: false, enemyColor: '#ff4f6d',
  // audio
  vol: 0.6, hitSound: true,
  // viseur
  chColor: '#6dfff0', chOp: 1, chOutline: true, chOutlineOp: 0.6, chOutlineW: 1, chDot: false, chDotSize: 2,
  chInner: true, chLen: 7, chThick: 2, chGap: 4, chT: false, chDynamic: true,
  keys: { ...DEFAULT_KEYS },
};
const defaults = () => ({
  name: '', eclats: 600, owned: ['default'], equipped: Object.fromEntries(SKINNABLE.map(w => [w, 'default'])),
  agent: 'ignis',
  settings: structuredClone(DEFAULT_SETTINGS),
});
let data;
try { data = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { data = defaults(); }
const savedSettings = data.settings || {};
if (savedSettings.cross && !savedSettings.chColor) savedSettings.chColor = savedSettings.cross; // ancienne version
data.settings = { ...structuredClone(DEFAULT_SETTINGS), ...savedSettings, keys: { ...DEFAULT_KEYS, ...(savedSettings.keys || {}) } };
delete data.settings.cross;
data.equipped = { ...defaults().equipped, ...(data.equipped || {}) };
export const profile = data;
// Session de compte (jeton). Les données du compte viennent du serveur.
export const session = { token: null, account: false };
try { session.token = localStorage.getItem('eclipse_token'); } catch { /* indisponible */ }
export function setToken(t) { session.token = t; try { if (t) localStorage.setItem('eclipse_token', t); else localStorage.removeItem('eclipse_token'); } catch { /* indisponible */ } }
export function applyServerProfile(p) {
  data.name = p.name; data.eclats = p.eclats; data.owned = p.owned.slice(); data.equipped = { ...data.equipped, ...p.equipped }; data.agent = p.agent || data.agent; data.stats = p.stats; data.progress = p.progress || null;
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* stockage indisponible */ } }
