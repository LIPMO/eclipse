// Client de jeu : rendu, prédiction du mouvement local, tir, capacités, HUD.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { parseMap, CELL, MAP_INFO } from '/shared/maps.js';
const MAP_NAMES = Object.fromEntries(Object.entries(MAP_INFO).map(([id, i]) => [id, i.name]));
import { WEAPONS, AGENTS, MOVE, PLAYER, ARMOR, ROUND, isFfa, GUN_LADDER, KIT, WEAPON_RULES, customSummary } from '/shared/data.js';
import { tr } from './i18n.js';
import { collideMove, depenetrate, raycastBoxes, rayAABB, raySphere, hitboxes, dirFromAngles, norm } from '/shared/physics.js';
import { envTexture, normalMapFor, buildWeapon, buildCharacter, setCharacterOpacity, animateSkins, agentIconHTML, drawMapPreview } from './models.js';
import * as SFX from './audio.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { pad } from './gamepad.js';
import { emojify, isFriendName, openFeedback } from './hub.js';
import { profile, save } from './store.js';
import { mountSettings, isRebinding, applyCrosshair, keyName } from './settings.js';
import { WEAPON_UNLOCK, RADIO, REPORT_REASONS } from '/shared/progress.js';

const $ = id => document.getElementById(id);
let ALLY = '#19e3c4';
const ENEMY = '#ff4f6d';
const TROLL_NAMES = { upside: 'écran à l\'envers', spin: 'vertige', drunk: 'caméra ivre', invert: 'commandes inversées', pixel: 'écran pixelisé', rainbow: 'arc-en-ciel', bighead: 'grosse tête', tiny: 'minuscule', duck: 'tirs « coin-coin »', fakeban: 'faux bannissement', fakedc: 'fausse déconnexion', confetti: 'confettis', dance: 'danse', flash: 'flash', freeze: 'gel sur place' };
const SIGHT_COLORS = { red: '#ff2a2a', green: '#3dff6a', blue: '#3da8ff', yellow: '#ffe14d', pink: '#ff4fd8', white: '#ffffff' };
const EMOTES = ['👍 GG', '😂 Mdr', '🔥 En feu !', '😮 Oups', '👏 Bien joué', '😎 Trop facile', '🙏 Désolé', '💀 RIP'];
const ULTS = new Set(['overdrive', 'megasmoke', 'hunt', 'fortress', 'phantom', 'firestorm', 'blizzard']);
const TIPS = [
  'Clic molette : marque une position pour ton équipe. Vise un ennemi pour une alerte rouge.',
  'Marcher (Maj) rend tes pas silencieux : les ennemis ne t\'entendent plus.',
  'Accroupi, ta précision augmente de 25 %.',
  'En courant, appuie sur S\'ACCROUPIR pour glisser : tu deviens petit et rapide, mais tu tires moins précisément.',
  'Saute pendant une glissade pour garder ton élan.',
  'Le Longbow tue en un tir à la tête… mais il faut viser avec la lunette.',
  'Clic droit avec le Viper, le Brute, le Tempest ou le Lancer : tu vises au viseur, plus précis mais plus lent.',
  'Après ta mort, la killcam te montre d\'où venait le tir.',
  'Tes capacités se rechargent en Mêlée : utilise-les souvent !',
  'En Assaut, garde de l\'argent pour la manche suivante si tu perds.',
  'Une série de 5 éliminations est annoncée à tout le serveur.',
  'En Mêlée, abattre le meneur 👑 rapporte 150 points de bonus.',
  'Touche V : émotes rapides. Touche G : inspecter ton arme.',
  'Rejoins un clan pour faire grimper son classement à chaque partie.',
  'Le champ de tir (Entraînement → Champ de tir) est parfait pour t\'échauffer.',
];
const ICONS = { smoke: '◍', molotov: '✹', flash: '✦', dash: '➤', heal: '✚', recon: '◎', wall: '▦', shield: '⛉', blink: '⇢', invis: '◌', overdrive: 'ϟ', megasmoke: '☁', hunt: '◉', fortress: '⛨', phantom: '☾', firestorm: '⚡', haste: '»', cryo: '❄', blizzard: '❅' };
const REASONS = { elim: 'ÉQUIPE ADVERSE ÉLIMINÉE', time: 'TEMPS ÉCOULÉ', explode: 'NOYAU DÉTONÉ', defuse: 'NOYAU DÉSAMORCÉ', hp: 'TEMPS ÉCOULÉ — AVANTAGE PV', draw: 'TEMPS ÉCOULÉ — PV IDENTIQUES', admin: 'MANCHE ANNULÉE PAR L\'ÉQUIPE' };
const VM_OFFSET = {
  knife: [0.27, -0.25, -0.48], pistol: [0.22, -0.22, -0.52], heavypistol: [0.22, -0.22, -0.52], smg: [0.23, -0.24, -0.52],
  shotgun: [0.23, -0.25, -0.48], dmr: [0.23, -0.25, -0.46], rifle: [0.23, -0.25, -0.46], sniper: [0.23, -0.26, -0.42],
};
const lerpAngle = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; };
const fmtTime = s => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ST = () => profile.settings;
const KB = a => keyName(profile.settings.keys[a]);

export class Game {
  constructor(net, start, onExit) {
    this.net = net;
    this.onExit = onExit;
    this.myId = start.you;
    ALLY = ST().allyColor || '#19e3c4';
    this.mode = start.mode;
    this.isGuest = !!start.guest;
    this.target = start.target;
    this.level = start.level || 1;
    this.unlocks = !!start.unlocks;
    this.chatTeam = false; this.radioOpen = false; this.reportOpen = false;
    this.map = parseMap(start.mapId);
    this.roster = new Map();
    this.others = new Map();
    this.snap = null;
    this.me = null;
    this.self = null;
    this.offset = null;
    this.held = new Set();
    this.codeMap = {};
    this.chExtra = -1;
    this.local = {
      pos: [this.map.size[0] / 2, 0, this.map.size[1] / 2], vel: [0, 0, 0], yaw: 0, pitch: 0, onGround: true, crouch: false,
      eyeH: PLAYER.eye, slot: 2, mag: 12, reserve: 36, reloadEnd: 0, nextFire: 0, recoil: 0, burst: 0, lastShot: -10,
      dashT: 0, alive: false, stepT: 0, triggerHeld: false, switchT: 0, abilityCd: 0, flashUntil: 0, flashDur: 1, hurtT: 0,
    };
    this.syncSlot = true;
    this.scoped = false;
    this.ads = false; this.adsK = 0; // visée au viseur (armes avec ads, voir shared/data.js)
    this.trolls = {}; this.trollFx = new Map(); // blagues de l'administrateur (1.15) : les miennes, et celles visibles sur les autres
    this.bigHeadEvent = !!start.fx?.bigHead; // événement serveur « grosses têtes »
    this.boxes = this.map.boxes;
    this.wallMeshes = new Map(); this.smokeMeshes = new Map(); this.fireMeshes = new Map(); this.projMeshes = new Map();
    this.tracers = []; this.particles = [];
    this.lastInput = 0;
    this.specIdx = 0;
    this.visibleEnemies = new Set(); this.lastVis = 0; this.shotSeen = new Map();
    this.coreBeepT = 0;
    this.lastMini = 0;
    this.fpsAcc = 0; this.fpsN = 0;
    this.chatOpen = false; this.buyOpen = false; this.paused = false; this.expectUnlock = false;
    this.unsubs = [];
    this.alive = true;
    this.killedBy = null;
    // spectateur staff : vue du joueur observé, aucune entrée envoyée au serveur
    this.opts = start.opts || {};
    this.isHost = !!start.host;
    this.roundHistory = [];
    this.bubbles = [];
    this.spec = start.spectate ? { xray: false, third: false, buf: [], info: null, ghost: null, friend: !!start.friendSpec, delay: start.delay || 0, name: start.watchName || '' } : null;
    this.range = start.diff === 'cible'; // champ de tir (défi de visée)
    this.slideOn = start.slide !== false; // glissade autorisée sur ce serveur (désactivable dans l'administration)
    this.muted = new Set(); this.dropMeshes = new Map(); this.allyDeaths = []; this.prevSlot = null; this.lastLoadout = null; this.bought = {}; this.readyN = null;

    this.initRenderer();
    this.buildMap();
    this.setupBloom();
    this.initViewmodel();
    this.initHUD();
    this.bindInput();
    this.bindNet();
    if (isTouchDevice() && !this.spec) this.touch = new TouchControls(this);
    if (this.spec) this.initSpectator();
    // événements serveur (1.15) annoncés au début de la partie
    { const ev = [start.fx?.turbo && 'TURBO (VITESSE ×1,3)', start.fx?.bigHead && !start.custom?.bigHead && 'GROSSES TÊTES', this.opts.lowGrav && !start.custom?.lowGrav && 'GRAVITÉ BASSE'].filter(Boolean); if (ev.length) setTimeout(() => { if (!this.destroyed) this.centerMsg('ÉVÉNEMENT : ' + ev.join(' · '), 4); }, 1800);
      // partie perso (1.16) : rappel des règles au début
      const rules = customSummary(start.custom || {}, this.mode); if (rules.length) setTimeout(() => { if (!this.destroyed) this.centerMsg('PARTIE PERSO : ' + rules.join(' · '), 5); }, ev.length ? 6200 : 1800); }
    pad.attach(this);
    this.applyRoster(start.players);
    $('game').classList.add('active');
    this.onResize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(t => this.frame(t));
    window.onbeforeunload = e => { e.preventDefault(); e.returnValue = ''; };
  }

  // ======================= RENDU =======================
  initRenderer() {
    const canvas = $('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = ST().brightness;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = profile.settings.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.vmScene = new THREE.Scene();
    this.vmCam = new THREE.PerspectiveCamera(ST().vmFov, 1, 0.01, 10);
    this.vmScene.add(new THREE.HemisphereLight('#ffffff', '#445566', 1.6));
    const vl = new THREE.DirectionalLight('#ffffff', 2.2); vl.position.set(1, 2, 1); this.vmScene.add(vl);
    this.muzzleLight = new THREE.PointLight('#ffcc88', 0, 8, 2);
    this.scene.add(this.muzzleLight);
    this._onResize = () => this.onResize();
    window.addEventListener('resize', this._onResize);
  }

  // ---------- halo lumineux (bloom) + vignettage : modules chargés seulement quand l'option est active ----------
  wantBloom() { return ST().bloom !== false && ST().gfxPreset !== 'low' && (!isTouchDevice() || ['high', 'ultra'].includes(ST().gfxPreset)); }
  async setupBloom() {
    if (!this.wantBloom()) { this.composer?.dispose?.(); this.composer = null; return; }
    if (this.composer || this.bloomLoading) return;
    this.bloomLoading = true;
    try {
      const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { ShaderPass }, { OutputPass }] = await Promise.all([
        import('three/addons/postprocessing/EffectComposer.js'), import('three/addons/postprocessing/RenderPass.js'), import('three/addons/postprocessing/UnrealBloomPass.js'),
        import('three/addons/postprocessing/ShaderPass.js'), import('three/addons/postprocessing/OutputPass.js')]);
      if (this.destroyed || !this.wantBloom()) return;
      const night = !!this.map?.theme?.night;
      const c = new EffectComposer(this.renderer);
      c.addPass(new RenderPass(this.scene, this.camera));
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), night ? 0.85 : 0.35, night ? 0.6 : 0.45, night ? 0.35 : 0.9);
      c.addPass(this.bloomPass);
      c.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null }, strength: { value: night ? 0.38 : 0.28 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D tDiffuse; uniform float strength; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = 1.0 - strength * smoothstep(0.25, 0.85, length(d) * 1.35); gl_FragColor = vec4(c.rgb * v, c.a); }',
      }));
      c.addPass(new OutputPass());
      this.composer = c;
      this.onResize();
    } catch (e) { console.warn('Halo lumineux indisponible', e); this.composer = null; }
    finally { this.bloomLoading = false; }
  }
  updateDust(dt) {
    const p = this.camera.position, g = this.dust.geometry.attributes.position, a = g.array, t = performance.now() / 1000;
    this.dust.position.set(0, 0, 0);
    for (let i = 0; i < a.length; i += 3) {
      a[i] += Math.sin(t * 0.3 + i) * 0.12 * dt; a[i + 1] += (Math.cos(t * 0.21 + i * 0.7) * 0.08 - 0.02) * dt; a[i + 2] += Math.cos(t * 0.25 + i) * 0.12 * dt;
      // les particules restent dans un cube de 50 m autour du joueur
      if (a[i] - p.x > 25) a[i] -= 50; else if (a[i] - p.x < -25) a[i] += 50;
      if (a[i + 2] - p.z > 25) a[i + 2] -= 50; else if (a[i + 2] - p.z < -25) a[i + 2] += 50;
      if (a[i + 1] < 0) a[i + 1] += 7; else if (a[i + 1] > 7) a[i + 1] -= 7;
    }
    g.needsUpdate = true;
  }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, ST().gfxPreset === 'ultra' ? 2 : ST().quality === 'high' ? 1.5 : 1) * ST().renderScale * (this.trollOn?.('pixel') ? 0.12 : 1));
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
    this.aspect = w / h;
    this.camera.aspect = this.aspect;
    this.vmCam.aspect = this.aspect;
    this.vmCam.updateProjectionMatrix();
    this.updateFov();
  }

  updateFov() {
    const hfov = profile.settings.fov * Math.PI / 180;
    let v = 2 * Math.atan(Math.tan(hfov / 2) / (this.aspect || 1.7)) * 180 / Math.PI;
    if (this.scoped) v /= WEAPONS.longbow.scope;
    else v *= this.fovKick || 1; // léger élargissement du champ de vision pendant une glissade
    if (this.adsK > 0) v /= 1 + (this.adsZoom() - 1) * this.adsK; // zoom du viseur
    this.camera.fov = v;
    this.camera.updateProjectionMatrix();
  }

  buildMap() {
    const m = this.map, th = m.theme, S = this.scene;
    const [W, H] = m.size;
    // ciel en dégradé
    const sky = document.createElement('canvas'); sky.width = 2; sky.height = 256;
    const sg = sky.getContext('2d');
    const gr = sg.createLinearGradient(0, 0, 0, 256);
    const skyC = new THREE.Color(th.sky);
    gr.addColorStop(0, '#' + skyC.clone().multiplyScalar(th.night ? 0.5 : 0.75).getHexString());
    gr.addColorStop(0.55, th.sky); gr.addColorStop(1, th.fog);
    sg.fillStyle = gr; sg.fillRect(0, 0, 2, 256);
    const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace;
    S.background = skyTex;
    S.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
    S.add(new THREE.HemisphereLight(th.hemiSky, th.hemiGround, th.hemiInt));
    const sun = new THREE.DirectionalLight(th.sun, th.sunInt);
    sun.position.set(W / 2 - 50, 90, H / 2 - 35);
    sun.target.position.set(W / 2, 0, H / 2);
    sun.castShadow = true;
    const sc = sun.shadow.camera, R = Math.max(W, H) * 0.65;
    sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 10; sc.far = 250;
    sun.shadow.mapSize.set(ST().gfxPreset === 'ultra' ? 4096 : 2048, ST().gfxPreset === 'ultra' ? 4096 : 2048);
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    S.add(sun, sun.target);

    // murs fusionnés avec UV mises à l'échelle
    const fixUV = (geo, sx, sy, sz, scale) => {
      const uv = geo.attributes.uv;
      const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
      for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, uv.getX(i) * dims[f][0] / scale, uv.getY(i) * dims[f][1] / scale);
      }
    };
    const wallGeos = [], crateGeos = [];
    const relief = ST().relief !== false && ST().gfxPreset !== 'low';
    for (const b of m.boxes) {
      const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
      const g = new THREE.BoxGeometry(sx, sy, sz);
      if (b.kind === 'wall') fixUV(g, sx, sy, sz, 4);
      if (relief) { // assombrit le bas des murs et des caisses (occlusion ambiante simplifiée)
        const pos = g.attributes.position, col = new Float32Array(pos.count * 3), low = b.kind === 'wall' ? 0.72 : 0.8;
        for (let i = 0; i < pos.count; i++) { const k = b.min[1] > 0.05 ? 1 : (pos.getY(i) < 0 ? low : 1); col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      }
      g.translate((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
      (b.kind === 'wall' ? wallGeos : crateGeos).push(g);
    }
    const wallMat = new THREE.MeshStandardMaterial({ map: envTexture(th.wall, th.accent), roughness: 0.92, metalness: th.wall === 'neon' ? 0.3 : 0.02, vertexColors: relief });
    if (relief) { wallMat.normalMap = normalMapFor(wallMat.map, th.wall === 'ice' ? 1.5 : 3); wallMat.normalScale.set(1, 1); }
    if (th.wall === 'neon') { wallMat.emissiveMap = envTexture('neonEmissive', th.accent); wallMat.emissive = new THREE.Color('#ffffff'); wallMat.emissiveIntensity = 1.6; }
    if (th.wall === 'ice') { wallMat.roughness = 0.35; wallMat.metalness = 0.1; }
    const walls = new THREE.Mesh(mergeGeometries(wallGeos), wallMat);
    walls.castShadow = walls.receiveShadow = true;
    S.add(walls);
    if (crateGeos.length) {
      const crateMat = new THREE.MeshStandardMaterial({ map: envTexture(th.crate, th.accent), roughness: 0.8, vertexColors: relief });
      if (relief) crateMat.normalMap = normalMapFor(crateMat.map, 2.5);
      const crates = new THREE.Mesh(mergeGeometries(crateGeos), crateMat);
      crates.castShadow = crates.receiveShadow = true;
      S.add(crates);
    }
    // corniche lumineuse au sommet des murs (thème néon) / liseré
    const trimGeos = [];
    for (const b of m.boxes) if (b.kind === 'wall') {
      const sx = b.max[0] - b.min[0], sz = b.max[2] - b.min[2];
      const g = new THREE.BoxGeometry(sx + 0.3, 0.25, sz + 0.3);
      g.translate((b.min[0] + b.max[0]) / 2, b.max[1] + 0.12, (b.min[2] + b.max[2]) / 2);
      trimGeos.push(g);
    }
    const trimMat = th.night
      ? new THREE.MeshStandardMaterial({ color: th.accent, emissive: th.accent, emissiveIntensity: 1.5 })
      : new THREE.MeshStandardMaterial({ color: new THREE.Color(th.hemiGround).multiplyScalar(1.2), roughness: 0.9 });
    S.add(new THREE.Mesh(mergeGeometries(trimGeos), trimMat));

    // sol
    const floorTex = envTexture(th.floor, th.accent).clone();
    floorTex.needsUpdate = true;
    floorTex.repeat.set(W / 6, H / 6);
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: th.floor === 'snow' ? 0.6 : 0.95 });
    if (relief) { const n = normalMapFor(envTexture(th.floor, th.accent), th.floor === 'snow' ? 1.2 : 2.2); if (n) { floorMat.normalMap = n.clone(); floorMat.normalMap.needsUpdate = true; floorMat.normalMap.repeat.copy(floorTex.repeat); } }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
    floor.rotation.x = -Math.PI / 2; floor.position.set(W / 2, 0, H / 2);
    floor.receiveShadow = true;
    S.add(floor);
    // sol extérieur (évite le vide au loin)
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(W * 6, H * 6), new THREE.MeshStandardMaterial({ color: new THREE.Color(th.fog).multiplyScalar(0.8), roughness: 1 }));
    outer.rotation.x = -Math.PI / 2; outer.position.set(W / 2, -0.05, H / 2);
    S.add(outer);
    // décor lointain : montagnes / tours
    const decoMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(th.fog).multiplyScalar(th.night ? 0.6 : 0.85), roughness: 1 });
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2, r = Math.max(W, H) * (0.95 + Math.random() * 0.5);
      const hgt = th.night ? 20 + Math.random() * 50 : 12 + Math.random() * 30;
      const geo = th.night ? new THREE.BoxGeometry(10 + Math.random() * 10, hgt, 10 + Math.random() * 10) : new THREE.ConeGeometry(14 + Math.random() * 18, hgt, 5);
      const d = new THREE.Mesh(geo, decoMat);
      d.position.set(W / 2 + Math.cos(a) * r, hgt / 2 - 1, H / 2 + Math.sin(a) * r);
      S.add(d);
      if (th.night && Math.random() < 0.7) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, hgt * 0.7, 0.6), new THREE.MeshBasicMaterial({ color: Math.random() < 0.5 ? th.accent : '#ff3fa4' }));
        win.position.copy(d.position); win.position.y = hgt * 0.4; win.position.x += 5;
        S.add(win);
      }
    }
    // zones de pose
    for (const k of ['A', 'B']) {
      const site = m.sites[k];
      if (!site.cells.length) continue;
      const geos = site.cells.map(([i, j]) => { const g = new THREE.PlaneGeometry(CELL, CELL); g.rotateX(-Math.PI / 2); g.translate((i + 0.5) * CELL, 0.02, (j + 0.5) * CELL); return g; });
      const zone = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ color: k === 'A' ? '#ff7a59' : '#59a6ff', transparent: true, opacity: 0.1, depthWrite: false }));
      S.add(zone);
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const g = c.getContext('2d');
      g.font = 'bold 200px Chakra Petch, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 8; g.strokeText(k, 128, 140);
      const t = new THREE.CanvasTexture(c);
      const letter = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.8 }));
      letter.rotation.x = -Math.PI / 2; letter.position.set(site.center[0], 0.03, site.center[1]);
      S.add(letter);
    }
    // barrières de spawn (phase d'achat)
    this.barriers = new THREE.Group();
    const barMat = { T: new THREE.MeshBasicMaterial({ color: '#19e3c4', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
      D: new THREE.MeshBasicMaterial({ color: '#ff4f6d', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }) };
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
      const c = m.grid[j][i];
      if (c !== 'T' && c !== 'D') continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = m.grid[j + dj]?.[i + di];
        if (!n || n === c || n === '#' || n === ' ') continue;
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(CELL, 3.5), barMat[c]);
        pl.position.set((i + 0.5 + di * 0.5) * CELL, 1.75, (j + 0.5 + dj * 0.5) * CELL);
        if (di) pl.rotation.y = Math.PI / 2;
        this.barriers.add(pl);
      }
    }
    S.add(this.barriers);
    // noyau
    const coreG = new THREE.Group();
    const coreMat = new THREE.MeshStandardMaterial({ color: '#2a0f2f', emissive: '#ff2f6d', emissiveIntensity: 1.6, metalness: 0.6, roughness: 0.3 });
    const oct = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), coreMat); oct.position.y = 0.45; coreG.add(oct);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.15, 12), new THREE.MeshStandardMaterial({ color: '#222', metalness: 0.7, roughness: 0.4 })); base.position.y = 0.07; coreG.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 8, 32), new THREE.MeshBasicMaterial({ color: '#ff2f6d' })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; coreG.add(ring);
    coreG.visible = false;
    this.coreMesh = coreG; this.coreOct = oct; this.coreRing = ring;
    S.add(coreG);
    // textures de particules
    const pc = document.createElement('canvas'); pc.width = pc.height = 64;
    const pg = pc.getContext('2d');
    const rg = pg.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.4, 'rgba(255,255,255,.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    pg.fillStyle = rg; pg.fillRect(0, 0, 64, 64);
    this.softTex = new THREE.CanvasTexture(pc);
    // particules d'ambiance : poussière de jour, lucioles colorées la nuit (suivent la caméra)
    {
      const N = 420, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = (Math.random() - 0.5) * 50; }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ map: this.softTex, size: th.night ? 0.16 : 0.07, color: th.night ? th.accent : '#fff4dc', transparent: true, opacity: th.night ? 0.75 : 0.45, depthWrite: false, blending: th.night ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
      this.dust = new THREE.Points(geo, mat); this.dust.frustumCulled = false; this.dust.renderOrder = 2;
      this.dust.visible = ST().particles !== false && ST().gfxPreset !== 'low';
      S.add(this.dust);
    }
    // mini-carte de base
    this.miniBase = document.createElement('canvas'); this.miniBase.width = this.miniBase.height = 220;
    this.miniXf = drawMapPreview(this.miniBase, m);
  }

  // ======================= MODÈLE VUE 1RE PERSONNE =======================
  initViewmodel() {
    this.vm = new THREE.Group();
    this.vmScene.add(this.vm);
    this.vmFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color: '#ffd28a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.vmFlash.scale.set(0.25, 0.25, 0.25);
    this.vmFlash.visible = false;
    this.vmKick = 0; this.vmSwayX = 0; this.vmSwayY = 0; this.vmBob = 0;
    this.vmWeaponId = null;
  }

  setViewmodel(wid) {
    const skin = profile.equipped[wid] || 'default';
    const key = wid + skin;
    if (this.vmKey === key) return;
    this.vmKey = key;
    this.vmWeaponId = wid;
    while (this.vm.children.length) this.vm.remove(this.vm.children[0]);
    const def = WEAPONS[wid];
    const w = buildWeapon(def.model, skin);
    this.vm.add(w);
    const agent = AGENTS[this.roster.get(this.myId)?.agent || 'ignis'];
    const glove = new THREE.MeshStandardMaterial({ color: '#23262e', roughness: 0.8 });
    const sleeve = new THREE.MeshStandardMaterial({ color: new THREE.Color(agent.color).multiplyScalar(0.7), roughness: 0.6 });
    const arm = (x, y, z, rx, ry) => {
      const g = new THREE.Group();
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.1), glove); g.add(hand);
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.4), sleeve); fore.position.z = 0.24; g.add(fore);
      g.position.set(x, y, z); g.rotation.set(rx, ry, 0);
      return g;
    };
    if (def.model === 'knife') this.vm.add(arm(0, 0.0, 0.07, 0.25, 0));
    else {
      this.vm.add(arm(0, -0.03, 0.04, 0.5, 0.05));
      const front = def.model.includes('pistol') ? [-0.03, -0.04, 0.0] : [-0.02, 0.0, -0.3];
      this.vm.add(arm(front[0], front[1], front[2], 0.35, 0.5));
    }
    this.vmFlash.position.copy(w.userData.muzzle);
    this.vm.add(this.vmFlash);
    if (def.model === 'knife') { w.rotation.set(0.2, -0.25, -0.5); }
    this.vmBase = VM_OFFSET[def.model] || VM_OFFSET.rifle;
    this.vmSight = w.userData.sight || null; // centre de la fenêtre du viseur (visée)
    const sc = SIGHT_COLORS[ST().sightColor] || SIGHT_COLORS.red;
    w.traverse(o => { if (o.userData?.sightDot) { o.material = o.material.clone(); o.material.color.set(sc); } });
    this.local.switchT = 0.35;
  }

  // ======================= PERSONNAGES DISTANTS =======================
  applyRoster(players) {
    const ids = new Set();
    for (const p of players) {
      ids.add(p.id);
      const prev = this.roster.get(p.id);
      this.roster.set(p.id, p);
      if (p.id === this.myId) continue;
      let o = this.others.get(p.id);
      const needRebuild = !o || prev?.agent !== p.agent || prev?.team !== p.team || prev?.of !== p.of;
      if (needRebuild) {
        if (o) this.scene.remove(o.ch.root);
        o = this.createOther(p, o);
        this.others.set(p.id, o);
      } else if (JSON.stringify(prev.skins) !== JSON.stringify(p.skins)) o.ch.weaponKey = null;
    }
    for (const [id, o] of this.others) if (!ids.has(id)) { this.scene.remove(o.ch.root); this.others.delete(id); }
    for (const id of [...this.roster.keys()]) if (!ids.has(id)) this.roster.delete(id);
    this.buildTeamIcons();
  }

  // sous-titres des sons importants, avec la direction de la source (option d'accessibilité)
  caption(text, pos, key, maxDist = 0, every = 1.6) {
    if (!ST().subtitles || !this.local) return;
    const now = performance.now() / 1000;
    this.capLast ||= {};
    if (now - (this.capLast[key] || 0) < every) return;
    let arrow = '';
    if (pos) {
      const L = this.local, dx = pos[0] - L.pos[0], dz = pos[2] - L.pos[2], d = Math.hypot(dx, dz);
      if (maxDist && d > maxDist) return;
      if (d > 1.5) {
        const f = -dx * Math.sin(L.yaw) - dz * Math.cos(L.yaw), r = dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw);
        const a = Math.atan2(r, f) * 180 / Math.PI;
        arrow = Math.abs(a) < 35 ? ' ↑' : Math.abs(a) > 145 ? ' ↓' : a > 0 ? ' →' : ' ←';
      }
    }
    this.capLast[key] = now;
    let box = document.getElementById('captions');
    if (!box) { box = document.createElement('div'); box.id = 'captions'; document.getElementById('hud').appendChild(box); }
    const el = document.createElement('div'); el.className = 'cap'; el.textContent = text + arrow;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => el.remove(), 2200);
  }

  isEnemyId(id) {
    if (id === this.myId) return false;
    if (isFfa(this.mode)) return true;
    const a = this.roster.get(id), me = this.roster.get(this.myId);
    return !a || !me || a.team !== me.team;
  }

  createOther(p, old) {
    const enemy = this.isEnemyId(p.id);
    const ch = buildCharacter(p.agent, enemy ? ST().enemyColor : ALLY, p.of);
    if (enemy) ch.xmat.color.set(ST().enemyColor);
    this.scene.add(ch.root);
    ch.root.visible = false;
    if (!enemy) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 48;
      const g = c.getContext('2d');
      g.font = 'bold 30px Rajdhani, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(p.name, 128, 24);
      g.fillStyle = ALLY; g.fillText(p.name, 128, 24);
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, sizeAttenuation: false, transparent: true }));
      tag.scale.set(0.16, 0.03, 1); tag.position.y = 2.15; tag.renderOrder = 1000;
      ch.root.add(tag);
    }
    return { id: p.id, ch, buf: old ? old.buf : [], cur: null, walkPhase: 0, stepT: 0, deadT: 0, lastPos: null, opacity: 1, fireT: 0 };
  }

  setOtherWeapon(o, wid) {
    const skin = this.roster.get(o.id)?.skins?.[wid] || 'default';
    const key = wid + skin;
    if (o.ch.weaponKey === key) return;
    o.ch.weaponKey = key;
    if (o.ch.weapon) o.ch.hand.remove(o.ch.weapon);
    const w = buildWeapon(WEAPONS[wid]?.model || 'rifle', skin);
    w.scale.setScalar(1.1);
    o.ch.hand.add(w);
    o.ch.weapon = w;
    o.opacity = -1;
  }

  // ======================= HUD =======================
  initHUD() {
    applyCrosshair($('crosshair'));
    $('abilities').style.display = this.opts.noAbilities ? 'none' : '';
    for (const id of ['streak', 'leader', 'ult-warn', 'combat']) $(id).textContent = '';
    $('end-vote').innerHTML = '';
    document.querySelectorAll('.end-endorse').forEach(x => x.remove());
    $('p-tacpause').style.display = this.isHost ? '' : 'none';
    $('p-tacpause').onclick = () => { this.net.send('tacPause'); $('p-tacpause').style.display = 'none'; this.lock(); };
    if (!this.spec) { const tip = $('tip'); tip.textContent = '💡 ' + (this.range ? `Champ de tir : appuie sur ${KB('ready')} pour lancer le défi de visée de 60 secondes.` : TIPS[(Math.random() * TIPS.length) | 0]); tip.classList.add('show'); clearTimeout(this.tipT); this.tipT = setTimeout(() => tip.classList.remove('show'), 9000); }
    $('netgraph').style.display = ST().netGraph ? 'block' : 'none';
    $('fps').style.display = ST().fps ? 'block' : 'none';
    $('minimap').style.display = ST().minimap ? 'block' : 'none';
    $('killfeed').innerHTML = '';
    $('game-chat').querySelector('.log').innerHTML = '';
    $('end-screen').classList.remove('show');
    $('scoreboard').classList.remove('show');
    $('buy-menu').classList.remove('show');
    $('pause-menu').classList.remove('show');
    $('death-info').innerHTML = '';
    $('banner').className = '';
    $('credits').style.display = isFfa(this.mode) ? 'none' : 'flex';
    $('click-to-play').style.display = isTouchDevice() ? 'none' : 'block';
    this.buildAbilityHUD();
    this.buildBuyMenu();
  }

  buildAbilityHUD() {
    const agent = AGENTS[this.roster.get(this.myId)?.agent || this.pendingAgent || 'ignis'];
    this.hudAgent = agent.id;
    const el = $('abilities');
    el.innerHTML = ['q', 'e', 'x'].map(k => {
      const ab = agent.abilities[k];
      return `<div class="ability ${k === 'x' ? 'ult' : ''}" data-k="${k}" style="--c:${agent.color}" title="${esc(ab.name)} — ${esc(ab.desc)}">
        <div class="ic">${ICONS[ab.type] || '•'}</div><div class="k">${esc(KB(k === 'q' ? 'abilityQ' : k === 'e' ? 'abilityE' : 'ult'))}</div>
        ${k === 'x' ? `<div class="pips">${'<i></i>'.repeat(ab.cost)}</div>` : '<div class="ch"></div>'}</div>`;
    }).join('');
  }

  buildBuyMenu() {
    const cols = [
      ['PISTOLETS', ['spark', 'hornet']],
      ['PM & POMPE', ['viper', 'brute']],
      ['FUSILS', ['tempest', 'lancer']],
      ['PRÉCISION', ['longbow']],
      ['PROTECTION', ['light', 'heavy', 'kit']],
    ];
    // partie perso : seules les armes autorisées sont proposées
    const rule = WEAPON_RULES[this.opts?.weapons];
    if (rule) for (const c of cols) c[1] = c[1].filter(id => !WEAPONS[id] || rule.allow.includes(id));
    $('buy-cols').innerHTML = cols.filter(([, items]) => items.length).map(([title, items]) => `<div class="buy-col"><h4>${title}</h4>${items.map(id => {
      const w = WEAPONS[id], a = ARMOR[id] || (id === KIT.id ? KIT : null);
      const name = w ? w.name : a.name;
      const cost = w ? w.cost : a.cost;
      const stat = w ? `${w.damage}${w.pellets > 1 ? '×' + w.pellets : ''} dég · ${w.mag} balles · ${w.auto ? 'auto' : 'semi'}${w.ads ? ' · viseur' : w.scope ? ' · lunette' : ''}` : id === KIT.id ? `désamorçage en ${KIT.defuseTime} s (défense)` : `+${a.value} armure`;
      const lock = w && this.unlocks && (WEAPON_UNLOCK[id] || 1) > this.level;
      return `<div class="buy-item ${lock ? 'locked' : ''}" data-item="${id}"><div class="bn">${name}${lock ? ` <span class="lock">🔒 NIV. ${WEAPON_UNLOCK[id]}</span>` : ''}</div><div class="bp">${cost ? cost : 'GRATUIT'}</div><div class="bs">${stat}</div></div>`;
    }).join('')}</div>`).join('');
    $('buy-cols').onclick = e => {
      const it = e.target.closest('.buy-item');
      if (!it || it.classList.contains('locked')) return;
      this.net.send('buy', { item: it.dataset.item });
      SFX.playUI('buy');
    };
    // clic droit sur un objet possédé : revente
    $('buy-cols').oncontextmenu = e => { const it = e.target.closest('.buy-item'); if (it?.classList.contains('owned')) this.sellItem(it.dataset.item); };
    let extra = $('buy-extra');
    if (!extra) { extra = document.createElement('div'); extra.id = 'buy-extra'; $('buy-cols').after(extra); }
    const roundMode = !isFfa(this.mode);
    extra.innerHTML = `<div class="buy-row">
        <div class="buy-gear">${roundMode ? '<h4>TON ÉQUIPEMENT <span class="muted">(clic droit sur un objet pour le revendre)</span></h4><div id="buy-gear"></div>' : ''}</div>
        <div class="buy-acts">
          <button class="btn small" data-bact="rebuy" title="Rachète l'équipement de la manche précédente">⟲ RACHETER <kbd>${esc(KB('rebuy'))}</kbd></button>
          <span class="buy-favs">${[0, 1, 2].map(i => `<span class="bfav"><button class="btn small ghost" data-fav="${i}"></button><button class="btn small ghost" data-favsave="${i}" title="Enregistrer l'équipement actuel dans ce favori">💾</button></span>`).join('')}</span>
          ${roundMode && this.mode !== 'duel' ? '<button class="btn small" data-bact="request">🙋 DEMANDER UNE ARME</button>' : ''}
          ${roundMode ? `<button class="btn small primary" data-bact="ready">✔ PRÊT <kbd>${esc(KB('ready'))}</kbd></button>` : ''}
        </div>
      </div>
      <div class="buy-row"><div class="buy-eco muted" id="buy-eco"></div><div class="buy-team" id="buy-team"></div></div>`;
    extra.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.bact === 'rebuy') this.rebuy();
      else if (b.dataset.bact === 'request') this.requestWeapon();
      else if (b.dataset.bact === 'ready') this.sendReady();
      else if (b.dataset.sell) this.sellItem(b.dataset.sell);
      else if (b.dataset.fav !== undefined) { const l = this.favs()[+b.dataset.fav]; if (l) this.buyLoadout(l); else this.centerMsg('FAVORI VIDE : CLIQUE SUR 💾 POUR L\'ENREGISTRER', 2); }
      else if (b.dataset.favsave !== undefined) { const l = this.currentLoadout(); if (!l) { this.centerMsg('ACHÈTE D\'ABORD UNE ARME OU UN GILET', 2); return; } this.favs()[+b.dataset.favsave] = l; save(); if (!this.isGuest) this.net.send('saveLoadouts', { loadouts: this.favs() }); this.renderFavs(); this.centerMsg(`FAVORI ${+b.dataset.favsave + 1} ENREGISTRÉ`, 1.5); }
    };
    this.renderFavs();
    this.buyCache = {};
  }

  // ---------- équipements : revente, rachat, favoris ----------
  favs() { if (!Array.isArray(profile.loadouts) || profile.loadouts.length !== 3) profile.loadouts = [null, null, null]; return profile.loadouts; }
  loadoutLabel(l) { return [l.w1, l.w2, l.armor].filter(Boolean).map(id => WEAPONS[id]?.name || ARMOR[id]?.name || id).join(' + '); }
  renderFavs() {
    document.querySelectorAll('#buy-extra [data-fav]').forEach(b => { const l = this.favs()[+b.dataset.fav]; b.textContent = `★${+b.dataset.fav + 1} ${l ? this.loadoutLabel(l) : '(vide)'}`; b.classList.toggle('empty', !l); });
  }
  currentLoadout() {
    const me = this.me; if (!me) return null;
    const l = { w1: me.wp[1]?.[0] || null, w2: me.wp[2] && me.wp[2][0] !== 'spark' ? me.wp[2][0] : null, armor: me.ar >= 50 ? 'heavy' : me.ar >= 25 ? 'light' : null };
    return l.w1 || l.w2 || l.armor ? l : null;
  }
  buyLoadout(l) {
    const me = this.me; if (!me?.al) return;
    if (!isFfa(this.mode) && this.snap?.ph !== 'buy') { this.centerMsg('ACHAT POSSIBLE SEULEMENT PENDANT LA PHASE D\'ACHAT', 2); return; }
    let n = 0;
    for (const id of [l.w1, l.w2]) if (id && WEAPONS[id] && me.wp[WEAPONS[id].slot]?.[0] !== id) { this.net.send('buy', { item: id }); n++; }
    if (l.armor && ARMOR[l.armor] && me.ar < ARMOR[l.armor].value) { this.net.send('buy', { item: l.armor }); n++; }
    if (n) SFX.playUI('buy'); else this.centerMsg('TU AS DÉJÀ CET ÉQUIPEMENT', 1.5);
  }
  rebuy() { if (this.lastLoadout) this.buyLoadout(this.lastLoadout); else this.centerMsg('RIEN À RACHETER POUR L\'INSTANT', 1.5); }
  sellValue(item) {
    if (ARMOR[item]) return this.bought.armor === item ? ARMOR[item].cost : 0;
    const d = WEAPONS[item]; if (!d) return 0;
    return this.bought['s' + d.slot] === item ? d.cost : Math.floor(d.cost / 2 / 50) * 50;
  }
  sellItem(item) {
    if (ARMOR[item] || item === 'armor') { this.net.send('sell', { item: 'armor' }); return; }
    const d = WEAPONS[item]; if (!d || d.slot === 3) return;
    this.net.send('sell', { slot: d.slot });
  }
  requestWeapon() {
    const now = performance.now() / 1000; if (now - (this.reqT || 0) < 5) return; this.reqT = now;
    this.net.send('chat', { text: `🙋 J'ai besoin d'une arme ! (${this.me?.$ ?? 0} crédits)`, teamOnly: true });
    this.centerMsg('DEMANDE ENVOYÉE À TON ÉQUIPE', 1.5);
  }
  sendReady() {
    if (this.range) { this.startChallenge(); return; }
    if (isFfa(this.mode) || this.snap?.ph !== 'buy') return;
    this.net.send('ready');
  }
  // contenu dynamique du menu d'achat (équipement, équipe, prévision des crédits)
  updateBuyExtra(s, me) {
    const set = (id, html) => { if (this.buyCache[id] !== html) { this.buyCache[id] = html; const el = $(id); if (el) el.innerHTML = html; } };
    if (!isFfa(this.mode)) {
      const rows = [];
      for (const sl of [1, 2]) { const w = me.wp[sl]; if (w && !(sl === 2 && w[0] === 'spark')) rows.push(`<div class="bg-row"><span>${esc(WEAPONS[w[0]].name)}</span><button class="btn small ghost" data-sell="${w[0]}" ${s.ph === 'buy' ? '' : 'disabled'}>VENDRE +${this.sellValue(w[0])}</button></div>`); }
      if (me.ar > 0) { const it = this.bought.armor; rows.push(`<div class="bg-row"><span>Gilet (${me.ar})</span>${it ? `<button class="btn small ghost" data-sell="${it}" ${s.ph === 'buy' ? '' : 'disabled'}>VENDRE +${ARMOR[it].cost}</button>` : '<span class="muted small">gardé de la manche précédente</span>'}</div>`); }
      set('buy-gear', rows.join('') || '<span class="muted small">Rien à revendre : le pistolet Spark et le couteau sont gratuits.</span>');
    }
    if (this.mode === 'assault') {
      const loss = Math.min(ROUND.maxMoney, me.$ + ROUND.lossMoney), win = Math.min(ROUND.maxMoney, me.$ + ROUND.winMoney);
      set('buy-eco', `Manche suivante, si tu gardes tes crédits : <b>${loss}</b> en cas de défaite · <b>${win}</b> en cas de victoire <span class="muted">(+${ROUND.killMoney} par élimination)</span>`);
      const myTeam = this.roster.get(this.myId)?.team;
      const mates = s.players.filter(p => p.i !== this.myId && this.roster.get(p.i)?.team === myTeam);
      set('buy-team', mates.length ? `<h4>TON ÉQUIPE</h4>${mates.map(p => `<div class="bt-row ${p.al ? '' : 'dead'}"><span>${esc(this.nameOf(p.i))}${p.rd ? ' <b class="ok">✔</b>' : ''}</span><span class="gold">${p.$ ?? '—'}</span><span>${esc(WEAPONS[p.pw]?.name || '—')}</span><span class="muted">${p.ar ? '⛉ ' + p.ar : ''}</span></div>`).join('')}` : '');
    }
    const rb = document.querySelector('#buy-extra [data-bact="ready"]');
    if (rb) { rb.disabled = s.ph !== 'buy' || !!this.self?.rd; rb.innerHTML = `✔ PRÊT${this.readyN ? ` ${this.readyN.n}/${this.readyN.total}` : ''} <kbd>${esc(KB('ready'))}</kbd>`; }
  }

  buildTeamIcons() {
    if (isFfa(this.mode)) { $('icons-left').innerHTML = ''; $('icons-right').innerHTML = ''; return; }
    const me = this.roster.get(this.myId);
    const allies = [], enemies = [];
    for (const p of this.roster.values()) (me && p.team === me.team ? allies : enemies).push(p);
    const html = (list, ally) => list.map(p => `<div data-id="${p.id}">${agentIconHTML(p.agent)}${ally && p.id !== this.myId ? '<i class="hpb"><b></b></i>' : ''}</div>`).join('');
    $('icons-left').innerHTML = html(allies, true);
    $('icons-right').innerHTML = html(enemies, false);
    if (this.hudAgent !== me?.agent) this.buildAbilityHUD();
  }

  // ---------- réactions rapides (👏 à un coéquipier qui vient d'éliminer quelqu'un) ----------
  offerReaction(id) {
    this.reactTarget = { id, until: performance.now() / 1000 + 5 };
    let h = $('react-hint');
    if (!h) { h = document.createElement('div'); h.id = 'react-hint'; $('hud').appendChild(h); }
    h.classList.remove('sent');
    h.innerHTML = `<kbd>${esc(keyName(ST().keys.react))}</kbd> 👏 Bravo à <b>${esc(this.nameOf(id))}</b>`;
    h.classList.add('show');
    clearTimeout(this.reactHT); this.reactHT = setTimeout(() => h.classList.remove('show'), 5000);
  }
  sendReaction() {
    const t = this.reactTarget;
    if (!t || performance.now() / 1000 > t.until) return;
    this.reactTarget = null;
    this.net.send('react', { id: t.id, e: 0 });
  }
  showReaction(m) {
    let box = $('react-recv');
    if (!box) { box = document.createElement('div'); box.id = 'react-recv'; $('hud').appendChild(box); }
    const el = document.createElement('div'); el.className = 'rr';
    el.innerHTML = `<span class="re">${['👏', '🔥', '😮', 'GG'][m.e] || '👏'}</span> <b>${esc(this.nameOf(m.from) === '???' ? m.name : this.nameOf(m.from))}</b> te félicite !`;
    box.appendChild(el); while (box.children.length > 3) box.firstChild.remove();
    SFX.playNotify?.();
    setTimeout(() => el.remove(), 3500);
  }
  // ---------- résumé de fin de manche ----------
  roundSummary(m, win) {
    if (isFfa(this.mode)) return;
    let el = $('round-sum');
    if (!el) { el = document.createElement('div'); el.id = 'round-sum'; $('hud').appendChild(el); }
    const myTeam = this.roster.get(this.myId)?.team;
    const sc = m.score || this.snap?.sc || {};
    const mine = sc[myTeam] ?? 0, theirs = sc[myTeam === 'alpha' ? 'beta' : 'alpha'] ?? 0;
    el.className = 'show ' + (m.winner ? (win ? 'win' : 'lose') : '');
    el.innerHTML = `<div class="rs-score"><span class="ally">${mine}</span><i>–</i><span class="enemy">${theirs}</span></div>
      <div class="rs-me"><div><b>${this.roundKills || 0}</b><span>élimination${(this.roundKills || 0) > 1 ? 's' : ''}</span></div><div><b>${Math.round(this.roundDmg || 0)}</b><span>dégâts</span></div><div><b>${this.self?.$ ?? '—'}</b><span>crédits</span></div></div>
      <div class="rs-goal muted">Objectif : ${this.target} manches${mine === this.target - 1 ? ' · <b class="gold">balle de match !</b>' : ''}</div>`;
    clearTimeout(this.rsT); this.rsT = setTimeout(() => { el.className = ''; }, 4200);
  }
  // ---------- barre de progression du match (sous le chrono) ----------
  updateProgress(s, myTeam) {
    let el = $('match-prog');
    if (!el) { el = document.createElement('div'); el.id = 'match-prog'; el.innerHTML = '<i class="mp-a"></i><i class="mp-b"></i>'; document.querySelector('#hud .mid')?.appendChild(el); }
    if (!el.isConnected) return;
    let a = 0, b = 0;
    if (this.mode === 'gungame') { a = ((this.self?.gl || 0)) / (GUN_LADDER.length - 1); b = Math.max(0, ...s.players.filter(p => p.i !== this.myId).map(p => p.gl || 0)) / (GUN_LADDER.length - 1); }
    else if (this.mode === 'lives') { el.style.display = 'none'; return; }
    else if (isFfa(this.mode)) { a = (this.self?.k ?? 0) / this.target; b = Math.max(0, ...s.players.filter(p => p.i !== this.myId).map(p => p.k)) / this.target; }
    else { a = (s.sc[myTeam] ?? 0) / this.target; b = (s.sc[myTeam === 'alpha' ? 'beta' : 'alpha'] ?? 0) / this.target; }
    el.style.display = '';
    el.firstChild.style.width = Math.min(100, a * 100) + '%';
    el.lastChild.style.width = Math.min(100, b * 100) + '%';
    el.title = isFfa(this.mode) ? 'Toi (à gauche) et le meilleur adversaire (à droite)' : 'Progression vers l\'objectif : ton équipe à gauche, l\'adversaire à droite';
  }

  banner(title, sub = '', cls = '', dur = 2.5) {
    const b = $('banner');
    b.querySelector('.b-title').textContent = title;
    b.querySelector('.b-sub').textContent = sub;
    b.className = 'show ' + cls;
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => { b.className = ''; }, dur * 1000);
  }

  centerMsg(text, dur = 2) {
    $('center-msg').textContent = text;
    clearTimeout(this.cmT);
    this.cmT = setTimeout(() => { $('center-msg').textContent = ''; }, dur * 1000);
  }

  nameOf(id) {
    const r = this.roster.get(id);
    if (!r) return '???';
    // mode streamer : les pseudos des autres joueurs sont remplacés
    if (ST().streamer && id !== this.myId && !r.bot) return 'Joueur ' + ([...this.roster.keys()].filter(k => !this.roster.get(k).bot).indexOf(id) + 1);
    return r.name;
  }

  addKillfeed(m) {
    const kf = $('killfeed');
    const cls = id => id === this.myId ? 'ally' : this.isEnemyId(id) ? 'enemy' : 'ally';
    const wname = WEAPONS[m.w]?.name || { fire: 'Feu', shock: 'Électricité', frost: 'Givre', trap: 'Piège', core: 'Noyau', admin: 'Admin' }[m.w] || m.w;
    const div = document.createElement('div');
    div.className = 'kf' + (m.k === this.myId || m.v === this.myId ? ' mine' : '');
    div.innerHTML = (m.k ? `<span class="${cls(m.k)}">${esc(this.nameOf(m.k))}</span>` : '') +
      `<span class="w">${esc(wname).toUpperCase()}${m.h ? ' ◎' : ''}</span><span class="${cls(m.v)}">${esc(this.nameOf(m.v))}</span>`;
    kf.prepend(div);
    while (kf.children.length > 6) kf.lastChild.remove();
    setTimeout(() => div.remove(), 7000);
  }

  // ---- blagues de l'administrateur (1.15) ----
  trollOn(k) { return (this.trolls[k] || 0) > performance.now() / 1000; }
  fxOn(id, k) { return (this.trollFx.get(id)?.[k] || 0) > performance.now() / 1000; }
  onTroll(m) {
    const now = performance.now() / 1000;
    if (m.kind === 'stop') { this.trolls = {}; document.querySelectorAll('.troll-ov').forEach(e => e.remove()); this.onResize(); return; }
    this.trolls[m.kind] = now + m.s; this.trollBy = m.by || 'l\'admin';
    if (m.kind === 'fakeban' || m.kind === 'fakedc') this.trollOverlay(m.kind, m.s, this.trollBy);
    if (m.kind === 'flash') { this.local.flashUntil = now + m.s; this.local.flashDur = m.s; }
    if (m.kind === 'confetti') this.domConfetti();
    if (m.kind === 'pixel') this.onResize();
  }
  trollOverlay(kind, s, by) {
    const el = document.createElement('div'); el.className = 'troll-ov ' + kind;
    el.innerHTML = kind === 'fakeban'
      ? '<div class="to-box ban"><h2>⛔ TU AS ÉTÉ BANNI</h2><p>Raison : comportement suspect · durée : définitive</p></div>'
      : '<div class="to-box"><div class="to-spin"></div><h2>Connexion perdue…</h2><p>Reconnexion au serveur en cours</p></div>';
    document.body.appendChild(el);
    setTimeout(() => { el.innerHTML = `<div class="to-box joke"><h2>😜 C'EST UNE BLAGUE !</h2><p>${esc(by)} t'a bien eu.</p></div>`; }, Math.max(1500, Math.min(4, s - 1.5) * 1000));
    setTimeout(() => el.remove(), s * 1000);
  }
  domConfetti() {
    const box = document.createElement('div'); box.className = 'confetti';
    const cols = ['#ff4f6d', '#19e3c4', '#ffcf5a', '#8b5cff', '#3d9bff', '#ffffff'];
    box.innerHTML = Array.from({ length: 70 }, () => `<i style="left:${Math.random() * 100}%;background:${cols[(Math.random() * cols.length) | 0]};animation-delay:${(Math.random() * 0.8).toFixed(2)}s;animation-duration:${(1.8 + Math.random() * 1.4).toFixed(2)}s"></i>`).join('');
    document.body.appendChild(box); setTimeout(() => box.remove(), 4000);
  }
  confettiAt(id) {
    const o = this.others.get(id); const p = o?.cur?.p; if (!p) return;
    const cols = ['#ff4f6d', '#19e3c4', '#ffcf5a', '#8b5cff', '#3d9bff'];
    for (let i = 0; i < 14; i++) this.addImpact([p[0] + (Math.random() - 0.5) * 1.6, p[1] + 1.4 + Math.random() * 1.2, p[2] + (Math.random() - 0.5) * 1.6], cols[i % cols.length], 0.35, 0.9);
  }
  // pastille « blague en cours » (le joueur sait que c'est une blague)
  updateTrollBadge() {
    const now = performance.now() / 1000;
    const act = Object.entries(this.trolls).filter(([, t]) => t > now).map(([k]) => TROLL_NAMES[k] || k);
    let el = $('troll-badge');
    if (!act.length) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'troll-badge'; $('hud').appendChild(el); }
    const txt = `😜 Blague de ${this.trollBy || 'l\'admin'} : ${act.map(n => tr(n)).join(', ')}`;
    if (el.textContent !== txt) el.textContent = txt;
  }


  addChat(m) {
    const log = $('game-chat').querySelector('.log');
    const d = document.createElement('div');
    const myTeam = this.roster.get(this.myId)?.team;
    const sys = m.from === 'SYSTÈME' || m.system;
    if (!sys && this.muted.has(m.from)) return;
    if (!sys && ST().chatMode === 'off') return;
    if (!sys && ST().chatMode === 'team' && !m.teamOnly && !m.radio) return;
    if (!sys && ST().streamer) m = { ...m, from: [...this.roster.values()].find(r => r.name === m.from && r.id !== this.myId) ? this.nameOf([...this.roster.values()].find(r => r.name === m.from).id) : m.from };
    const color = m.from === 'SYSTÈME' ? '#ffcf5a' : isFfa(this.mode) ? '#c4b0ff' : m.team === myTeam ? ALLY : ENEMY;
    const tag = m.party ? '<span class="tag party">GROUPE</span>' : m.radio ? '<span class="tag radio">RADIO</span>' : m.teamOnly ? '<span class="tag team">ÉQUIPE</span>' : '';
    d.className = m.radio ? 'radio' : m.teamOnly ? 'team' : '';
    d.innerHTML = m.me ? `<i style="color:#c4b0ff">${esc(m.text)}</i>` : `${tag}<b style="color:${color}">${esc(m.from)}</b> : ${esc(emojify(m.text))}`;
    log.appendChild(d);
    while (log.children.length > 8) log.firstChild.remove();
  }
  addWhisper(m) {
    const log = $('game-chat').querySelector('.log');
    const d = document.createElement('div'); d.className = 'whisper';
    d.innerHTML = m.to ? `<span class="tag mp">MP</span>à <b>${esc(m.to)}</b> : ${esc(m.text)}` : `<span class="tag mp">MP</span>de <b>${esc(m.from)}</b> : ${esc(m.text)}`;
    log.appendChild(d);
    while (log.children.length > 8) log.firstChild.remove();
  }

  addClanChat(m) {
    const log = $('game-chat').querySelector('.log');
    const d = document.createElement('div'); d.className = 'whisper';
    d.innerHTML = `<span class="tag clan">${esc(m.tag)}</span>${m.from ? `<b>${esc(m.from)}</b> : ` : ''}${esc(emojify(m.text))}`;
    log.appendChild(d);
    while (log.children.length > 8) log.firstChild.remove();
  }

  // ---------- messages radio ----------
  toggleRadio(v = !this.radioOpen) {
    if (isFfa(this.mode)) return;
    this.radioOpen = v;
    const el = $('radio-menu');
    if (v) el.innerHTML = `<h4>RADIO <span class="muted">(chiffre pour envoyer, ${esc(KB('radio'))} pour fermer)</span></h4>` + RADIO.map((t, i) => `<div><b>${i + 1}</b> ${esc(t)}</div>`).join('');
    el.classList.toggle('show', v);
  }

  toggleEmote(v = !this.emoteOpen) {
    this.emoteOpen = v;
    const el = $('emote-menu');
    if (v) el.innerHTML = `<h4>ÉMOTES <span class="muted">(chiffre ou toucher)</span></h4>` + EMOTES.map((t, i) => `<div data-emote="${i}"><b>${i + 1}</b> ${esc(t)}</div>`).join('');
    el.classList.toggle('show', v);
    el.onclick = e => { const d = e.target.closest('[data-emote]'); if (d) { this.net.send('emote', { e: +d.dataset.emote }); this.toggleEmote(false); } };
  }

  // ---------- signalement en partie ----------
  openReport() {
    this.reportOpen = true;
    $('report-inner').onclick = null;
    this.unlock(); // libère la souris pour pouvoir cliquer dans la fenêtre
    this.showPause(false);
    const list = [...this.roster.values()].filter(r => !r.bot && r.id !== this.myId);
    $('report-inner').innerHTML = `<h2>SIGNALER UN JOUEUR</h2>
      ${list.length ? `<label>Joueur<select id="rp-who">${list.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select></label>
      <label>Motif<select id="rp-why">${Object.entries(REPORT_REASONS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
      <label>Détails (facultatif)<input id="rp-text" maxlength="200" placeholder="Ex. : vise à travers les murs"></label>
      <button class="btn primary wide" id="rp-send">ENVOYER LE SIGNALEMENT</button>` : '<p class="muted">Aucun autre joueur humain dans la partie.</p>'}
      <button class="btn ghost wide" id="rp-close">ANNULER</button>`;
    $('report-overlay').classList.add('show');
    const close = () => { this.reportOpen = false; $('report-overlay').classList.remove('show'); this.showPause(true); };
    $('rp-close').onclick = close;
    if ($('rp-send')) $('rp-send').onclick = () => { this.net.send('report', { id: $('rp-who').value, reason: $('rp-why').value, text: $('rp-text').value }); close(); };
  }

  // ======================= ENTRÉES =======================
  buildKeyMap() {
    this.codeMap = {};
    for (const [action, code] of Object.entries(ST().keys)) if (code) this.codeMap[code] = action;
  }

  press(code) { this.pressAction(this.codeMap[code]); }
  pressAction(a) {
    if (!a) return;
    // accroupi / marche en mode bascule : chaque appui inverse l'état
    if ((a === 'crouch' && ST().crouchToggle) || (a === 'walk' && ST().walkToggle)) {
      if (this.held.has(a + '_k')) return;
      this.held.add(a + '_k');
      if (this.held.has(a)) this.held.delete(a); else this.held.add(a);
      return;
    }
    if (this.held.has(a)) return;
    this.held.add(a);
    if (this.kc && (a === 'jump' || a === 'fire')) { this.endKillcam(); return; }
    switch (a) {
      case 'buy': this.toggleBuy(); break;
      case 'chat': this.openChat(false); break;
      case 'teamChat': this.openChat(true); break;
      case 'radio': this.toggleRadio(); break;
      case 'reload': this.reload(); break;
      case 'slot1': this.switchSlot(1); break;
      case 'slot2': this.switchSlot(2); break;
      case 'slot3': this.switchSlot(3); break;
      case 'abilityQ': this.useAbility('q'); break;
      case 'abilityE': this.useAbility('e'); break;
      case 'ult': this.useAbility('x'); break;
      case 'interact': this.net.send('interact', { on: true }); this.interacting = true; break;
      case 'scoreboard': this.showScoreboard(true); break;
      case 'scope': ST().scopeHold ? this.toggleScope(true) : this.toggleScope(); break;
      case 'drop': if (this.me?.al && !this.ended) this.net.send('drop'); break;
      case 'lastWeapon': if (this.prevSlot && this.me?.wp?.[this.prevSlot]) this.switchSlot(this.prevSlot); break;
      case 'bigMap': $('minimap').classList.add('big'); break;
      case 'ready': this.sendReady(); break;
      case 'rebuy': this.rebuy(); break;
      case 'mark': if (this.me?.al && !this.ended) this.net.send('mark', { d: this.aimDir() }); break;
      case 'emote': this.toggleEmote(); break;
      case 'inspect': if (this.me?.al) this.inspectT = 1.8; break;
      case 'react': this.sendReaction(); break;
      case 'fire': if (!this.me?.al && !isFfa(this.mode)) this.specIdx++; break;
    }
  }

  release(code) { this.releaseAction(this.codeMap[code]); }
  releaseAction(a) {
    if (!a) return;
    if ((a === 'crouch' && ST().crouchToggle) || (a === 'walk' && ST().walkToggle)) { this.held.delete(a + '_k'); return; }
    this.held.delete(a);
    if (a === 'scope' && ST().scopeHold) this.toggleScope(false);
    if (a === 'bigMap') $('minimap').classList.remove('big');
    if (a === 'fire') this.local.triggerHeld = false;
    if (a === 'scoreboard') this.showScoreboard(false);
    if (a === 'interact' && this.interacting) { this.net.send('interact', { on: false }); this.interacting = false; }
  }

  releaseAll() {
    for (const a of [...this.held]) this.releaseAction(a);
    this.held.clear();
    this.touch?.reset();
  }

  bindInput() {
    const canvas = $('game-canvas');
    const L = this.local;
    this.buildKeyMap();
    this._kd = e => {
      if (this.settingsOpen) { if (e.code === 'Escape' && !isRebinding()) this.closeSettings(); return; }
      if (this.reportOpen) { if (e.code === 'Escape') $('rp-close')?.click(); return; }
      if (this.chatOpen) {
        if (e.code === 'Enter') { const inp = $('game-chat').querySelector('input'); const t = inp.value.trim(); if (t) this.net.send('chat', { text: t, teamOnly: this.chatTeam }); this.closeChat(); }
        else if (e.code === 'Escape') this.closeChat();
        return;
      }
      // menu radio ouvert : un chiffre envoie le message correspondant
      if (this.radioOpen && /^(Digit|Numpad)[1-8]$/.test(e.code)) {
        e.preventDefault();
        this.net.send('radio', { id: +e.code.slice(-1) - 1 });
        this.toggleRadio(false);
        return;
      }
      if (this.radioOpen && e.code === 'Escape') { this.toggleRadio(false); return; }
      if (this.emoteOpen && /^(Digit|Numpad)[1-8]$/.test(e.code)) { e.preventDefault(); this.net.send('emote', { e: +e.code.slice(-1) - 1 }); this.toggleEmote(false); return; }
      if (this.emoteOpen && e.code === 'Escape') { this.toggleEmote(false); return; }
      if (this.codeMap[e.code] || e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (this.spec) { this.specKey(e); return; }
      if (e.code === 'Escape' && this.buyOpen) { this.toggleBuy(false); return; }
      if (e.repeat || this.paused) return;
      this.press(e.code);
    };
    this._ku = e => { if (this.codeMap[e.code] || e.code === 'Tab') e.preventDefault(); this.release(e.code); };
    this._mm = e => {
      if (document.pointerLockElement !== canvas) return;
      const s = ST().sens * 0.0022 * this.aimSensK();
      L.yaw -= e.movementX * s * (this.trollOn('invert') ? -1 : 1);
      L.pitch = Math.max(-1.55, Math.min(1.55, L.pitch - e.movementY * s * (ST().sensY || 1) * (ST().invertY ? -1 : 1)));
      this.vmSwayX += e.movementX * 0.00025; this.vmSwayY += e.movementY * 0.00025;
    };
    this._md = e => {
      if (document.pointerLockElement !== canvas) {
        if (e.target === canvas || e.target.id === 'click-to-play') this.lock();
        return;
      }
      this.press('Mouse' + e.button);
    };
    this._mu = e => this.release('Mouse' + e.button);
    this._wheel = e => {
      if (document.pointerLockElement !== canvas) return;
      this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
    };
    this._plc = () => {
      const locked = document.pointerLockElement === canvas;
      $('click-to-play').style.display = locked || this.buyOpen || this.chatOpen || this.settingsOpen || this.reportOpen || this.ended ? 'none' : 'block';
      if (!locked) {
        if (!this.buyOpen) this.releaseAll();
        if (!this.expectUnlock && !this.ended && !this.settingsOpen) this.showPause(true);
        this.expectUnlock = false;
      } else this.showPause(false);
    };
    this._ctx = e => e.preventDefault();
    this._sc = e => this.applySettings(e.detail?.key);
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    window.addEventListener('mousemove', this._mm);
    window.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    window.addEventListener('wheel', this._wheel, { passive: true });
    window.addEventListener('contextmenu', this._ctx);
    document.addEventListener('pointerlockchange', this._plc);
    document.addEventListener('settings-changed', this._sc);
    // menu pause
    $('p-resume').onclick = () => this.lock();
    $('p-settings').onclick = () => this.openSettings();
    $('sf-close').onclick = () => this.closeSettings();
    $('p-leave').onclick = () => { if (ST().confirmQuit && !this.ended && !this.spec && !confirm('Quitter la partie en cours ?')) return; this.leave(); };
    $('p-report').onclick = () => this.openReport();
    $('p-mute').onclick = () => this.openMute();
    $('p-feedback').onclick = () => openFeedback(`${this.mode} · ${this.map?.id || ''}`);
    $('p-surrender').style.display = this.mode === 'assault' && !this.spec ? '' : 'none';
    $('p-surrender').onclick = () => { if (confirm('Proposer à ton équipe d\'abandonner la partie ? (vote, à partir de la manche 4)')) { this.net.send('chat', { text: '/ff' }); this.showPause(false); } };
    $('p-challenge').style.display = this.range ? '' : 'none';
    $('p-challenge').onclick = () => { this.lock(); this.startChallenge(); };
  }

  openSettings() {
    this.settingsOpen = true;
    this.showPause(false);
    mountSettings($('settings-slot'));
    $('settings-overlay').classList.add('show');
    $('click-to-play').style.display = 'none';
  }

  closeSettings() {
    this.settingsOpen = false;
    $('settings-overlay').classList.remove('show');
    this.showPause(true);
  }

  // Applique en direct un paramètre modifié (depuis le menu)
  applySettings(key) {
    const all = key === '*' || !key;
    if (all || key === 'fov') this.updateFov();
    if (all || key === 'touchSize' || key === 'touchOpacity') this.touch?.applyScale();
    if (all || key === 'vmFov') { this.vmCam.fov = ST().vmFov; this.vmCam.updateProjectionMatrix(); }
    if ((all || key === 'sightColor') && this.vmWeaponId) { this.vmKey = null; this.setViewmodel(this.vmWeaponId); }
    if (all || key === 'adsZoomMul') this.updateFov();
    if (all || key === 'renderScale' || key === 'quality') this.onResize();
    if (all || key === 'brightness') this.renderer.toneMappingExposure = ST().brightness;
    if (all || key === 'bloom' || key === 'gfxPreset') this.setupBloom();
    if ((all || key === 'particles') && this.dust) this.dust.visible = ST().particles !== false && ST().gfxPreset !== 'low';
    if (all || key.startsWith('ch')) { this.chExtra = -1; applyCrosshair($('crosshair')); }
    if (all || key === 'fps') $('fps').style.display = ST().fps ? 'block' : 'none';
    if (all || key === 'minimap') $('minimap').style.display = ST().minimap ? 'block' : 'none';
    if (all || key === 'vol') SFX.setVolume(ST().vol);
    for (const [k, c] of [['volWeapons', 'weapons'], ['volSteps', 'steps'], ['volAbilities', 'abilities'], ['volUi', 'ui'], ['volNotif', 'notif']]) if (all || key === k) SFX.setCategoryVolume(c, ST()[k] ?? 1);
    if (all || key === 'netGraph') $('netgraph').style.display = ST().netGraph ? 'block' : 'none';
    if (all || key === 'keys') { this.buildKeyMap(); this.buildAbilityHUD(); }
    if (all || key === 'enemyColor') {
      for (const o of this.others.values()) if (this.isEnemyId(o.id)) {
        o.ch.teamMat.color.set(ST().enemyColor); o.ch.teamMat.emissive.set(ST().enemyColor); o.ch.xmat.color.set(ST().enemyColor);
      }
    }
  }

  cycleWeapon(dir = 1) {
    const order = [1, 2, 3].filter(s => this.me?.wp?.[s]);
    const i = order.indexOf(this.local.slot);
    if (i < 0 || !order.length) return;
    this.switchSlot(order[(i + (dir > 0 ? 1 : order.length - 1)) % order.length]);
  }

  // visée au doigt (commandes tactiles)
  touchLook(mx, my) {
    if (!this.canAct() && !(this.me && !this.me.al)) return;
    const L = this.local;
    const s = (ST().touchSens || 1) * 0.0048 * this.aimSensK();
    L.yaw -= mx * s;
    L.pitch = Math.max(-1.55, Math.min(1.55, L.pitch - my * s * (ST().sensY || 1) * (ST().invertY ? -1 : 1)));
    this.vmSwayX += mx * 0.0003; this.vmSwayY += my * 0.0003;
  }

  // visée à la manette (angles déjà calculés par gamepad.js)
  padLook(dx, dy) {
    if (!this.canAct() && !(this.me && !this.me.al)) return;
    const L = this.local;
    const k = this.aimSensK();
    L.yaw -= dx * k;
    L.pitch = Math.max(-1.55, Math.min(1.55, L.pitch - dy * k));
    this.vmSwayX += dx * 0.05; this.vmSwayY += dy * 0.05;
  }
  // un ennemi visible est-il sous le viseur ? (viseur rouge, aide à la visée de la manette)
  enemyUnderCrosshair() {
    if (!this.me?.al) return false;
    const now = performance.now();
    if (this.ecT && now - this.ecT < 30) return this.ecV;
    this.ecT = now;
    const o = this.eyePos(), d = this.aimDir(), r = raycastBoxes(o, d, 200, this.boxes);
    let on = false;
    for (const ot of this.others.values()) {
      if (!ot.cur?.al || !ot.ch.root.visible || !this.isEnemyId(ot.id) || ot.opacity < 0.3) continue;
      for (const hb of hitboxes(ot.cur.p, ot.cur.c)) if (rayAABB(o, d, hb.min, hb.max) < r.t) { on = true; break; }
      if (on) break;
    }
    this.ecV = on;
    return on;
  }

  lock() {
    SFX.initAudio();
    if (this.padActive) { this.showPause(false); $('click-to-play').style.display = 'none'; }
    if (this.touch) {
      // pas de verrouillage du pointeur sur mobile : plein écran et paysage si possible
      this.showPause(false);
      $('click-to-play').style.display = 'none';
      try { const el = document.documentElement; if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {}); } catch { /* non pris en charge */ }
      return;
    }
    const c = $('game-canvas');
    try { const r = c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* ignoré */ }
  }
  unlock() { if (this.touch) return; if (document.pointerLockElement) { this.expectUnlock = true; document.exitPointerLock(); } }

  showPause(v) { this.paused = v; $('pause-menu').classList.toggle('show', v); }

  toggleBuy(force) {
    if (this.spec) return;
    const open = this.mode === 'gungame' ? false : (force ?? !this.buyOpen);
    if (open === this.buyOpen) return;
    this.buyOpen = open;
    $('buy-menu').classList.toggle('show', open);
    $('buy-close-hint').textContent = this.padActive ? 'Ⓑ fermer · Ⓐ acheter · Ⓧ revendre · Ⓨ racheter' : `${KB('buy')} pour fermer · clic droit pour revendre`;
    if (open) this.unlock(); else this.lock();
  }

  openChat(team = false) {
    this.chatOpen = true;
    this.chatTeam = team && !isFfa(this.mode);
    this.unlock();
    $('game-chat').classList.add('open');
    $('game-chat').classList.toggle('team', this.chatTeam);
    const inp = $('game-chat').querySelector('input');
    inp.placeholder = this.chatTeam ? 'Message à ton ÉQUIPE (Entrée pour envoyer, Échap pour annuler)' : 'Message à TOUS (Entrée pour envoyer, Échap pour annuler)';
    inp.value = '';
    setTimeout(() => inp.focus(), 0);
  }
  closeChat() {
    this.chatOpen = false;
    $('game-chat').classList.remove('open');
    $('game-chat').querySelector('input').blur();
    this.lock();
  }

  showScoreboard(v) {
    this.sbOpen = v;
    $('scoreboard').classList.toggle('show', v);
    if (v) this.renderScoreboard();
  }

  renderScoreboard() {
    if (!this.snap) return;
    const gun = this.mode === 'gungame', lives = this.mode === 'lives';
    const players = this.snap.players.slice().sort((a, b) => gun ? (b.gl || 0) - (a.gl || 0) || b.k - a.k : lives ? (b.lv || 0) - (a.lv || 0) || b.k - a.k : b.sc - a.sc);
    const me = this.roster.get(this.myId);
    const row = p => {
      const r = this.roster.get(p.i) || {};
      const ag = AGENTS[r.agent] || AGENTS.ignis;
      const ally = !isFfa(this.mode) && r.team === me?.team;
      const lvl = r.level ? `<span class="sb-lvl">${r.prestige ? `<span class="pres">★${['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][r.prestige]}</span>` : ''}${r.level}</span>` : '';
      return `<div class="sb-row ${p.i === this.myId ? 'me' : ''} ${p.al ? '' : 'dead'}" style="--c:${ag.color}">${agentIconHTML(r.agent, 'sm')}<span>${lvl}${r.clan && !ST().streamer ? `<span class="clan-tag">[${esc(r.clan)}]</span> ` : ''}${p.i === this.leaderId && isFfa(this.mode) ? '👑 ' : ''}${esc(this.nameOf(p.i))}${r.bot ? ' <span class="muted">(bot)</span>' : ''}${r.title ? ` <span class="sb-title">${esc(r.title)}</span>` : ''}${!r.bot && p.i !== this.myId && isFriendName(r.name) ? ' <span title="Ami">🤝</span>' : ''}</span><span>${gun ? `${(p.gl || 0) + 1}/${GUN_LADDER.length}` : lives ? (p.lv > 0 ? '❤'.repeat(Math.min(p.lv, 5)) : 'éliminé') : p.sc}</span><span>${p.k}</span><span>${p.d}</span><span>${p.a}</span><span>${p.dm ?? ''}</span><span>${ally || p.i === this.myId ? (p.$ ?? '') : ''}</span><span class="muted">${r.bot ? 'BOT' : p.pg ? p.pg + ' ms' : '—'}</span></div>`;
    };
    const head = `<div class="sb-row head"><span></span><span>JOUEUR</span><span>${gun ? 'ARME' : lives ? 'VIES' : 'SCORE'}</span><span>É</span><span>M</span><span>A</span><span>DÉG.</span><span>CRÉDITS</span><span>PING</span></div>`;
    let html;
    if (this.mode === 'duel') html = `<h2>DUEL 1v1 — premier à ${this.target} manches</h2><br>${head}${players.map(row).join('')}`;
    else if (gun) html = `<h2>GUN GAME — chaque élimination donne l'arme suivante, le couteau pour finir</h2><br>${head}${players.map(row).join('')}`;
    else if (lives) html = `<h2>DERNIER DEBOUT — ${this.target} vie(s) par joueur, le dernier en jeu gagne</h2><br>${head}${players.map(row).join('')}`;
    else if (isFfa(this.mode)) html = `<h2>MÊLÉE — premier à ${this.target} éliminations</h2><br>${head}${players.map(row).join('')}`;
    else {
      const ally = players.filter(p => this.roster.get(p.i)?.team === me?.team);
      const enemy = players.filter(p => this.roster.get(p.i)?.team !== me?.team);
      const sc = this.snap.sc;
      const myS = sc[me?.team] ?? 0, enS = sc[me?.team === 'alpha' ? 'beta' : 'alpha'] ?? 0;
      // historique des manches : une pastille par manche (gagnée / perdue)
      const hist = this.roundHistory.length ? `<div class="sb-hist">${this.roundHistory.map((w, i) => `<i class="${!w ? 'draw' : w === me?.team ? 'won' : 'lost'}" title="Manche ${i + 1}">${i + 1}</i>`).join('')}</div>` : '';
      html = hist + `<div class="sb-team"><h3 class="t-alpha">VOTRE ÉQUIPE — ${myS}</h3>${head}${ally.map(row).join('')}</div>
        <div class="sb-team"><h3 class="t-beta">ADVERSAIRES — ${enS}</h3>${head}${enemy.map(row).join('')}</div>`;
    }
    $('sb-inner').innerHTML = html;
  }

  // ======================= ACTIONS =======================
  curWeaponId() {
    const w = this.me?.wp?.[this.local.slot];
    return w ? w[0] : (this.me?.wp?.[2]?.[0] || 'knife');
  }

  switchSlot(s) {
    const L = this.local;
    if (!this.me?.wp?.[s] || L.slot === s) return;
    if (L.slot && this.me.wp[L.slot]) this.prevSlot = L.slot;
    L.slot = s;
    SFX.playSwitch();
    L.reloadEnd = 0;
    const w = this.me.wp[s];
    L.mag = w[1]; L.reserve = w[2];
    L.nextFire = performance.now() / 1000 + 0.3;
    L.burst = 0;
    if (this.scoped || this.ads) this.toggleScope(false);
    this.setViewmodel(w[0]);
  }

  reload() {
    const L = this.local, now = performance.now() / 1000;
    const def = WEAPONS[this.curWeaponId()];
    if (!def.mag || L.reloadEnd > now || L.mag >= def.mag || L.reserve <= 0 || !this.me?.al) return;
    L.reloadEnd = now + def.reload;
    this.reloadSlot = L.slot;
    if (this.scoped || this.ads) this.toggleScope(false);
    this.net.send('reload');
    SFX.playReload();
  }

  toggleScope(force) {
    const def = WEAPONS[this.curWeaponId()];
    if (force === false) this.ads = false;
    if (def.ads && !def.scope) {
      // viseur : pas de cache noir, l'arme se centre et le champ de vision se resserre un peu
      this.ads = !!(force ?? !this.ads) && !!this.me?.al && !(this.local.slideT > 0);
      return;
    }
    this.ads = false;
    const v = force ?? (!this.scoped && !!def.scope && this.me?.al);
    if (v === this.scoped) return;
    this.scoped = !!v;
    $('scope-overlay').style.display = this.scoped ? 'block' : 'none';
    $('crosshair').style.display = this.scoped ? 'none' : 'block';
    this.updateFov();
  }

  // sensibilité de visée : lunette, ou viseur (progressif pendant la mise en joue)
  aimSensK() {
    if (this.scoped) return ST().scopeSens / WEAPONS.longbow.scope;
    const k = this.adsK || 0; if (k < 0.01) return 1;
    const z = 1 + (this.adsZoom() - 1) * k;
    return (1 + ((ST().scopeSens ?? 1) - 1) * k) / z;
  }
  // zoom du viseur de l'arme en main, × réglage du joueur (0 = aucun zoom)
  adsZoom() { const z = WEAPONS[this.curWeaponId()]?.ads?.zoom || 1; return 1 + (z - 1) * (ST().adsZoomMul ?? 1); }
  aimDir() { return dirFromAngles(this.local.yaw, this.local.pitch + this.local.recoil); }
  eyePos() { const L = this.local; return [L.pos[0], L.pos[1] + L.eyeH, L.pos[2]]; }

  canAct() {
    return !this.spec && this.me?.al && !this.chatOpen && !this.buyOpen && !this.paused && (!!this.touch || this.padActive || document.pointerLockElement === $('game-canvas'));
  }

  tryFire(now) {
    const L = this.local;
    if (!this.canAct()) return;
    const ph = this.snap?.ph;
    if (ph === 'buy' || ph === 'warmup' || ph === 'over') return;
    if (now < L.nextFire || L.switchT > 0) return;
    const wid = this.curWeaponId();
    const def = WEAPONS[wid];
    if (!def.auto && L.triggerHeld) return;
    if (def.type !== 'melee') {
      if (L.reloadEnd > now) return;
      if (L.mag <= 0) { SFX.playEmpty(); L.nextFire = now + 0.3; L.triggerHeld = true; this.reload(); return; }
    }
    L.triggerHeld = true;
    L.nextFire = now + 1 / (def.rate * (this.me.rm || 1));
    const hs = Math.hypot(L.vel[0], L.vel[2]);
    let spread = def.type === 'sniper' ? (this.scoped ? def.scopedSpread : def.spread) : (def.spread || 0);
    // viseur : dispersion de base et rafale réduites (pas les pénalités de mouvement ni de saut)
    const adsM = def.ads ? 1 - (1 - def.ads.spread) * (this.adsK || 0) : 1;
    if (def.type !== 'melee') {
      spread *= adsM;
      if (hs > 2.2) spread += def.moveSpread * Math.min(1, hs / 6);
      if (!L.onGround) spread += def.airSpread;
      if (L.crouch && !(L.slideT > 0)) spread *= 0.75; // la glissade ne donne pas le bonus de précision accroupi
      if (def.auto) spread += Math.min(L.burst, 14) * def.recoil * 0.3 * adsM;
    }
    const dirs = [];
    const n = def.pellets || 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      dirs.push(dirFromAngles(L.yaw + Math.cos(a) * r, L.pitch + L.recoil + Math.sin(a) * r));
    }
    this.net.send('shoot', { d: dirs.map(d => d.map(v => Math.round(v * 10000) / 10000)), ...(this.scoped ? { z: 1 } : {}), ...(this.adsK > 0.6 ? { a: 1 } : {}) });
    if (this.chal && def.type !== 'melee') this.chal.shots++;
    this.pad?.rumble(def.type === 'sniper' || def.type === 'shotgun' ? 0.5 : 0.18, 60);
    L.lastShot = now;
    if (def.type !== 'melee') {
      if (!this.opts.infAmmo) L.mag--;
      const rec = def.recoil * (L.burst < 3 ? 0.6 : 1) * (1 - 0.25 * (this.adsK || 0));
      L.recoil = Math.min(0.32, L.recoil + rec);
      L.yaw += (Math.random() - 0.5) * def.recoil * (L.burst > 5 ? 1.2 : 0.4);
      L.burst++;
    }
    // effets locaux
    const type = def.type === 'pistol' ? 'pistol' : def.type;
    if (this.trollOn('duck') && def.type !== 'melee') SFX.playQuack(null); else SFX.playShot(type, null);
    this.vmKick = def.type === 'melee' ? 1 : Math.min(1, 0.35 + def.recoil * 12);
    if (def.type !== 'melee') {
      this.vmFlash.visible = true; this.vmFlash.material.rotation = Math.random() * 6;
      this.flashT = 0.045;
      this.muzzleLight.intensity = 6; this.muzzleLight.position.set(...this.eyePos());
      const eye = this.eyePos();
      for (const d of dirs.slice(0, 4)) {
        const end = this.localHitPoint(eye, d);
        const vmMuzzle = new THREE.Vector3(...eye).add(new THREE.Vector3(...d).multiplyScalar(0.8)).add(new THREE.Vector3(0, -0.12, 0));
        this.addTracer(vmMuzzle, new THREE.Vector3(...end.p));
        this.addImpact(end.p, end.player ? '#ff3355' : '#ffe0a0');
      }
    }
  }

  localHitPoint(o, d) {
    const r = raycastBoxes(o, d, 300, this.boxes);
    let best = r.t, player = false;
    for (const ot of this.others.values()) {
      if (!ot.cur || !ot.cur.al || !this.isEnemyId(ot.id)) continue;
      for (const hb of hitboxes(ot.cur.p, ot.cur.c)) { const t = rayAABB(o, d, hb.min, hb.max); if (t < best) { best = t; player = true; } }
    }
    return { p: [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best], player };
  }

  useAbility(k) {
    const L = this.local, now = performance.now() / 1000;
    if (this.opts.noAbilities) { this.centerMsg('CAPACITÉS DÉSACTIVÉES DANS CE SALON', 1.5); return; }
    if (!this.canAct() || now < L.abilityCd || this.snap?.ph === 'over') return;
    const agent = AGENTS[this.roster.get(this.myId)?.agent];
    if (!agent) return;
    const ab = agent.abilities[k];
    if (k === 'x') { if ((this.me.ult || 0) < ab.cost) { SFX.playClick(); return; } }
    else if ((this.me.ab?.[k] || 0) <= 0) { SFX.playClick(); return; }
    L.abilityCd = now + 0.35;
    const dir = this.aimDir();
    if (ab.type === 'dash') {
      const H = this.held, f = (H.has('forward') ? 1 : 0) - (H.has('back') ? 1 : 0), s = (H.has('right') ? 1 : 0) - (H.has('left') ? 1 : 0);
      let dx = -Math.sin(L.yaw) * f + Math.cos(L.yaw) * s, dz = -Math.cos(L.yaw) * f - Math.sin(L.yaw) * s;
      if (!f && !s) { dx = -Math.sin(L.yaw); dz = -Math.cos(L.yaw); }
      const l = Math.hypot(dx, dz) || 1;
      L.vel[0] = dx / l * MOVE.dashSpeed; L.vel[2] = dz / l * MOVE.dashSpeed; L.vel[1] = Math.max(L.vel[1], 1.5);
      L.dashT = MOVE.dashTime;
    } else if (ab.type === 'grapple') {
      // grappin : on vise un point (mur, caisse, sol) jusqu'à 22 m et on y est propulsé
      const o = [L.pos[0], L.pos[1] + (L.crouch ? PLAYER.eyeCrouch : PLAYER.eye), L.pos[2]];
      const r = raycastBoxes(o, dir, 22, this.boxes);
      const t = Math.min(22, r.t);
      const tgt = [o[0] + dir[0] * (t - 0.8), Math.min(4.2, o[1] + dir[1] * (t - 0.8)), o[2] + dir[2] * (t - 0.8)];
      const v = [tgt[0] - L.pos[0], tgt[1] - L.pos[1] + 0.6, tgt[2] - L.pos[2]], dl = Math.hypot(...v) || 1;
      L.vel[0] = v[0] / dl * 24; L.vel[2] = v[2] / dl * 24; L.vel[1] = Math.max(4, v[1] / dl * 24 + 3);
      L.dashT = Math.min(0.9, dl / 24);
      this.addImpact?.(tgt, '#c95cff', 0.25, 0.4);
    } else if (ab.type === 'blink') {
      const fl = norm([-Math.sin(L.yaw), 0, -Math.cos(L.yaw)]);
      const o = [L.pos[0], L.pos[1] + 1, L.pos[2]];
      const r = raycastBoxes(o, fl, MOVE.blinkDist, this.boxes);
      const t = Math.max(0, Math.min(MOVE.blinkDist, r.t - 0.7));
      L.pos[0] += fl[0] * t; L.pos[2] += fl[2] * t;
      depenetrate(L.pos, this.boxes);
      this.local.flashUntil = now + 0.15; this.local.flashDur = 0.15;
    }
    if (k === 'x') this.me.ult = 0; else this.me.ab[k]--;
    this.net.send('ability', { k, d: dir });
    SFX.playAbility(ab.type, null);
  }

  // ======================= RÉSEAU =======================
  bindNet() {
    const on = (t, fn) => this.unsubs.push(this.net.on(t, fn));
    on('snap', m => this.onSnap(m));
    on('roster', m => this.applyRoster(m.players));
    on('teleport', m => {
      const L = this.local;
      L.slideT = 0; // réapparition / téléportation : la glissade s'arrête
      L.pos = m.p.slice(); L.vel = [0, 0, 0]; L.yaw = m.y; L.pitch = 0; L.recoil = 0; L.burst = 0; L.reloadEnd = 0; L.dashT = 0;
      this.syncSlot = true;
      this.killedBy = null;
      $('death-info').innerHTML = '';
    });
    on('shot', m => this.onRemoteShot(m));
    on('hit', m => {
      if (m.d > 0) this.roundDmg = (this.roundDmg || 0) + m.d;
      if (this.chal) this.chal.hits++;
      if (ST().damageNumbers && m.d > 0) this.damageNumber(m.d, m.h, m.k);
      if (ST().hitmarker) {
        const hm = $('hitmarker');
        hm.className = m.k ? 'kill' : m.h ? 'head' : '';
        hm.style.opacity = 1;
        this.hitT = 0.18;
      }
      // son d'élimination au choix (1.15)
      const ks = ST().killSound || 'classic';
      if (m.k && ks !== 'classic') { if (ST().hitSound) SFX.playHit(m.h, false); if (ks !== 'off') SFX.playKillSound(ks); }
      else if (ST().hitSound || m.k) SFX.playHit(m.h, m.k);
    });
    on('hurt', m => { this.local.hurtT = 0.4; SFX.playHurt(); if (m.from) this.showDamageDir(m.from); this.pad?.rumble(Math.min(1, 0.3 + (m.d || 0) / 100), 180); });
    on('kill', m => {
      this.addKillfeed(m);
      if (m.k === this.myId && m.v !== this.myId) { this.roundKills = (this.roundKills || 0) + 1; if (this.chal) { this.chal.kills++; if (m.h) this.chal.hs++; } }
      if (m.v !== this.myId && !isFfa(this.mode) && !this.isEnemyId(m.v)) { const p = this.others.get(m.v)?.cur?.p; if (p) this.allyDeaths.push({ p: p.slice(), t: performance.now() / 1000, n: this.nameOf(m.v) }); }
      const kr = m.k && m.k !== this.myId && m.v !== this.myId && this.roster.get(m.k);
      if (kr && !kr.bot && !this.isEnemyId(m.k)) this.offerReaction(m.k);
      if (m.k === this.myId && m.v !== this.myId) {
        const now = performance.now() / 1000;
        this.streak = now - (this.streakT || 0) < 4 ? (this.streak || 0) + 1 : 1;
        this.streakT = now;
        if (this.streak >= 2) { const sm = ['', '', 'DOUBLE ÉLIMINATION', 'TRIPLE ÉLIMINATION', 'QUADRUPLE !', 'QUINTUPLE !'][Math.min(5, this.streak)]; SFX.playStreak(this.streak); this.centerMsg(sm, 1.4); }
      }
      if (m.v === this.myId) {
        this.killedBy = m.k;
        this.deathMark = { p: this.local.pos.slice(), t: performance.now() / 1000 };
        $('combat').innerHTML = '';
        if (this.scoped || this.ads) this.toggleScope(false);
        $('death-info').innerHTML = m.k && m.k !== this.myId ? `ÉLIMINÉ PAR <b>${esc(this.nameOf(m.k))}</b>` : 'ÉLIMINÉ';
      }
      const o = this.others.get(m.v);
      if (o) o.deadT = 0.001;
    });
    on('roundStart', m => {
      this.banner(`MANCHE ${m.round}`, m.half ? 'SECONDE MI-TEMPS · PHASE D\'ACHAT' : `PHASE D'ACHAT — ${KB('buy')} POUR ACHETER`, '', 3);
      SFX.playUI('roundStart');
      for (const o of this.others.values()) { o.deadT = 0; o.ch.root.rotation.x = 0; }
      for (const t of this.tracers) this.scene.remove(t.mesh);
      this.tracers = [];
      this.roundKills = 0; this.roundDmg = 0; this.bought = {}; this.readyN = null; this.allyDeaths = []; this.lastBeep = 0;
    });
    on('reaction', m => this.showReaction(m));
    on('reactSent', m => { const h = $('react-hint'); if (h) { h.textContent = `${['👏', '🔥', '😮', 'GG'][m.e]} envoyé à ${m.to}`; h.classList.add('show', 'sent'); clearTimeout(this.reactHT); this.reactHT = setTimeout(() => h.classList.remove('show', 'sent'), 1500); } });
    on('phase', m => { if (m.phase === 'live') { this.centerMsg('ENGAGEZ !', 1.5); SFX.playUI('roundStart'); this.toggleBuy(false); const l = this.currentLoadout(); if (l) this.lastLoadout = l; } });
    on('roundEnd', m => {
      const me = this.roster.get(this.myId);
      const win = me && m.winner === me.team;
      if (m.history) this.roundHistory = m.history;
      const mvpTxt = m.mvp ? ` · MVP de la manche : ${this.nameOf(m.mvp.id)} (${m.mvp.kills} élim., ${m.mvp.dmg} dégâts)` : '';
      this.roundSummary(m, win);
      if (!m.winner) { this.banner('ÉGALITÉ', (REASONS[m.reason] || '') + mvpTxt, '', 4); return; }
      this.banner(win ? 'MANCHE GAGNÉE' : 'MANCHE PERDUE', (REASONS[m.reason] || '') + mvpTxt, win ? 'win' : 'lose', 4);
      SFX.playUI(win ? 'win' : 'lose');
      if (win) { this.roundWins = (this.roundWins || 0) + 1; }
    });
    on('planted', m => { this.centerMsg(`NOYAU POSÉ SUR LE SITE ${m.site}`, 3); SFX.playUI('plant'); this.caption(`Noyau posé (site ${m.site})`, null, 'plant'); });
    on('defused', () => { this.centerMsg('NOYAU DÉSAMORCÉ', 3); this.caption('Noyau désamorcé', null, 'defuse'); });
    on('explode', m => {
      SFX.playExplosion(m.p); this.caption('Explosion', m.p, 'boom');
      const d = Math.hypot(m.p[0] - this.local.pos[0], m.p[2] - this.local.pos[2]);
      this.local.flashUntil = performance.now() / 1000 + (d < 30 ? 1.2 : 0.4);
      this.local.flashDur = 1.2;
      this.shake = 1;
      this.addImpact(m.p, '#ff2f6d', 12, 1.2);
    });
    on('flash', m => { const now = performance.now() / 1000; this.local.flashUntil = now + m.d; this.local.flashDur = m.d; });
    on('flashBang', m => { SFX.playFlashBang(m.p); this.addImpact(m.p, '#ffffff', 5, 0.3); this.caption('Flash', m.p, 'flash'); });
    on('ability', m => {
      if (m.i !== this.myId) SFX.playAbility(m.k, m.p);
      if (m.i !== this.myId && m.p) this.caption(this.isEnemyId(m.i) ? 'Capacité ennemie' : 'Capacité alliée', m.p, 'ab' + (this.isEnemyId(m.i) ? 'e' : 'a'), 45);
      // avertissement d'ultime ennemie
      if (ULTS.has(m.k) && this.isEnemyId(m.i)) { const w = $('ult-warn'); w.textContent = `⚠ ULTIME ENNEMIE : ${this.nameOf(m.i)}`; clearTimeout(this.ultT); this.ultT = setTimeout(() => { w.textContent = ''; }, 2500); }
    });
    on('notice', m => this.centerMsg(m.text, 2.5));
    on('troll', m => this.onTroll(m));
    on('trollFx', m => { if (m.kind === 'stop') { this.trollFx.delete(m.i); return; } const e = this.trollFx.get(m.i) || {}; e[m.kind] = performance.now() / 1000 + m.s; this.trollFx.set(m.i, e); if (m.kind === 'confetti') this.confettiAt(m.i); });
    on('bought', m => { if (m.slot) { this.pendingSwitch = m.slot; this.bought['s' + m.slot] = m.item; } else if (ARMOR[m.item]) this.bought.armor = m.item; });
    on('sold', m => { const n = WEAPONS[m.item]?.name || ARMOR[m.item]?.name || ''; this.centerMsg(`${n.toUpperCase()} REVENDU · +${m.refund}`, 1.5); SFX.playUI('buy'); if (m.slot) delete this.bought['s' + m.slot]; else delete this.bought.armor; this.buyCache = {}; });
    on('dropped', m => { this.centerMsg(`${(WEAPONS[m.item]?.name || '').toUpperCase()} LÂCHÉ`, 1.2); SFX.playSwitch(); });
    on('picked', m => { this.centerMsg(`ARME RAMASSÉE : ${(WEAPONS[m.item]?.name || '').toUpperCase()}`, 1.5); SFX.playReload(); });
    on('readyState', m => { this.readyN = m; if (m.name !== this.roster.get(this.myId)?.name) this.caption(`${m.name} est prêt (${m.n}/${m.total})`, null, 'ready', 0, 0.2); });
    on('dmgReport', m => this.showDmgReport(m.rows));
    on('wallBreak', () => SFX.playAbility('wall', null));
    on('mark', m => this.addMark(m));
    // pièges de Kora (1.19) : visibles seulement par son équipe
    on('trap', m => {
      this.trapMeshes ||= new Map();
      const g = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.06, 20), new THREE.MeshStandardMaterial({ color: '#2a2410', emissive: '#ffd166', emissiveIntensity: 0.6 }));
      disc.position.y = 0.04; g.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 24), new THREE.MeshBasicMaterial({ color: '#ffd166' }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.08; g.add(ring);
      g.position.set(m.p[0], m.p[1], m.p[2]); this.scene.add(g); this.trapMeshes.set(m.id, g);
    });
    on('trapGone', m => { const g = this.trapMeshes?.get(m.id); if (g) { this.scene.remove(g); this.trapMeshes.delete(m.id); } });
    on('killcam', m => this.startKillcam(m));
    on('emote', m => this.showEmote(m));
    on('leader', m => { this.leaderId = m.id; $('leader').textContent = m.id && isFfa(this.mode) ? `👑 MENEUR : ${this.nameOf(m.id)}${m.id === this.myId ? ' (toi !)' : ''}` : ''; });
    on('combat', m => { $('combat').innerHTML = `<b>${esc(this.nameOf([...this.roster.values()].find(r => r.name === m.killer)?.id) || m.killer)}</b> à ${m.dist} m · tu lui as infligé <b>${m.dealt}</b> dégâts · il lui restait <b>${m.hp}</b> PV${m.armor ? ` et ${m.armor} d'armure` : ''} · tu as reçu <b>${m.recv}</b> dégâts`; });
    on('voteOpen', m => this.renderVote(m.options));
    on('voteState', m => this.renderVote(this.voteOptions, m));
    on('gun', m => {
      const id = GUN_LADDER[Math.min(m.lvl, GUN_LADDER.length - 1)];
      const name = (WEAPONS[id]?.name || '').toUpperCase();
      if (m.down) { this.centerMsg(`RÉTROGRADÉ PAR ${String(m.by || '').toUpperCase()} · ${name}`, 2); SFX.playUI('lose'); }
      else { this.centerMsg(m.lvl >= GUN_LADDER.length - 1 ? 'DERNIÈRE ARME : LE COUTEAU !' : `ARME ${m.lvl + 1}/${GUN_LADDER.length} · ${name}`, 1.6); SFX.playPromote(); }
    });
    on('chat', m => this.addChat(m));
    on('whisper', m => this.addWhisper(m));
    on('matchSummary', m => this.onSummary(m));
    on('matchEnd', m => this.onMatchEnd(m));
  }

  onSnap(s) {
    const now = Date.now();
    const off = s.t - now;
    this.offset = this.offset === null ? off : this.offset * 0.95 + off * 0.05;
    const prevPhase = this.snap?.ph;
    this.snap = s;
    const me = s.me;
    this.me = me;
    const L = this.local;
    const tnow = performance.now() / 1000;
    // vie / mort
    if (me.al && !L.alive) { L.alive = true; this.syncSlot = true; }
    if (!me.al && L.alive) { L.alive = false; this.toggleBuy(false); }
    if (this.spec) {
      // le spectateur suit l'arme réellement tenue par le joueur observé
      const wid = me.wp[me.sl]?.[0];
      L.slot = me.sl; if (me.wp[me.sl]) { L.mag = me.wp[me.sl][1]; L.reserve = me.wp[me.sl][2]; }
      if (wid && this.vmWeaponId !== wid) this.setViewmodel(wid);
      if (this.spec.friend && !this.spec.started) { this.spec.started = true; $('sp-wait')?.remove(); }
      const selfP = s.players.find(p => p.i === this.myId);
      if (selfP && selfP.p) { this.spec.buf.push({ t: s.t, p: selfP.p, y: selfP.y, pt: selfP.pt, c: selfP.c, al: selfP.al, sd: selfP.sd }); if (this.spec.buf.length > 30) this.spec.buf.shift(); }
    }
    if (this.syncSlot && me.wp[me.sl]) {
      this.syncSlot = false;
      L.slot = me.sl;
      L.mag = me.wp[me.sl][1]; L.reserve = me.wp[me.sl][2];
      this.setViewmodel(me.wp[me.sl][0]);
    }
    if (this.pendingSwitch && me.wp[this.pendingSwitch]) {
      const s2 = this.pendingSwitch; this.pendingSwitch = null;
      L.slot = 0; this.switchSlot(s2);
    }
    if (!me.wp[L.slot]) { L.slot = [1, 2, 3].find(k => me.wp[k]) || 3; if (me.wp[L.slot]) this.setViewmodel(me.wp[L.slot][0]); }
    const w = me.wp[L.slot];
    if (w && this.vmWeaponId !== w[0]) { this.setViewmodel(w[0]); L.mag = w[1]; L.reserve = w[2]; L.reloadEnd = 0; }
    if (w && tnow - L.lastShot > 0.4 && L.reloadEnd <= tnow) { L.mag = w[1]; L.reserve = w[2]; }
    if (w && me.rl > 0 && L.reloadEnd <= tnow) L.reloadEnd = tnow + me.rl;

    for (const p of s.players) {
      if (p.i === this.myId) { this.self = p; continue; }
      const o = this.others.get(p.i);
      if (!o) continue;
      // ennemi hors de vue : le serveur ne transmet plus sa position (anti-wallhack)
      if (p.h) { o.buf.length = 0; o.hiddenSnap = true; continue; }
      const lastB = o.buf[o.buf.length - 1];
      if (o.hiddenSnap || (lastB && s.t - lastB.t > 400)) { o.buf.length = 0; o.lastPos = null; }
      o.hiddenSnap = false;
      o.buf.push({ t: s.t, ...p });
      if (o.buf.length > 30) o.buf.shift();
      if (p.al && o.deadT) { o.deadT = 0; o.ch.root.rotation.x = 0; }
      if (!p.al && !o.deadT) o.deadT = 0.001;
    }
    this.syncDynamic(s);
    if (prevPhase !== s.ph) this.barriers.visible = s.ph === 'buy';
    this.updateHUD();
    if (this.sbOpen) this.renderScoreboard();
  }

  syncDynamic(s) {
    // murs de glace
    const wallIds = new Set(s.walls.map(w => w.i));
    let wallsChanged = false;
    for (const w of s.walls) if (!this.wallMeshes.has(w.i)) {
      const sx = w.max[0] - w.min[0], sy = w.max[1] - w.min[1], sz = w.max[2] - w.min[2];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.MeshStandardMaterial({ color: '#a8f0ff', emissive: '#2bb8ff', emissiveIntensity: 0.35, transparent: true, opacity: 0.82, roughness: 0.1, metalness: 0.2 }));
      mesh.position.set((w.min[0] + w.max[0]) / 2, (w.min[1] + w.max[1]) / 2, (w.min[2] + w.max[2]) / 2);
      mesh.castShadow = true; mesh.scale.y = 0.01; mesh.userData.box = { min: w.min, max: w.max };
      this.scene.add(mesh); this.wallMeshes.set(w.i, mesh); wallsChanged = true;
      SFX.playAbility('wall', mesh.position.toArray());
    }
    for (const [id, mesh] of this.wallMeshes) if (!wallIds.has(id)) { this.scene.remove(mesh); this.wallMeshes.delete(id); wallsChanged = true; }
    if (wallsChanged) {
      this.boxes = this.map.boxes.concat([...this.wallMeshes.values()].map(m => m.userData.box));
      if (this.me?.al) depenetrate(this.local.pos, [...this.wallMeshes.values()].map(m => m.userData.box));
    }
    // fumées
    const smokeIds = new Set(s.smokes.map(x => x.i));
    for (const sm of s.smokes) {
      let g = this.smokeMeshes.get(sm.i);
      if (!g) {
        g = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: '#b7bdd8', roughness: 1, transparent: true, opacity: 0.0, depthWrite: false });
        for (let k = 0; k < 6; k++) {
          const s2 = new THREE.Mesh(new THREE.IcosahedronGeometry(sm.r * (0.55 + Math.random() * 0.3), 2), mat);
          s2.position.set((Math.random() - 0.5) * sm.r * 0.7, (Math.random() - 0.3) * sm.r * 0.4, (Math.random() - 0.5) * sm.r * 0.7);
          g.add(s2);
        }
        const core = new THREE.Mesh(new THREE.SphereGeometry(sm.r * 0.92, 20, 14), mat); g.add(core);
        g.position.set(...sm.p); g.userData = { mat, r: sm.r, born: performance.now() / 1000, p: sm.p };
        g.scale.setScalar(0.2);
        this.scene.add(g); this.smokeMeshes.set(sm.i, g);
        SFX.playSmoke(sm.p);
      }
      g.userData.remain = sm.u;
    }
    for (const [id, g] of this.smokeMeshes) if (!smokeIds.has(id)) { this.scene.remove(g); this.smokeMeshes.delete(id); }
    // zones de feu / électricité
    const fireIds = new Set(s.fires.map(x => x.i));
    for (const f of s.fires) {
      let g = this.fireMeshes.get(f.i);
      if (!g) {
        g = new THREE.Group();
        const col = f.k === 'shock' ? '#3fd0ff' : f.k === 'frost' ? '#9ee7ff' : '#ff6a1f';
        const disc = new THREE.Mesh(new THREE.CircleGeometry(f.r, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
        disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; g.add(disc);
        const flames = [];
        for (let k = 0; k < Math.round(f.r * 7); k++) {
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
          const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * f.r;
          sp.position.set(Math.cos(a) * r, Math.random(), Math.sin(a) * r);
          sp.userData.ph = Math.random();
          g.add(sp); flames.push(sp);
        }
        g.position.set(...f.p); g.userData = { flames, disc, kind: f.k };
        this.scene.add(g); this.fireMeshes.set(f.i, g);
        if (f.k === 'frost') SFX.playFrost?.(f.p); else SFX.playFire(f.p);
      }
    }
    for (const [id, g] of this.fireMeshes) if (!fireIds.has(id)) { this.scene.remove(g); this.fireMeshes.delete(id); }
    // projectiles
    const projIds = new Set(s.proj.map(x => x.i));
    for (const pr of s.proj) {
      let m = this.projMeshes.get(pr.i);
      if (!m) {
        const col = pr.k === 'smoke' ? '#c9d0ff' : pr.k === 'flash' ? '#ffffff' : pr.k === 'cryo' ? '#9ee7ff' : '#ff8a3d';
        m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.2 }));
        m.position.set(...pr.p);
        this.scene.add(m); this.projMeshes.set(pr.i, m);
      }
      m.userData.target = pr.p;
    }
    for (const [id, m] of this.projMeshes) if (!projIds.has(id)) { this.scene.remove(m); this.projMeshes.delete(id); }
    // armes au sol
    const dropIds = new Set((s.drops || []).map(d => d.i));
    for (const d of s.drops || []) {
      if (this.dropMeshes.has(d.i) || !WEAPONS[d.w]) continue;
      const g = new THREE.Group();
      const w = buildWeapon(WEAPONS[d.w].model, 'default'); w.scale.setScalar(1.5); w.rotation.set(0, 0, Math.PI / 2.2); w.position.y = 0.32; g.add(w);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 24), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
      g.position.set(...d.p); g.userData = { w: d.w, ring, wm: w };
      this.scene.add(g); this.dropMeshes.set(d.i, g);
    }
    for (const [id, g] of this.dropMeshes) if (!dropIds.has(id)) { this.scene.remove(g); g.traverse(o => o.geometry?.dispose()); this.dropMeshes.delete(id); }
    // noyau
    const c = s.core;
    this.coreMesh.visible = !!c.p && (c.s === 'dropped' || c.s === 'planted' || c.s === 'defused');
    if (c.p) this.coreMesh.position.set(...c.p);
  }

  onRemoteShot(m) {
    if (m.i === this.myId && this.spec) { const d = WEAPONS[m.w]; SFX.playShot(d ? (d.type === 'pistol' ? 'pistol' : d.type) : 'rifle', null); this.vmKick = 1; if (d && d.type !== 'melee') for (const e of m.e || []) { this.addTracer(this.camera.position.clone().add(new THREE.Vector3(0, -0.12, 0)), new THREE.Vector3(...e)); this.addImpact(e, '#ffe0a0'); } return; }
    if (m.i === this.myId) return;
    const o = this.others.get(m.i);
    const def = WEAPONS[m.w];
    const type = def ? def.type : 'rifle';
    if (this.fxOn(m.i, 'duck') && type !== 'melee') SFX.playQuack(m.o); else SFX.playShot(type === 'pistol' ? 'pistol' : type, m.o);
    if (this.isEnemyId(m.i)) this.caption(type === 'melee' ? 'Couteau ennemi' : 'Tir ennemi', m.o, 'shot');
    let start = new THREE.Vector3(...m.o);
    if (o && o.ch.weapon && o.ch.root.visible) {
      o.ch.root.updateMatrixWorld(true);
      start = o.ch.weapon.localToWorld(o.ch.weapon.userData.muzzle.clone());
      o.fireT = 0.06;
    }
    if (type !== 'melee') for (const e of m.e) { this.addTracer(start, new THREE.Vector3(...e)); this.addImpact(e, '#ffe0a0'); }
    this.shotSeen.set(m.i, performance.now() / 1000);
  }

  // indicateur de la direction d'où viennent les dégâts
  showDamageDir(from) {
    const L = this.local;
    const vx = from[0] - L.pos[0], vz = from[2] - L.pos[2];
    if (Math.hypot(vx, vz) < 0.5) return;
    let rel = Math.atan2(-vx, -vz) - L.yaw;
    while (rel > Math.PI) rel -= 2 * Math.PI;
    while (rel < -Math.PI) rel += 2 * Math.PI;
    const el = document.createElement('i');
    el.style.transform = `rotate(${(-rel * 180 / Math.PI).toFixed(1)}deg)`;
    $('dmg-dir').appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }

  // ======================= EFFETS =======================
  addTracer(a, b) {
    const len = a.distanceTo(b);
    if (len < 0.5) return;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, len), new THREE.MeshBasicMaterial({ color: '#fff2c0', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.lookAt(b);
    this.scene.add(mesh);
    this.tracers.push({ mesh, t: 0.07 });
  }

  addImpact(p, color, size = 0.5, life = 0.25) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.softTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    sp.position.set(p[0], p[1], p[2]);
    sp.scale.setScalar(size);
    this.scene.add(sp);
    this.particles.push({ sp, t: life, life, size });
  }

  // ======================= BOUCLE =======================
  frame(t) {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(tt => this.frame(tt));
    // limiteur d'images par seconde
    const cap = Number(ST().fpsCap) || 0;
    if (cap && t - this.last < 1000 / cap - 1.5) return;
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    const now = t / 1000;
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) {
      const fpsNow = Math.round(this.fpsN / this.fpsAcc);
      $('fps').textContent = fpsNow + ' FPS'; this.fpsAcc = 0; this.fpsN = 0;
      // conseil « PC faible » si le jeu rame longtemps
      if (ST().lowFpsTip && ST().gfxPreset !== 'low' && !this.lowTipDone && fpsNow > 0) {
        this.lowFps = fpsNow < 28 ? (this.lowFps || 0) + 1 : 0;
        if (this.lowFps >= 30) { this.lowTipDone = true; this.onLowFps?.(); }
      }
      if (ST().netGraph) this.drawNetGraph(fpsNow);
      const rtt = Math.round(this.net.rtt || 0);
      $('ping').textContent = rtt ? `${rtt} ms` : '';
      $('ping').className = rtt > 150 ? 'bad' : rtt > 80 ? 'mid' : '';
    }

    this.updateLocal(dt, now);
    this.updateOthers(dt, now);
    this.updateEffects(dt, now);
    this.updateCamera(dt, now);
    if (this.kc) this.updateKillcam(now);
    animateSkins(now);

    if (this.dust?.visible) this.updateDust(dt);
    if (this.composer) this.composer.render(dt);
    else { this.renderer.clear(); this.renderer.render(this.scene, this.camera); }
    if (this.me?.al && !this.scoped && !this.kc && !this.spec?.third) {
      this.renderer.clearDepth();
      this.renderer.render(this.vmScene, this.vmCam);
    }
    this.updateFrameHUD(dt, now);
    if (this.touch) this.touch.update({ alive: !!this.me?.al, canBuy: this.mode !== 'gungame' && (isFfa(this.mode) || this.snap?.ph === 'buy'), assault: this.mode === 'assault', scope: WEAPONS[this.curWeaponId()]?.scope || WEAPONS[this.curWeaponId()]?.ads });
  }

  updateLocal(dt, now) {
    if (this.spec) { this.updateSpectator(dt, now); return; }
    const L = this.local, H = this.held;
    const alive = !!this.me?.al;
    if (!alive) return;
    const ph = this.snap?.ph;
    const def = WEAPONS[this.curWeaponId()];
    const frozen = ph === 'warmup' || ph === 'over' || (this.interacting && this.me?.pr) || this.chatOpen || this.trollOn('freeze');
    L.crouch = H.has('crouch') && !frozen;
    let f = 0, s = 0;
    if (!frozen) { f = (H.has('forward') ? 1 : 0) - (H.has('back') ? 1 : 0); s = (H.has('right') ? 1 : 0) - (H.has('left') ? 1 : 0); }
    // joystick tactile : petite inclinaison = marche silencieuse
    const tm = this.touch?.move || (this.padActive ? this.padMove : null);
    let stickMag = 0;
    if (tm && !frozen && !this.paused) { stickMag = Math.min(1, Math.hypot(tm.x, tm.y)); if (stickMag > 0.15) { f = -tm.y; s = tm.x; } }
    if (this.trollOn('invert')) s = -s; // blague : gauche et droite inversées
    let wx = -Math.sin(L.yaw) * f + Math.cos(L.yaw) * s, wz = -Math.cos(L.yaw) * f - Math.sin(L.yaw) * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    const walking = H.has('walk') || (stickMag > 0.15 && stickMag < 0.55);
    let speed = MOVE.run * (def.speed || 1) * (this.me.sm || 1);
    // glissade : s'accroupir en courant (au sol, ni en marche lente, ni en visée à la lunette)
    const runSpeed = speed;
    if (L.crouch && !L.crouchPrev && !(L.slideT > 0) && !(L.dashT > 0) && this.slideOn && ST().slide !== false && L.onGround && !walking && !this.scoped
      && Math.hypot(L.vel[0], L.vel[2]) >= runSpeed * MOVE.slideStart && now >= (L.slideReady || 0)) this.startSlide(now, runSpeed);
    L.crouchPrev = L.crouch;
    if (walking) speed *= MOVE.walkMul;
    if (L.crouch) speed *= MOVE.crouchMul;
    if (this.scoped) speed *= 0.6;
    if (def.ads && this.adsK > 0) speed *= 1 - (1 - def.ads.move) * this.adsK;
    if (L.dashT > 0) L.dashT -= dt;
    else if (L.slideT > 0) {
      // la vitesse de la glissade diminue avec le frottement ; on peut légèrement l'orienter
      L.slideT -= dt;
      const hv = Math.hypot(L.vel[0], L.vel[2]);
      const nv = hv * Math.exp(-MOVE.slideFriction * dt);
      let dx = hv > 0.01 ? L.vel[0] / hv : 0, dz = hv > 0.01 ? L.vel[2] / hv : 0;
      if (wl > 0 && hv > 0.01) { const k = Math.min(1, MOVE.slideSteer * dt); dx += (wx - dx) * k; dz += (wz - dz) * k; const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl; }
      L.vel[0] = dx * nv; L.vel[2] = dz * nv;
      // fin : durée écoulée, trop lent (mur, frottement), accroupi relâché ou en l'air
      if (L.slideT <= 0 || nv < runSpeed * MOVE.crouchMul || !L.crouch || !L.onGround || frozen) L.slideT = 0;
    } else {
      const rate = L.onGround ? 15 : 2.2;
      const k = Math.min(1, rate * dt);
      L.vel[0] += (wx * speed - L.vel[0]) * k;
      L.vel[2] += (wz * speed - L.vel[2]) * k;
    }
    if (H.has('jump') && L.onGround && !frozen) {
      // saut pendant une glissade : on garde une bonne partie de l'élan
      if (L.slideT > 0) { L.slideT = 0; const hv = Math.hypot(L.vel[0], L.vel[2]), cap = MOVE.slideSpeed * MOVE.slideJumpKeep * (def.speed || 1) * (this.me.sm || 1); if (hv > cap) { L.vel[0] *= cap / hv; L.vel[2] *= cap / hv; } }
      L.vel[1] = MOVE.jump; L.onGround = false; SFX.playJump();
    }
    L.vel[1] -= MOVE.gravity * (this.opts.lowGrav ? 0.45 : 1) * dt;
    const prev = L.pos.slice();
    const wasGround = L.onGround, fallV = L.vel[1];
    L.onGround = collideMove(L.pos, L.vel, dt, this.boxes);
    if (L.onGround && !wasGround && fallV < -3) SFX.playLand(fallV < -11);
    if (ph === 'buy' && !isFfa(this.mode)) {
      const allowed = this.me.side === 'atk' ? 'T' : 'D';
      if (this.map.cellAt(L.pos[0], L.pos[2]) !== allowed) { L.pos[0] = prev[0]; L.pos[2] = prev[2]; L.vel[0] = L.vel[2] = 0; }
    }
    L.eyeH += ((L.crouch ? PLAYER.eyeCrouch : PLAYER.eye) - L.eyeH) * Math.min(1, dt * 14);
    // pas
    const hs = Math.hypot(L.vel[0], L.vel[2]);
    if (L.onGround && hs > 4 && !walking && !L.crouch) {
      L.stepT -= dt;
      if (L.stepT <= 0) { SFX.playStep(null, true); L.stepT = 0.36; }
    }
    // tir
    if (H.has('fire')) this.tryFire(now);
    else L.triggerHeld = false;
    // rechargement automatique quand le chargeur est vide
    if (ST().autoReload && def.mag && L.mag <= 0 && L.reserve > 0 && !(L.reloadEnd > now) && now - L.lastShot > 0.12 && this.snap?.ph !== 'buy') this.reload();
    // recul : récupération
    if (now - L.lastShot > 1 / (def.rate || 5) * 1.3) {
      L.recoil *= Math.exp(-dt * 9);
      L.burst = Math.max(0, L.burst - dt * 20);
    }
    if (L.switchT > 0) L.switchT -= dt;
    // fin de rechargement (prédiction)
    if (L.reloadEnd && now >= L.reloadEnd) {
      if (this.reloadSlot === L.slot && def.mag) { const take = Math.min(def.mag - L.mag, L.reserve); L.mag += take; L.reserve -= take; }
      L.reloadEnd = 0;
      L.lastShot = now - 0.2;
    }
    // envoi des entrées (30 Hz)
    if (now - this.lastInput > 1 / 30) {
      this.lastInput = now;
      this.net.send('input', { p: L.pos.map(v => Math.round(v * 100) / 100), y: Math.round(L.yaw * 1000) / 1000, pt: Math.round((L.pitch + L.recoil) * 1000) / 1000, c: L.crouch ? 1 : 0, s: L.slot, ...(L.slideT > 0 ? { sl: 1 } : {}) });
    }
    SFX.setListener(this.eyePos(), L.yaw);
  }

  // glissade : élan vers l'avant dans la direction du déplacement
  startSlide(now, runSpeed) {
    const L = this.local;
    const hv = Math.hypot(L.vel[0], L.vel[2]) || 1;
    const v0 = Math.max(hv, MOVE.slideSpeed * (runSpeed / MOVE.run));
    L.vel[0] *= v0 / hv; L.vel[2] *= v0 / hv;
    L.slideT = MOVE.slideTime;
    L.slideReady = now + MOVE.slideCooldown;
    this.ads = false;
    this.toggleBuy(false);
    SFX.playSlide();
    this.net.send('slide');
  }

  interpState(o, renderT) {
    const b = o.buf;
    if (!b.length) return null;
    if (renderT <= b[0].t) return b[0];
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i].t <= renderT) {
        const a = b[i], c = b[i + 1];
        if (!c) return a;
        const k = (renderT - a.t) / Math.max(1, c.t - a.t);
        return {
          ...c, p: [a.p[0] + (c.p[0] - a.p[0]) * k, a.p[1] + (c.p[1] - a.p[1]) * k, a.p[2] + (c.p[2] - a.p[2]) * k],
          y: lerpAngle(a.y, c.y, k), pt: a.pt + (c.pt - a.pt) * k,
        };
      }
    }
    return b[b.length - 1];
  }

  updateOthers(dt, now) {
    const renderT = Date.now() + (this.offset || 0) - 120;
    const tnow = performance.now() / 1000;
    if (tnow - this.lastVis > 0.1) { this.lastVis = tnow; this.computeVisibility(); }
    for (const o of this.others.values()) {
      const st = this.interpState(o, renderT);
      o.cur = st;
      const ch = o.ch;
      if (!st) { ch.root.visible = false; continue; }
      if (st.au) { // seulement entendu : pas de modèle affiché, mais les pas restent audibles
        ch.root.visible = false;
        const sp = o.lastPos ? Math.hypot(st.p[0] - o.lastPos[0], st.p[2] - o.lastPos[2]) / Math.max(dt, 1e-3) : 0;
        o.lastPos = st.p.slice(); o.speedS = (o.speedS || 0) * 0.85 + sp * 0.15;
        if (o.speedS > 4.3) { o.stepT -= dt; if (o.stepT <= 0) { SFX.playStep(st.p); o.stepT = 0.36; if (this.isEnemyId(o.id)) this.caption('Pas ennemis', st.p, 'step', 22); } }
        continue;
      }
      ch.root.visible = true;
      this.setOtherWeapon(o, st.w);
      ch.root.position.set(st.p[0], st.p[1], st.p[2]);
      ch.root.rotation.y = st.y;
      const crouch = st.c ? 1 : 0;
      const slid = st.sd && st.al ? 1 : 0;
      if (slid && !o.slid) { SFX.playSlide(st.p); if (this.isEnemyId(o.id)) this.caption('Glissade ennemie', st.p, 'slide', 30); }
      o.slid = slid;
      ch.upper.position.y += ((slid ? 0.42 : crouch ? 0.5 : 0.9) - ch.upper.position.y) * Math.min(1, dt * 12);
      ch.upper.rotation.x += ((slid ? -0.45 : 0) - ch.upper.rotation.x) * Math.min(1, dt * 12);
      ch.lower.scale.y += ((crouch ? 0.58 : 1) - ch.lower.scale.y) * Math.min(1, dt * 12);
      ch.head.rotation.x = st.pt * 0.6;
      ch.arms[0].rotation.x = -1.2 + st.pt * 0.8 + (o.fireT > 0 ? 0.15 : 0);
      ch.arms[1].rotation.x = -1.35 + st.pt * 0.8 + (o.fireT > 0 ? 0.15 : 0);
      // blagues visibles par tous : grosse tête (ou événement serveur), minuscule, danse
      { const hs = this.bigHeadEvent || this.fxOn(o.id, 'bighead') ? 2.3 : 1; ch.head.scale.setScalar(ch.head.scale.x + (hs - ch.head.scale.x) * Math.min(1, dt * 8));
        const rs = this.fxOn(o.id, 'tiny') ? 0.45 : 1; ch.root.scale.setScalar(ch.root.scale.x + (rs - ch.root.scale.x) * Math.min(1, dt * 8));
        if (this.fxOn(o.id, 'dance')) { const tn = performance.now() / 1000; ch.root.rotation.y = st.y + tn * 5; ch.arms[0].rotation.x = -2.9 + Math.sin(tn * 9) * 0.4; ch.arms[1].rotation.x = -2.9 - Math.sin(tn * 9) * 0.4; ch.root.position.y += Math.abs(Math.sin(tn * 9)) * 0.12; } }
      ch.hand.position.y = 0.3 + st.pt * 0.3;
      ch.hand.rotation.x = st.pt * 0.9;
      if (o.fireT > 0) o.fireT -= dt;
      // marche
      let speed = 0;
      if (o.lastPos) speed = Math.hypot(st.p[0] - o.lastPos[0], st.p[2] - o.lastPos[2]) / Math.max(dt, 1e-3);
      o.lastPos = st.p.slice();
      o.speedS = (o.speedS || 0) * 0.85 + speed * 0.15;
      if (slid) { ch.legs[0].rotation.x += (-1.25 - ch.legs[0].rotation.x) * Math.min(1, dt * 14); ch.legs[1].rotation.x += (-1.05 - ch.legs[1].rotation.x) * Math.min(1, dt * 14); }
      else if (st.al && o.speedS > 0.5) {
        o.walkPhase += dt * o.speedS * 1.6;
        const sw = Math.sin(o.walkPhase) * Math.min(0.7, o.speedS * 0.1);
        ch.legs[0].rotation.x = sw; ch.legs[1].rotation.x = -sw;
      } else { ch.legs[0].rotation.x *= 0.8; ch.legs[1].rotation.x *= 0.8; }
      if (st.al && !slid && o.speedS > 4.3 && Math.abs(st.p[1] - (o.prevY ?? st.p[1])) < 0.02) {
        o.stepT -= dt;
        if (o.stepT <= 0) { SFX.playStep(st.p); o.stepT = 0.36; if (this.isEnemyId(o.id)) this.caption('Pas ennemis', st.p, 'step', 22); }
      }
      o.prevY = st.p[1];
      // mort
      if (!st.al) {
        if (!o.deadT) o.deadT = 0.001;
        o.deadT += dt;
        ch.root.rotation.x = -Math.min(1, o.deadT / 0.35) * Math.PI / 2;
        ch.root.position.y = st.p[1] + 0.18 * Math.min(1, o.deadT / 0.35);
        ch.xray.visible = false;
      } else {
        ch.root.rotation.x = 0;
        const enemy = this.isEnemyId(o.id);
        ch.xray.visible = !!((enemy && st.rv) || (this.spec?.xray && enemy));
      }
      // invisibilité
      const enemy = this.isEnemyId(o.id);
      const op = st.iv && st.al ? (enemy ? 0.05 : 0.35) : st.sp && st.al ? (Math.sin(now * 14) > 0 ? 0.35 : 0.75) : 1;
      if (op !== o.opacity) { setCharacterOpacity(ch, op); o.opacity = op; }
      // spectateur : cacher la cible suivie
      if (this.specTarget === o.id && !this.me?.al) ch.root.visible = false;
    }
  }

  computeVisibility() {
    this.visibleEnemies.clear();
    if (!this.me) return;
    const eye = this.me.al ? this.eyePos() : null;
    for (const o of this.others.values()) {
      const st = o.cur;
      if (!st || !st.al || !this.isEnemyId(o.id)) continue;
      if (st.rv) { this.visibleEnemies.add(o.id); continue; }
      if (!eye || st.iv) continue;
      const tp = [st.p[0], st.p[1] + 1.3, st.p[2]];
      const to = [tp[0] - eye[0], tp[1] - eye[1], tp[2] - eye[2]];
      const dist = Math.hypot(...to);
      const d = norm(to);
      const look = dirFromAngles(this.local.yaw, 0);
      if (d[0] * look[0] + d[2] * look[2] < 0.2 && dist > 4) continue;
      if (raycastBoxes(eye, d, dist, this.boxes).t < dist - 0.3) continue;
      let blocked = false;
      for (const g of this.smokeMeshes.values()) if (raySphere(eye, d, g.userData.p, g.userData.r * 0.9) < dist) { blocked = true; break; }
      if (!blocked) this.visibleEnemies.add(o.id);
    }
  }

  updateEffects(dt, now) {
    for (const t of this.tracers) { t.t -= dt; t.mesh.material.opacity = Math.max(0, t.t / 0.07); }
    this.tracers = this.tracers.filter(t => { if (t.t <= 0) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); return false; } return true; });
    for (const p of this.particles) { p.t -= dt; const k = p.t / p.life; p.sp.material.opacity = k; p.sp.scale.setScalar(p.size * (1.5 - k * 0.5)); }
    this.particles = this.particles.filter(p => { if (p.t <= 0) { this.scene.remove(p.sp); return false; } return true; });
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.vmFlash.visible = false; } }
    this.muzzleLight.intensity *= Math.exp(-dt * 40);
    for (const m of this.wallMeshes.values()) m.scale.y = Math.min(1, m.scale.y + dt * 4);
    for (const g of this.smokeMeshes.values()) {
      const age = now - g.userData.born;
      g.scale.setScalar(Math.min(1, 0.2 + age * 1.6));
      const fade = g.userData.remain < 1.2 ? g.userData.remain / 1.2 : 1;
      g.userData.mat.opacity = 0.72 * Math.min(1, age * 2) * fade;
      g.rotation.y += dt * 0.05;
    }
    for (const g of this.fireMeshes.values()) {
      for (const sp of g.userData.flames) {
        const kd = g.userData.kind;
        sp.userData.ph = (sp.userData.ph + dt * (kd === 'shock' ? 2.5 : kd === 'frost' ? 0.5 : 1.2)) % 1;
        const ph = sp.userData.ph;
        sp.position.y = kd === 'frost' ? (1 - ph) * 2.4 : ph * (kd === 'shock' ? 0.8 : 1.6); // le givre tombe
        const sc = kd === 'frost' ? 0.35 + (1 - ph) * 0.25 : (1 - ph) * (kd === 'shock' ? 0.6 : 1.1) + 0.2;
        sp.scale.setScalar(sc);
        sp.material.opacity = (1 - ph) * 0.8;
      }
      g.userData.disc.material.opacity = 0.25 + Math.sin(now * 12) * 0.06;
    }
    for (const g of this.dropMeshes.values()) { g.userData.wm.rotation.y += dt * 1.2; g.userData.ring.material.opacity = 0.35 + Math.sin(now * 4) * 0.2; }
    for (const m of this.projMeshes.values()) {
      const tg = m.userData.target;
      if (tg) m.position.lerp(new THREE.Vector3(...tg), Math.min(1, dt * 15));
    }
    if (this.coreMesh.visible) {
      this.coreOct.rotation.y += dt * 2;
      const planted = this.snap?.core.s === 'planted';
      const pulse = planted ? (Math.sin(now * (this.snap.core.f < 10 ? 18 : 8)) * 0.5 + 0.5) : 0.5;
      this.coreOct.material.emissiveIntensity = 0.8 + pulse * 2;
      this.coreRing.scale.setScalar(1 + pulse * 0.3);
      if (planted) {
        const f = this.snap.core.f;
        const iv = f > 20 ? 1 : f > 10 ? 0.5 : f > 5 ? 0.25 : 0.12;
        this.coreBeepT -= dt;
        if (this.coreBeepT <= 0) { this.coreBeepT = iv; SFX.playBeep(f < 10 ? 1.3 : 1); if (f < 10) this.caption('Bips rapides du noyau', null, 'beep', 0, 4); }
      }
    }
  }

  updateCamera(dt, now) {
    const L = this.local;
    const cam = this.camera;
    let shake = 0;
    if (this.shake > 0) { this.shake -= dt; shake = ST().reduceMotion ? 0 : this.shake * 0.08 * (ST().shakeAmount ?? 1); }
    // mise en joue au viseur (≈ 0,15 s) : zoom progressif, réticule normal masqué ; retombe à 0 à la mort
    this.adsK += ((this.ads && this.me?.al && !this.spec ? 1 : 0) - this.adsK) * Math.min(1, dt * 14);
    if (this.adsK < 0.002) this.adsK = 0;
    if (Math.abs(this.adsK - (this.adsFovK || 0)) > 0.002 || (this.adsK === 0 && this.adsFovK)) { this.adsFovK = this.adsK; this.updateFov(); }
    $('crosshair').classList.toggle('ads', this.adsK > 0.6);
    // blagues : arc-en-ciel, écran pixelisé, pastille
    { const cv = this.renderer.domElement; const tn = performance.now() / 1000;
      if (this.trollOn('rainbow')) cv.style.filter = `hue-rotate(${(tn * 200) % 360}deg) saturate(1.8)`; else if (cv.style.filter) cv.style.filter = '';
      const px = this.trollOn('pixel'); if (px !== !!this.pixelOn) { this.pixelOn = px; cv.style.imageRendering = px ? 'pixelated' : ''; this.onResize(); }
      this.updateTrollBadge(); }
    if (this.spec) {
      const e = this.eyePos();
      if (this.spec.third) {
        const back = 3.2, cp = Math.cos(L.pitch);
        cam.position.set(e[0] + Math.sin(L.yaw) * cp * back, e[1] + 0.6 - Math.sin(L.pitch) * back * 0.5, e[2] + Math.cos(L.yaw) * cp * back);
      } else cam.position.set(e[0], e[1], e[2]);
      // le joueur observé glisse : même inclinaison de caméra que lui
      L.slideRoll = (L.slideRoll || 0) + ((L.specSlide && !this.spec.third && !ST().reduceMotion ? 0.075 : 0) - (L.slideRoll || 0)) * Math.min(1, dt * 10);
      cam.rotation.set(L.pitch, L.yaw, L.slideRoll);
      $('death-info').innerHTML = this.me && !this.me.al ? `${esc(this.nameOf(this.myId))} est mort${this.me.rs ? ` · réapparition dans ${Math.ceil(this.me.rs)} s` : ''}` : '';
    } else if (this.me?.al || !this.me) {
      const e = this.eyePos();
      cam.position.set(e[0], e[1], e[2]);
      const sliding = L.slideT > 0 && !ST().reduceMotion && ST().slideTilt !== false;
      L.slideRoll = (L.slideRoll || 0) + ((sliding ? 0.075 : 0) - (L.slideRoll || 0)) * Math.min(1, dt * 10);
      const kick = sliding && !this.scoped ? 1.07 : 1;
      if (Math.abs((this.fovKick || 1) - kick) > 0.002) { this.fovKick = (this.fovKick || 1) + (kick - (this.fovKick || 1)) * Math.min(1, dt * 8); this.updateFov(); }
      const tn = performance.now() / 1000;
      let roll = L.slideRoll, tp = 0;
      if (this.trollOn('upside')) roll += Math.PI;
      if (this.trollOn('spin')) roll += (tn * 2.4) % (Math.PI * 2);
      if (this.trollOn('drunk')) { roll += Math.sin(tn * 1.3) * 0.22; tp = Math.sin(tn * 0.9) * 0.06; }
      cam.rotation.set(L.pitch + L.recoil + tp + (Math.random() - 0.5) * shake, L.yaw + (Math.random() - 0.5) * shake, roll);
      this.specTarget = null;
    } else {
      // mode spectateur
      let target = null;
      if (!isFfa(this.mode)) {
        const me = this.roster.get(this.myId);
        const allies = [...this.others.values()].filter(o => o.cur?.al && this.roster.get(o.id)?.team === me?.team);
        if (allies.length) target = allies[this.specIdx % allies.length];
      }
      if (target) {
        const st = target.cur;
        cam.position.set(st.p[0], st.p[1] + (st.c ? PLAYER.eyeCrouch : PLAYER.eye), st.p[2]);
        cam.rotation.set(st.pt, st.y, 0);
        this.specTarget = target.id;
        const tp = this.snap?.players.find(p => p.i === target.id);
        const info = tp && tp.hp !== undefined ? ` · <span class="spec-hp">✚ ${tp.hp}</span>${tp.ar ? ` <span class="muted">⛉ ${tp.ar}</span>` : ''} · ${esc(WEAPONS[tp.w]?.name || '')}${tp.$ !== undefined ? ` · <span class="gold">${tp.$}</span>` : ''}` : '';
        $('death-info').innerHTML = `SPECTATEUR : <b style="color:${ALLY}">${esc(this.nameOf(target.id))}</b>${info} <span class="muted">(clic pour changer)</span>`;
      } else {
        this.specTarget = null;
        const e = this.eyePos();
        cam.position.set(e[0], e[1] + 1.5, e[2]);
        cam.rotation.set(L.pitch, L.yaw, 0);
        if (isFfa(this.mode) && this.me) $('death-info').innerHTML = (this.killedBy && this.killedBy !== this.myId ? `ÉLIMINÉ PAR <b>${esc(this.nameOf(this.killedBy))}</b> · ` : '') + `RÉAPPARITION DANS ${Math.ceil(this.me.rs)} s`;
      }
    }
    // modèle d'arme
    const hs = Math.hypot(L.vel[0], L.vel[2]);
    if (L.onGround && hs > 0.5) this.vmBob += dt * hs * 1.5;
    const bobA = ST().bob && !ST().reduceMotion ? Math.min(1, hs / 6) * (L.onGround ? 1 : 0.3) : 0;
    this.vmSwayX *= Math.exp(-dt * 10); this.vmSwayY *= Math.exp(-dt * 10);
    this.vmKick *= Math.exp(-dt * 14);
    const base = this.vmBase || VM_OFFSET.rifle;
    const reloadK = L.reloadEnd > now ? Math.sin(Math.min(1, 1 - (L.reloadEnd - now) / (WEAPONS[this.curWeaponId()].reload || 1)) * Math.PI) : 0;
    const sw = Math.max(0, L.switchT) / 0.35;
    const melee = WEAPONS[this.curWeaponId()].type === 'melee';
    // viseur : l'arme glisse au centre, la fenêtre du viseur devant l'œil (balancement réduit)
    const ak = this.vmSight ? (this.adsK || 0) : 0, hipK = 1 - ak * 0.85;
    const hip = [base[0] * (ST().leftHand ? -1 : 1), base[1], base[2]];
    const aim = this.vmSight ? [0, -this.vmSight.y, -(this.vmSight.dist || 0.25) - this.vmSight.z] : hip;
    this.vm.position.set(
      hip[0] + (aim[0] - hip[0]) * ak + (Math.cos(this.vmBob) * 0.012 * bobA - this.vmSwayX) * hipK,
      hip[1] + (aim[1] - hip[1]) * ak + (Math.abs(Math.sin(this.vmBob)) * 0.014 * bobA + this.vmSwayY) * hipK - reloadK * 0.12 - sw * 0.25 - (L.crouch ? 0.01 : 0) * hipK - (L.slideRoll || 0) * 0.5,
      hip[2] + (aim[2] - hip[2]) * ak + this.vmKick * (melee ? -0.15 : 0.06));
    let insp = 0;
    if (this.inspectT > 0) { this.inspectT -= dt; if (this.local.lastShot > now - 0.2 || L.reloadEnd > now) this.inspectT = 0; insp = Math.sin(Math.min(1, (1.8 - this.inspectT) / 1.8) * Math.PI); }
    this.vm.rotation.set(this.vmKick * (melee ? -0.6 : 0.12) - reloadK * 0.6 + sw * 0.6 + insp * 0.35, this.vmSwayX * 2 + (melee ? this.vmKick * 0.8 : 0) + insp * 1.1, reloadK * 0.4 + insp * 0.5 + (L.slideRoll || 0) * 2.5);
  }

  // ======================= HUD (mise à jour) =======================
  updateHUD() {
    const s = this.snap, me = s.me;
    const myTeam = this.roster.get(this.myId)?.team;
    // score + minuteur
    if (this.mode === 'gungame') {
      const myG = this.self?.gl ?? 0;
      const best = Math.max(0, ...s.players.filter(p => p.i !== this.myId).map(p => p.gl || 0));
      $('score-left').textContent = myG + 1;
      $('score-right').textContent = best + 1;
      const next = GUN_LADDER[myG];
      $('round-label').textContent = `GUN GAME · ARME ${myG + 1}/${GUN_LADDER.length} · ${(WEAPONS[next]?.name || '').toUpperCase()}`;
    } else if (isFfa(this.mode)) {
      const myK = this.self?.k ?? 0;
      const best = Math.max(0, ...s.players.filter(p => p.i !== this.myId).map(p => p.k));
      // classement en direct : position du joueur
      const pos = 1 + s.players.filter(p => p.i !== this.myId && p.k > myK).length;
      if (this.mode === 'lives') {
        const inGame = s.players.filter(p => (p.lv ?? 1) > 0).length;
        $('score-left').textContent = this.self?.lv ?? 0;
        $('score-right').textContent = inGame;
        $('round-label').textContent = `${this.self?.lv ?? 0} ❤ · ${inGame} EN JEU`;
      } else {
        $('score-left').textContent = myK;
        $('score-right').textContent = best;
        $('round-label').textContent = `OBJECTIF ${this.target} · ${pos}${pos === 1 ? 'ER' : 'E'} / ${s.players.length}`;
      }
    } else {
      $('score-left').textContent = s.sc[myTeam] ?? 0;
      $('score-right').textContent = s.sc[myTeam === 'alpha' ? 'beta' : 'alpha'] ?? 0;
      $('round-label').textContent = s.ph === 'buy' ? 'PHASE D\'ACHAT' : this.mode === 'duel' ? `DUEL · MANCHE ${s.rd} · OBJ. ${this.target}` : `MANCHE ${s.rd} · ${me.side === 'atk' ? 'ATTAQUE' : 'DÉFENSE'}`;
    }
    this.updateProgress(s, myTeam);
    const timer = $('timer');
    if (s.ph === 'planted') { timer.textContent = '◆ ' + fmtTime(s.core.f); timer.classList.add('planted'); }
    else { timer.textContent = fmtTime(s.tm); timer.classList.remove('planted'); }
    // icônes vivants/morts
    for (const p of s.players) {
      const el = document.querySelector(`.team-icons [data-id="${p.i}"] .agent-icon`);
      if (el) el.classList.toggle('dead', !p.al);
      const hb = p.hp !== undefined && document.querySelector(`#icons-left [data-id="${p.i}"] .hpb b`);
      if (hb) { hb.style.width = (p.al ? Math.max(0, Math.min(100, p.hp)) : 0) + '%'; hb.parentElement.classList.toggle('low', p.hp <= 30); }
    }
    // joueurs encore en vie : « 4 contre 3 »
    let ac = $('alive-count');
    if (!ac) { ac = document.createElement('div'); ac.id = 'alive-count'; document.querySelector('#hud .score-box .mid')?.appendChild(ac); }
    if (!isFfa(this.mode)) {
      const mine = s.players.filter(p => p.al && this.roster.get(p.i)?.team === myTeam).length, foes = s.players.filter(p => p.al && this.roster.get(p.i) && this.roster.get(p.i).team !== myTeam).length;
      ac.innerHTML = `<span class="ally">${mine}</span> contre <span class="enemy">${foes}</span>`; ac.style.display = '';
    } else ac.style.display = 'none';
    // bips des 10 dernières secondes de la manche
    if (ST().roundBeeps && !isFfa(this.mode) && s.ph === 'live' && s.tm > 0 && s.tm <= 10) {
      const sec = Math.ceil(s.tm);
      if (sec !== this.lastBeep) { this.lastBeep = sec; SFX.playTick(sec <= 3); if (sec === 10) this.caption('Fin de la manche dans 10 secondes', null, 'rbeep', 0, 5); }
    }
    this.renderBuffs(me.bt || {});
    // vie
    $('hp-val').textContent = me.hp;
    $('armor-val').textContent = me.ar;
    $('hp-fill').style.width = me.hp + '%';
    $('armor-fill').style.width = me.ar * 2 + '%';
    document.querySelector('.vitals').classList.toggle('low', me.hp <= 30);
    // battements de cœur quand la vie est basse
    if (me.al && me.hp > 0 && me.hp <= 25) { const nowS = performance.now() / 1000; if (nowS > (this.heartT || 0)) { this.heartT = nowS + 0.9; SFX.playHeartbeat(); this.caption('Battements de cœur (points de vie bas)', null, 'heart', 0, 6); } }
    $('money').textContent = me.$;
    $('buy-money').textContent = isFfa(this.mode) ? '∞' : me.$;
    // capacités
    const agent = AGENTS[this.roster.get(this.myId)?.agent];
    if (agent) for (const el of document.querySelectorAll('#abilities .ability')) {
      const k = el.dataset.k;
      if (k === 'x') {
        const cost = agent.abilities.x.cost;
        el.querySelectorAll('.pips i').forEach((p, i) => p.classList.toggle('on', i < me.ult));
        el.classList.toggle('ready', me.ult >= cost);
        el.classList.toggle('empty', me.ult < cost);
      } else {
        const n = me.ab?.[k] || 0;
        el.querySelector('.ch').textContent = n > 1 ? n : (n === 0 && me.rc?.[k] ? Math.ceil(me.rc[k]) + 's' : '');
        el.classList.toggle('empty', n <= 0);
        el.classList.toggle('ready', n > 0);
      }
    }
    // emplacements
    $('slots').innerHTML = [1, 2, 3].filter(i => me.wp[i]).map(i => `<span class="${i === this.local.slot ? 'on' : ''}">${i}·${WEAPONS[me.wp[i][0]].name}</span>`).join('');
    // menu d'achat
    if (this.buyOpen) {
      const canBuy = isFfa(this.mode) || s.ph === 'buy';
      for (const it of document.querySelectorAll('.buy-item')) {
        const id = it.dataset.item, w = WEAPONS[id], a = ARMOR[id];
        if (id === KIT.id) { it.style.display = this.mode === 'assault' && me.side === 'def' ? '' : 'none'; }
        const cost = w ? w.cost : a ? a.cost : KIT.cost;
        const owned = w ? me.wp[w.slot]?.[0] === id : a ? me.ar >= a.value : !!me.kt;
        it.classList.toggle('owned', owned);
        it.classList.toggle('poor', !canBuy || (!isFfa(this.mode) && cost > me.$ && !owned));
      }
      this.updateBuyExtra(s, me);
    }
    // indice noyau
    let hint = '';
    if (this.mode === 'assault' && me.al) {
      const cell = this.map.cellAt(this.local.pos[0], this.local.pos[2]);
      if (this.self?.cr) hint = (cell === 'A' || cell === 'B') && s.ph === 'live' ? `MAINTENEZ ${KB('interact')} POUR POSER LE NOYAU` : 'VOUS PORTEZ LE NOYAU — POSEZ-LE SUR UN SITE (A / B)';
      else if (me.side === 'def' && s.ph === 'planted' && s.core.f < ROUND.defuseTime) hint = '⚠ PLUS ASSEZ DE TEMPS POUR DÉSAMORCER : METS-TOI À L\'ABRI !';
      else if (me.side === 'def' && s.ph === 'planted' && s.core.p && Math.hypot(s.core.p[0] - this.local.pos[0], s.core.p[2] - this.local.pos[2]) < 2.3) hint = `MAINTENEZ ${KB('interact')} POUR DÉSAMORCER`;
      else if (s.ph === 'buy') hint = `${KB('buy')} — MENU D'ACHAT`;
    }
    $('core-hint').textContent = hint;
    $('core-hint').classList.toggle('warn', hint.startsWith('⚠'));
    const pr = $('progress');
    if (me.pr) {
      pr.style.display = 'block';
      pr.querySelector('.p-label').textContent = me.pr[0] === 'plant' ? 'POSE DU NOYAU' : 'DÉSAMORÇAGE';
      pr.querySelector('i').style.width = Math.min(100, me.pr[1] * 100) + '%';
    } else pr.style.display = 'none';
  }

  updateFrameHUD(dt, now) {
    const L = this.local;
    const me = this.me;
    if (!me) return;
    // 1.15 : compteur de vitesse, jauge de glissade, horloge
    { const sp = $('speedo'); const on = ST().showSpeed && me.al && !this.spec; sp.style.display = on ? '' : 'none'; if (on) sp.textContent = `${Math.hypot(L.vel[0], L.vel[2]).toFixed(1)} m/s`;
      const g = $('slide-gauge'); const left = (L.slideReady || 0) - now; const show = this.slideOn && ST().slide !== false && me.al && left > 0 && !this.spec;
      g.style.display = show ? '' : 'none'; if (show) g.firstChild.style.width = `${Math.round((1 - left / MOVE.slideCooldown) * 100)}%`;
      const ck = $('hud-clock'); ck.style.display = ST().showClock ? '' : 'none';
      if (ST().showClock && (!this.clockT || now - this.clockT > 1)) { this.clockT = now; const d = new Date(); ck.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; } }
    // série en cours
    const st = this.self?.st || 0;
    $('streak').textContent = me.al && st >= 2 ? `SÉRIE ×${st}` : '';
    $('combat').style.display = !me.al && !this.spec && $('combat').textContent ? 'block' : 'none';
    // alerte de grenade proche
    let nade = null, nd = 7;
    for (const m of this.projMeshes.values()) { const d = Math.hypot(m.position.x - L.pos[0], m.position.z - L.pos[2]); if (d < nd) { nd = d; nade = m; } }
    const nw = $('nade-warn');
    if (nade && me.al) { const ang = Math.atan2(nade.position.x - L.pos[0], -(nade.position.z - L.pos[2])) + L.yaw; nw.style.display = 'block'; nw.style.transform = `translate(-50%, -50%) rotate(${ang}rad) translateY(-90px) rotate(${-ang}rad)`; }
    else nw.style.display = 'none';
    this.updateObjective();
    // munitions
    const wid = this.curWeaponId();
    const def = WEAPONS[wid];
    $('weapon-name').textContent = def.name.toUpperCase() + (L.reloadEnd > now ? ' · RECHARGEMENT' : '');
    $('mag').textContent = def.mag ? L.mag : '—';
    $('reserve').textContent = def.mag ? '/ ' + L.reserve : '';
    // alerte de munitions faibles
    let aw = $('ammo-warn');
    if (!aw) { aw = document.createElement('div'); aw.id = 'ammo-warn'; $('hud').appendChild(aw); }
    const awT = !ST().lowAmmoWarn || !me.al || !def.mag || L.reloadEnd > now || this.ended ? '' : L.mag <= 0 && L.reserve <= 0 ? 'PLUS DE MUNITIONS' : L.mag <= Math.ceil(def.mag * 0.25) && L.reserve > 0 ? `${KB('reload')} — RECHARGE` : '';
    if (aw.textContent !== awT) aw.textContent = awT;
    // viseur rouge sur un ennemi visible
    if (ST().chEnemy && me.al && !this.scoped) $('crosshair').classList.toggle('on-enemy', this.enemyUnderCrosshair());
    else $('crosshair').classList.remove('on-enemy');
    if (this.chal) this.updateChallenge(now);
    // viseur dynamique
    const hs = Math.hypot(L.vel[0], L.vel[2]);
    const extra = Math.round(Math.min(36, def.type !== 'melee' ? (hs > 2.2 ? def.moveSpread * 120 : 0) + (!L.onGround ? 12 : 0) + Math.min(L.burst, 10) * 1.2 : 0));
    if (extra !== this.chExtra && ST().chDynamic) { this.chExtra = extra; applyCrosshair($('crosshair'), ST(), extra); }
    // marqueur de touche
    if (this.hitT > 0) { this.hitT -= dt; $('hitmarker').style.opacity = Math.max(0, this.hitT / 0.18); }
    // aveuglement
    const fl = L.flashUntil - now;
    $('frost-overlay').classList.toggle('on', !!(this.me && this.me.al && this.me.sm < (this.opts?.speed || 1) - 0.01));
    $('flash-overlay').style.opacity = fl > 0 ? Math.min(1, fl / Math.min(0.9, L.flashDur * 0.6)) * (ST().noFlash ? 0.85 : 1) : 0;
    if (L.hurtT > 0) L.hurtT -= dt;
    $('damage-overlay').style.opacity = Math.max(0, L.hurtT / 0.4) * 0.9 + (me.al && me.hp < 30 ? 0.25 : 0);
    // dans une fumée ?
    let inSmoke = 0;
    const cp = this.camera.position;
    for (const g of this.smokeMeshes.values()) {
      const d = cp.distanceTo(g.position);
      if (d < g.userData.r) inSmoke = Math.max(inSmoke, Math.min(1, (g.userData.r - d) / 1.2) * g.userData.mat.opacity / 0.72);
    }
    $('smoke-overlay').style.opacity = inSmoke * 0.92;
    this.updateMarks(now);
    this.updateBubbles(now);
    if (ST().minimap && now - this.lastMini > 0.05) { this.lastMini = now; this.drawMinimap(); }
  }

  // ---- objectif (Noyau au sol ou posé) ----
  updateObjective() {
    const el = $('obj-tag'), c = this.snap?.core;
    if (!c || !c.p || this.mode !== 'assault' || !(c.s === 'dropped' || c.s === 'planted') || this.kc) { el.style.display = 'none'; return; }
    const v = new THREE.Vector3(c.p[0], c.p[1] + 1, c.p[2]).project(this.camera);
    const w = innerWidth, h = innerHeight;
    let x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
    if (v.z > 1) { x = w - x; y = h - 60; }
    x = Math.max(40, Math.min(w - 40, x)); y = Math.max(60, Math.min(h - 60, y));
    el.style.display = 'flex';
    el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    el.classList.toggle('planted', c.s === 'planted');
    const e = this.camera.position;
    el.querySelector('.md').textContent = `${c.s === 'planted' ? 'NOYAU POSÉ' : 'NOYAU'} · ${Math.round(Math.hypot(c.p[0] - e.x, c.p[2] - e.z))} m`;
  }
  // ---- émotes ----
  showEmote(m) {
    const text = EMOTES[m.e]; if (!text) return;
    if (ST().hideEmotes && m.i !== this.myId) return;
    if (this.muted.has(this.roster.get(m.i)?.name)) return;
    this.addChat({ from: this.nameOf(m.i), text, team: this.roster.get(m.i)?.team, emote: true });
    if (m.i === this.myId) return;
    const el = document.createElement('div'); el.className = 'emote-bubble'; el.textContent = text;
    $('hud').appendChild(el);
    this.bubbles.push({ id: m.i, el, end: performance.now() / 1000 + 2.6 });
  }
  updateBubbles(now) {
    if (!this.bubbles.length) return;
    const w = innerWidth, h = innerHeight, v = new THREE.Vector3();
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i], o = this.others.get(b.id);
      if (now > b.end || !o?.cur || !o.ch.root.visible) { if (now > b.end || !o) { b.el.remove(); this.bubbles.splice(i, 1); } else b.el.style.display = 'none'; continue; }
      v.set(o.cur.p[0], o.cur.p[1] + 2.35, o.cur.p[2]).project(this.camera);
      if (v.z > 1) { b.el.style.display = 'none'; continue; }
      b.el.style.display = 'block';
      b.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
    }
  }
  // ---- vote de fin de partie ----
  renderVote(options, st = null) {
    if (!options) return;
    this.voteOptions = options;
    const tally = st?.tally || {};
    $('end-vote').innerHTML = `<div class="ev-title">PROCHAINE CARTE</div><div class="ev-maps">${options.map(id => `<button class="btn ${this.myVote === id ? 'primary' : ''}" data-vote="${esc(id)}">${esc(MAP_NAMES[id] || id)}${tally[id] ? ` <b>${tally[id]}</b>` : ''}</button>`).join('')}</div>
      <button class="btn ${this.myRematch ? 'primary' : 'ghost'}" data-rematch>⟲ REVANCHE${st ? ` (${st.rematch}/${st.humans})` : ''}</button>`;
    $('end-vote').onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.vote) { this.myVote = b.dataset.vote; this.net.send('mapVote', { map: b.dataset.vote }); }
      if (b.dataset.rematch !== undefined) { this.myRematch = true; this.net.send('rematch'); }
      this.renderVote(this.voteOptions, st);
    };
  }

  // ---- temps restant des effets (sous les capacités) ----
  renderBuffs(bt) {
    let el = $('buffs');
    if (!el) { el = document.createElement('div'); el.id = 'buffs'; $('hud').appendChild(el); }
    const L = { od: ['ϟ', 'Surchauffe'], ph: ['☾', 'Fantôme'], hs: ['»', 'Élan'], iv: ['◌', 'Invisible'], sl: ['❄', 'Ralenti'], hl: ['✚', 'Soin'], pr: ['⛨', 'Protégé'], rv: ['◉', 'Repéré !'] };
    const html = Object.entries(bt).filter(([k]) => L[k]).map(([k, v]) => `<span class="buff b-${k}">${L[k][0]} ${L[k][1]}${v > 0 && k !== 'sl' ? ` <b>${Math.ceil(v)} s</b>` : ''}</span>`).join('');
    if (this.buffHtml !== html) { this.buffHtml = html; el.innerHTML = html; }
  }
  // ---- rapport des dégâts de la manche ----
  showDmgReport(rows) {
    if (!ST().dmgReport || !rows?.length || this.spec) return;
    let el = $('dmg-report');
    if (!el) { el = document.createElement('div'); el.id = 'dmg-report'; $('hud').appendChild(el); }
    el.innerHTML = `<h4>DÉGÂTS DE LA MANCHE</h4>${rows.map(r => `<div class="dr-row ${r.dead ? 'dead' : ''}"><span>${esc(this.nameOf(r.i) === '???' ? r.n : this.nameOf(r.i))}${r.dead ? ' ✝' : ''}</span><span class="dr-out" title="Dégâts infligés">→ ${r.dealt}</span><span class="dr-in" title="Dégâts reçus">← ${r.recv}</span></div>`).join('')}`;
    el.classList.add('show');
    clearTimeout(this.drT); this.drT = setTimeout(() => el.classList.remove('show'), 6500);
  }
  // ---- défi de visée de 60 s (champ de tir) ----
  startChallenge() {
    if (!this.range || this.chal) return;
    const now = performance.now() / 1000;
    this.chal = { end: now + 63, start: now + 3, shots: 0, hits: 0, kills: 0, hs: 0, cd: 3 };
    this.centerMsg('DÉFI DE VISÉE : 3…', 1);
    SFX.playTick();
  }
  updateChallenge(now) {
    const c = this.chal;
    let el = $('chal');
    if (!el) { el = document.createElement('div'); el.id = 'chal'; $('hud').appendChild(el); }
    if (now < c.start) { const n = Math.ceil(c.start - now); if (n !== c.cd) { c.cd = n; this.centerMsg(`DÉFI DE VISÉE : ${n}…`, 1); SFX.playTick(); } c.shots = c.hits = c.kills = c.hs = 0; el.innerHTML = ''; return; }
    if (c.cd) { c.cd = 0; this.centerMsg('PARTEZ !', 1); SFX.playTick(true); }
    const left = c.end - now;
    if (left <= 0) { this.endChallenge(); return; }
    const acc = c.shots ? Math.round(c.hits / c.shots * 100) : 0;
    el.innerHTML = `<div class="ch-t">${Math.ceil(left)} s</div><div><b>${c.kills}</b> cibles · <b>${c.hs}</b> à la tête · <b>${acc} %</b> de précision</div>`;
  }
  endChallenge() {
    const c = this.chal; this.chal = null;
    const acc = c.shots ? c.hits / c.shots : 0;
    const score = c.kills * 100 + c.hs * 50 + Math.round(acc * 300);
    let best = profile.progress?.aimBest || 0; try { best = Math.max(best, +localStorage.getItem('eclipse_aim_best') || 0); } catch { /* stockage indisponible */ }
    const rec = score > best;
    if (rec) { try { localStorage.setItem('eclipse_aim_best', String(score)); } catch { /* stockage indisponible */ } if (!this.isGuest) { this.net.send('aimRecord', { score }); if (profile.progress) profile.progress.aimBest = score; } }
    $('chal').innerHTML = `<div class="ch-t">${rec ? '🏆 NOUVEAU RECORD !' : 'DÉFI TERMINÉ'}</div><div>Score <b>${score}</b> · ${c.kills} cibles · ${c.hs} à la tête · ${Math.round(acc * 100)} % de précision</div><div class="muted">Record : ${Math.max(score, best)} · ${esc(KB('ready'))} pour recommencer</div>`;
    this.banner(rec ? 'NOUVEAU RECORD' : 'DÉFI TERMINÉ', `Score : ${score}`, rec ? 'win' : '', 3);
    SFX.playUI(rec ? 'win' : 'roundStart');
    clearTimeout(this.chalT); this.chalT = setTimeout(() => { if (!this.chal && $('chal')) $('chal').innerHTML = ''; }, 12000);
  }
  // ---- couper le chat d'un joueur pendant la partie ----
  openMute() {
    this.reportOpen = true;
    this.unlock();
    this.showPause(false);
    const list = [...this.roster.values()].filter(r => !r.bot && r.id !== this.myId);
    const draw = () => {
      $('report-inner').innerHTML = `<h2>COUPER LE CHAT</h2><p class="muted">Les messages et émotes des joueurs coupés ne s'affichent plus pour toi pendant cette partie.</p>
        ${list.length ? list.map(r => `<div class="mute-row"><b>${esc(this.nameOf(r.id))}</b><button class="btn small ${this.muted.has(r.name) ? 'primary' : 'ghost'}" data-mute="${esc(r.name)}">${this.muted.has(r.name) ? '🔇 COUPÉ' : '🔊 AFFICHÉ'}</button></div>`).join('') : '<p class="muted">Aucun autre joueur humain dans la partie.</p>'}
        <button class="btn ghost wide" id="rp-close">RETOUR</button>`;
      $('rp-close').onclick = () => { this.reportOpen = false; $('report-overlay').classList.remove('show'); this.showPause(true); };
    };
    draw();
    $('report-inner').onclick = e => { const b = e.target.closest('[data-mute]'); if (!b) return; const n = b.dataset.mute; if (this.muted.has(n)) this.muted.delete(n); else this.muted.add(n); draw(); };
    $('report-overlay').classList.add('show');
  }

  // ---- chiffres de dégâts ----
  damageNumber(d, head, kill) {
    const el = document.createElement('div');
    el.className = 'dmg-num' + (head ? ' head' : '') + (kill ? ' kill' : '');
    el.textContent = Math.round(d);
    el.style.left = `calc(50% + ${Math.round((Math.random() - 0.5) * 60)}px)`;
    $('hud').appendChild(el);
    setTimeout(() => el.remove(), 800);
  }
  // ---- graphique réseau ----
  drawNetGraph(fps) {
    const c = $('netgraph'); if (!c) return;
    (this.ng ||= []).push([Math.round(this.net.rtt || 0), fps]);
    if (this.ng.length > 60) this.ng.shift();
    const g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H); g.fillStyle = 'rgba(8,10,18,.6)'; g.fillRect(0, 0, W, H);
    const line = (i, max, col) => { g.strokeStyle = col; g.lineWidth = 1.5; g.beginPath(); this.ng.forEach((v, x) => { const y = H - 4 - Math.min(1, v[i] / max) * (H - 18); x === 0 ? g.moveTo(x * W / 60, y) : g.lineTo(x * W / 60, y); }); g.stroke(); };
    line(0, 300, '#ffcf5a'); line(1, 160, '#19e3c4');
    const last = this.ng[this.ng.length - 1];
    g.fillStyle = '#ffcf5a'; g.font = '11px sans-serif'; g.fillText(`ping ${last[0]} ms`, 4, 11);
    g.fillStyle = '#19e3c4'; g.fillText(`${last[1]} FPS`, W - 50, 11);
  }

  // ---- spectateur staff ----
  initSpectator() {
    $('click-to-play').style.display = 'none';
    document.body.classList.add('spectating');
    const el = document.createElement('div');
    el.id = 'spec-panel';
    // ami spectateur : panneau simple, retransmission en différé, pas de rayons X ni d'outils de modération
    if (this.spec.friend) {
      el.classList.add('friend');
      el.innerHTML = `<div class="sp-head"><span class="sp-tag">👁 SPECTATEUR</span><span class="muted small">différé de ${this.spec.delay} s</span></div>
        <div class="sp-name">Tu regardes <b>${esc(this.spec.name)}</b></div>
        <div id="sp-wait" class="muted small">La retransmission commence dans ${this.spec.delay} secondes…</div>
        <div class="sp-row"><button class="btn small" data-sp="third" id="sp-third">Vue : 1re personne</button><button class="btn small ghost" data-sp="quit">Quitter</button></div>
        <p class="muted small">V : changer de vue · Tab : scores · Échap : quitter</p>`;
      $('hud').appendChild(el);
      el.onclick = e => { const b = e.target.closest('[data-sp]'); if (b) this.specAction(b.dataset.sp); };
      return;
    }
    el.innerHTML = `<div class="sp-head"><span class="sp-tag">👁 OBSERVATION</span><span class="muted small">invisible pour les joueurs</span></div>
      <div id="sp-body">Chargement…</div>
      <div class="sp-row"><select id="sp-target"></select><button class="btn small" data-sp="prev">◀</button><button class="btn small" data-sp="next">▶</button></div>
      <div class="sp-row"><button class="btn small" data-sp="xray" id="sp-xray">Rayons X : non</button><button class="btn small" data-sp="third" id="sp-third">Vue : 1re personne</button></div>
      <div class="sp-row sp-mod"><input id="sp-reason" maxlength="200" placeholder="Raison (facultatif)"></div>
      <div class="sp-row sp-mod"><button class="btn small" data-sp="warn">Avertir</button><button class="btn small" data-sp="mute">Silence 10 min</button><button class="btn small danger" data-sp="kick">Expulser</button><button class="btn small danger" data-sp="ban">Bannir 24 h</button></div>
      <div class="sp-row sp-mod"><select id="sp-troll">${Object.entries(TROLL_NAMES).map(([k, n]) => `<option value="${k}">😜 ${esc(n)}</option>`).join('')}</select><button class="btn small" data-sp="troll">Blague (10 s)</button><button class="btn small ghost" data-sp="trollstop">Stop</button></div>
      <div id="sp-notice" class="muted small"></div>
      <div class="sp-row"><button class="btn small ghost wide" data-sp="quit">Quitter l'observation</button></div>
      <p class="muted small">Touches : ← → changer de joueur · X rayons X · V vue · Échap quitter</p>`;
    $('hud').appendChild(el);
    el.onclick = e => { const b = e.target.closest('[data-sp]'); if (b) this.specAction(b.dataset.sp); };
    el.querySelector('#sp-target').onchange = e => this.net.send('spectateSwitch', { id: e.target.value });
    el.querySelector('#sp-reason').addEventListener('keydown', e => e.stopPropagation()); // taper la raison ne déclenche pas les raccourcis
    const on = (t, fn) => this.unsubs.push(this.net.on(t, fn));
    on('specInfo', m => this.renderSpecInfo(m));
    on('specTarget', m => this.setSpecTarget(m.you));
    on('specNotice', m => { $('sp-notice').textContent = m.text; });
  }
  setSpecTarget(id) {
    this.myId = id; this.spec.buf = []; this.others.forEach(o => { o.ch.root.visible = false; });
    // le joueur observé n'est plus un « autre » : on reconstruit la liste des modèles
    for (const [oid, o] of this.others) { this.scene.remove(o.ch.root); this.others.delete(oid); }
    if (this.spec.ghost) { this.scene.remove(this.spec.ghost.root); this.spec.ghost = null; }
    this.applyRoster([...this.roster.values()].map(r => ({ ...r, id: r.id })));
  }
  specKey(e) {
    if (e.repeat) return;
    if (this.spec.friend) {
      if (e.code === 'KeyV') this.specAction('third');
      else if (e.code === 'Escape') this.specAction('quit');
      else if (e.code === 'Tab') this.showScoreboard(!$('scoreboard').classList.contains('show'));
      return;
    }
    if (e.code === 'ArrowRight') this.specAction('next');
    else if (e.code === 'ArrowLeft') this.specAction('prev');
    else if (e.code === 'KeyX') this.specAction('xray');
    else if (e.code === 'KeyV') this.specAction('third');
    else if (e.code === 'Escape') this.specAction('quit');
    else if (e.code === 'Tab') this.showScoreboard(!$('scoreboard').classList.contains('show'));
  }
  specAction(a) {
    const sp = this.spec;
    if (sp.friend && !['third', 'quit'].includes(a)) return;
    const list = sp.info?.players || [];
    if (a === 'next' || a === 'prev') {
      if (!list.length) return;
      const i = list.findIndex(p => p.id === this.myId);
      const n = list[(i + (a === 'next' ? 1 : list.length - 1) + list.length) % list.length];
      if (n) this.net.send('spectateSwitch', { id: n.id });
    } else if (a === 'xray') { sp.xray = !sp.xray; $('sp-xray').textContent = `Rayons X : ${sp.xray ? 'oui' : 'non'}`; }
    else if (a === 'third') { sp.third = !sp.third; $('sp-third').textContent = `Vue : ${sp.third ? '3e personne' : '1re personne'}`; }
    else if (a === 'quit') { this.net.send('spectateStop'); this.destroy(); this.onExit && this.onExit('spec'); }
    else if (a === 'troll') this.net.send('staffTroll', { id: this.myId, kind: $('sp-troll').value, seconds: 10 });
    else if (a === 'trollstop') this.net.send('staffTroll', { id: this.myId, kind: 'stop' });
    else if (['warn', 'mute', 'kick', 'ban'].includes(a)) {
      const name = sp.info?.p?.name || '?';
      const label = { warn: 'avertir', mute: 'rendre muet 10 min', kick: 'expulser', ban: 'bannir 24 h' }[a];
      if (!confirm(`Confirmer : ${label} ${name} ?`)) return;
      this.net.send('staffAction', { action: a, id: this.myId, reason: $('sp-reason').value });
    }
  }
  renderSpecInfo(m) {
    this.spec.info = m;
    const p = m.p; if (!p) return;
    if (p.id !== this.myId) this.setSpecTarget(p.id);
    const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '—';
    const ag = AGENTS[p.agent];
    const wn = id => WEAPONS[id]?.name || id;
    const warn = (v, lim) => v >= lim ? ' class="bad"' : '';
    $('sp-body').innerHTML = `<div class="sp-name">${p.clan ? `<span class="clan-tag">[${esc(p.clan)}]</span> ` : ''}<b>${esc(p.name)}</b> ${p.bot ? '<span class="muted">(bot)</span>' : p.account ? '' : '<span class="muted">(invité)</span>'}</div>
      <div class="sp-grid">
        <span>Niveau</span><b>${p.level ?? '—'}</b><span>Agent</span><b style="color:${ag?.color || '#fff'}">${esc(ag?.name || p.agent)}</b>
        <span>Arme en main</span><b>${p.weapon ? esc(wn(p.weapon)) : '—'}${p.mag != null && WEAPONS[p.weapon]?.mag ? ` (${p.mag}/${p.reserve})` : ''}</b><span>Équipement</span><b>${p.weapons.map(w => esc(wn(w))).join(', ')}</b>
        <span>PV / armure</span><b>${p.alive ? `${p.hp} / ${p.armor}` : 'mort'}</b><span>Crédits</span><b>${p.money}</b>
        <span>É / M / A</span><b>${p.kills} / ${p.deaths} / ${p.assists}</b><span>Dégâts</span><b>${p.dmg}</b>
        <span>Tirs à la tête</span><b${warn(p.kills >= 8 && p.hs / p.kills, 0.75)}>${pct(p.hs, p.kills)}</b><span>Précision</span><b${warn(p.shots >= 40 && p.hits / p.shots, 0.7)}>${pct(p.hits, p.shots)} <span class="muted">(${p.hits}/${p.shots})</span></b>
        <span>Capacités / ultimes</span><b>${p.abilities} / ${p.ults}</b><span>Vitesse</span><b>${p.speed} m/s</b>
        <span>Alertes anti-triche</span><b${warn(p.strikes, 5)}>${p.strikes}</b><span>Ping</span><b>${p.ping ? p.ping + ' ms' : '—'}</b>
        ${p.gun !== undefined ? `<span>Gun Game</span><b>arme ${p.gun + 1}</b>` : ''}
      </div>
      <div class="muted small">${esc(m.mode)} · ${esc(m.map)} · ${m.ac ? 'anti-triche actif' : '<span class="bad">anti-triche désactivé</span>'}</div>`;
    const sel = $('sp-target');
    sel.innerHTML = m.players.map(q => `<option value="${esc(q.id)}" ${q.id === p.id ? 'selected' : ''}>${esc(q.name)}${q.bot ? ' (bot)' : ''} · ${q.k}/${q.d}${q.alive ? '' : ' · mort'}</option>`).join('');
    document.querySelectorAll('#spec-panel .sp-mod').forEach(x => { x.style.display = p.bot ? 'none' : ''; });
  }
  updateSpectator(dt, now) {
    const sp = this.spec, L = this.local;
    const renderT = Date.now() + (this.offset || 0) - 120;
    const st = this.interpState({ buf: sp.buf }, renderT);
    if (st) {
      L.pos = st.p.slice(); L.yaw = st.y; L.pitch = st.pt; L.crouch = !!st.c; L.specSlide = !!st.sd;
      L.eyeH += ((L.crouch ? PLAYER.eyeCrouch : PLAYER.eye) - L.eyeH) * Math.min(1, dt * 14);
      // vue à la 3e personne : modèle du joueur observé et caméra derrière lui
      if (sp.third) {
        if (!sp.ghost) { const r = this.roster.get(this.myId); sp.ghost = buildCharacter(r?.agent || 'ignis', ALLY); this.scene.add(sp.ghost.root); }
        sp.ghost.root.visible = !!this.me?.al;
        sp.ghost.root.position.set(L.pos[0], L.pos[1], L.pos[2]); sp.ghost.root.rotation.y = L.yaw;
      } else if (sp.ghost) sp.ghost.root.visible = false;
    }
    SFX.setListener(this.eyePos(), L.yaw);
  }

  // ---- killcam : revoir les 3 dernières secondes avant sa mort, du point de vue du tueur ----
  startKillcam(m) {
    if (!ST().killcam || this.ended || !Array.isArray(m.frames) || m.frames.length < 3) return;
    this.endKillcam();
    const t0 = m.frames[0].t, t1 = m.frames[m.frames.length - 1].t;
    if (!(t1 > t0)) return;
    const r = this.roster.get(this.myId);
    const ghost = buildCharacter(r?.agent || 'ignis', ALLY);
    this.scene.add(ghost.root);
    this.kc = { m, t0, dur: t1 - t0, start: performance.now() / 1000 + 0.35, ghost, shotIdx: 0 };
    const wn = WEAPONS[m.w]?.name || { fire: 'Feu', shock: 'Électricité', frost: 'Givre', trap: 'Piège' }[m.w] || '';
    $('kc-who').innerHTML = `Éliminé par <b style="color:${ENEMY}">${esc(m.kn || '?')}</b>${wn ? ` · ${esc(wn)}` : ''}${m.h ? ' · <b>tête</b>' : ''} <span class="muted">(${m.hp} PV restants)</span>`;
    $('kc-skip').textContent = `${KB('jump')} ou clic pour passer`;
    $('killcam').classList.add('on');
    document.body.classList.add('killcam-on');
    SFX.playWhoosh();
  }
  endKillcam() {
    if (!this.kc) return;
    this.scene.remove(this.kc.ghost.root);
    this.kc.ghost.root.traverse(o => { o.geometry?.dispose(); });
    this.kc = null;
    $('killcam').classList.remove('on');
    document.body.classList.remove('killcam-on');
  }
  updateKillcam(now) {
    const kc = this.kc, F = kc.m.frames;
    // le joueur a réapparu, ou la manche a recommencé : on arrête
    if (this.ended || (this.me?.al && now > kc.start + 0.5)) { this.endKillcam(); return; }
    const el = Math.max(0, now - kc.start);
    if (el > kc.dur + 1) { this.endKillcam(); return; }
    const t = kc.t0 + Math.min(el, kc.dur);
    let i = 0; while (i < F.length - 2 && F[i + 1].t < t) i++;
    const a = F[i], b = F[i + 1] || a;
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 1;
    const L3 = (x, y) => x + (y - x) * k;
    const ka = a.k, kb = b.k;
    const eyeH = (ka[5] ? PLAYER.eyeCrouch : PLAYER.eye);
    this.camera.position.set(L3(ka[0], kb[0]), L3(ka[1], kb[1]) + eyeH, L3(ka[2], kb[2]));
    this.camera.rotation.set(L3(ka[4], kb[4]), lerpAngle(ka[3], kb[3], k), 0);
    // les autres joueurs (positions actuelles) sont masqués ; seule la victime est rejouée
    for (const o of this.others.values()) o.ch.root.visible = false;
    const va = a.v, vb = b.v || a.v, g = kc.ghost.root;
    if (va) {
      g.visible = true;
      g.position.set(L3(va[0], vb[0]), L3(va[1], vb[1]), L3(va[2], vb[2]));
      g.rotation.y = lerpAngle(va[3], vb[3], k);
      const dead = el >= kc.dur;
      g.rotation.x = dead ? -Math.min(1, (el - kc.dur) / 0.35) * Math.PI / 2 : 0;
    } else g.visible = false;
    // tirs du tueur pendant la séquence
    const shots = kc.m.shots || [];
    while (kc.shotIdx < shots.length && shots[kc.shotIdx][0] <= t) {
      const [, w, end] = shots[kc.shotIdx++];
      const def = WEAPONS[w];
      if (def && def.type !== 'melee' && Array.isArray(end)) {
        const from = this.camera.position.clone().add(new THREE.Vector3(0, -0.15, 0));
        this.addTracer(from, new THREE.Vector3(...end));
        this.addImpact(end, '#ffe0a0');
      }
      SFX.playShot(def ? (def.type === 'pistol' ? 'pistol' : def.type) : 'rifle', null);
    }
    $('kc-prog').style.width = Math.min(100, el / kc.dur * 100) + '%';
  }

  // ---- marqueurs de position (clic molette) ----
  addMark(m) {
    if (!Array.isArray(m.p) || m.p.length !== 3) return;
    this.marks = this.marks || [];
    const old = this.marks.findIndex(k => k.i === m.i); // un seul marqueur par joueur
    if (old >= 0) this.removeMark(old);
    if (this.marks.length >= 8) this.removeMark(0);
    const col = m.d ? '#ff4f6d' : (m.i === this.myId ? '#ffe14d' : ALLY);
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 30, 6, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 15; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 24), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    g.position.set(m.p[0], m.p[1], m.p[2]);
    this.scene.add(g);
    const el = document.createElement('div');
    el.className = 'mark-tag' + (m.d ? ' danger' : '');
    el.style.setProperty('--mc', col);
    el.innerHTML = `<div class="mi">${m.d ? '⚠' : '◆'}</div><div class="mn">${esc(m.i === this.myId ? '' : m.n || '')}</div><div class="md"></div>`;
    $('hud').appendChild(el);
    const t0 = performance.now() / 1000;
    this.marks.push({ i: m.i, p: m.p, d: m.d, t0, end: t0 + (m.d ? 5 : 8), g, ring, el });
    SFX.playPing(m.i === this.myId ? null : m.p, !!m.d);
    if (m.i !== this.myId) this.caption(m.d ? 'Danger signalé' : 'Position signalée', m.p, 'ping', 0, 1);
  }
  removeMark(idx) {
    const k = this.marks[idx];
    if (!k) return;
    this.scene.remove(k.g); k.g.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    k.el.remove();
    this.marks.splice(idx, 1);
  }
  updateMarks(now) {
    if (!this.marks?.length) return;
    const w = innerWidth, h = innerHeight, v = new THREE.Vector3();
    const eye = this.camera.position;
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const k = this.marks[i];
      if (now > k.end || this.ended) { this.removeMark(i); continue; }
      const age = now - k.t0;
      k.ring.scale.setScalar(1 + (age * 1.5 % 1) * 1.6);
      k.ring.material.opacity = 0.8 * (1 - (age * 1.5 % 1));
      v.set(k.p[0], k.p[1] + 0.6, k.p[2]).project(this.camera);
      const behind = v.z > 1;
      let x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      if (behind) { x = w - x; y = h - 40; }
      const off = behind || x < 30 || x > w - 30 || y < 30 || y > h - 30;
      x = Math.max(30, Math.min(w - 30, x)); y = Math.max(30, Math.min(h - 30, y));
      k.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
      k.el.classList.toggle('edge', off);
      k.el.style.opacity = now > k.end - 0.6 ? Math.max(0, (k.end - now) / 0.6) : 1;
      k.el.querySelector('.md').textContent = Math.round(Math.hypot(k.p[0] - eye.x, k.p[1] - eye.y, k.p[2] - eye.z)) + ' m';
    }
  }

  drawMinimap() {
    const c = $('minimap'), g = c.getContext('2d');
    const { s, ox, oy } = this.miniXf;
    const P = (x, z) => [ox + (x / CELL) * s, oy + (z / CELL) * s];
    g.clearRect(0, 0, 220, 220);
    // mini-carte tournante et zoomée autour du joueur (la grande carte montre toujours tout)
    const big = c.classList.contains('big'), Lp = this.local.pos;
    const rot = !big && ST().minimapRotate && this.me?.al, zoom = big ? 1 : (ST().minimapZoom || 1);
    g.save();
    if (rot || zoom > 1.01) { const [px, py] = P(Lp[0], Lp[2]); g.translate(110, 110); if (rot) g.rotate(this.local.yaw); g.scale(zoom, zoom); g.translate(-px, -py); }
    g.drawImage(this.miniBase, 0, 0);
    const snap = this.snap;
    if (!snap) { g.restore(); return; }
    // coéquipiers éliminés pendant la manche (15 s)
    const tn = performance.now() / 1000;
    this.allyDeaths = this.allyDeaths.filter(d => tn - d.t < 15);
    for (const d of this.allyDeaths) { const [x, y] = P(d.p[0], d.p[2]); g.strokeStyle = ALLY; g.globalAlpha = 0.9 - (tn - d.t) / 25; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 4, y - 4); g.lineTo(x + 4, y + 4); g.moveTo(x + 4, y - 4); g.lineTo(x - 4, y + 4); g.stroke(); g.globalAlpha = 1; }
    // armes au sol
    for (const d of this.dropMeshes.values()) { const [x, y] = P(d.position.x, d.position.z); g.fillStyle = '#ffd84a'; g.fillRect(x - 2, y - 2, 4, 4); }
    for (const sm of this.smokeMeshes.values()) { const [x, y] = P(sm.position.x, sm.position.z); g.fillStyle = 'rgba(200,205,230,.75)'; g.beginPath(); g.arc(x, y, (sm.userData.r / CELL) * s, 0, 7); g.fill(); }
    for (const f of this.fireMeshes.values()) { const [x, y] = P(f.position.x, f.position.z); g.fillStyle = f.userData.kind === 'shock' ? 'rgba(63,208,255,.5)' : f.userData.kind === 'frost' ? 'rgba(158,231,255,.45)' : 'rgba(255,110,40,.5)'; g.beginPath(); g.arc(x, y, (f.userData.disc.geometry.parameters.radius / CELL) * s, 0, 7); g.fill(); }
    for (const w of this.wallMeshes.values()) { const b = w.userData.box; const [x1, y1] = P(b.min[0], b.min[2]); const [x2, y2] = P(b.max[0], b.max[2]); g.fillStyle = '#9ef0ff'; g.fillRect(x1, y1, Math.max(2, x2 - x1), Math.max(2, y2 - y1)); }
    if (snap.ph === 'planted' && snap.core.p) {
      // zone de danger du Noyau : cercle de l'explosion, l'anneau intérieur se resserre jusqu'à l'explosion
      const [x, y] = P(snap.core.p[0], snap.core.p[2]), R = (ROUND.explosionRadius / CELL) * s;
      const left = Math.max(0, Math.min(1, snap.core.f / (ROUND.fuseTime || 40)));
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / (snap.core.f < 10 ? 80 : 200));
      g.fillStyle = `rgba(255,47,109,${0.10 + 0.08 * pulse})`; g.beginPath(); g.arc(x, y, R, 0, 7); g.fill();
      g.strokeStyle = 'rgba(255,47,109,.85)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, R, 0, 7); g.stroke();
      g.strokeStyle = '#ffcf5a'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, Math.max(3, R * left), 0, 7); g.stroke();
    }
    for (const pm of this.projMeshes.values()) { const [x, y] = P(pm.position.x, pm.position.z); g.fillStyle = '#ff9a3d'; g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); g.strokeStyle = 'rgba(255,154,61,.5)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 7, 0, 7); g.stroke(); }
    if (snap.core.p) { const [x, y] = P(snap.core.p[0], snap.core.p[2]); g.fillStyle = '#ff2f6d'; g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-4, -4, 8, 8); g.restore(); }
    const tnow = performance.now() / 1000;
    const me = this.roster.get(this.myId);
    if (this.deathMark && tnow - this.deathMark.t < 20) { const [x, y] = P(this.deathMark.p[0], this.deathMark.p[2]); g.strokeStyle = '#ff4f6d'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x - 5, y - 5); g.lineTo(x + 5, y + 5); g.moveTo(x + 5, y - 5); g.lineTo(x - 5, y + 5); g.stroke(); }
    for (const k of this.marks || []) { const [x, y] = P(k.p[0], k.p[2]); g.strokeStyle = k.d ? '#ff4f6d' : '#ffe14d'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5, y); g.lineTo(x, y + 6); g.lineTo(x - 5, y); g.closePath(); g.stroke(); }
    for (const o of this.others.values()) {
      const st = o.cur;
      if (!st || !st.al) continue;
      const enemy = this.isEnemyId(o.id);
      // ennemi seulement entendu (pas) : cercle pâle
      if (st.au) { if (enemy && ST().heardOnMap) { const [x, y] = P(st.p[0], st.p[2]); g.strokeStyle = ST().enemyColor; g.globalAlpha = 0.55; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 6 + Math.sin(tn * 6) * 1.5, 0, 7); g.stroke(); g.globalAlpha = 1; } continue; }
      if (enemy && !this.visibleEnemies.has(o.id) && !(tnow - (this.shotSeen.get(o.id) || -9) < 0.8)) continue;
      const [x, y] = P(st.p[0], st.p[2]);
      g.fillStyle = enemy ? ST().enemyColor : ALLY;
      g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      if (!enemy && st.cr) { g.strokeStyle = '#ff2f6d'; g.lineWidth = 2; g.stroke(); }
    }
    if (this.me?.al) {
      const L = this.local;
      const [x, y] = P(L.pos[0], L.pos[2]);
      g.save(); g.translate(x, y); g.rotate(-L.yaw);
      g.fillStyle = 'rgba(255,255,255,.12)';
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 28, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(-5, 5); g.closePath(); g.fill();
      if (this.self?.cr) { g.strokeStyle = '#ff2f6d'; g.lineWidth = 2; g.stroke(); }
      g.restore();
    }
    g.restore();
    void me;
  }

  onMatchEnd(m) {
    this.ended = true;
    $('click-to-play').style.display = 'none';
    this.unlock();
    this.toggleBuy(false);
    this.showScoreboard(false);
    const meR = this.roster.get(this.myId);
    const mine = m.stats.find(s => s.id === this.myId) || { kills: 0, deaths: 0, assists: 0 };
    const win = isFfa(m.mode) ? m.winner === this.myId : m.winner === meR?.team;
    const reward = m.rewards?.[this.myId] ?? 0;
    if (this.isGuest) { profile.eclats += reward; save(); }
    void mine;
    $('end-title').textContent = win ? 'VICTOIRE' : 'DÉFAITE';
    $('end-title').className = 'end-title ' + (win ? 'win' : 'lose');
    if (isFfa(m.mode)) $('end-score').textContent = `Vainqueur : ${this.nameOf(m.winner)}`;
    else { const a = m.score[meR?.team] ?? 0, b = m.score[meR?.team === 'alpha' ? 'beta' : 'alpha'] ?? 0; $('end-score').textContent = `${a} — ${b}`; }
    $('end-reward').innerHTML = `<span class="gem"></span> +${reward} Éclats`;
    const mvp = m.stats.find(s => s.id === m.mvp);
    $('end-mvp').innerHTML = mvp ? `<span class="mvp-badge">MVP</span> ${agentIconHTML(mvp.agent, 'sm')} <b>${esc(mvp.name)}</b> <span class="muted">${mvp.score} pts · ${mvp.kills}/${mvp.deaths}/${mvp.assists} · ${mvp.dmg} dégâts</span>` : '';
    $('end-progress').innerHTML = this.isGuest ? '<div class="muted">Crée un compte pour gagner de l\'XP, monter de niveau et accomplir des quêtes.</div>' : '<div class="muted">Calcul de la progression…</div>';
    const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '—';
    const wn = id => WEAPONS[id]?.name || { fire: 'Feu', shock: 'Électricité', frost: 'Givre', trap: 'Piège' }[id] || '—';
    const rows = m.stats.slice().sort((a, b) => b.score - a.score).map(s => `<div class="sb-row end-row ${s.id === this.myId ? 'me' : ''}" style="--c:${AGENTS[s.agent]?.color}">${agentIconHTML(s.agent, 'sm')}<span>${esc(this.nameOf(s.id) === '???' ? s.name : this.nameOf(s.id))}${s.id === m.mvp ? ' <span class="mvp-badge small">MVP</span>' : ''}</span><span>${s.score}</span><span>${s.kills}/${s.deaths}/${s.assists}</span><span>${s.dmg ?? ''}</span><span>${pct(s.hs || 0, s.kills)}</span><span>${pct(s.hits || 0, s.shots)}</span><span>${s.best || 0}</span><span class="small">${esc(wn(s.fav))}</span></div>`).join('');
    $('end-stats').innerHTML = `<div class="sb-row end-row head"><span></span><span>JOUEUR</span><span>SCORE</span><span>É/M/A</span><span>DÉG.</span><span>TÊTE</span><span>PRÉCISION</span><span>SÉRIE</span><span>ARME FAVORITE</span></div>${rows}`;
    this.myVote = null; this.myRematch = false;
    // recommander un joueur de la partie (comptes uniquement)
    if (!this.isGuest) {
      const others = m.stats.filter(x => x.id !== this.myId && !x.bot);
      if (others.length) {
        const box = document.createElement('div'); box.className = 'end-endorse';
        box.innerHTML = `<div class="ev-title">RECOMMANDER UN JOUEUR</div>${others.map(x => `<div class="ee-row"><b>${esc(this.nameOf(x.id) === '???' ? x.name : this.nameOf(x.id))}</b>${[['fairplay', '🤝 Fair-play'], ['leader', '🎖 Meneur'], ['equipier', '💪 Coéquipier']].map(([k, l]) => `<button class="btn small ghost" data-end="${k}" data-n="${esc(x.name)}">${l}</button>`).join('')}</div>`).join('')}`;
        box.onclick = e => { const b = e.target.closest('[data-end]'); if (!b) return; this.net.send('endorse', { name: b.dataset.n, kind: b.dataset.end }); b.parentElement.querySelectorAll('button').forEach(x => { x.disabled = true; }); b.classList.add('primary'); };
        $('end-stats').after(box);
      }
    }
    $('end-screen').classList.add('show');
    document.dispatchEvent(new CustomEvent('eclats-changed'));
  }

  // progression de fin de partie (XP, niveau, quêtes, succès, Elo)
  onSummary(m) {
    if (!m.summary) return;
    const s = m.summary;
    const parts = [`<div class="ep-row"><b class="xp">+${s.xp + s.questXp} XP</b>${s.questXp ? ` <span class="muted">(dont ${s.questXp} de quêtes)</span>` : ''}${s.acc != null ? ` · précision ${s.acc} %` : ''}${s.eloDelta != null ? ` · Elo <b class="${s.eloDelta >= 0 ? 'up' : 'down'}">${s.eloDelta >= 0 ? '+' : ''}${s.eloDelta}</b> (${s.elo})` : ''}</div>`];
    if (s.streakBonus) parts.push(`<div class="ep-row">🔥 Série de ${s.winStreak} victoires : +${Math.round(s.streakBonus * 100)} % d'XP</div>`);
    if (s.level > s.levelBefore) parts.push(`<div class="ep-row lvlup">NIVEAU ${s.level} ATTEINT ! <span class="gem small"></span> +${s.levelEclats}${s.skins.length ? ` · skin débloqué : ${s.skins.map(esc).join(', ')}` : ''}</div>`);
    for (const q of s.questsDone) parts.push(`<div class="ep-row quest">✔ Quête terminée : ${esc(q.label)} <span class="gem small"></span> +${q.eclats} · +${q.xp} XP</div>`);
    for (const a of s.achievements) parts.push(`<div class="ep-row ach">🏆 Succès : ${esc(a.label)} <span class="gem small"></span> +${a.reward}${a.title ? ` · titre « ${esc(a.title)} »` : ''}</div>`);
    $('end-progress').innerHTML = parts.join('');
    $('end-reward').innerHTML = `<span class="gem"></span> +${s.eclatsTotal} Éclats au total`;
    if (s.level > s.levelBefore) SFX.playLevelUp();
  }

  leave() {
    this.net.send('leaveMatch');
    this.destroy();
    this.onExit && this.onExit('left');
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.onbeforeunload = null;
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    window.removeEventListener('mousemove', this._mm);
    window.removeEventListener('mousedown', this._md);
    window.removeEventListener('mouseup', this._mu);
    window.removeEventListener('wheel', this._wheel);
    window.removeEventListener('contextmenu', this._ctx);
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('pointerlockchange', this._plc);
    document.removeEventListener('settings-changed', this._sc);
    for (const u of this.unsubs) u();
    this.touch?.destroy();
    if (pad.game === this) pad.attach(null);
    while (this.marks?.length) this.removeMark(0);
    this.composer?.dispose?.(); this.composer = null;
    this.endKillcam();
    for (const id of ['chal', 'dmg-report', 'buffs', 'ammo-warn', 'alive-count']) $(id)?.remove();
    $('minimap').classList.remove('big'); $('crosshair').classList.remove('on-enemy');
    if (this.spec) { this.spec.ghost && this.scene.remove(this.spec.ghost.root); document.body.classList.remove('spectating'); $('spec-panel')?.remove(); }
    if (document.pointerLockElement) { this.expectUnlock = true; document.exitPointerLock(); }
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    this.renderer.dispose();
    $('game').classList.remove('active');
    for (const id of ['end-screen', 'scoreboard', 'buy-menu', 'pause-menu', 'settings-overlay', 'report-overlay', 'radio-menu']) $(id).classList.remove('show');
    $('scope-overlay').style.display = 'none';
    $('crosshair').style.display = 'block';
  }
}
