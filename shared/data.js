// Données partagées client/serveur : armes, agents, skins, constantes de jeu.
export const TICK_RATE = 30;
export const SNAP_EVERY = 2; // snapshot toutes les 2 frames serveur (15 Hz)

export const ROUND = {
  buyTime: 20, roundTime: 100, fuseTime: 40, plantTime: 4, defuseTime: 7, endTime: 6,
  startMoney: 800, maxMoney: 9000, winMoney: 3000, lossMoney: 1900, killMoney: 200, plantMoney: 300,
  // bonus de défaite (1.25) : +500 par défaite d'affilée, jusqu'à 3 400 (évite qu'une équipe ne puisse plus jamais acheter)
  lossStep: 500, lossMax: 3400,
  explosionRadius: 14,
};

// couteau lancé (1.25) : clic droit avec le couteau ; il se ramasse en passant dessus (ou revient tout seul)
// vol en ligne droite (pas de gravité). Clic droit maintenu : la force se charge en `charge` secondes (minimum `minPower`).
// Force 0 → 1 : vitesse speedMin → speedMax (portée = vitesse × flight, 30 à 80 m) et dégâts damageMin → damageMax.
// S'il ne touche rien, il revient dans la main.
export const KNIFE_THROW = { damageMin: 45, damageMax: 80, headMul: 2.2, legMul: 0.85, speedMin: 15, speedMax: 40, charge: 1, minPower: 0.2, gravity: 0, cooldown: 1, flight: 2, returnAfter: 10, pickup: 1.7 };
export const knifePower = (heldSeconds) => Math.max(KNIFE_THROW.minPower, Math.min(1, (heldSeconds || 0) / KNIFE_THROW.charge));
// argent gagné en cas de défaite selon le nombre de défaites d'affilée (1 = première défaite)
export const lossBonus = streak => Math.min(ROUND.lossMax, ROUND.lossMoney + ROUND.lossStep * Math.max(0, streak - 1));
// temps mort tactique (1.26, Assaut) : une fois par équipe et par mi-temps, prolonge la phase d'achat
export const TIMEOUT = { extra: 30, maxBuy: 75 };
// recul apprenable (1.26) : décalage horizontal de chaque balle d'une rafale (× recul de l'arme), toujours le même
// → on peut apprendre à le compenser. La montée verticale reste celle de l'arme.
export const RECOIL_PATTERNS = {
  lancer: [0, 0, 0, 0.2, 0.4, 0.6, 0.5, 0.2, -0.2, -0.6, -0.9, -0.8, -0.4, 0, 0.4, 0.8, 1, 0.8, 0.4, 0, -0.4, -0.8, -0.8, -0.5, -0.2],
  viper: [0, 0.1, -0.1, 0.25, -0.25, 0.35, -0.35, 0.4, -0.4, 0.45, -0.45, 0.4, -0.4, 0.35, -0.35],
  tempest: [0, 0.1, 0.2, 0.1, -0.1, -0.2, -0.1, 0.1, 0.2, 0.1],
  hornet: [0, 0.2, -0.2, 0.3, -0.3, 0.2, -0.2],
  spark: [0, 0.15, -0.15, 0.2, -0.2],
};
export const recoilX = (id, n) => { const p = RECOIL_PATTERNS[id]; return p ? p[n % p.length] : 0; };
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
  hornet:  { id: 'hornet', pen: 0.3, name: 'Hornet', slot: 2, cost: 800, type: 'pistol', damage: 55, headMul: 2.9, legMul: 0.85, rate: 2.8, mag: 7, reserve: 21, reload: 2.1, spread: 0.004, moveSpread: 0.05, airSpread: 0.2, recoil: 0.03, auto: false, pellets: 1, falloff: [30, 0.85], speed: 1, model: 'heavypistol' },
  viper:   { id: 'viper', pen: 0.35, aim: 0.13, name: 'Viper', slot: 1, cost: 1600, type: 'smg', damage: 24, headMul: 2.7, legMul: 0.85, rate: 13, mag: 30, reserve: 90, reload: 2.2, spread: 0.012, moveSpread: 0.012, airSpread: 0.15, recoil: 0.006, auto: true, pellets: 1, falloff: [20, 0.75], speed: 0.97, model: 'smg', ads: { zoom: 1.2, spread: 0.65, move: 0.8, sight: 'reddot' } },
  brute:   { id: 'brute', aim: 0.17, name: 'Brute', slot: 1, cost: 1850, type: 'shotgun', damage: 13, headMul: 2, legMul: 0.85, rate: 1.15, mag: 6, reserve: 18, reload: 2.6, spread: 0.06, moveSpread: 0.01, airSpread: 0.1, recoil: 0.05, auto: false, pellets: 12, falloff: [12, 0.4], speed: 0.95, model: 'shotgun', ads: { zoom: 1.15, spread: 0.75, move: 0.8, sight: 'reddot' } },
  tempest: { id: 'tempest', pen: 0.55, aim: 0.2, name: 'Tempest', slot: 1, cost: 2250, type: 'rifle', damage: 42, headMul: 3.6, legMul: 0.85, rate: 4.8, mag: 20, reserve: 60, reload: 2.4, spread: 0.003, moveSpread: 0.06, airSpread: 0.25, recoil: 0.016, auto: false, pellets: 1, falloff: [60, 0.9], speed: 0.94, model: 'dmr', ads: { zoom: 1.6, spread: 0.45, move: 0.7, sight: 'acog' } },
  lancer:  { id: 'lancer', pen: 0.5, aim: 0.24, name: 'Lancer', slot: 1, cost: 2900, type: 'rifle', damage: 39, headMul: 4, legMul: 0.85, rate: 9.75, mag: 25, reserve: 75, reload: 2.5, spread: 0.004, moveSpread: 0.07, airSpread: 0.25, recoil: 0.011, auto: true, pellets: 1, falloff: [50, 0.9], speed: 0.92, model: 'rifle', ads: { zoom: 1.35, spread: 0.55, move: 0.75, sight: 'holo' } },
  longbow: { id: 'longbow', pen: 0.8, aim: 0.38, name: 'Longbow', slot: 1, cost: 4700, type: 'sniper', damage: 150, headMul: 1.7, legMul: 0.85, rate: 0.75, mag: 5, reserve: 15, reload: 3.6, spread: 0.08, scopedSpread: 0.0005, moveSpread: 0.15, airSpread: 0.3, recoil: 0.07, auto: false, pellets: 1, falloff: [999, 1], speed: 0.85, scope: 3.5, model: 'sniper' },
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
export const CUSTOM_FLAGS = [['infAmmo', 'Munitions infinies'], ['noAbilities', 'Sans capacités (armes uniquement)'], ['headOnly', 'Tirs à la tête uniquement'], ['lowGrav', 'Gravité basse'], ['bigHead', 'Grosses têtes'], ['friendlyFire', 'Tir allié (dégâts divisés par deux)'], ['randomMap', 'Carte aléatoire à chaque partie'], ['knifeRound', 'Manche au couteau : le gagnant choisit son côté (Assaut)']];
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
  // ---- nouveaux agents (1.17) ----
  orion: {
    id: 'orion', name: 'ORION', role: 'Initiateur', color: '#5ab4ff',
    bio: 'Ancien cartographe stellaire, Orion lit le terrain comme un ciel étoilé et guide son équipe vers chaque cible.',
    abilities: {
      q: { name: 'Drone éclaireur', type: 'drone', charges: 1, desc: 'Envoie un drone vers l\'endroit visé : il repère tous les ennemis à 14 m autour de lui pendant 6 s.' },
      e: { name: 'Supernova', type: 'flash', charges: 2, desc: 'Une étoile éclate devant toi et aveugle les ennemis qui la regardent.' },
      x: { name: 'Constellation', type: 'hunt', cost: 7, desc: 'Révèle la position de tous les ennemis pendant 7 s.' },
    },
  },
  marea: {
    id: 'marea', name: 'MARÉA', role: 'Contrôleur', color: '#2fd6c8',
    bio: 'Venue d\'une cité engloutie, Maréa noie les lignes de vue sous l\'écume et le froid des abysses.',
    abilities: {
      q: { name: 'Écume', type: 'smoke', charges: 2, desc: 'Lance une grenade qui libère un nuage opaque pendant 14 s.' },
      e: { name: 'Mur de glace', type: 'icewall', charges: 1, desc: 'Fait surgir un long mur de glace qui coupe le passage ; le sol gelé à ses pieds ralentit les ennemis.' },
      x: { name: 'Raz-de-marée', type: 'blizzard', cost: 7, desc: 'Une immense vague glacée ralentit et blesse les ennemis dans la zone visée pendant 8 s.' },
    },
  },
  vanta: {
    id: 'vanta', name: 'VANTA', role: 'Duelliste', color: '#c95cff',
    bio: 'Vanta frappe depuis les ombres : on ne la voit qu\'au moment où il est déjà trop tard.',
    abilities: {
      q: { name: 'Grappin', type: 'grapple', charges: 2, desc: 'Lance un grappin vers l\'endroit visé et te propulse jusqu\'à lui, même sur une caisse en hauteur.' },
      e: { name: 'Encre brûlante', type: 'molotov', charges: 1, desc: 'Lance une fiole d\'encre corrosive qui brûle le sol et inflige de lourds dégâts.' },
      x: { name: 'Néant', type: 'phantom', cost: 7, desc: 'Invisibilité et vitesse accrue pendant 10 s.' },
    },
  },
  kora: {
    id: 'kora', name: 'KORA', role: 'Sentinelle', color: '#ffd166',
    bio: 'Ingénieure têtue, Kora transforme n\'importe quel couloir en forteresse et ne laisse personne derrière.',
    abilities: {
      q: { name: 'Rempart', type: 'wall', charges: 1, desc: 'Érige un mur destructible devant toi pour couper un passage.' },
      e: { name: 'Piège à ressort', type: 'trap', charges: 2, desc: 'Pose un piège caché à tes pieds : l\'ennemi qui marche dessus est ralenti, révélé 5 s et perd 25 PV.' },
      x: { name: 'Bastion vivant', type: 'fortress', cost: 6, desc: 'Soigne complètement les alliés proches et leur donne 50 d\'armure.' },
    },
  },
};
export const AGENT_ORDER = ['ignis', 'nimbus', 'oracle', 'bastion', 'spectre', 'volta', 'kairo', 'borea', 'vesper', 'aegis', 'sol', 'nyx', 'helia', 'orion', 'marea', 'vanta', 'kora'];
// rôles des agents (page Agents)
export const ROLES = {
  Duelliste: { icon: '⚔', desc: 'Attaquant autonome : il ouvre les combats et prend les sites.' },
  Initiateur: { icon: '◎', desc: 'Prépare l\'assaut : il révèle et aveugle les ennemis avant que l\'équipe n\'entre.' },
  'Contrôleur': { icon: '☁', desc: 'Découpe la carte : fumées et zones pour bloquer la vue et les passages.' },
  Sentinelle: { icon: '⛨', desc: 'Défend et soutient : murs, soins et protection de l\'équipe.' },
};
// icônes des capacités (page Agents, menus)
export const ABILITY_ICONS = { molotov: '🔥', dash: '💨', overdrive: '⚡', smoke: '☁', heal: '✚', megasmoke: '🌫', flash: '✦', recon: '◉', hunt: '🎯', wall: '▦', shield: '⛨', fortress: '🏰', blink: '✧', invis: '◐', phantom: '👻', firestorm: '☄', haste: '➤', cryo: '❄', blizzard: '❅', grapple: '🪝', drone: '🛸', icewall: '🧊', trap: '⚠' };
// tenues des agents (1.19) : débloquées par la maîtrise de l'agent ; glow null = couleur de l'agent
export const OUTFITS = {
  base: { name: 'Standard', mastery: 1 },
  ombre: { name: 'Ombre', mastery: 2, armor: '#1c1d26', suit: '#14151c', glow: null },
  neon: { name: 'Néon', mastery: 4, armor: '#14142a', suit: '#0c0c18', glow: '#ff3fd2' },
  givre: { name: 'Givre', mastery: 6, armor: '#a8d8f0', suit: '#5a7d93', glow: '#e8fdff' },
  or: { name: 'Or', mastery: 8, armor: '#c9a04a', suit: '#3a2a10', glow: '#fff1a8' },
  eclipse: { name: 'Éclipse', mastery: 10, armor: '#08080c', suit: '#0d0d14', glow: '#ffb84d' },
};

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
  // ---- 100 skins (1.17) : 10 collections de 10 ----
  { id: 'lagon', name: 'Lagon', price: 250, set: 'Océan', body: '#0f6f8f', accent: '#6fe3ff', pattern: 'waves', metal: 0.35, rough: 0.55 },
  { id: 'recif', name: 'Récif', price: 300, set: 'Océan', body: '#0d4a6b', accent: '#ff8a65', pattern: 'bubbles', metal: 0.35, rough: 0.55 },
  { id: 'ecume', name: 'Écume', price: 300, set: 'Océan', body: '#1a5c7a', accent: '#e8fbff', pattern: 'waves', metal: 0.35, rough: 0.55 },
  { id: 'mareehaute', name: 'Marée haute', price: 350, set: 'Océan', body: '#062a44', accent: '#2fd6c8', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'corail', name: 'Corail', price: 450, set: 'Océan', body: '#8a2f3a', accent: '#ffb199', pattern: 'bubbles', metal: 0.5, rough: 0.4 },
  { id: 'meduse', name: 'Méduse', price: 550, set: 'Océan', body: '#1b1340', accent: '#ff7ae6', pattern: 'rings', metal: 0.5, rough: 0.4 },
  { id: 'perlenoire', name: 'Perle noire', price: 650, set: 'Océan', body: '#15161c', accent: '#d9e6ff', pattern: 'marble', metal: 0.5, rough: 0.4 },
  { id: 'tempetemarine', name: 'Tempête marine', price: 900, set: 'Océan', body: '#0a1f33', accent: '#40c4ff', glow: true, pattern: 'lines', metal: 0.65, rough: 0.3 },
  { id: 'abysses', name: 'Abysses', price: 1100, set: 'Océan', body: '#020b1a', accent: '#00ffd5', glow: true, pattern: 'bubbles', metal: 0.65, rough: 0.3 },
  { id: 'kraken', name: 'Kraken', price: 1700, set: 'Océan', body: '#0b1d2b', accent: '#7cffb2', glow: true, pattern: 'scales', metal: 0.85, rough: 0.18 },
  { id: 'cendre', name: 'Cendre', price: 250, set: 'Volcan', body: '#3a3a3e', accent: '#8a8a92', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'basalte', name: 'Basalte', price: 300, set: 'Volcan', body: '#22201f', accent: '#5a4a40', pattern: 'shards', metal: 0.35, rough: 0.55 },
  { id: 'soufre', name: 'Soufre', price: 300, set: 'Volcan', body: '#4a4520', accent: '#e3e05a', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'argilecuite', name: 'Argile cuite', price: 350, set: 'Volcan', body: '#6b3a22', accent: '#c47a4a', pattern: 'topo', metal: 0.35, rough: 0.55 },
  { id: 'braise', name: 'Braise', price: 450, set: 'Volcan', body: '#1d0f0a', accent: '#ff6a2a', pattern: 'cracks', metal: 0.5, rough: 0.4 },
  { id: 'eruption', name: 'Éruption', price: 550, set: 'Volcan', body: '#2a0d08', accent: '#ff4d1a', pattern: 'flames', metal: 0.5, rough: 0.4 },
  { id: 'cratere', name: 'Cratère', price: 650, set: 'Volcan', body: '#2b1a14', accent: '#ff9a3c', pattern: 'topo', metal: 0.5, rough: 0.4 },
  { id: 'fournaise', name: 'Fournaise', price: 900, set: 'Volcan', body: '#160604', accent: '#ffb020', glow: true, pattern: 'flames', metal: 0.65, rough: 0.3 },
  { id: 'lave', name: 'Lave', price: 1100, set: 'Volcan', body: '#120302', accent: '#ff3d00', glow: true, pattern: 'cracks', metal: 0.65, rough: 0.3 },
  { id: 'coeurdevolcan', name: 'Cœur de volcan', price: 1700, set: 'Volcan', body: '#0d0202', accent: '#ff2a00', glow: true, pattern: 'shards', metal: 0.85, rough: 0.18 },
  { id: 'mousse', name: 'Mousse', price: 250, set: 'Forêt', body: '#3d5a2e', accent: '#6f8f45', pattern: 'camo', metal: 0.35, rough: 0.55 },
  { id: 'fougere', name: 'Fougère', price: 300, set: 'Forêt', body: '#2e4a2a', accent: '#9fd36b', pattern: 'petals', metal: 0.35, rough: 0.55 },
  { id: 'ecorce', name: 'Écorce', price: 300, set: 'Forêt', body: '#4a3626', accent: '#7a5a3e', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'sousbois', name: 'Sous-bois', price: 350, set: 'Forêt', body: '#2a3a24', accent: '#556b3a', alt: '#1c2618', pattern: 'digital', metal: 0.35, rough: 0.55 },
  { id: 'lierre', name: 'Lierre', price: 450, set: 'Forêt', body: '#1e3a22', accent: '#5fbf6a', pattern: 'waves', metal: 0.5, rough: 0.4 },
  { id: 'automne', name: 'Automne', price: 550, set: 'Forêt', body: '#6b3410', accent: '#ffb347', alt: '#a0521d', pattern: 'leopard', metal: 0.5, rough: 0.4 },
  { id: 'bambou', name: 'Bambou', price: 650, set: 'Forêt', body: '#4f6b2a', accent: '#c9e58a', pattern: 'stripes', metal: 0.5, rough: 0.4 },
  { id: 'clairiere', name: 'Clairière', price: 900, set: 'Forêt', body: '#18301c', accent: '#ffe066', glow: true, pattern: 'petals', metal: 0.65, rough: 0.3 },
  { id: 'luciole', name: 'Luciole', price: 1100, set: 'Forêt', body: '#0b1a10', accent: '#c8ff6a', glow: true, pattern: 'stars', metal: 0.65, rough: 0.3 },
  { id: 'espritsylvestre', name: 'Esprit sylvestre', price: 1700, set: 'Forêt', body: '#0c1f12', accent: '#6bffb8', glow: true, pattern: 'web', metal: 0.85, rough: 0.18 },
  { id: 'banquise', name: 'Banquise', price: 250, set: 'Arctique', body: '#dfe8ef', accent: '#9db4c8', alt: '#ffffff', pattern: 'digital', metal: 0.35, rough: 0.55 },
  { id: 'toundra', name: 'Toundra', price: 300, set: 'Arctique', body: '#8a9aa3', accent: '#c9d6dc', pattern: 'camo', metal: 0.35, rough: 0.55 },
  { id: 'flocon', name: 'Flocon', price: 300, set: 'Arctique', body: '#c8d8e8', accent: '#ffffff', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'polaire', name: 'Polaire', price: 350, set: 'Arctique', body: '#e9eef2', accent: '#6c8aa8', alt: '#b0c4d8', pattern: 'plaid', metal: 0.35, rough: 0.55 },
  { id: 'iceberg', name: 'Iceberg', price: 450, set: 'Arctique', body: '#a8d8ef', accent: '#ffffff', pattern: 'shards', metal: 0.5, rough: 0.4 },
  { id: 'permafrost', name: 'Permafrost', price: 550, set: 'Arctique', body: '#5a7d93', accent: '#dff6ff', pattern: 'cracks', metal: 0.5, rough: 0.4 },
  { id: 'cristal', name: 'Cristal', price: 650, set: 'Arctique', body: '#7fb6d8', accent: '#e8fdff', pattern: 'ice', metal: 0.5, rough: 0.4 },
  { id: 'tourmente', name: 'Tourmente', price: 900, set: 'Arctique', body: '#0d2236', accent: '#9ef0ff', glow: true, pattern: 'waves', metal: 0.65, rough: 0.3 },
  { id: 'glacierbleu', name: 'Glacier bleu', price: 1100, set: 'Arctique', body: '#06223a', accent: '#4fd8ff', glow: true, pattern: 'ice', metal: 0.65, rough: 0.3 },
  { id: 'zeroabsolu', name: 'Zéro absolu', price: 1700, set: 'Arctique', body: '#020c18', accent: '#b8f6ff', glow: true, pattern: 'shards', metal: 0.85, rough: 0.18 },
  { id: 'octet', name: 'Octet', price: 250, set: 'Cyber', body: '#1d2230', accent: '#3a4a66', alt: '#2a3346', pattern: 'digital', metal: 0.35, rough: 0.55 },
  { id: 'binaire', name: 'Binaire', price: 300, set: 'Cyber', body: '#101318', accent: '#1f6f4a', pattern: 'checker', metal: 0.35, rough: 0.55 },
  { id: 'reseau', name: 'Réseau', price: 300, set: 'Cyber', body: '#12161f', accent: '#3c5a7a', pattern: 'web', metal: 0.35, rough: 0.55 },
  { id: 'pixel', name: 'Pixel', price: 350, set: 'Cyber', body: '#2a1f3d', accent: '#7a5cff', alt: '#ff5ca8', pattern: 'digital', metal: 0.35, rough: 0.55 },
  { id: 'matrice', name: 'Matrice', price: 450, set: 'Cyber', body: '#031a0c', accent: '#33ff88', pattern: 'lines', metal: 0.5, rough: 0.4 },
  { id: 'firewall', name: 'Firewall', price: 550, set: 'Cyber', body: '#1a0b0b', accent: '#ff4d4d', pattern: 'hex', metal: 0.5, rough: 0.4 },
  { id: 'glitch', name: 'Glitch', price: 650, set: 'Cyber', body: '#14101f', accent: '#34e7ff', alt: '#ff2e88', pattern: 'glitch', metal: 0.5, rough: 0.4 },
  { id: 'hologramme', name: 'Hologramme', price: 900, set: 'Cyber', body: '#0a0f20', accent: '#7cf0ff', glow: true, pattern: 'circuit', metal: 0.65, rough: 0.3 },
  { id: 'neoncity', name: 'Néon City', price: 1100, set: 'Cyber', body: '#0b0420', accent: '#ff3fd2', glow: true, pattern: 'grid', metal: 0.65, rough: 0.3 },
  { id: 'singularite', name: 'Singularité', price: 1700, set: 'Cyber', body: '#050510', accent: '#b07cff', alt: '#34e7ff', glow: true, animated: 'hue', pattern: 'glitch', metal: 0.85, rough: 0.18 },
  { id: 'ocre', name: 'Ocre', price: 250, set: 'Désert', body: '#b07a3c', accent: '#d9a35f', pattern: 'topo', metal: 0.35, rough: 0.55 },
  { id: 'sahara', name: 'Sahara', price: 300, set: 'Désert', body: '#c9a26a', accent: '#f2d39b', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'caravane', name: 'Caravane', price: 300, set: 'Désert', body: '#8a5a2e', accent: '#e0b070', pattern: 'stripes', metal: 0.35, rough: 0.55 },
  { id: 'oasis', name: 'Oasis', price: 350, set: 'Désert', body: '#b8955a', accent: '#2fbfa0', pattern: 'waves', metal: 0.35, rough: 0.55 },
  { id: 'sirocco', name: 'Sirocco', price: 450, set: 'Désert', body: '#a0602a', accent: '#ffd08a', pattern: 'lines', metal: 0.5, rough: 0.4 },
  { id: 'canyon', name: 'Canyon', price: 550, set: 'Désert', body: '#7a2e1a', accent: '#e07a4a', pattern: 'topo', metal: 0.5, rough: 0.4 },
  { id: 'scorpion', name: 'Scorpion', price: 650, set: 'Désert', body: '#3a2a14', accent: '#e0b030', pattern: 'scales', metal: 0.5, rough: 0.4 },
  { id: 'simoun', name: 'Simoun', price: 900, set: 'Désert', body: '#2a1a0a', accent: '#ffb84d', glow: true, pattern: 'waves', metal: 0.65, rough: 0.3 },
  { id: 'dunerouge', name: 'Dune rouge', price: 1100, set: 'Désert', body: '#2a0806', accent: '#ff5a2a', glow: true, pattern: 'topo', metal: 0.65, rough: 0.3 },
  { id: 'miragedore', name: 'Mirage doré', price: 1700, set: 'Désert', body: '#1a1206', accent: '#ffd24d', glow: true, pattern: 'chevron', metal: 0.85, rough: 0.18 },
  { id: 'ivoire', name: 'Ivoire', price: 250, set: 'Royal', body: '#e8e0cf', accent: '#b8a888', pattern: 'marble', metal: 0.35, rough: 0.55 },
  { id: 'velours', name: 'Velours', price: 300, set: 'Royal', body: '#4a1028', accent: '#7a2a4a', pattern: 'filigree', metal: 0.35, rough: 0.55 },
  { id: 'topaze', name: 'Topaze', price: 300, set: 'Royal', body: '#6b4a10', accent: '#ffcf5a', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'baroque', name: 'Baroque', price: 350, set: 'Royal', body: '#2a1a0a', accent: '#c9a04a', pattern: 'filigree', metal: 0.35, rough: 0.55 },
  { id: 'amethyste', name: 'Améthyste', price: 450, set: 'Royal', body: '#3a1f5a', accent: '#c9a0ff', pattern: 'marble', metal: 0.5, rough: 0.4 },
  { id: 'saphir', name: 'Saphir', price: 550, set: 'Royal', body: '#0a1f5a', accent: '#6fa8ff', pattern: 'hex', metal: 0.5, rough: 0.4 },
  { id: 'emeraude', name: 'Émeraude', price: 650, set: 'Royal', body: '#0a3a24', accent: '#5fffb0', pattern: 'shards', metal: 0.5, rough: 0.4 },
  { id: 'rubis', name: 'Rubis', price: 900, set: 'Royal', body: '#3a0510', accent: '#ff3d5a', glow: true, pattern: 'filigree', metal: 0.65, rough: 0.3 },
  { id: 'sceptre', name: 'Sceptre', price: 1100, set: 'Royal', body: '#0e0a1a', accent: '#ffd24d', glow: true, pattern: 'filigree', metal: 0.65, rough: 0.3 },
  { id: 'empereur', name: 'Empereur', price: 1700, set: 'Royal', body: '#120a02', accent: '#ffc83d', glow: true, pattern: 'scales', metal: 0.85, rough: 0.18 },
  { id: 'zebre', name: 'Zèbre', price: 250, set: 'Sauvage', body: '#f2f2f2', accent: '#15151a', pattern: 'zebra', metal: 0.35, rough: 0.55 },
  { id: 'lynx', name: 'Lynx', price: 300, set: 'Sauvage', body: '#b8a07a', accent: '#4a3a2a', alt: '#d8c4a0', pattern: 'leopard', metal: 0.35, rough: 0.55 },
  { id: 'cameleon', name: 'Caméléon', price: 300, set: 'Sauvage', body: '#3a6b2e', accent: '#a0d84a', pattern: 'scales', metal: 0.35, rough: 0.55 },
  { id: 'crocodile', name: 'Crocodile', price: 350, set: 'Sauvage', body: '#2e3a1e', accent: '#5a6b3a', pattern: 'scales', metal: 0.35, rough: 0.55 },
  { id: 'guepard', name: 'Guépard', price: 450, set: 'Sauvage', body: '#d8a040', accent: '#2a1a0a', alt: '#f0c060', pattern: 'leopard', metal: 0.5, rough: 0.4 },
  { id: 'jaguar', name: 'Jaguar', price: 550, set: 'Sauvage', body: '#a8742a', accent: '#1a0f05', alt: '#d89a4a', pattern: 'leopard', metal: 0.5, rough: 0.4 },
  { id: 'cobra', name: 'Cobra', price: 650, set: 'Sauvage', body: '#1a1a10', accent: '#e0d040', pattern: 'scales', metal: 0.5, rough: 0.4 },
  { id: 'panthere', name: 'Panthère', price: 900, set: 'Sauvage', body: '#0a0a0e', accent: '#5a3aff', alt: '#15151c', glow: true, pattern: 'leopard', metal: 0.65, rough: 0.3 },
  { id: 'python', name: 'Python', price: 1100, set: 'Sauvage', body: '#101a12', accent: '#3dff8a', glow: true, pattern: 'scales', metal: 0.65, rough: 0.3 },
  { id: 'tigredesneiges', name: 'Tigre des neiges', price: 1700, set: 'Sauvage', body: '#eef2ff', accent: '#4f8cff', glow: true, pattern: 'zebra', metal: 0.85, rough: 0.18 },
  { id: 'tartan', name: 'Tartan', price: 250, set: 'Rétro', body: '#6b1a1a', accent: '#1a3a2a', alt: '#e0c040', pattern: 'plaid', metal: 0.35, rough: 0.55 },
  { id: 'bonbon', name: 'Bonbon', price: 300, set: 'Rétro', body: '#ffd6e8', accent: '#ff5c9a', alt: '#ffffff', pattern: 'stripes', metal: 0.35, rough: 0.55 },
  { id: 'damierrouge', name: 'Damier rouge', price: 300, set: 'Rétro', body: '#1a1a1a', accent: '#c0202a', pattern: 'checker', metal: 0.35, rough: 0.55 },
  { id: 'vinyle', name: 'Vinyle', price: 350, set: 'Rétro', body: '#0e0e10', accent: '#3a3a44', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'disco', name: 'Disco', price: 450, set: 'Rétro', body: '#2a0a3a', accent: '#ffd24d', pattern: 'dots', metal: 0.5, rough: 0.4 },
  { id: 'arcade', name: 'Arcade', price: 550, set: 'Rétro', body: '#10102a', accent: '#ff4fd8', alt: '#4fd8ff', pattern: 'digital', metal: 0.5, rough: 0.4 },
  { id: 'chevron', name: 'Chevron', price: 650, set: 'Rétro', body: '#1a2a4a', accent: '#ffb84d', pattern: 'chevron', metal: 0.5, rough: 0.4 },
  { id: 'annees80', name: 'Années 80', price: 900, set: 'Rétro', body: '#1a0630', accent: '#4fd8ff', glow: true, pattern: 'grid', metal: 0.65, rough: 0.3 },
  { id: 'jukebox', name: 'Juke-box', price: 1100, set: 'Rétro', body: '#200a14', accent: '#ff3fd2', alt: '#ffd24d', glow: true, pattern: 'stripes', metal: 0.65, rough: 0.3 },
  { id: 'retrowave', name: 'Rétrowave', price: 1700, set: 'Rétro', body: '#0a0418', accent: '#ff2e88', glow: true, animated: 'hue', pattern: 'chevron', metal: 0.85, rough: 0.18 },
  { id: 'asteroide', name: 'Astéroïde', price: 250, set: 'Cosmos', body: '#3a3a40', accent: '#6a6a74', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'orbite', name: 'Orbite', price: 300, set: 'Cosmos', body: '#10142a', accent: '#5a6aa0', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'comete', name: 'Comète', price: 300, set: 'Cosmos', body: '#0e1226', accent: '#9fb4ff', pattern: 'lines', metal: 0.35, rough: 0.55 },
  { id: 'regolithe', name: 'Régolithe', price: 350, set: 'Cosmos', body: '#5a5a60', accent: '#8a8a94', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'meteore', name: 'Météore', price: 450, set: 'Cosmos', body: '#120a1a', accent: '#ff8a3d', pattern: 'flames', metal: 0.5, rough: 0.4 },
  { id: 'saturne', name: 'Saturne', price: 550, set: 'Cosmos', body: '#2a1f14', accent: '#e0b070', pattern: 'rings', metal: 0.5, rough: 0.4 },
  { id: 'nova', name: 'Nova', price: 650, set: 'Cosmos', body: '#0a0a1f', accent: '#ffe066', pattern: 'stars', metal: 0.5, rough: 0.4 },
  { id: 'nebuleuse', name: 'Nébuleuse', price: 900, set: 'Cosmos', body: '#1a0630', accent: '#ff5cf0', glow: true, pattern: 'stars', metal: 0.65, rough: 0.3 },
  { id: 'quasar', name: 'Quasar', price: 1100, set: 'Cosmos', body: '#04040e', accent: '#7cf0ff', glow: true, pattern: 'rings', metal: 0.65, rough: 0.3 },
  { id: 'trounoir', name: 'Trou noir', price: 1700, set: 'Cosmos', body: '#000000', accent: '#b07cff', glow: true, animated: 'hue', pattern: 'web', metal: 0.85, rough: 0.18 },
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
