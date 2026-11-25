// Données partagées client/serveur : armes, agents, skins, constantes de jeu.
export const TICK_RATE = 30;
export const SNAP_EVERY = 2; // snapshot toutes les 2 frames serveur (15 Hz)

export const ROUND = {
  buyTime: 20, roundTime: 100, fuseTime: 40, plantTime: 4, defuseTime: 7, endTime: 6,
  startMoney: 800, maxMoney: 9000, winMoney: 3000, lossMoney: 1900, killMoney: 200, plantMoney: 300,
  explosionRadius: 14,
};

export const DUEL = { buyTime: 10, roundTime: 60, money: 9000 };

export const FFA = { respawn: 3, timeLimit: 600, gunTimeLimit: 480, abilityRecharge: 18 };
// modes « chacun pour soi » (pas d'équipes, réapparition) : Mêlée et Gun Game
export const isFfa = mode => mode === 'ffa' || mode === 'gungame' || mode === 'lives';
// Gun Game : une arme par niveau, chaque élimination fait passer à la suivante ; la dernière est le couteau
export const GUN_LADDER = ['lancer', 'tempest', 'viper', 'brute', 'longbow', 'hornet', 'spark', 'knife'];

export const MOVE = {
  run: 6.6, walkMul: 0.5, crouchMul: 0.42, jump: 8.2, gravity: 23,
  accel: 75, airAccel: 16, friction: 11, dashSpeed: 22, dashTime: 0.18, blinkDist: 11,
  // glissade : s'accroupir en courant. Vitesse de départ, durée max, frottement (par s), délai entre deux glissades,
  // vitesse minimale pour la déclencher (fraction de la course), contrôle de direction, vitesse gardée en sautant
  slideSpeed: 11, slideTime: 2.0, slideFriction: 0.8, slideCooldown: 1.1, slideStart: 0.8, slideSteer: 2.2, slideJumpKeep: 0.85,
};

export const PLAYER = { hw: 0.4, h: 1.8, hCrouch: 1.25, eye: 1.62, eyeCrouch: 1.1, maxHp: 100 };

export const WEAPONS = {
  knife:   { id: 'knife', name: 'Lame tactique', slot: 3, cost: 0, type: 'melee', damage: 50, headMul: 1.5, legMul: 1, rate: 2.2, range: 2.6, speed: 1.08, auto: true, model: 'knife' },
  spark:   { id: 'spark', name: 'Spark', slot: 2, cost: 0, type: 'pistol', damage: 26, headMul: 3, legMul: 0.85, rate: 6.5, mag: 12, reserve: 36, reload: 1.6, spread: 0.006, moveSpread: 0.03, airSpread: 0.15, recoil: 0.009, auto: false, pellets: 1, falloff: [30, 0.8], speed: 1, model: 'pistol' },
  hornet:  { id: 'hornet', name: 'Hornet', slot: 2, cost: 800, type: 'pistol', damage: 55, headMul: 2.9, legMul: 0.85, rate: 2.8, mag: 7, reserve: 21, reload: 2.1, spread: 0.004, moveSpread: 0.05, airSpread: 0.2, recoil: 0.03, auto: false, pellets: 1, falloff: [30, 0.85], speed: 1, model: 'heavypistol' },
  viper:   { id: 'viper', name: 'Viper', slot: 1, cost: 1600, type: 'smg', damage: 24, headMul: 2.7, legMul: 0.85, rate: 13, mag: 30, reserve: 90, reload: 2.2, spread: 0.012, moveSpread: 0.012, airSpread: 0.15, recoil: 0.006, auto: true, pellets: 1, falloff: [20, 0.75], speed: 0.97, model: 'smg', ads: { zoom: 1.2, spread: 0.65, move: 0.8, sight: 'reddot' } },
  brute:   { id: 'brute', name: 'Brute', slot: 1, cost: 1850, type: 'shotgun', damage: 13, headMul: 2, legMul: 0.85, rate: 1.15, mag: 6, reserve: 18, reload: 2.6, spread: 0.06, moveSpread: 0.01, airSpread: 0.1, recoil: 0.05, auto: false, pellets: 12, falloff: [12, 0.4], speed: 0.95, model: 'shotgun', ads: { zoom: 1.15, spread: 0.75, move: 0.8, sight: 'reddot' } },
  tempest: { id: 'tempest', name: 'Tempest', slot: 1, cost: 2250, type: 'rifle', damage: 42, headMul: 3.6, legMul: 0.85, rate: 4.8, mag: 20, reserve: 60, reload: 2.4, spread: 0.003, moveSpread: 0.06, airSpread: 0.25, recoil: 0.016, auto: false, pellets: 1, falloff: [60, 0.9], speed: 0.94, model: 'dmr', ads: { zoom: 1.6, spread: 0.45, move: 0.7, sight: 'acog' } },
  lancer:  { id: 'lancer', name: 'Lancer', slot: 1, cost: 2900, type: 'rifle', damage: 39, headMul: 4, legMul: 0.85, rate: 9.75, mag: 25, reserve: 75, reload: 2.5, spread: 0.004, moveSpread: 0.07, airSpread: 0.25, recoil: 0.011, auto: true, pellets: 1, falloff: [50, 0.9], speed: 0.92, model: 'rifle', ads: { zoom: 1.35, spread: 0.55, move: 0.75, sight: 'holo' } },
  longbow: { id: 'longbow', name: 'Longbow', slot: 1, cost: 4700, type: 'sniper', damage: 150, headMul: 1.7, legMul: 0.85, rate: 0.75, mag: 5, reserve: 15, reload: 3.6, spread: 0.08, scopedSpread: 0.0005, moveSpread: 0.15, airSpread: 0.3, recoil: 0.07, auto: false, pellets: 1, falloff: [999, 1], speed: 0.85, scope: 3.5, model: 'sniper' },
};
// viseur (clic droit) : zoom, dispersion × spread, vitesse × move. Pistolets : pas de viseur ; Longbow : lunette (scope).
export const WEAPON_ORDER = ['spark', 'hornet', 'viper', 'brute', 'tempest', 'lancer', 'longbow'];
export const SKINNABLE = ['knife', 'spark', 'hornet', 'viper', 'brute', 'tempest', 'lancer', 'longbow'];

// kit de désamorçage (1.15) : défenseurs en Assaut, désamorçage plus rapide
export const KIT = { id: 'kit', name: 'Kit de désamorçage', cost: 400, defuseTime: 4 };

// ---------- parties personnalisées (1.16) ----------
// règles réglables par l'hôte ; 0 = valeur normale du mode
export const CUSTOM_RULES = {
  speed: { label: 'Vitesse des joueurs', def: 1, opts: [[0.75, 'Lente'], [1, 'Normale'], [1.25, 'Rapide'], [1.5, 'Très rapide']] },
  dmg: { label: 'Dégâts reçus', def: 1, opts: [[2, '×2 (fragile)'], [1, 'Normaux'], [0.5, '÷2 (solide)'], [0.33, '÷3 (tank)']] },
  weapons: { label: 'Armes', def: 'all', opts: [['all', 'Toutes'], ['pistols', 'Pistolets seulement'], ['snipers', 'Snipers seulement'], ['shotguns', 'Fusils à pompe seulement'], ['knife', 'Couteau seulement']] },
  money: { label: 'Argent de départ', def: 0, modes: ['assault'], opts: [[0, '800 (normal)'], [2000, '2 000'], [4000, '4 000'], [9000, 'Illimité (9 000 à chaque manche)']] },
  roundTime: { label: 'Durée d\'une manche', def: 0, modes: ['assault', 'duel'], opts: [[0, 'Normale'], [45, '45 s'], [60, '1 min'], [100, '1 min 40'], [150, '2 min 30']] },
  timeLimit: { label: 'Temps limite', def: 0, modes: ['ffa', 'gungame', 'lives'], opts: [[0, 'Normal'], [300, '5 min'], [600, '10 min'], [900, '15 min'], [1200, '20 min']] },
  respawn: { label: 'Réapparition', def: 0, modes: ['ffa', 'gungame'], opts: [[0, '3 s (normal)'], [1, '1 s'], [5, '5 s']] },
};
// interrupteurs des parties personnalisées
export const CUSTOM_FLAGS = [['infAmmo', 'Munitions infinies'], ['noAbilities', 'Sans capacités (armes uniquement)'], ['headOnly', 'Tirs à la tête uniquement'], ['lowGrav', 'Gravité basse'], ['bigHead', 'Grosses têtes'], ['friendlyFire', 'Tir allié (dégâts divisés par deux)'], ['randomMap', 'Carte aléatoire à chaque partie']];
// armes autorisées selon la règle « Armes » (give : arme principale offerte à chaque apparition)
export const WEAPON_RULES = {
  pistols: { allow: ['spark', 'hornet', 'knife'], give: null },
  snipers: { allow: ['longbow', 'spark', 'hornet', 'knife'], give: 'longbow' },
  shotguns: { allow: ['brute', 'spark', 'hornet', 'knife'], give: 'brute' },
  knife: { allow: ['knife'], give: null, noPistol: true },
};
// garde seulement des valeurs prévues (règles + interrupteurs)
export function cleanCustomOpts(o) {
  o = o && typeof o === 'object' ? o : {};
  const out = {};
  for (const [k, r] of Object.entries(CUSTOM_RULES)) { const v = r.opts.find(([x]) => x === o[k] || String(x) === String(o[k])); out[k] = v ? v[0] : r.def; }
  for (const [k] of CUSTOM_FLAGS) out[k] = !!o[k];
  return out;
}
// résumé lisible des règles qui changent (cartes, salon, début de partie)
export function customSummary(opts, mode) {
  const o = cleanCustomOpts(opts), out = [];
  for (const [k, r] of Object.entries(CUSTOM_RULES)) {
    if (o[k] === r.def || (r.modes && mode && !r.modes.includes(mode))) continue;
    const lab = r.opts.find(([x]) => x === o[k])?.[1] || o[k];
    out.push(k === 'weapons' ? lab : `${r.label} : ${lab}`);
  }
  for (const [k, l] of CUSTOM_FLAGS) if (o[k] && k !== 'randomMap') out.push(l.replace(/ \(.*\)$/, ''));
  return out;
}

export const ARMOR = {
  light: { id: 'light', name: 'Gilet léger', cost: 400, value: 25 },
  heavy: { id: 'heavy', name: 'Gilet lourd', cost: 1000, value: 50 },
};

// Types de capacités gérés : smoke, molotov, flash, dash, heal, recon, wall, shield, blink, invis, haste, cryo
// Ultimes : overdrive, megasmoke, hunt, fortress, phantom, firestorm, blizzard
export const AGENTS = {
  ignis: {
    id: 'ignis', name: 'IGNIS', role: 'Duelliste', color: '#ff6b2c',
    bio: 'Pyromane de l\'escouade, Ignis ouvre les sites dans les flammes.',
    abilities: {
      q: { name: 'Cocktail', type: 'molotov', charges: 1, desc: 'Lance une fiole incendiaire qui embrase le sol et inflige de lourds dégâts.' },
      e: { name: 'Propulsion', type: 'dash', charges: 2, desc: 'Ruée instantanée dans la direction de déplacement.' },
      x: { name: 'Surchauffe', type: 'overdrive', cost: 6, desc: 'Pendant 10 s : vitesse +25 %, cadence +30 % et soin complet.' },
    },
  },
  nimbus: {
    id: 'nimbus', name: 'NIMBUS', role: 'Contrôleur', color: '#8fa8ff',
    bio: 'Météorologue renégat, Nimbus coupe les lignes de vue adverses.',
    abilities: {
      q: { name: 'Nuée', type: 'smoke', charges: 2, desc: 'Lance une grenade qui libère un nuage opaque pendant 14 s.' },
      e: { name: 'Rosée', type: 'heal', charges: 1, desc: 'Régénère 60 PV sur 3 secondes.' },
      x: { name: 'Front orageux', type: 'megasmoke', cost: 6, desc: 'Déploie instantanément un mur de trois nuages dans la direction visée.' },
    },
  },
  oracle: {
    id: 'oracle', name: 'ORACLE', role: 'Initiateur', color: '#ffd84a',
    bio: 'Analyste de terrain, Oracle voit ce que les autres ignorent.',
    abilities: {
      q: { name: 'Éclair', type: 'flash', charges: 2, desc: 'Grenade aveuglante qui explose après un court délai.' },
      e: { name: 'Sonar', type: 'recon', charges: 1, desc: 'Révèle les ennemis dans un rayon de 40 m pendant 5 s.' },
      x: { name: 'Traque', type: 'hunt', cost: 7, desc: 'Révèle la position de tous les ennemis pendant 7 s.' },
    },
  },
  bastion: {
    id: 'bastion', name: 'BASTION', role: 'Sentinelle', color: '#4fe3c1',
    bio: 'Ingénieure cryogénique, Bastion verrouille ses positions.',
    abilities: {
      q: { name: 'Mur de givre', type: 'wall', charges: 1, desc: 'Érige un mur de glace destructible (400 PV) pendant 15 s.' },
      e: { name: 'Égide', type: 'shield', charges: 1, desc: 'Gagne instantanément 50 points d\'armure.' },
      x: { name: 'Forteresse', type: 'fortress', cost: 6, desc: 'Soigne complètement les alliés proches et leur donne 50 d\'armure.' },
    },
  },
  spectre: {
    id: 'spectre', name: 'SPECTRE', role: 'Duelliste', color: '#b06bff',
    bio: 'Assassin intangible, Spectre frappe là où on ne l\'attend pas.',
    abilities: {
      q: { name: 'Saut d\'ombre', type: 'blink', charges: 2, desc: 'Se téléporte de 11 m vers l\'avant.' },
      e: { name: 'Voile', type: 'invis', charges: 1, desc: 'Devient quasi invisible pendant 4 s (tirer annule l\'effet).' },
      x: { name: 'Fantôme', type: 'phantom', cost: 7, desc: 'Invisibilité et vitesse accrue pendant 10 s.' },
    },
  },
  volta: {
    id: 'volta', name: 'VOLTA', role: 'Initiateur', color: '#3fd0ff',
    bio: 'Électricienne de choc, Volta pilonne les zones avant l\'assaut.',
    abilities: {
      q: { name: 'Arc', type: 'flash', charges: 1, desc: 'Grenade aveuglante électrique.' },
      e: { name: 'Décharge', type: 'molotov', charges: 1, desc: 'Électrifie une zone au sol qui inflige des dégâts continus.' },
      x: { name: 'Tempête ionique', type: 'firestorm', cost: 7, desc: 'Une immense zone électrifiée frappe l\'endroit visé pendant 8 s.' },
    },
  },
  kairo: {
    id: 'kairo', name: 'KAIRO', role: 'Duelliste', color: '#ff3d7f',
    bio: 'Ancien coureur de rue, Kairo frappe vite et disparaît avant la riposte.',
    abilities: {
      q: { name: 'Élan', type: 'haste', charges: 2, desc: 'Vitesse de course +35 % pendant 4 secondes.' },
      e: { name: 'Rupture', type: 'blink', charges: 1, desc: 'Se téléporte de 11 m vers l\'avant.' },
      x: { name: 'Frénésie', type: 'overdrive', cost: 6, desc: 'Pendant 10 s : vitesse +25 %, cadence +30 % et soin complet.' },
    },
  },
  borea: {
    id: 'borea', name: 'BORÉA', role: 'Contrôleur', color: '#9ee7ff',
    bio: 'Glaciologue de combat, Boréa fige les assauts adverses.',
    abilities: {
      q: { name: 'Gel', type: 'cryo', charges: 2, desc: 'Grenade de givre : les ennemis dans la zone sont ralentis pendant 6 s.' },
      e: { name: 'Brume', type: 'smoke', charges: 1, desc: 'Lance une grenade qui libère un nuage opaque pendant 14 s.' },
      x: { name: 'Blizzard', type: 'blizzard', cost: 7, desc: 'Une immense tempête de givre ralentit et blesse les ennemis dans la zone visée pendant 8 s.' },
    },
  },
  vesper: {
    id: 'vesper', name: 'VESPER', role: 'Initiateur', color: '#c9a2ff',
    bio: 'Traqueuse silencieuse, Vesper entend tout ce qui bouge.',
    abilities: {
      q: { name: 'Écho', type: 'recon', charges: 1, desc: 'Révèle les ennemis dans un rayon de 40 m pendant 5 s.' },
      e: { name: 'Lueur', type: 'flash', charges: 2, desc: 'Grenade aveuglante qui explose après un court délai.' },
      x: { name: 'Prédation', type: 'hunt', cost: 7, desc: 'Révèle la position de tous les ennemis pendant 7 s.' },
    },
  },
  aegis: {
    id: 'aegis', name: 'AEGIS', role: 'Sentinelle', color: '#ffb547',
    bio: 'Ancien garde du corps, Aegis ne recule jamais.',
    abilities: {
      q: { name: 'Rempart', type: 'shield', charges: 1, desc: 'Gagne instantanément 50 points d\'armure.' },
      e: { name: 'Bastille', type: 'wall', charges: 1, desc: 'Érige un mur destructible (400 PV) pendant 15 s.' },
      x: { name: 'Citadelle', type: 'fortress', cost: 6, desc: 'Soigne complètement les alliés proches et leur donne 50 d\'armure.' },
    },
  },
  sol: {
    id: 'sol', name: 'SOL', role: 'Duelliste', color: '#ffd23f',
    bio: 'Né dans une centrale solaire, Sol brûle tout sur son passage.',
    abilities: {
      q: { name: 'Éruption', type: 'molotov', charges: 1, desc: 'Lance une charge incendiaire qui embrase le sol.' },
      e: { name: 'Embrasement', type: 'haste', charges: 1, desc: 'Vitesse de course +35 % pendant 4 secondes.' },
      x: { name: 'Soleil noir', type: 'firestorm', cost: 7, desc: 'Une immense zone brûlante frappe l\'endroit visé pendant 8 s.' },
    },
  },
  nyx: {
    id: 'nyx', name: 'NYX', role: 'Contrôleur', color: '#6d6aff',
    bio: 'Insaisissable, Nyx plonge le terrain dans l\'obscurité.',
    abilities: {
      q: { name: 'Voile nocturne', type: 'smoke', charges: 2, desc: 'Lance une grenade qui libère un nuage opaque pendant 14 s.' },
      e: { name: 'Ombre', type: 'invis', charges: 1, desc: 'Devient quasi invisible pendant 4 s (tirer annule l\'effet).' },
      x: { name: 'Nuit tombante', type: 'megasmoke', cost: 6, desc: 'Déploie instantanément un mur de trois nuages dans la direction visée.' },
    },
  },
  helia: {
    id: 'helia', name: 'HÉLIA', role: 'Sentinelle', color: '#7dffb2',
    bio: 'Médecin de terrain, Hélia garde son équipe en vie.',
    abilities: {
      q: { name: 'Soin', type: 'heal', charges: 2, desc: 'Régénère 60 PV sur 3 secondes.' },
      e: { name: 'Givre', type: 'cryo', charges: 1, desc: 'Grenade de givre : les ennemis dans la zone sont ralentis pendant 6 s.' },
      x: { name: 'Sanctuaire', type: 'fortress', cost: 6, desc: 'Soigne complètement les alliés proches et leur donne 50 d\'armure.' },
    },
  },
};
export const AGENT_ORDER = ['ignis', 'nimbus', 'oracle', 'bastion', 'spectre', 'volta', 'kairo', 'borea', 'vesper', 'aegis', 'sol', 'nyx', 'helia'];

export const SKINS = [
  { id: 'default', name: 'Standard', price: 0, body: '#3b4048', accent: '#9aa3ad', metal: 0.55, rough: 0.45 },
  { id: 'carbon', name: 'Carbone', price: 250, body: '#18191d', accent: '#4a515b', pattern: 'carbon', metal: 0.3, rough: 0.5 },
  { id: 'mirage', name: 'Mirage', price: 300, body: '#c4a675', accent: '#6f5636', pattern: 'camo', metal: 0.1, rough: 0.8 },
  { id: 'sakura', name: 'Sakura', price: 650, body: '#f4c9d6', accent: '#d64f7d', pattern: 'petals', metal: 0.2, rough: 0.5 },
  { id: 'pulsar', name: 'Pulsar néon', price: 800, body: '#0f1220', accent: '#00f0ff', glow: true, pattern: 'lines', metal: 0.6, rough: 0.3 },
  { id: 'magma', name: 'Magma', price: 900, body: '#1c0e0a', accent: '#ff5a1f', glow: true, pattern: 'cracks', metal: 0.2, rough: 0.7 },
  { id: 'abysse', name: 'Abysse', price: 1000, body: '#081830', accent: '#4d7cff', glow: true, pattern: 'waves', metal: 0.7, rough: 0.25 },
  { id: 'couronne', name: 'Couronne', price: 1200, body: '#e2b84d', accent: '#fff3c4', metal: 1, rough: 0.22, pattern: 'filigree' },
  { id: 'neant', name: 'Néant', price: 1300, body: '#06040c', accent: '#a259ff', glow: true, pattern: 'stars', metal: 0.4, rough: 0.4 },
  { id: 'prisme', name: 'Prisme', price: 1600, body: '#f4f4ff', accent: '#ffffff', glow: true, animated: 'hue', pattern: 'lines', metal: 0.8, rough: 0.2 },
  // 1.12 : nouveaux skins (communs → légendaires)
  { id: 'acier', name: 'Acier brossé', price: 250, body: '#8a919b', accent: '#d4d9e0', metal: 0.95, rough: 0.28 },
  { id: 'urbain', name: 'Urbain', price: 300, body: '#5d636c', accent: '#2c3036', pattern: 'digital', alt: '#9aa1aa', metal: 0.15, rough: 0.8 },
  { id: 'jungle', name: 'Jungle', price: 300, body: '#2f4a26', accent: '#16240f', pattern: 'digital', alt: '#6b8a3a', metal: 0.1, rough: 0.85 },
  { id: 'dune', name: 'Dune', price: 300, body: '#c9a66b', accent: '#8a6a3c', pattern: 'digital', alt: '#e6cf9c', metal: 0.1, rough: 0.85 },
  { id: 'damier', name: 'Damier', price: 350, body: '#f2f2f2', accent: '#16161a', pattern: 'checker', metal: 0.2, rough: 0.55 },
  { id: 'pop', name: 'Pop', price: 450, body: '#ffd23f', accent: '#ff3d7f', pattern: 'dots', metal: 0.1, rough: 0.5 },
  { id: 'menthe', name: 'Fondu menthe', price: 500, body: '#19e3c4', accent: '#f4fffc', pattern: 'fade', metal: 0.45, rough: 0.3 },
  { id: 'relief', name: 'Relief', price: 500, body: '#4d5a3a', accent: '#c8d49a', pattern: 'topo', metal: 0.15, rough: 0.7 },
  { id: 'tigre', name: 'Tigre', price: 550, body: '#f08a24', accent: '#1a120a', pattern: 'tiger', metal: 0.15, rough: 0.6 },
  { id: 'eclaboussure', name: 'Éclaboussures', price: 550, body: '#1b1d24', accent: '#ff4fa3', pattern: 'splatter', alt: '#3dd6ff', alt2: '#ffe14d', metal: 0.2, rough: 0.55 },
  { id: 'marbre', name: 'Marbre', price: 600, body: '#ecebe6', accent: '#b89a55', pattern: 'marble', metal: 0.35, rough: 0.25 },
  { id: 'crepuscule', name: 'Crépuscule', price: 650, body: '#ff7a3d', accent: '#5b2bd6', pattern: 'fade', metal: 0.4, rough: 0.35 },
  { id: 'ecailles', name: 'Écailles', price: 700, body: '#1f4d3a', accent: '#7ee0a0', pattern: 'scales', metal: 0.5, rough: 0.35 },
  { id: 'ruche', name: 'Ruche', price: 900, body: '#1a1407', accent: '#ffb11f', glow: true, pattern: 'hex', metal: 0.6, rough: 0.35 },
  { id: 'circuit', name: 'Circuit', price: 950, body: '#071a12', accent: '#2bff88', glow: true, pattern: 'circuit', metal: 0.5, rough: 0.4 },
  { id: 'givre', name: 'Givre', price: 1000, body: '#cfeeff', accent: '#3fb8ff', glow: true, pattern: 'ice', metal: 0.7, rough: 0.15 },
  { id: 'toxique', name: 'Toxique', price: 1050, body: '#10180a', accent: '#9dff2e', glow: true, pattern: 'cracks', metal: 0.3, rough: 0.6 },
  { id: 'brasier', name: 'Brasier', price: 1100, body: '#160805', accent: '#ff6a1a', glow: true, pattern: 'flames', metal: 0.3, rough: 0.55 },
  { id: 'synthwave', name: 'Synthwave', price: 1250, body: '#1a0b2e', accent: '#ff3fd2', glow: true, pattern: 'grid', metal: 0.5, rough: 0.35 },
  { id: 'dragon', name: 'Dragon', price: 1300, body: '#2a0707', accent: '#ffb347', glow: true, pattern: 'scales', metal: 0.8, rough: 0.25 },
  { id: 'chrome', name: 'Chrome', price: 1500, body: '#c9ced6', accent: '#ffffff', pattern: 'fade', metal: 1, rough: 0.05 },
  { id: 'obsidienne', name: 'Obsidienne', price: 1500, body: '#07060a', accent: '#ffcc4d', glow: true, pattern: 'cracks', metal: 1, rough: 0.12 },
  { id: 'galaxie', name: 'Galaxie', price: 1700, body: '#050818', accent: '#5ad1ff', glow: true, pattern: 'stars', metal: 0.5, rough: 0.3 },
  { id: 'aurore', name: 'Aurore', price: 1800, body: '#06121a', accent: '#5affc8', glow: true, animated: 'hue', pattern: 'waves', metal: 0.6, rough: 0.25 },
  // skins exclusifs : débloqués en montant de niveau, impossibles à acheter
  { id: 'recrue', name: 'Recrue', price: 0, level: 5, body: '#2c3a2a', accent: '#9bd36a', pattern: 'camo', metal: 0.2, rough: 0.7 },
  { id: 'veteran', name: 'Vétéran', price: 0, level: 10, body: '#3a2a1e', accent: '#e0a458', pattern: 'filigree', metal: 0.6, rough: 0.35 },
  { id: 'elite', name: 'Élite', price: 0, level: 20, body: '#0b1a2e', accent: '#ff3b6b', glow: true, pattern: 'lines', metal: 0.7, rough: 0.25 },
  { id: 'legende', name: 'Légende', price: 0, level: 30, body: '#1a1206', accent: '#ffd76a', glow: true, animated: 'hue', pattern: 'stars', metal: 1, rough: 0.15 },
  { id: 'maitre', name: 'Maître', price: 0, level: 40, body: '#0a0f1e', accent: '#7cf0ff', glow: true, animated: 'hue', pattern: 'circuit', metal: 0.9, rough: 0.2 },
  { id: 'eclipse', name: 'Éclipse', price: 0, level: 50, body: '#030308', accent: '#ffb84d', glow: true, pattern: 'eclipse', metal: 1, rough: 0.1 },
];
// rareté d'un skin (affichage et filtres de la collection) : d'après son prix, « exclusif » pour les skins de niveau
export const RARITY = {
  common: { name: 'Commun', color: '#9aa3ad' },
  rare: { name: 'Rare', color: '#3d9bff' },
  epic: { name: 'Épique', color: '#b05cff' },
  legendary: { name: 'Légendaire', color: '#ffb11f' },
  exclusive: { name: 'Exclusif', color: '#ff3b6b' },
};
export const rarityOf = s => !s ? 'common' : s.level ? 'exclusive' : s.price >= 1400 ? 'legendary' : s.price >= 800 ? 'epic' : s.price >= 400 ? 'rare' : 'common';

export const REWARDS = { kill: 10, roundWin: 15, matchWin: 150, matchPlayed: 50 };

// moments annoncés en partie (1.15) : nom affiché, XP de base (× réglage de l'administration),

export function sideOf(team, half) {
  if (team === 'ffa') return 'ffa';
  const first = team === 'alpha' ? 'atk' : 'def';
  return half === 0 ? first : (first === 'atk' ? 'def' : 'atk');
}
