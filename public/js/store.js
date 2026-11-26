// Profil local (pseudo, Éclats, skins possédés/équipés, paramètres)
import { SKINNABLE } from '/shared/data.js';
const KEY = 'eclipse_profile_v1';
export const DEFAULT_KEYS = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'KeyC', walk: 'ShiftLeft',
  fire: 'Mouse0', scope: 'Mouse2', reload: 'KeyR', slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3',
  abilityQ: 'KeyQ', abilityE: 'KeyE', ult: 'KeyX', interact: 'KeyF', buy: 'KeyB', scoreboard: 'Tab', chat: 'Enter',
  teamChat: 'KeyY', radio: 'KeyT', mark: 'Mouse1', emote: 'KeyV', inspect: 'KeyG', react: 'KeyH',
  drop: 'KeyJ', lastWeapon: 'KeyZ', bigMap: 'KeyM', ready: 'KeyP', rebuy: 'KeyN', muteAll: 'F8',
};
export const DEFAULT_SETTINGS = {
  // souris
  sound3d: true,
  sens: 1, sensY: 1, scopeSens: 1, invertY: false, touchSens: 1, touchSize: 1, touchOpacity: 0.55, touchLeft: false,
  // vidéo
  fov: 100, vmFov: 62, renderScale: 1, brightness: 1.05, quality: 'high', gfxPreset: 'custom', fpsCap: 0, lowFpsTip: true, bloom: true, relief: true, particles: true,
  // interface
  fps: false, minimap: true, hitmarker: true, killcam: true, bob: true, leftHand: false, enemyColor: '#ff4f6d', allyColor: '#19e3c4',
  netGraph: false, damageNumbers: true, dmgNumPos: 'target', chatMode: 'all', chatSize: 1, hudScale: 1, confirmQuit: true,
  minimapRotate: false, minimapZoom: 1, heardOnMap: true, chEnemy: false, lowAmmoWarn: true, roundBeeps: true, dmgReport: true,
  // commandes
  crouchToggle: false, walkToggle: false, scopeHold: false, autoReload: true, slide: true,
  // 1.15
  killSound: 'classic', sightColor: 'red', adsZoomMul: 1, showSpeed: false, slideTilt: true, showClock: false, hideEmotes: false,
  // manette
  gpSens: 1, gpSensY: 1, gpInvert: false, gpDeadzone: 0.15, gpAimAssist: true, gpVibration: true,
  // langue
  lang: 'fr',
  // accessibilité et confidentialité
  colorblind: 'none', reduceMotion: false, streamer: false, readableFont: false, menuTheme: 'dark', uiFont: 1, highContrast: false, soundRing: false, subtitles: false, shakeAmount: 1, noFlash: false,
  // notifications
  notifFriends: true, notifClan: true, notifTour: true, notifInvite: true, notifSound: true, notifFriendOnline: true,
  syncAccount: true,
  // audio
  vol: 0.6, hitSound: true, volWeapons: 1, volSteps: 1, volAbilities: 1, volUi: 1, volNotif: 1,
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
  // favoris de la boutique : ceux du compte font foi
  if (Array.isArray(p.progress?.loadouts) && p.progress.loadouts.length === 3) data.loadouts = p.progress.loadouts.slice();
}
export function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* stockage indisponible */ } }
