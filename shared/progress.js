// Progression partagée client/serveur : niveaux, déblocages, quêtes, succès, titres, rangs Elo, messages radio.

export const MAX_LEVEL = 100;
// XP nécessaire pour passer du niveau L au niveau L+1
export const xpToNext = level => 300 + level * 100;
export function levelInfo(xp) {
  let level = 1, rest = Math.max(0, Math.floor(xp || 0));
  while (level < MAX_LEVEL && rest >= xpToNext(level)) { rest -= xpToNext(level); level++; }
  return { level, cur: rest, need: level >= MAX_LEVEL ? 0 : xpToNext(level) };
}
export const levelOf = xp => levelInfo(xp).level;
export function xpForLevel(level) { let t = 0; for (let l = 1; l < level; l++) t += xpToNext(l); return t; }
// Éclats offerts à chaque passage de niveau
export const levelReward = level => 50 + level * 10;

// Armes débloquées par niveau (le niveau 1 a déjà les pistolets)
// (Assaut et Duel uniquement : en Mêlée, tout le monde reçoit l'équipement complet)
export const WEAPON_UNLOCK = { spark: 1, hornet: 1, viper: 2, brute: 2, tempest: 3, lancer: 3, longbow: 5 };
// Skins exclusifs de niveau (définis dans SKINS avec un champ level)
export const LEVEL_SKINS = { 5: 'recrue', 10: 'veteran', 20: 'elite', 30: 'legende', 40: 'maitre', 50: 'eclipse' };
// bannières de profil : débloquées en montant de niveau
export const BANNERS = {
  nuit: { name: 'Nuit', level: 1, css: 'linear-gradient(135deg,#141a2e,#0b0f1b)' },
  aube: { name: 'Aube', level: 3, css: 'linear-gradient(135deg,#ff8a5c,#8b5cff)' },
  ocean: { name: 'Océan', level: 5, css: 'linear-gradient(135deg,#0f5e8c,#19e3c4)' },
  braise: { name: 'Braise', level: 8, css: 'linear-gradient(135deg,#5a0f0f,#ff6a1f)' },
  foret: { name: 'Forêt', level: 12, css: 'linear-gradient(135deg,#0d3b23,#7dff6b)' },
  glace: { name: 'Glace', level: 16, css: 'linear-gradient(135deg,#bfefff,#3d8bff)' },
  neon: { name: 'Néon', level: 20, css: 'linear-gradient(135deg,#ff2f9d,#3d00ff)' },
  or: { name: 'Or', level: 30, css: 'linear-gradient(135deg,#7a5a00,#ffd23f)' },
  eclipse: { name: 'Éclipse', level: 40, css: 'radial-gradient(circle at 30% 40%,#ffd23f 0 12%,#1a1030 13% 100%)' },
};
export const ENDORSE = { fairplay: 'Fair-play', leader: 'Meneur', equipier: 'Bon coéquipier' };
export const CHAT_EMOJI = { ':gg:': '👍', ':lol:': '😂', ':feu:': '🔥', ':rip:': '💀', ':ok:': '👌', ':coeur:': '❤️', ':cool:': '😎', ':oups:': '😮', ':gg2:': '🏆', ':non:': '❌' };

// XP gagnée en partie
export const XP = { match: 100, kill: 20, assist: 8, roundWin: 15, win: 150, plant: 25, defuse: 35, mvp: 75 };

// ---------- quêtes ----------
// stat : clé du résultat de partie qui fait avancer la quête
export const QUESTS = {
  d_play3:   { kind: 'daily', label: 'Jouer 3 parties', stat: 'matches', goal: 3 },
  d_win1:    { kind: 'daily', label: 'Gagner une partie', stat: 'wins', goal: 1 },
  d_kills15: { kind: 'daily', label: 'Réaliser 15 éliminations', stat: 'kills', goal: 15 },
  d_hs5:     { kind: 'daily', label: '5 éliminations à la tête', stat: 'hsKills', goal: 5 },
  d_knife1:  { kind: 'daily', label: 'Une élimination au couteau', stat: 'knifeKills', goal: 1 },
  d_duel1:   { kind: 'daily', label: 'Gagner un duel', stat: 'duelWins', goal: 1 },
  d_plant2:  { kind: 'daily', label: 'Poser le Noyau 2 fois', stat: 'plants', goal: 2 },
  d_abil10:  { kind: 'daily', label: 'Utiliser 10 capacités', stat: 'abilities', goal: 10 },
  d_dmg2000: { kind: 'daily', label: 'Infliger 2 000 dégâts', stat: 'dmg', goal: 2000 },
  d_ffa20:   { kind: 'daily', label: '20 éliminations en Mêlée', stat: 'ffaKills', goal: 20 },
  d_assist5: { kind: 'daily', label: '5 assistances', stat: 'assists', goal: 5 },
  w_win10:    { kind: 'weekly', label: 'Gagner 10 parties', stat: 'wins', goal: 10 },
  w_kills150: { kind: 'weekly', label: 'Réaliser 150 éliminations', stat: 'kills', goal: 150 },
  w_hs40:     { kind: 'weekly', label: '40 éliminations à la tête', stat: 'hsKills', goal: 40 },
  w_knife5:   { kind: 'weekly', label: '5 éliminations au couteau', stat: 'knifeKills', goal: 5 },
  w_duel5:    { kind: 'weekly', label: 'Gagner 5 duels', stat: 'duelWins', goal: 5 },
  w_defuse5:  { kind: 'weekly', label: 'Désamorcer le Noyau 5 fois', stat: 'defuses', goal: 5 },
  w_play25:   { kind: 'weekly', label: 'Jouer 25 parties', stat: 'matches', goal: 25 },
  w_dmg20k:   { kind: 'weekly', label: 'Infliger 20 000 dégâts', stat: 'dmg', goal: 20000 },
  w_ult15:    { kind: 'weekly', label: 'Utiliser 15 ultimes', stat: 'ults', goal: 15 },
  w_multi5:   { kind: 'weekly', label: '5 manches à 3 éliminations ou plus', stat: 'multi3', goal: 5 },
  d_moments2: { kind: 'daily', label: 'Réaliser 2 moments (vengeance, no-scope…)', stat: 'momentsN', goal: 2 },
  w_moments12: { kind: 'weekly', label: 'Réaliser 12 moments', stat: 'momentsN', goal: 12 },
};
export const QUEST_REWARD = { daily: { eclats: 120, xp: 250 }, weekly: { eclats: 500, xp: 1200 } };
export const QUESTS_PER = { daily: 3, weekly: 3 };

// ---------- succès ----------
// check(u) : u est le compte (stats, niveau, Elo, etc.)
export const ACHIEVEMENTS = [
  { id: 'first_win', label: 'Premier sang', desc: 'Gagner une partie', reward: 100, check: u => u.stats.wins >= 1 },
  { id: 'wins_50', label: 'Habitué de la victoire', desc: 'Gagner 50 parties', reward: 500, check: u => u.stats.wins >= 50 },
  { id: 'matches_100', label: 'Centurion', desc: 'Jouer 100 parties', reward: 500, check: u => u.stats.matches >= 100 },
  { id: 'kills_100', label: 'Chasseur', desc: '100 éliminations', reward: 150, check: u => u.stats.kills >= 100 },
  { id: 'kills_1000', label: 'Prédateur', desc: '1 000 éliminations', reward: 800, check: u => u.stats.kills >= 1000 },
  { id: 'hs_100', label: 'Tireur d\'élite', desc: '100 éliminations à la tête', reward: 400, title: 'tireur', check: u => (u.stats.hsKills || 0) >= 100 },
  { id: 'knife_25', label: 'Lame silencieuse', desc: '25 éliminations au couteau', reward: 400, title: 'lame', check: u => (u.stats.knifeKills || 0) >= 25 },
  { id: 'duel_10', label: 'Duelliste', desc: 'Gagner 10 duels', reward: 300, title: 'duelliste', check: u => u.stats.duelWins >= 10 },
  { id: 'ace_1', label: 'As', desc: 'Éliminer 5 ennemis dans une même manche', reward: 500, title: 'as', check: u => (u.stats.aces || 0) >= 1 },
  { id: 'multi_10', label: 'Carnage', desc: '10 manches à 3 éliminations ou plus', reward: 300, check: u => (u.stats.multi3 || 0) >= 10 },
  { id: 'plant_50', label: 'Démolisseur', desc: 'Poser le Noyau 50 fois', reward: 400, title: 'demolisseur', check: u => (u.stats.plants || 0) >= 50 },
  { id: 'defuse_25', label: 'Démineur', desc: 'Désamorcer le Noyau 25 fois', reward: 400, title: 'demineur', check: u => (u.stats.defuses || 0) >= 25 },
  { id: 'mvp_10', label: 'Joueur décisif', desc: 'Être MVP de 10 parties', reward: 500, title: 'mvp', check: u => (u.stats.mvps || 0) >= 10 },
  { id: 'dmg_100k', label: 'Artilleur', desc: 'Infliger 100 000 dégâts', reward: 600, check: u => (u.stats.dmg || 0) >= 100000 },
  { id: 'level_10', label: 'Confirmé', desc: 'Atteindre le niveau 10', reward: 300, check: u => levelOf(u.xp) >= 10 },
  { id: 'level_25', label: 'Vétéran', desc: 'Atteindre le niveau 25', reward: 800, title: 'veteran', check: u => levelOf(u.xp) >= 25 },
  { id: 'level_50', label: 'Légende vivante', desc: 'Atteindre le niveau 50', reward: 2000, title: 'legende', check: u => levelOf(u.xp) >= 50 },
  { id: 'streak_7', label: 'Fidèle', desc: '7 jours de connexion d\'affilée', reward: 300, title: 'fidele', check: u => (u.daily?.best || 0) >= 7 },
  { id: 'agents_all', label: 'Polyvalent', desc: 'Jouer une partie avec chaque agent', reward: 300, title: 'polyvalent', check: (u, ctx) => Object.keys(u.agentStats || {}).length >= ctx.agentCount },
  { id: 'maps_all', label: 'Explorateur', desc: 'Jouer sur toutes les cartes', reward: 300, title: 'explorateur', check: (u, ctx) => Object.keys(u.mapStats || {}).length >= ctx.mapCount },
  { id: 'elo_1200', label: 'Classé Or', desc: 'Atteindre 1 200 d\'Elo en duel', reward: 400, check: u => (u.eloPeak || 0) >= 1200 },
  { id: 'elo_1700', label: 'Éclipse', desc: 'Atteindre 1 700 d\'Elo en duel', reward: 1500, title: 'eclipse', check: u => (u.eloPeak || 0) >= 1700 },
  { id: 'friends_5', label: 'Bien entouré', desc: 'Avoir 5 amis', reward: 150, check: u => (u.friends || []).length >= 5 },
  { id: 'quests_50', label: 'Aventurier', desc: 'Terminer 50 quêtes', reward: 600, check: u => (u.stats.questsDone || 0) >= 50 },
  // moments (1.15)
  { id: 'moments_25', label: 'Spectaculaire', desc: 'Réaliser 25 moments en partie', reward: 300, check: u => Object.values(u.stats.moments || {}).reduce((a, n) => a + n, 0) >= 25 },
  { id: 'revenge_25', label: 'Vengeur', desc: '25 vengeances', reward: 400, title: 'vengeur', check: u => (u.stats.moments?.revenge || 0) >= 25 },
  { id: 'noscope_1', label: 'Sans lunette', desc: 'Une élimination au Longbow sans la lunette', reward: 250, check: u => (u.stats.moments?.noscope || 0) >= 1 },
  { id: 'longshot_10', label: 'Œil de faucon', desc: '10 tirs à la tête à plus de 40 m', reward: 400, title: 'faucon', check: u => (u.stats.moments?.longshot || 0) >= 10 },
  { id: 'slidekill_25', label: 'Glisseur fou', desc: '25 éliminations en glissade', reward: 400, check: u => (u.stats.moments?.slidekill || 0) >= 25 },
  { id: 'remontada_1', label: 'Remontada', desc: 'Gagner une partie après avoir été mené de 4 manches', reward: 600, title: 'remontada', check: u => (u.stats.moments?.remontada || 0) >= 1 },
];

// ---------- titres ----------
export const TITLES = {
  recrue: 'Recrue', tireur: 'Tireur d\'élite', lame: 'Lame silencieuse', duelliste: 'Duelliste', as: 'As',
  demolisseur: 'Démolisseur', demineur: 'Démineur', mvp: 'Joueur décisif', veteran: 'Vétéran', legende: 'Légende',
  fidele: 'Fidèle', polyvalent: 'Polyvalent', explorateur: 'Explorateur', eclipse: 'Éclipse', vengeur: 'Vengeur', faucon: 'Œil de faucon', remontada: 'Roi de la remontada',
  fondateur: 'Fondateur', champion: 'Champion', testeur: 'Testeur',
};
// titres attribuables uniquement par l'équipe
export const STAFF_TITLES = ['fondateur', 'champion', 'testeur'];

// ---------- rangs Elo (duel) ----------
export const ELO_START = 1000;
export const RANKS = [
  { id: 'fer', name: 'Fer', min: 0, color: '#8a8f99', reward: 0 },
  { id: 'bronze', name: 'Bronze', min: 900, color: '#c98a4b', reward: 100 },
  { id: 'argent', name: 'Argent', min: 1050, color: '#c9d1dd', reward: 200 },
  { id: 'or', name: 'Or', min: 1200, color: '#ffcf5a', reward: 400 },
  { id: 'platine', name: 'Platine', min: 1350, color: '#5fe3d0', reward: 700 },
  { id: 'diamant', name: 'Diamant', min: 1500, color: '#7fb2ff', reward: 1000 },
  { id: 'eclipse', name: 'Éclipse', min: 1700, color: '#b98cff', reward: 1500 },
];
export const rankOf = elo => { let r = RANKS[0]; for (const k of RANKS) if ((elo ?? ELO_START) >= k.min) r = k; return r; };

// Bonus de connexion quotidien (jour 1 à 7 de la série)
export const DAILY_BONUS = [50, 75, 100, 125, 150, 200, 400];

// Messages radio rapides (envoyés à l'équipe)
export const RADIO = ['Besoin d\'aide !', 'On attaque le site A', 'On attaque le site B', 'Ennemi repéré ici !', 'Attendez, je regroupe', 'Bien joué !', 'Je couvre', 'Noyau posé, défendez-le !'];

export const REPORT_REASONS = { cheat: 'Triche', behavior: 'Comportement toxique', chat: 'Insultes / chat', grief: 'Antijeu', name: 'Pseudo inapproprié', other: 'Autre' };

// maîtrise d'un agent (1.15) : niveau 1 à 10 selon les parties, victoires et éliminations jouées avec lui
const MASTERY_STEPS = [0, 20, 50, 100, 170, 260, 380, 530, 720, 950];
export function masteryOf(a) {
  const pts = Math.round((a?.kills || 0) + (a?.matches || 0) * 4 + (a?.wins || 0) * 6);
  let level = 1; while (level < 10 && pts >= MASTERY_STEPS[level]) level++;
  return { level, pts, next: level < 10 ? MASTERY_STEPS[level] : null, prev: MASTERY_STEPS[level - 1] };
}
