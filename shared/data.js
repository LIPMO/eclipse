// Données partagées client/serveur : armes, agents, skins, constantes de jeu.
export const TICK_RATE = 30;
export const SNAP_EVERY = 1; // snapshot à chaque frame serveur (30 Hz, 1.28 : avant 15 Hz)
export const STATS_EVERY = 15; // statistiques du tableau des scores : 2 fois par seconde (ou tout de suite après une élimination)
export const INTERP_DELAY = 75; // retard d'affichage des autres joueurs (ms), ≈ 2 snapshots

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
// n peut être à virgule (le compteur de rafale redescend entre deux tirs) : on prend la case la plus proche
export const recoilX = (id, n) => { const p = RECOIL_PATTERNS[id]; const i = Math.max(0, Math.round(Number(n) || 0)); return p ? (p[i % p.length] || 0) : 0; };
export const DUEL = { buyTime: 10, roundTime: 60, money: 9000 };
// ---- mécaniques 1.28 ----
// recharge : avec des balles restantes, 20 % plus rapide ; tirer pendant la recharge l'interrompt s'il reste des balles.
// Fusil à pompe : les cartouches déjà glissées restent dans l'arme si on interrompt.
export const RELOAD = { tactical: 0.8 };
export const reloadTime = (def, mag) => def.reload * (mag > 0 ? RELOAD.tactical : 1);
export function partialShells(def, mag0, elapsed, dur, reserve) {
  if (!def || def.type !== 'shotgun' || !(dur > 0)) return 0;
  const missing = def.mag - mag0;
  return Math.max(0, Math.min(reserve, missing, Math.floor(missing * Math.min(1, Math.max(0, elapsed) / dur))));
}
// dégâts de chute : au-delà de 3,4 m de chute, 15 PV par mètre (sauter d'une caisse haute ≈ 10 PV)
export const FALL = { safe: 3.4, perM: 15 };
// coup de crosse : attaque rapide au corps à corps, quelle que soit l'arme en main
export const BASH = { damage: 45, range: 1.9, cooldown: 0.9 };
// lunette : niveaux de zoom changés à la molette
export const SCOPE_LEVELS = [2, 3.5, 6];
// pas : au-dessus de cette vitesse, les ennemis proches entendent tes pas (même seuil que le serveur)
export const STEP_LOUD = 4.3;

export const FFA = { respawn: 3, timeLimit: 600, gunTimeLimit: 480, abilityRecharge: 18 };
// modes « chacun pour soi » (pas d'équipes, réapparition) : Mêlée et Gun Game
export const isFfa = mode => mode === 'ffa' || mode === 'gungame' || mode === 'lives' || mode === 'br';
// dernier debout : une ou plusieurs vies, le dernier en jeu gagne (Dernier debout, Battle Royale)
export const isLastStand = mode => mode === 'lives' || mode === 'br';
// Battle Royale (1.42) : zone qui se resserre par étapes, coffres à ouvrir (touche d'interaction), une seule vie
export const BR = {
  timeLimit: 900, startRadius: 118, chestRange: 2.4,
  // V2 (1.44) : saut en parachute au départ, sac à dos de 3 emplacements (touches 4, 5, 6)
  bus: { delay: 3, duration: 22, height: 62 }, // V3 (1.52) : dirigeable de départ, on saute quand on veut (Espace)
  drop: { height: 55, fall: 6, fastFall: 15, speed: 8.5, botWait: 9 }, bagSize: 3,
  // 1.47 : potions (touches 7 et 8) et +50 PV par élimination (le surplus devient de l'armure)
  // 1.48 : petite boutique de soin (touche d'achat) et distributeurs de soin complet sur la carte
  shop: { heal: { hp: 50, price: 300 } }, money: { chest: 150, kill: 300 },
  dispensers: [[13, 12], [26, 12], [13, 25], [26, 25], [20, 6], [20, 33]], dispenserCooldown: 45,
  // V3 (1.51) : rareté des armes trouvées (dégâts en plus) et nouveaux objets
  rarity: { common: { name: 'Commun', mul: 1, color: '#9aa3ad' }, rare: { name: 'Rare', mul: 1.08, color: '#3d9bff' }, epic: { name: 'Épique', mul: 1.16, color: '#b05cff' }, legendary: { name: 'Légendaire', mul: 1.25, color: '#ffb11f' } },
  items: { bandage: { name: 'Bandage', hp: 15, cap: 75, time: 0.8, max: 6 }, mini: { name: 'Mini-bouclier', armor: 25, cap: 50, time: 0.9, max: 6 }, nade: { name: 'Grenade', max: 4, dmg: 95, radius: 5.5 } },
  potions: { heal: { name: 'Potion de soin', hp: 40, time: 1.4, max: 4 }, shield: { name: 'Potion de bouclier', armor: 50, time: 1.8, max: 3 } }, killHeal: 50,
  // attente avant de se resserrer (s), durée du resserrement (s), rayon visé (m), dégâts par seconde hors zone pendant l'étape
  stages: [[50, 30, 58, 1], [40, 25, 36, 2], [35, 20, 20, 4], [25, 15, 9, 7], [20, 15, 0, 10]],
  loot: { common: ['spark', 'viper'], rare: ['hornet', 'brute'], epic: ['tempest', 'lancer'], legendary: ['longbow'] },
  lootOdds: { common: 48, rare: 30, epic: 17, legendary: 5 },
};
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
  // ---- 100 skins (1.28) : 10 nouvelles collections de 10 ----
  { id: 'grisaille', name: 'Grisaille', price: 250, set: 'Tempête', body: '#5a6270', accent: '#9aa6b6', pattern: 'waves', metal: 0.35, rough: 0.55 },
  { id: 'bruine', name: 'Bruine', price: 300, set: 'Tempête', body: '#4a5a6a', accent: '#b8d0e8', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'nimbus', name: 'Nimbus', price: 300, set: 'Tempête', body: '#6c7684', accent: '#e6edf5', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'rafale', name: 'Rafale', price: 350, set: 'Tempête', body: '#3a4656', accent: '#8fb8ff', pattern: 'lines', metal: 0.35, rough: 0.55 },
  { id: 'grele', name: 'Grêle', price: 450, set: 'Tempête', body: '#2e3a4a', accent: '#d8f0ff', pattern: 'shards', metal: 0.5, rough: 0.4 },
  { id: 'cyclone', name: 'Cyclone', price: 550, set: 'Tempête', body: '#1e2a3c', accent: '#6fc8ff', pattern: 'rings', metal: 0.5, rough: 0.4 },
  { id: 'ouragan', name: 'Ouragan', price: 650, set: 'Tempête', body: '#18202e', accent: '#a0e4ff', pattern: 'waves', metal: 0.5, rough: 0.4 },
  { id: 'foudre', name: 'Foudre', price: 900, set: 'Tempête', body: '#0c1020', accent: '#fff35a', glow: true, pattern: 'cracks', metal: 0.65, rough: 0.3 },
  { id: 'supercellule', name: 'Supercellule', price: 1100, set: 'Tempête', body: '#0a0e1c', accent: '#7cb8ff', glow: true, pattern: 'circuit', metal: 0.65, rough: 0.3 },
  { id: 'ilducyclone', name: 'Œil du cyclone', price: 1700, set: 'Tempête', body: '#04060e', accent: '#b8f0ff', glow: true, pattern: 'rings', metal: 0.85, rough: 0.18 },
  { id: 'gravier', name: 'Gravier', price: 250, set: 'Jardin zen', body: '#bdb6a6', accent: '#7a7468', pattern: 'topo', metal: 0.35, rough: 0.55 },
  { id: 'galet', name: 'Galet', price: 300, set: 'Jardin zen', body: '#8a8478', accent: '#cfc8b8', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'bonsai', name: 'Bonsaï', price: 300, set: 'Jardin zen', body: '#3a4a2e', accent: '#a6c27a', pattern: 'petals', metal: 0.35, rough: 0.55 },
  { id: 'thevert', name: 'Thé vert', price: 350, set: 'Jardin zen', body: '#5a6e3a', accent: '#d8e6a8', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'lanterne', name: 'Lanterne', price: 450, set: 'Jardin zen', body: '#4a2a1a', accent: '#ffb86a', pattern: 'filigree', metal: 0.5, rough: 0.4 },
  { id: 'pontrouge', name: 'Pont rouge', price: 550, set: 'Jardin zen', body: '#6a1a1a', accent: '#ff8a6a', pattern: 'stripes', metal: 0.5, rough: 0.4 },
  { id: 'koi', name: 'Koï', price: 650, set: 'Jardin zen', body: '#f2efe6', accent: '#ff6a2a', pattern: 'scales', metal: 0.5, rough: 0.4 },
  { id: 'cerisier', name: 'Cerisier', price: 900, set: 'Jardin zen', body: '#2a1420', accent: '#ffa8d0', glow: true, pattern: 'petals', metal: 0.65, rough: 0.3 },
  { id: 'lunedautomne', name: 'Lune d\'automne', price: 1100, set: 'Jardin zen', body: '#141026', accent: '#ffd890', glow: true, pattern: 'stars', metal: 0.65, rough: 0.3 },
  { id: 'espritdusanctuaire', name: 'Esprit du sanctuaire', price: 1700, set: 'Jardin zen', body: '#0a0814', accent: '#ff7ab8', glow: true, pattern: 'filigree', metal: 0.85, rough: 0.18 },
  { id: 'rouille', name: 'Rouille', price: 250, set: 'Mécanique', body: '#6a3a22', accent: '#a86a3e', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'boulon', name: 'Boulon', price: 300, set: 'Mécanique', body: '#5a5e64', accent: '#a8adb4', pattern: 'hex', metal: 0.35, rough: 0.55 },
  { id: 'engrenage', name: 'Engrenage', price: 300, set: 'Mécanique', body: '#3e4248', accent: '#c8a060', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'cuivre', name: 'Cuivre', price: 350, set: 'Mécanique', body: '#7a4a28', accent: '#e0a070', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'piston', name: 'Piston', price: 450, set: 'Mécanique', body: '#2e3236', accent: '#9ab0c4', pattern: 'stripes', metal: 0.5, rough: 0.4 },
  { id: 'vapeur', name: 'Vapeur', price: 550, set: 'Mécanique', body: '#4a4e52', accent: '#e6e6e6', pattern: 'bubbles', metal: 0.5, rough: 0.4 },
  { id: 'horlogerie', name: 'Horlogerie', price: 650, set: 'Mécanique', body: '#2a1e10', accent: '#e8c060', pattern: 'filigree', metal: 0.5, rough: 0.4 },
  { id: 'forge', name: 'Forge', price: 900, set: 'Mécanique', body: '#1a0c06', accent: '#ff8a2a', glow: true, pattern: 'hex', metal: 0.65, rough: 0.3 },
  { id: 'turbine', name: 'Turbine', price: 1100, set: 'Mécanique', body: '#0c121a', accent: '#5ad8ff', glow: true, pattern: 'circuit', metal: 0.65, rough: 0.3 },
  { id: 'curmecanique', name: 'Cœur mécanique', price: 1700, set: 'Mécanique', body: '#0a0806', accent: '#ffc040', glow: true, pattern: 'rings', metal: 0.85, rough: 0.18 },
  { id: 'guimauve', name: 'Guimauve', price: 250, set: 'Confiserie', body: '#f6e0ec', accent: '#ffffff', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'reglisse', name: 'Réglisse', price: 300, set: 'Confiserie', body: '#16141a', accent: '#4a3a4a', pattern: 'stripes', metal: 0.35, rough: 0.55 },
  { id: 'caramel', name: 'Caramel', price: 300, set: 'Confiserie', body: '#a86a2a', accent: '#f0c080', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'barbeapapa', name: 'Barbe à papa', price: 350, set: 'Confiserie', body: '#ffc8e8', accent: '#a8d8ff', pattern: 'bubbles', metal: 0.35, rough: 0.55 },
  { id: 'sucredorge', name: 'Sucre d\'orge', price: 450, set: 'Confiserie', body: '#ffffff', accent: '#ff3a5a', pattern: 'stripes', metal: 0.5, rough: 0.4 },
  { id: 'praline', name: 'Praline', price: 550, set: 'Confiserie', body: '#5a3a22', accent: '#ff9ac0', pattern: 'dots', metal: 0.5, rough: 0.4 },
  { id: 'chewinggum', name: 'Chewing-gum', price: 650, set: 'Confiserie', body: '#ff7ac8', accent: '#7af0ff', alt: '#ffe14d', pattern: 'splatter', metal: 0.5, rough: 0.4 },
  { id: 'bonbonacidule', name: 'Bonbon acidulé', price: 900, set: 'Confiserie', body: '#1a0a20', accent: '#9dff2e', glow: true, pattern: 'bubbles', metal: 0.65, rough: 0.3 },
  { id: 'sucettearcenciel', name: 'Sucette arc-en-ciel', price: 1100, set: 'Confiserie', body: '#140a1e', accent: '#ff5cf0', glow: true, pattern: 'rings', metal: 0.65, rough: 0.3 },
  { id: 'patisserieroyale', name: 'Pâtisserie royale', price: 1700, set: 'Confiserie', body: '#1a0e14', accent: '#ffd0e8', glow: true, animated: 'hue', pattern: 'filigree', metal: 0.85, rough: 0.18 },
  { id: 'argileantique', name: 'Argile antique', price: 250, set: 'Mythes', body: '#8a5a3a', accent: '#d8a878', pattern: 'chevron', metal: 0.35, rough: 0.55 },
  { id: 'minotaure', name: 'Minotaure', price: 300, set: 'Mythes', body: '#4a2a1a', accent: '#c87a4a', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'medusemyt', name: 'Méduse', price: 300, set: 'Mythes', body: '#2a3a2a', accent: '#8ae0a0', pattern: 'scales', metal: 0.35, rough: 0.55 },
  { id: 'cyclope', name: 'Cyclope', price: 350, set: 'Mythes', body: '#3a3048', accent: '#a890d8', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'pegase', name: 'Pégase', price: 450, set: 'Mythes', body: '#e8eef6', accent: '#a8c8ff', pattern: 'petals', metal: 0.5, rough: 0.4 },
  { id: 'hydre', name: 'Hydre', price: 550, set: 'Mythes', body: '#0e2a1e', accent: '#5affa0', pattern: 'scales', metal: 0.5, rough: 0.4 },
  { id: 'olympe', name: 'Olympe', price: 650, set: 'Mythes', body: '#f2e6c8', accent: '#e0b040', pattern: 'filigree', metal: 0.5, rough: 0.4 },
  { id: 'phenix', name: 'Phénix', price: 900, set: 'Mythes', body: '#1a0604', accent: '#ff7a1a', glow: true, pattern: 'flames', metal: 0.65, rough: 0.3 },
  { id: 'griffon', name: 'Griffon', price: 1100, set: 'Mythes', body: '#120e06', accent: '#ffd060', glow: true, pattern: 'chevron', metal: 0.65, rough: 0.3 },
  { id: 'titan', name: 'Titan', price: 1700, set: 'Mythes', body: '#060408', accent: '#c890ff', glow: true, pattern: 'shards', metal: 0.85, rough: 0.18 },
  { id: 'pierretombale', name: 'Pierre tombale', price: 250, set: 'Gothique', body: '#4a4a50', accent: '#7e7e88', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'corbeau', name: 'Corbeau', price: 300, set: 'Gothique', body: '#141418', accent: '#3a3a48', pattern: 'scales', metal: 0.35, rough: 0.55 },
  { id: 'brume', name: 'Brume', price: 300, set: 'Gothique', body: '#3a3a46', accent: '#a8a8c0', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'vitrail', name: 'Vitrail', price: 350, set: 'Gothique', body: '#1a1430', accent: '#8a6aff', pattern: 'shards', metal: 0.35, rough: 0.55 },
  { id: 'chandelle', name: 'Chandelle', price: 450, set: 'Gothique', body: '#1a120a', accent: '#ffc46a', pattern: 'flames', metal: 0.5, rough: 0.4 },
  { id: 'rosenoire', name: 'Rose noire', price: 550, set: 'Gothique', body: '#14060c', accent: '#c0203a', pattern: 'petals', metal: 0.5, rough: 0.4 },
  { id: 'gargouille', name: 'Gargouille', price: 650, set: 'Gothique', body: '#2a2a2e', accent: '#9a9aa8', pattern: 'cracks', metal: 0.5, rough: 0.4 },
  { id: 'spectre', name: 'Spectre', price: 900, set: 'Gothique', body: '#06060e', accent: '#7cf0d0', glow: true, pattern: 'web', metal: 0.65, rough: 0.3 },
  { id: 'sangroyal', name: 'Sang royal', price: 1100, set: 'Gothique', body: '#100206', accent: '#ff2a4a', glow: true, pattern: 'filigree', metal: 0.65, rough: 0.3 },
  { id: 'comtedesombres', name: 'Comte des ombres', price: 1700, set: 'Gothique', body: '#040306', accent: '#b07cff', glow: true, pattern: 'web', metal: 0.85, rough: 0.18 },
  { id: 'sableblanc', name: 'Sable blanc', price: 250, set: 'Tropical', body: '#efe6cc', accent: '#c8b88a', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'noixdecoco', name: 'Noix de coco', price: 300, set: 'Tropical', body: '#5a3a22', accent: '#efe6d8', pattern: 'stripes', metal: 0.35, rough: 0.55 },
  { id: 'palmier', name: 'Palmier', price: 300, set: 'Tropical', body: '#2e5a2a', accent: '#a8e070', pattern: 'petals', metal: 0.35, rough: 0.55 },
  { id: 'lagonturquoise', name: 'Lagon turquoise', price: 350, set: 'Tropical', body: '#1a8a8a', accent: '#bff8f0', pattern: 'waves', metal: 0.35, rough: 0.55 },
  { id: 'hibiscus', name: 'Hibiscus', price: 450, set: 'Tropical', body: '#c02a5a', accent: '#ffd0e0', pattern: 'petals', metal: 0.5, rough: 0.4 },
  { id: 'toucan', name: 'Toucan', price: 550, set: 'Tropical', body: '#141414', accent: '#ffb020', alt: '#ff5a2a', pattern: 'stripes', metal: 0.5, rough: 0.4 },
  { id: 'mangue', name: 'Mangue', price: 650, set: 'Tropical', body: '#ffa02a', accent: '#ff5a3a', pattern: 'fade', metal: 0.5, rough: 0.4 },
  { id: 'volcandesiles', name: 'Volcan des îles', price: 900, set: 'Tropical', body: '#1a0604', accent: '#ff6a2a', glow: true, pattern: 'cracks', metal: 0.65, rough: 0.3 },
  { id: 'reciffluo', name: 'Récif fluo', price: 1100, set: 'Tropical', body: '#04141e', accent: '#3affd8', glow: true, pattern: 'bubbles', metal: 0.65, rough: 0.3 },
  { id: 'paradis', name: 'Paradis', price: 1700, set: 'Tropical', body: '#060e14', accent: '#ff8ad8', glow: true, pattern: 'petals', metal: 0.85, rough: 0.18 },
  { id: 'quartz', name: 'Quartz', price: 250, set: 'Cristaux', body: '#d8d4e0', accent: '#ffffff', pattern: 'shards', metal: 0.35, rough: 0.55 },
  { id: 'onyx', name: 'Onyx', price: 300, set: 'Cristaux', body: '#121214', accent: '#5a5a66', pattern: 'marble', metal: 0.35, rough: 0.55 },
  { id: 'jade', name: 'Jade', price: 300, set: 'Cristaux', body: '#2a6a4a', accent: '#8ae0b0', pattern: 'marble', metal: 0.35, rough: 0.55 },
  { id: 'citrine', name: 'Citrine', price: 350, set: 'Cristaux', body: '#c89a2a', accent: '#fff0a0', pattern: 'shards', metal: 0.35, rough: 0.55 },
  { id: 'opale', name: 'Opale', price: 450, set: 'Cristaux', body: '#e6f0f6', accent: '#ff9ae0', pattern: 'marble', metal: 0.5, rough: 0.4 },
  { id: 'tanzanite', name: 'Tanzanite', price: 550, set: 'Cristaux', body: '#2a2a7a', accent: '#9a8aff', pattern: 'hex', metal: 0.5, rough: 0.4 },
  { id: 'grenat', name: 'Grenat', price: 650, set: 'Cristaux', body: '#5a0a1a', accent: '#ff5a7a', pattern: 'shards', metal: 0.5, rough: 0.4 },
  { id: 'diamantnoir', name: 'Diamant noir', price: 900, set: 'Cristaux', body: '#040406', accent: '#e8f0ff', glow: true, pattern: 'shards', metal: 0.65, rough: 0.3 },
  { id: 'amethysteroyale', name: 'Améthyste royale', price: 1100, set: 'Cristaux', body: '#14062a', accent: '#d07cff', glow: true, pattern: 'hex', metal: 0.65, rough: 0.3 },
  { id: 'prismevivant', name: 'Prisme vivant', price: 1700, set: 'Cristaux', body: '#06060e', accent: '#ffffff', glow: true, animated: 'hue', pattern: 'shards', metal: 0.85, rough: 0.18 },
  { id: 'kaki', name: 'Kaki', price: 250, set: 'Militaire', body: '#6a6a3a', accent: '#9a9a5a', pattern: 'camo', metal: 0.35, rough: 0.55 },
  { id: 'olive', name: 'Olive', price: 300, set: 'Militaire', body: '#4a5a2a', accent: '#7a8a4a', alt: '#3a4620', pattern: 'digital', metal: 0.35, rough: 0.55 },
  { id: 'sabledudesert', name: 'Sable du désert', price: 300, set: 'Militaire', body: '#b8a07a', accent: '#8a7450', alt: '#d8c4a0', pattern: 'digital', metal: 0.35, rough: 0.55 },
  { id: 'grismarine', name: 'Gris marine', price: 350, set: 'Militaire', body: '#3a4450', accent: '#6a7684', alt: '#2a3038', pattern: 'digital', metal: 0.35, rough: 0.55 },
  { id: 'neigetactique', name: 'Neige tactique', price: 450, set: 'Militaire', body: '#e6eaee', accent: '#9aa6b0', alt: '#ffffff', pattern: 'digital', metal: 0.5, rough: 0.4 },
  { id: 'foretnocturne', name: 'Forêt nocturne', price: 550, set: 'Militaire', body: '#1a2418', accent: '#3a5030', pattern: 'camo', metal: 0.5, rough: 0.4 },
  { id: 'tigreurbain', name: 'Tigre urbain', price: 650, set: 'Militaire', body: '#3a3e44', accent: '#16181c', pattern: 'tiger', metal: 0.5, rough: 0.4 },
  { id: 'operationnuit', name: 'Opération nuit', price: 900, set: 'Militaire', body: '#06080a', accent: '#3dff6a', alt: '#0e1410', glow: true, pattern: 'digital', metal: 0.65, rough: 0.3 },
  { id: 'commando', name: 'Commando', price: 1100, set: 'Militaire', body: '#0e1006', accent: '#ffb020', glow: true, pattern: 'camo', metal: 0.65, rough: 0.3 },
  { id: 'general', name: 'Général', price: 1700, set: 'Militaire', body: '#08080a', accent: '#ffd24d', glow: true, pattern: 'chevron', metal: 0.85, rough: 0.18 },
  { id: 'rosee', name: 'Rosée', price: 250, set: 'Aube', body: '#c8d8e0', accent: '#ffffff', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'brumematinale', name: 'Brume matinale', price: 300, set: 'Aube', body: '#d8d0e0', accent: '#fff0f6', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'peche', name: 'Pêche', price: 300, set: 'Aube', body: '#ffc0a0', accent: '#fff0e0', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'lavande', name: 'Lavande', price: 350, set: 'Aube', body: '#9a8ac8', accent: '#e6dcff', pattern: 'petals', metal: 0.35, rough: 0.55 },
  { id: 'horizon', name: 'Horizon', price: 450, set: 'Aube', body: '#ff9a6a', accent: '#6a8aff', pattern: 'fade', metal: 0.5, rough: 0.4 },
  { id: 'premierrayon', name: 'Premier rayon', price: 550, set: 'Aube', body: '#2a1a3a', accent: '#ffd06a', pattern: 'lines', metal: 0.5, rough: 0.4 },
  { id: 'soleillevant', name: 'Soleil levant', price: 650, set: 'Aube', body: '#3a0e1a', accent: '#ff8a3a', pattern: 'rings', metal: 0.5, rough: 0.4 },
  { id: 'couronnesolaire', name: 'Couronne solaire', price: 900, set: 'Aube', body: '#100a02', accent: '#ffd040', glow: true, pattern: 'stars', metal: 0.65, rough: 0.3 },
  { id: 'cieldor', name: 'Ciel d\'or', price: 1100, set: 'Aube', body: '#0e0a14', accent: '#ffc8a0', glow: true, pattern: 'waves', metal: 0.65, rough: 0.3 },
  { id: 'renaissance', name: 'Renaissance', price: 1700, set: 'Aube', body: '#06040a', accent: '#ffe6a0', glow: true, animated: 'hue', pattern: 'stars', metal: 0.85, rough: 0.18 },
  // ---- 200 skins (1.29) : 20 nouvelles collections de 10 ----
  { id: 'corde', name: 'Corde', price: 250, set: 'Pirates', body: '#916b46', accent: '#dacb81', pattern: 'stripes', metal: 0.35, rough: 0.55 },
  { id: 'tonneau', name: 'Tonneau', price: 300, set: 'Pirates', body: '#837b3f', accent: '#c7da81', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'boussole', name: 'Boussole', price: 300, set: 'Pirates', body: '#754038', accent: '#daaa81', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'pavillon', name: 'Pavillon', price: 350, set: 'Pirates', body: '#446732', accent: '#82da81', pattern: 'checker', metal: 0.35, rough: 0.55 },
  { id: 'abordage', name: 'Abordage', price: 450, set: 'Pirates', body: '#5c1f2d', accent: '#ec8751', alt: '#52e0bf', pattern: 'splatter', metal: 0.5, rough: 0.4 },
  { id: 'sabredabordage', name: 'Sabre d\'abordage', price: 550, set: 'Pirates', body: '#1f5c38', accent: '#51ecec', pattern: 'lines', metal: 0.5, rough: 0.4 },
  { id: 'tresorenfoui', name: 'Trésor enfoui', price: 650, set: 'Pirates', body: '#5c1f43', accent: '#ec5153', pattern: 'dots', metal: 0.5, rough: 0.4 },
  { id: 'krakendesbrumes', name: 'Kraken des brumes', price: 900, set: 'Pirates', body: '#07191d', accent: '#3633ff', glow: true, pattern: 'scales', metal: 0.65, rough: 0.3 },
  { id: 'galionfantome', name: 'Galion fantôme', price: 1100, set: 'Pirates', body: '#1d071c', accent: '#ff334e', glow: true, pattern: 'waves', metal: 0.65, rough: 0.3 },
  { id: 'roidescorsaires', name: 'Roi des corsaires', price: 1700, set: 'Pirates', body: '#07081d', accent: '#d333ff', glow: true, animated: 'hue', pattern: 'filigree', metal: 0.85, rough: 0.18 },
  { id: 'bamboulaque', name: 'Bambou laqué', price: 250, set: 'Samouraï', body: '#914646', accent: '#da9e81', pattern: 'stripes', metal: 0.35, rough: 0.55 },
  { id: 'papierderiz', name: 'Papier de riz', price: 300, set: 'Samouraï', body: '#83593f', accent: '#dac181', pattern: 'marble', metal: 0.35, rough: 0.55 },
  { id: 'sabrecourt', name: 'Sabre court', price: 300, set: 'Samouraï', body: '#75384f', accent: '#da8184', pattern: 'lines', metal: 0.35, rough: 0.55 },
  { id: 'eventail', name: 'Éventail', price: 350, set: 'Samouraï', body: '#5f6732', accent: '#afda81', pattern: 'petals', metal: 0.35, rough: 0.55 },
  { id: 'armurelaquee', name: 'Armure laquée', price: 450, set: 'Samouraï', body: '#5c1f4b', accent: '#ec5168', pattern: 'scales', metal: 0.5, rough: 0.4 },
  { id: 'lunerouge', name: 'Lune rouge', price: 550, set: 'Samouraï', body: '#245c1f', accent: '#51ec9e', pattern: 'rings', metal: 0.5, rough: 0.4 },
  { id: 'shogun', name: 'Shogun', price: 650, set: 'Samouraï', body: '#561f5c', accent: '#ec51a1', pattern: 'filigree', metal: 0.5, rough: 0.4 },
  { id: 'fleurdesang', name: 'Fleur de sang', price: 900, set: 'Samouraï', body: '#071d16', accent: '#3396ff', glow: true, pattern: 'petals', metal: 0.65, rough: 0.3 },
  { id: 'dragondencre', name: 'Dragon d\'encre', price: 1100, set: 'Samouraï', body: '#13071d', accent: '#ff33b4', glow: true, pattern: 'scales', metal: 0.65, rough: 0.3 },
  { id: 'voiedusabre', name: 'Voie du sabre', price: 1700, set: 'Samouraï', body: '#07131d', accent: '#6d33ff', glow: true, pattern: 'flames', metal: 0.85, rough: 0.18 },
  { id: 'papyrus', name: 'Papyrus', price: 250, set: 'Égypte', body: '#917e46', accent: '#d3da81', pattern: 'topo', metal: 0.35, rough: 0.55 },
  { id: 'gres', name: 'Grès', price: 300, set: 'Égypte', body: '#7a833f', accent: '#b0da81', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'scarabee', name: 'Scarabée', price: 300, set: 'Égypte', body: '#755038', accent: '#dac181', pattern: 'scales', metal: 0.35, rough: 0.55 },
  { id: 'hieroglyphe', name: 'Hiéroglyphe', price: 350, set: 'Égypte', body: '#376732', accent: '#81da95', pattern: 'chevron', metal: 0.35, rough: 0.55 },
  { id: 'oasisdunil', name: 'Oasis du Nil', price: 450, set: 'Égypte', body: '#5c201f', accent: '#ecae51', pattern: 'waves', metal: 0.5, rough: 0.4 },
  { id: 'sphinx', name: 'Sphinx', price: 550, set: 'Égypte', body: '#1f5c47', accent: '#51c5ec', pattern: 'marble', metal: 0.5, rough: 0.4 },
  { id: 'anubis', name: 'Anubis', price: 650, set: 'Égypte', body: '#5c1f34', accent: '#ec7551', pattern: 'filigree', metal: 0.5, rough: 0.4 },
  { id: 'ildhorus', name: 'Œil d\'Horus', price: 900, set: 'Égypte', body: '#07131d', accent: '#6933ff', glow: true, pattern: 'rings', metal: 0.65, rough: 0.3 },
  { id: 'masquedor', name: 'Masque d\'or', price: 1100, set: 'Égypte', body: '#1d0716', accent: '#ff4b33', glow: true, pattern: 'filigree', metal: 0.65, rough: 0.3 },
  { id: 'soleildera', name: 'Soleil de Râ', price: 1700, set: 'Égypte', body: '#0b071d', accent: '#ff33f8', glow: true, pattern: 'stars', metal: 0.85, rough: 0.18 },
  { id: 'fjord', name: 'Fjord', price: 250, set: 'Vikings', body: '#466b91', accent: '#818fda', pattern: 'waves', metal: 0.35, rough: 0.55 },
  { id: 'bouclierrond', name: 'Bouclier rond', price: 300, set: 'Vikings', body: '#3f4783', accent: '#9481da', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'hache', name: 'Hache', price: 300, set: 'Vikings', body: '#386d75', accent: '#81b0da', pattern: 'shards', metal: 0.35, rough: 0.55 },
  { id: 'runes', name: 'Runes', price: 350, set: 'Vikings', body: '#553267', accent: '#d981da', pattern: 'chevron', metal: 0.35, rough: 0.55 },
  { id: 'drakkar', name: 'Drakkar', price: 450, set: 'Vikings', body: '#1f5c4e', accent: '#51b5ec', pattern: 'stripes', metal: 0.5, rough: 0.4 },
  { id: 'loupblanc', name: 'Loup blanc', price: 550, set: 'Vikings', body: '#5c1f42', accent: '#ec5151', pattern: 'camo', metal: 0.5, rough: 0.4 },
  { id: 'valkyrie', name: 'Valkyrie', price: 650, set: 'Vikings', body: '#1f5c37', accent: '#51ece9', pattern: 'petals', metal: 0.5, rough: 0.4 },
  { id: 'tonnerredunord', name: 'Tonnerre du nord', price: 900, set: 'Vikings', body: '#1d0b07', accent: '#fcff33', glow: true, pattern: 'cracks', metal: 0.65, rough: 0.3 },
  { id: 'yggdrasil', name: 'Yggdrasil', price: 1100, set: 'Vikings', body: '#071d08', accent: '#33ffe4', glow: true, pattern: 'web', metal: 0.65, rough: 0.3 },
  { id: 'ragnarok', name: 'Ragnarök', price: 1700, set: 'Vikings', body: '#1d1b07', accent: '#5fff33', glow: true, animated: 'hue', pattern: 'flames', metal: 0.85, rough: 0.18 },
  { id: 'laiton', name: 'Laiton', price: 250, set: 'Steampunk', body: '#916946', accent: '#dac881', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'rivet', name: 'Rivet', price: 300, set: 'Steampunk', body: '#83793f', accent: '#cada81', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'manometre', name: 'Manomètre', price: 300, set: 'Steampunk', body: '#753e38', accent: '#daa781', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'dirigeable', name: 'Dirigeable', price: 350, set: 'Steampunk', body: '#466732', accent: '#85da81', pattern: 'stripes', metal: 0.35, rough: 0.55 },
  { id: 'chaudiere', name: 'Chaudière', price: 450, set: 'Steampunk', body: '#5c1f2f', accent: '#ec8251', pattern: 'hex', metal: 0.5, rough: 0.4 },
  { id: 'automate', name: 'Automate', price: 550, set: 'Steampunk', body: '#1f5c36', accent: '#51ece6', pattern: 'circuit', metal: 0.5, rough: 0.4 },
  { id: 'locomotive', name: 'Locomotive', price: 650, set: 'Steampunk', body: '#5c1f45', accent: '#ec5158', pattern: 'lines', metal: 0.5, rough: 0.4 },
  { id: 'moteuravapeur', name: 'Moteur à vapeur', price: 900, set: 'Steampunk', body: '#07191d', accent: '#3336ff', glow: true, pattern: 'hex', metal: 0.65, rough: 0.3 },
  { id: 'chronographe', name: 'Chronographe', price: 1100, set: 'Steampunk', body: '#1d071d', accent: '#ff3355', glow: true, pattern: 'rings', metal: 0.65, rough: 0.3 },
  { id: 'machineinfernale', name: 'Machine infernale', price: 1700, set: 'Steampunk', body: '#07091d', accent: '#cc33ff', glow: true, pattern: 'circuit', metal: 0.85, rough: 0.18 },
  { id: 'citronvert', name: 'Citron vert', price: 250, set: 'Bonbons acides', body: '#914691', accent: '#da81bc', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'framboise', name: 'Framboise', price: 300, set: 'Bonbons acides', body: '#833f69', accent: '#da819a', pattern: 'bubbles', metal: 0.35, rough: 0.55 },
  { id: 'pommeverte', name: 'Pomme verte', price: 300, set: 'Bonbons acides', body: '#5f3875', accent: '#d781da', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'cerise', name: 'Cerise', price: 350, set: 'Bonbons acides', body: '#673a32', accent: '#daac81', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'sorbet', name: 'Sorbet', price: 450, set: 'Bonbons acides', body: '#2f1f5c', accent: '#d451ec', pattern: 'marble', metal: 0.5, rough: 0.4 },
  { id: 'petillant', name: 'Pétillant', price: 550, set: 'Bonbons acides', body: '#5c571f', accent: '#9eec51', pattern: 'bubbles', metal: 0.5, rough: 0.4 },
  { id: 'gelifie', name: 'Gélifié', price: 650, set: 'Bonbons acides', body: '#1f255c', accent: '#9c51ec', alt: '#e0d252', pattern: 'splatter', metal: 0.5, rough: 0.4 },
  { id: 'acidefluo', name: 'Acide fluo', price: 900, set: 'Bonbons acides', body: '#0e1d07', accent: '#33ff9c', glow: true, pattern: 'glitch', metal: 0.65, rough: 0.3 },
  { id: 'fizz', name: 'Fizz', price: 1100, set: 'Bonbons acides', body: '#07111d', accent: '#7e33ff', glow: true, pattern: 'bubbles', metal: 0.65, rough: 0.3 },
  { id: 'megaacide', name: 'Méga acide', price: 1700, set: 'Bonbons acides', body: '#071d11', accent: '#33c5ff', alt: '#e052a0', glow: true, pattern: 'splatter', metal: 0.85, rough: 0.18 },
  { id: 'plancton', name: 'Plancton', price: 250, set: 'Abysses', body: '#467e91', accent: '#81a6da', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'anemone', name: 'Anémone', price: 300, set: 'Abysses', body: '#3f5883', accent: '#8184da', pattern: 'petals', metal: 0.35, rough: 0.55 },
  { id: 'poulpe', name: 'Poulpe', price: 300, set: 'Abysses', body: '#38756e', accent: '#81c7da', pattern: 'bubbles', metal: 0.35, rough: 0.55 },
  { id: 'lanterneabyssale', name: 'Lanterne abyssale', price: 350, set: 'Abysses', body: '#473267', accent: '#c281da', pattern: 'stars', metal: 0.35, rough: 0.55 },
  { id: 'fosse', name: 'Fosse', price: 450, set: 'Abysses', body: '#1f5c3e', accent: '#51dcec', pattern: 'topo', metal: 0.5, rough: 0.4 },
  { id: 'calmargeant', name: 'Calmar géant', price: 550, set: 'Abysses', body: '#5c1f52', accent: '#ec5177', pattern: 'waves', metal: 0.5, rough: 0.4 },
  { id: 'requin', name: 'Requin', price: 650, set: 'Abysses', body: '#1f5c28', accent: '#51ecc2', pattern: 'scales', metal: 0.5, rough: 0.4 },
  { id: 'pression', name: 'Pression', price: 900, set: 'Abysses', body: '#1d0709', accent: '#ffcf33', glow: true, pattern: 'rings', metal: 0.65, rough: 0.3 },
  { id: 'bioluminescence', name: 'Bioluminescence', price: 1100, set: 'Abysses', body: '#0c1d07', accent: '#33ffb1', glow: true, pattern: 'stars', metal: 0.65, rough: 0.3 },
  { id: 'leviathan', name: 'Léviathan', price: 1700, set: 'Abysses', body: '#1d1607', accent: '#92ff33', glow: true, animated: 'hue', pattern: 'scales', metal: 0.85, rough: 0.18 },
  { id: 'sel', name: 'Sel', price: 250, set: 'Désert de sel', body: '#915f46', accent: '#dabc81', pattern: 'marble', metal: 0.35, rough: 0.55 },
  { id: 'mirageblanc', name: 'Mirage blanc', price: 300, set: 'Désert de sel', body: '#83703f', accent: '#d6da81', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'croute', name: 'Croûte', price: 300, set: 'Désert de sel', body: '#75383a', accent: '#da9b81', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'ventsec', name: 'Vent sec', price: 350, set: 'Désert de sel', body: '#4d6732', accent: '#91da81', pattern: 'lines', metal: 0.35, rough: 0.55 },
  { id: 'caravanedesel', name: 'Caravane de sel', price: 450, set: 'Désert de sel', body: '#5c1f37', accent: '#ec6d51', pattern: 'stripes', metal: 0.5, rough: 0.4 },
  { id: 'cristaldesel', name: 'Cristal de sel', price: 550, set: 'Désert de sel', body: '#1f5c2e', accent: '#51ecd2', pattern: 'shards', metal: 0.5, rough: 0.4 },
  { id: 'echo', name: 'Écho', price: 650, set: 'Désert de sel', body: '#5c1f4e', accent: '#ec516d', pattern: 'rings', metal: 0.5, rough: 0.4 },
  { id: 'tempeteblanche', name: 'Tempête blanche', price: 900, set: 'Désert de sel', body: '#071c1d', accent: '#3352ff', glow: true, pattern: 'waves', metal: 0.65, rough: 0.3 },
  { id: 'lacasseche', name: 'Lac asséché', price: 1100, set: 'Désert de sel', body: '#1a071d', accent: '#ff3370', glow: true, pattern: 'topo', metal: 0.65, rough: 0.3 },
  { id: 'desertinfini', name: 'Désert infini', price: 1700, set: 'Désert de sel', body: '#070c1d', accent: '#b133ff', glow: true, pattern: 'topo', metal: 0.85, rough: 0.18 },
  { id: 'motel', name: 'Motel', price: 250, set: 'Néon rétro', body: '#91467e', accent: '#da81a6', pattern: 'stripes', metal: 0.35, rough: 0.55 },
  { id: 'jukeboxneon', name: 'Juke-box néon', price: 300, set: 'Néon rétro', body: '#833f58', accent: '#da8184', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'diner', name: 'Diner', price: 300, set: 'Néon rétro', body: '#6e3875', accent: '#da81c7', pattern: 'checker', metal: 0.35, rough: 0.55 },
  { id: 'roller', name: 'Roller', price: 350, set: 'Néon rétro', body: '#674732', accent: '#dac281', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'cassette', name: 'Cassette', price: 450, set: 'Néon rétro', body: '#3e1f5c', accent: '#ec51dc', pattern: 'lines', metal: 0.5, rough: 0.4 },
  { id: 'palmierneon', name: 'Palmier néon', price: 550, set: 'Néon rétro', body: '#525c1f', accent: '#77ec51', pattern: 'petals', metal: 0.5, rough: 0.4 },
  { id: 'couchersynthetique', name: 'Coucher synthétique', price: 650, set: 'Néon rétro', body: '#281f5c', accent: '#c251ec', pattern: 'grid', metal: 0.5, rough: 0.4 },
  { id: 'boulevard', name: 'Boulevard', price: 900, set: 'Néon rétro', body: '#091d07', accent: '#33ffcf', glow: true, pattern: 'grid', metal: 0.65, rough: 0.3 },
  { id: 'enseigne', name: 'Enseigne', price: 1100, set: 'Néon rétro', body: '#070c1d', accent: '#b133ff', glow: true, pattern: 'lines', metal: 0.65, rough: 0.3 },
  { id: 'nuitelectrique', name: 'Nuit électrique', price: 1700, set: 'Néon rétro', body: '#071d16', accent: '#3392ff', glow: true, pattern: 'circuit', metal: 0.85, rough: 0.18 },
  { id: 'parchemin', name: 'Parchemin', price: 250, set: 'Fantasy', body: '#654691', accent: '#c481da', pattern: 'topo', metal: 0.35, rough: 0.55 },
  { id: 'potion', name: 'Potion', price: 300, set: 'Fantasy', body: '#753f83', accent: '#da81ce', pattern: 'bubbles', metal: 0.35, rough: 0.55 },
  { id: 'grimoire', name: 'Grimoire', price: 300, set: 'Fantasy', body: '#3b3875', accent: '#a381da', pattern: 'filigree', metal: 0.35, rough: 0.55 },
  { id: 'elfe', name: 'Elfe', price: 350, set: 'Fantasy', body: '#673249', accent: '#da8189', pattern: 'petals', metal: 0.35, rough: 0.55 },
  { id: 'fee', name: 'Fée', price: 450, set: 'Fantasy', body: '#1f325c', accent: '#7a51ec', pattern: 'stars', metal: 0.5, rough: 0.4 },
  { id: 'licorne', name: 'Licorne', price: 550, set: 'Fantasy', body: '#5c331f', accent: '#ecdf51', pattern: 'fade', metal: 0.5, rough: 0.4 },
  { id: 'mage', name: 'Mage', price: 650, set: 'Fantasy', body: '#1f485c', accent: '#5160ec', pattern: 'stars', metal: 0.5, rough: 0.4 },
  { id: 'dragondemeraude', name: 'Dragon d\'émeraude', price: 900, set: 'Fantasy', body: '#1a1d07', accent: '#41ff33', glow: true, pattern: 'scales', metal: 0.65, rough: 0.3 },
  { id: 'couronneelfique', name: 'Couronne elfique', price: 1100, set: 'Fantasy', body: '#071d1b', accent: '#335fff', glow: true, pattern: 'filigree', metal: 0.65, rough: 0.3 },
  { id: 'arcanesupreme', name: 'Arcane suprême', price: 1700, set: 'Fantasy', body: '#0a1d07', accent: '#33ffc2', glow: true, animated: 'hue', pattern: 'web', metal: 0.85, rough: 0.18 },
  { id: 'satellite', name: 'Satellite', price: 250, set: 'Espace profond', body: '#465291', accent: '#8f81da', pattern: 'grid', metal: 0.35, rough: 0.55 },
  { id: 'combinaison', name: 'Combinaison', price: 300, set: 'Espace profond', body: '#4e3f83', accent: '#b281da', pattern: 'fade', metal: 0.35, rough: 0.55 },
  { id: 'lunegrise', name: 'Lune grise', price: 300, set: 'Espace profond', body: '#385975', accent: '#8192da', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'stationorbitale', name: 'Station orbitale', price: 350, set: 'Espace profond', body: '#663267', accent: '#da81be', pattern: 'hex', metal: 0.35, rough: 0.55 },
  { id: 'pulsarlointain', name: 'Pulsar lointain', price: 450, set: 'Espace profond', body: '#1f565c', accent: '#5182ec', pattern: 'rings', metal: 0.5, rough: 0.4 },
  { id: 'eruptionsolaire', name: 'Éruption solaire', price: 550, set: 'Espace profond', body: '#5c1f2e', accent: '#ec8451', pattern: 'flames', metal: 0.5, rough: 0.4 },
  { id: 'ceinturedasteroides', name: 'Ceinture d\'astéroïdes', price: 650, set: 'Espace profond', body: '#1f5c4b', accent: '#51bbec', pattern: 'dots', metal: 0.5, rough: 0.4 },
  { id: 'supernova', name: 'Supernova', price: 900, set: 'Espace profond', body: '#1d1207', accent: '#b8ff33', glow: true, pattern: 'stars', metal: 0.65, rough: 0.3 },
  { id: 'horizondesevenements', name: 'Horizon des événements', price: 1100, set: 'Espace profond', body: '#071d0f', accent: '#33d6ff', glow: true, pattern: 'rings', metal: 0.65, rough: 0.3 },
  { id: 'multivers', name: 'Multivers', price: 1700, set: 'Espace profond', body: '#161d07', accent: '#33ff4b', glow: true, pattern: 'web', metal: 0.85, rough: 0.18 },
  { id: 'liane', name: 'Liane', price: 250, set: 'Jungle sauvage', body: '#529146', accent: '#81da8f', pattern: 'waves', metal: 0.35, rough: 0.55 },
  { id: 'fougeregeante', name: 'Fougère géante', price: 300, set: 'Jungle sauvage', body: '#3f834e', accent: '#81dab2', pattern: 'petals', metal: 0.35, rough: 0.55 },
  { id: 'grenouille', name: 'Grenouille', price: 300, set: 'Jungle sauvage', body: '#597538', accent: '#92da81', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'perroquet', name: 'Perroquet', price: 350, set: 'Jungle sauvage', body: '#326766', accent: '#81beda', pattern: 'stripes', metal: 0.35, rough: 0.55 },
  { id: 'pantherenoire', name: 'Panthère noire', price: 450, set: 'Jungle sauvage', body: '#565c1f', accent: '#82ec51', alt: '#6052e0', pattern: 'leopard', metal: 0.5, rough: 0.4 },
  { id: 'orchidee', name: 'Orchidée', price: 550, set: 'Jungle sauvage', body: '#1f2e5c', accent: '#8451ec', pattern: 'petals', metal: 0.5, rough: 0.4 },
  { id: 'serpentcorail', name: 'Serpent corail', price: 650, set: 'Jungle sauvage', body: '#5c4b1f', accent: '#bbec51', pattern: 'scales', metal: 0.5, rough: 0.4 },
  { id: 'templeperdu', name: 'Temple perdu', price: 900, set: 'Jungle sauvage', body: '#12071d', accent: '#ff33b8', glow: true, pattern: 'cracks', metal: 0.65, rough: 0.3 },
  { id: 'canopee', name: 'Canopée', price: 1100, set: 'Jungle sauvage', body: '#1d0f07', accent: '#d6ff33', glow: true, pattern: 'camo', metal: 0.65, rough: 0.3 },
  { id: 'espritdelajungle', name: 'Esprit de la jungle', price: 1700, set: 'Jungle sauvage', body: '#1d0716', accent: '#ff4b33', glow: true, pattern: 'web', metal: 0.85, rough: 0.18 },
  { id: 'givreleger', name: 'Givre léger', price: 250, set: 'Glace éternelle', body: '#467e91', accent: '#81a6da', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'stalactite', name: 'Stalactite', price: 300, set: 'Glace éternelle', body: '#3f5883', accent: '#8184da', pattern: 'shards', metal: 0.35, rough: 0.55 },
  { id: 'auroreboreale', name: 'Aurore boréale', price: 300, set: 'Glace éternelle', body: '#38756e', accent: '#81c7da', pattern: 'waves', metal: 0.35, rough: 0.55 },
  { id: 'lacgele', name: 'Lac gelé', price: 350, set: 'Glace éternelle', body: '#473267', accent: '#c281da', pattern: 'marble', metal: 0.35, rough: 0.55 },
  { id: 'mammouth', name: 'Mammouth', price: 450, set: 'Glace éternelle', body: '#1f5c3e', accent: '#51dcec', pattern: 'camo', metal: 0.5, rough: 0.4 },
  { id: 'blizzard', name: 'Blizzard', price: 550, set: 'Glace éternelle', body: '#5c1f52', accent: '#ec5177', pattern: 'lines', metal: 0.5, rough: 0.4 },
  { id: 'curdeglace', name: 'Cœur de glace', price: 650, set: 'Glace éternelle', body: '#1f5c28', accent: '#51ecc2', pattern: 'shards', metal: 0.5, rough: 0.4 },
  { id: 'banquisenoire', name: 'Banquise noire', price: 900, set: 'Glace éternelle', body: '#1d0709', accent: '#ffcf33', glow: true, pattern: 'cracks', metal: 0.65, rough: 0.3 },
  { id: 'reinedesneiges', name: 'Reine des neiges', price: 1100, set: 'Glace éternelle', body: '#0c1d07', accent: '#33ffb1', glow: true, pattern: 'petals', metal: 0.65, rough: 0.3 },
  { id: 'ereglaciaire', name: 'Ère glaciaire', price: 1700, set: 'Glace éternelle', body: '#1d1607', accent: '#92ff33', glow: true, animated: 'hue', pattern: 'ice', metal: 0.85, rough: 0.18 },
  { id: 'beton', name: 'Béton', price: 250, set: 'Urbain', body: '#914646', accent: '#da9e81', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'asphalte', name: 'Asphalte', price: 300, set: 'Urbain', body: '#83593f', accent: '#dac181', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'graffiti', name: 'Graffiti', price: 300, set: 'Urbain', body: '#75384f', accent: '#da8184', alt: '#52e0ac', pattern: 'splatter', metal: 0.35, rough: 0.55 },
  { id: 'brique', name: 'Brique', price: 350, set: 'Urbain', body: '#5f6732', accent: '#afda81', pattern: 'checker', metal: 0.35, rough: 0.55 },
  { id: 'metro', name: 'Métro', price: 450, set: 'Urbain', body: '#5c1f4b', accent: '#ec5168', pattern: 'lines', metal: 0.5, rough: 0.4 },
  { id: 'neonderue', name: 'Néon de rue', price: 550, set: 'Urbain', body: '#245c1f', accent: '#51ec9e', pattern: 'stripes', metal: 0.5, rough: 0.4 },
  { id: 'gratteciel', name: 'Gratte-ciel', price: 650, set: 'Urbain', body: '#561f5c', accent: '#ec51a1', pattern: 'grid', metal: 0.5, rough: 0.4 },
  { id: 'toitslanuit', name: 'Toits la nuit', price: 900, set: 'Urbain', body: '#071d16', accent: '#3396ff', glow: true, pattern: 'stars', metal: 0.65, rough: 0.3 },
  { id: 'skyline', name: 'Skyline', price: 1100, set: 'Urbain', body: '#13071d', accent: '#ff33b4', glow: true, pattern: 'grid', metal: 0.65, rough: 0.3 },
  { id: 'villequinedortjamais', name: 'Ville qui ne dort jamais', price: 1700, set: 'Urbain', body: '#07131d', accent: '#6d33ff', glow: true, pattern: 'circuit', metal: 0.85, rough: 0.18 },
  { id: 'pasteque', name: 'Pastèque', price: 250, set: 'Fruits', body: '#915846', accent: '#dab581', pattern: 'stripes', metal: 0.35, rough: 0.55 },
  { id: 'kiwi', name: 'Kiwi', price: 300, set: 'Fruits', body: '#836a3f', accent: '#dad781', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'ananas', name: 'Ananas', price: 300, set: 'Fruits', body: '#75383f', accent: '#da9481', pattern: 'hex', metal: 0.35, rough: 0.55 },
  { id: 'myrtille', name: 'Myrtille', price: 350, set: 'Fruits', body: '#526732', accent: '#98da81', pattern: 'bubbles', metal: 0.35, rough: 0.55 },
  { id: 'orangesanguine', name: 'Orange sanguine', price: 450, set: 'Fruits', body: '#5c1f3c', accent: '#ec6051', pattern: 'fade', metal: 0.5, rough: 0.4 },
  { id: 'figue', name: 'Figue', price: 550, set: 'Fruits', body: '#1f5c29', accent: '#51ecc5', pattern: 'marble', metal: 0.5, rough: 0.4 },
  { id: 'grenade', name: 'Grenade', price: 650, set: 'Fruits', body: '#5c1f53', accent: '#ec517a', pattern: 'bubbles', metal: 0.5, rough: 0.4 },
  { id: 'fruitdudragon', name: 'Fruit du dragon', price: 900, set: 'Fruits', body: '#071d1b', accent: '#3363ff', glow: true, pattern: 'scales', metal: 0.65, rough: 0.3 },
  { id: 'manguedoree', name: 'Mangue dorée', price: 1100, set: 'Fruits', body: '#18071d', accent: '#ff3381', glow: true, pattern: 'fade', metal: 0.65, rough: 0.3 },
  { id: 'corbeilleroyale', name: 'Corbeille royale', price: 1700, set: 'Fruits', body: '#070e1d', accent: '#a033ff', glow: true, pattern: 'filigree', metal: 0.85, rough: 0.18 },
  { id: 'blason', name: 'Blason', price: 250, set: 'Héraldique', body: '#465f91', accent: '#8181da', pattern: 'chevron', metal: 0.35, rough: 0.55 },
  { id: 'ecu', name: 'Écu', price: 300, set: 'Héraldique', body: '#423f83', accent: '#a381da', pattern: 'checker', metal: 0.35, rough: 0.55 },
  { id: 'liondor', name: 'Lion d\'or', price: 300, set: 'Héraldique', body: '#386375', accent: '#81a1da', pattern: 'filigree', metal: 0.35, rough: 0.55 },
  { id: 'fleurdelys', name: 'Fleur de lys', price: 350, set: 'Héraldique', body: '#5d3267', accent: '#da81cd', pattern: 'petals', metal: 0.35, rough: 0.55 },
  { id: 'tour', name: 'Tour', price: 450, set: 'Héraldique', body: '#1f5c58', accent: '#519cec', pattern: 'checker', metal: 0.5, rough: 0.4 },
  { id: 'griffondargent', name: 'Griffon d\'argent', price: 550, set: 'Héraldique', body: '#5c1f38', accent: '#ec6a51', pattern: 'filigree', metal: 0.5, rough: 0.4 },
  { id: 'ecarlate', name: 'Écarlate', price: 650, set: 'Héraldique', body: '#1f5c41', accent: '#51d4ec', pattern: 'stripes', metal: 0.5, rough: 0.4 },
  { id: 'banniere', name: 'Bannière', price: 900, set: 'Héraldique', body: '#1d0f07', accent: '#daff33', glow: true, pattern: 'chevron', metal: 0.65, rough: 0.3 },
  { id: 'ordreroyal', name: 'Ordre royal', price: 1100, set: 'Héraldique', body: '#071d0b', accent: '#33f8ff', glow: true, pattern: 'filigree', metal: 0.65, rough: 0.3 },
  { id: 'hautlignage', name: 'Haut lignage', price: 1700, set: 'Héraldique', body: '#1a1d07', accent: '#3dff33', glow: true, animated: 'hue', pattern: 'filigree', metal: 0.85, rough: 0.18 },
  { id: 'ecrou', name: 'Écrou', price: 250, set: 'Rouages', body: '#917846', accent: '#dada81', pattern: 'hex', metal: 0.35, rough: 0.55 },
  { id: 'ressort', name: 'Ressort', price: 300, set: 'Rouages', body: '#7f833f', accent: '#b8da81', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'aiguille', name: 'Aiguille', price: 300, set: 'Rouages', body: '#754b38', accent: '#dab981', pattern: 'lines', metal: 0.35, rough: 0.55 },
  { id: 'cadran', name: 'Cadran', price: 350, set: 'Rouages', body: '#3c6732', accent: '#81da8e', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'balancier', name: 'Balancier', price: 450, set: 'Rouages', body: '#5c1f23', accent: '#eca151', pattern: 'waves', metal: 0.5, rough: 0.4 },
  { id: 'remontoir', name: 'Remontoir', price: 550, set: 'Rouages', body: '#1f5c42', accent: '#51d2ec', pattern: 'rings', metal: 0.5, rough: 0.4 },
  { id: 'tourbillon', name: 'Tourbillon', price: 650, set: 'Rouages', body: '#5c1f39', accent: '#ec6851', pattern: 'rings', metal: 0.5, rough: 0.4 },
  { id: 'mouvementdore', name: 'Mouvement doré', price: 900, set: 'Rouages', body: '#07151d', accent: '#5833ff', glow: true, pattern: 'hex', metal: 0.65, rough: 0.3 },
  { id: 'grandecomplication', name: 'Grande complication', price: 1100, set: 'Rouages', body: '#1d0718', accent: '#ff3a33', glow: true, pattern: 'circuit', metal: 0.65, rough: 0.3 },
  { id: 'tempssuspendu', name: 'Temps suspendu', price: 1700, set: 'Rouages', body: '#0a071d', accent: '#f533ff', glow: true, pattern: 'rings', metal: 0.85, rough: 0.18 },
  { id: 'fumerolle', name: 'Fumerolle', price: 250, set: 'Volcans sous-marins', body: '#915246', accent: '#daad81', pattern: 'bubbles', metal: 0.35, rough: 0.55 },
  { id: 'basaltemarin', name: 'Basalte marin', price: 300, set: 'Volcans sous-marins', body: '#83643f', accent: '#dad081', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'chemineenoire', name: 'Cheminée noire', price: 300, set: 'Volcans sous-marins', body: '#753844', accent: '#da8c81', pattern: 'topo', metal: 0.35, rough: 0.55 },
  { id: 'lavefroide', name: 'Lave froide', price: 350, set: 'Volcans sous-marins', body: '#566732', accent: '#a0da81', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'coulee', name: 'Coulée', price: 450, set: 'Volcans sous-marins', body: '#5c1f41', accent: '#ec5351', pattern: 'flames', metal: 0.5, rough: 0.4 },
  { id: 'geyser', name: 'Geyser', price: 550, set: 'Volcans sous-marins', body: '#1f5c24', accent: '#51ecb8', pattern: 'bubbles', metal: 0.5, rough: 0.4 },
  { id: 'magmableu', name: 'Magma bleu', price: 650, set: 'Volcans sous-marins', body: '#5c1f58', accent: '#ec5187', pattern: 'cracks', metal: 0.5, rough: 0.4 },
  { id: 'dorsale', name: 'Dorsale', price: 900, set: 'Volcans sous-marins', body: '#071d19', accent: '#3374ff', glow: true, pattern: 'topo', metal: 0.65, rough: 0.3 },
  { id: 'feudesgrandsfonds', name: 'Feu des grands fonds', price: 1100, set: 'Volcans sous-marins', body: '#16071d', accent: '#ff3392', glow: true, pattern: 'flames', metal: 0.65, rough: 0.3 },
  { id: 'titansousmarin', name: 'Titan sous-marin', price: 1700, set: 'Volcans sous-marins', body: '#070f1d', accent: '#8f33ff', glow: true, pattern: 'shards', metal: 0.85, rough: 0.18 },
  { id: 'rideaurouge', name: 'Rideau rouge', price: 250, set: 'Opéra', body: '#91465f', accent: '#da8181', pattern: 'stripes', metal: 0.35, rough: 0.55 },
  { id: 'partition', name: 'Partition', price: 300, set: 'Opéra', body: '#83423f', accent: '#daa381', pattern: 'lines', metal: 0.35, rough: 0.55 },
  { id: 'veloursbordeaux', name: 'Velours bordeaux', price: 300, set: 'Opéra', body: '#753863', accent: '#da81a1', pattern: 'marble', metal: 0.35, rough: 0.55 },
  { id: 'lustre', name: 'Lustre', price: 350, set: 'Opéra', body: '#675d32', accent: '#cdda81', pattern: 'stars', metal: 0.35, rough: 0.55 },
  { id: 'masquedebal', name: 'Masque de bal', price: 450, set: 'Opéra', body: '#581f5c', accent: '#ec519c', pattern: 'filigree', metal: 0.5, rough: 0.4 },
  { id: 'tenor', name: 'Ténor', price: 550, set: 'Opéra', body: '#385c1f', accent: '#51ec6a', pattern: 'rings', metal: 0.5, rough: 0.4 },
  { id: 'diva', name: 'Diva', price: 650, set: 'Opéra', body: '#411f5c', accent: '#ec51d4', pattern: 'petals', metal: 0.5, rough: 0.4 },
  { id: 'grandfinal', name: 'Grand final', price: 900, set: 'Opéra', body: '#071d0f', accent: '#33daff', glow: true, pattern: 'stars', metal: 0.65, rough: 0.3 },
  { id: 'fantomedelascene', name: 'Fantôme de la scène', price: 1100, set: 'Opéra', body: '#0b071d', accent: '#ff33f8', glow: true, pattern: 'web', metal: 0.65, rough: 0.3 },
  { id: 'ovation', name: 'Ovation', price: 1700, set: 'Opéra', body: '#071a1d', accent: '#333dff', glow: true, animated: 'hue', pattern: 'filigree', metal: 0.85, rough: 0.18 },
  { id: 'fildecuivre', name: 'Fil de cuivre', price: 250, set: 'Électrique', body: '#918a46', accent: '#c4da81', pattern: 'lines', metal: 0.35, rough: 0.55 },
  { id: 'prise', name: 'Prise', price: 300, set: 'Électrique', body: '#6e833f', accent: '#a1da81', pattern: 'dots', metal: 0.35, rough: 0.55 },
  { id: 'ampoule', name: 'Ampoule', price: 300, set: 'Électrique', body: '#755a38', accent: '#dad081', pattern: 'rings', metal: 0.35, rough: 0.55 },
  { id: 'courtcircuit', name: 'Court-circuit', price: 350, set: 'Électrique', body: '#326735', accent: '#81daa4', pattern: 'cracks', metal: 0.35, rough: 0.55 },
  { id: 'bobine', name: 'Bobine', price: 450, set: 'Électrique', body: '#5c2a1f', accent: '#ecc751', pattern: 'rings', metal: 0.5, rough: 0.4 },
  { id: 'hautetension', name: 'Haute tension', price: 550, set: 'Électrique', body: '#1f5c52', accent: '#51abec', pattern: 'lines', metal: 0.5, rough: 0.4 },
  { id: 'arcelectrique', name: 'Arc électrique', price: 650, set: 'Électrique', body: '#5c1f2a', accent: '#ec8f51', pattern: 'cracks', metal: 0.5, rough: 0.4 },
  { id: 'tesla', name: 'Tesla', price: 900, set: 'Électrique', body: '#07101d', accent: '#8b33ff', glow: true, pattern: 'circuit', metal: 0.65, rough: 0.3 },
  { id: 'oragemagnetique', name: 'Orage magnétique', price: 1100, set: 'Électrique', body: '#1d0713', accent: '#ff6d33', glow: true, pattern: 'glitch', metal: 0.65, rough: 0.3 },
  { id: 'surtension', name: 'Surtension', price: 1700, set: 'Électrique', body: '#0f071d', accent: '#ff33d6', glow: true, pattern: 'glitch', metal: 0.85, rough: 0.18 },
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

// boîtes de skins (1.36) : payées en Éclats (jamais en argent réel), tirage fait par le serveur, chances affichées.
// On reçoit un skin de la rareté tirée qu'on ne possède pas encore ; si on a déjà toute cette rareté : la moitié de son prix en Éclats.
export const BOXES = {
  small: { name: 'Petite boîte', price: 300, color: '#9aa3ad', odds: { common: 70, rare: 25, epic: 4.5, legendary: 0.5 } },
  big: { name: 'Grosse boîte', price: 600, color: '#3d9bff', odds: { common: 40, rare: 40, epic: 16, legendary: 4 } },
  mega: { name: 'Méga boîte', price: 1000, color: '#b05cff', odds: { rare: 50, epic: 38, legendary: 12 } },
  ultra: { name: 'Ultra boîte', price: 1600, color: '#ffb11f', odds: { epic: 60, legendary: 40 } },
};
export const boxPool = r => SKINS.filter(s => s.id !== 'default' && !s.level && rarityOf(s) === r);

export const REWARDS = { kill: 10, roundWin: 15, matchWin: 150, matchPlayed: 50 };

// moments annoncés en partie (1.15) : nom affiché, XP de base (× réglage de l'administration),

export function sideOf(team, half) {
  if (team === 'ffa') return 'ffa';
  const first = team === 'alpha' ? 'atk' : 'def';
  return half === 0 ? first : (first === 'atk' ? 'def' : 'atk');
}
