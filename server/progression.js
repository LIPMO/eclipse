// Progression des comptes : XP et niveaux, déblocages, quêtes, succès, titres, Elo, historique, bonus quotidien.
import crypto from 'node:crypto';
import { AGENT_ORDER, SKINS, isFfa } from '../shared/data.js';
import { MAP_ORDER } from '../shared/maps.js';
import {
  levelInfo, levelOf, xpForLevel, levelReward, LEVEL_SKINS, XP, QUESTS, QUEST_REWARD, QUESTS_PER,
  ACHIEVEMENTS, TITLES, ELO_START, rankOf, DAILY_BONUS, MAX_LEVEL,
} from '../shared/progress.js';

const HISTORY_MAX = 20;
const CTX = { agentCount: AGENT_ORDER.length, mapCount: MAP_ORDER.length };
const EXTRA_STATS = ['assists', 'hsKills', 'knifeKills', 'dmg', 'shots', 'hits', 'plants', 'defuses', 'aces', 'multi3', 'mvps', 'abilities', 'ults', 'questsDone', 'playTime', 'ffaKills', 'slides', 'adsShots'];

export const dayKey = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export function weekKey(t = Date.now()) {
  // semaine ISO (lundi → dimanche)
  const d = new Date(t); d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return `${d.getUTCFullYear()}-S${String(Math.ceil(((d - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}
// rang affiché : « Non classé » tant qu'aucun duel classé n'a été joué dans la saison
export const rankFor = u => (u.seasonDuels > 0 ? rankOf(u.elo) : { id: 'none', name: 'Non classé', color: '#8a93ad' });
const seeded = (seed, n) => crypto.createHash('sha256').update(seed).digest().readUInt32BE(0) % n;

// Ajoute les champs manquants aux comptes créés avant la version 1.5 (XP calculée depuis les anciennes statistiques)
export function ensureUser(u) {
  u.stats = u.stats || {};
  for (const k of ['matches', 'wins', 'kills', 'deaths', 'duels', 'duelWins', ...EXTRA_STATS]) if (typeof u.stats[k] !== 'number') u.stats[k] = 0;
  if (typeof u.xp !== 'number') {
    u.xp = u.stats.matches * XP.match + u.stats.kills * XP.kill + u.stats.wins * XP.win;
    // les skins de niveau correspondant à l'XP reprise sont offerts
    grantLevelSkins(u, 1, levelOf(u.xp));
  }
  if (typeof u.elo !== 'number') u.elo = ELO_START;
  if (typeof u.eloPeak !== 'number') u.eloPeak = u.elo;
  u.seasonDuels = u.seasonDuels || 0;
  u.seasons = u.seasons || [];
  u.history = u.history || [];
  u.agentStats = u.agentStats || {};
  u.mapStats = u.mapStats || {};
  u.achievements = u.achievements || [];
  u.titles = u.titles || [];
  u.title = u.title || null;
  u.friends = u.friends || [];
  u.friendReq = u.friendReq || [];
  u.blocked = u.blocked || [];
  u.week = u.week || { key: weekKey(), xp: 0, kills: 0, wins: 0 };
  u.daily = u.daily || { last: null, streak: 0, best: 0 };
  u.quests = u.quests || null;
  u.warnings = u.warnings || 0;
  u.notes = u.notes || [];
  u.ips = u.ips || [];
  if (typeof u.winStreak !== 'number') u.winStreak = 0;
  return u;
}

function grantLevelSkins(u, from, to) {
  const got = [];
  for (const [lv, id] of Object.entries(LEVEL_SKINS)) if (+lv > from && +lv <= to && !u.owned.includes(id)) { u.owned.push(id); got.push(id); }
  return got;
}

function weekly(u) {
  const k = weekKey();
  if (u.week.key !== k) u.week = { key: k, xp: 0, kills: 0, wins: 0 };
  return u.week;
}

// ---------- quêtes ----------
function activeQuests(kind, overrides) { return Object.entries(QUESTS).filter(([id, q]) => q.kind === kind && !overrides?.[id]?.off).map(([id]) => id); }
function pick(u, kind, key, overrides, exclude = []) {
  const pool = activeQuests(kind, overrides).filter(id => !exclude.includes(id));
  const out = [];
  let i = 0;
  while (out.length < QUESTS_PER[kind] && pool.length) {
    const id = pool.splice(seeded(`${u.name}|${key}|${i++}|${exclude.join(',')}`, pool.length), 1)[0];
    out.push({ id, p: 0, done: false });
  }
  return out;
}
export function refreshQuests(u, overrides) {
  const d = dayKey(), w = weekKey();
  if (!u.quests) u.quests = { day: null, daily: [], week: null, weekly: [], reroll: null };
  const q = u.quests;
  if (q.day !== d) { q.day = d; q.daily = pick(u, 'daily', d, overrides); q.reroll = null; }
  if (q.week !== w) { q.week = w; q.weekly = pick(u, 'weekly', w, overrides); }
  // quêtes désactivées par l'équipe entre-temps : retirées
  q.daily = q.daily.filter(x => QUESTS[x.id]); q.weekly = q.weekly.filter(x => QUESTS[x.id]);
  return q;
}
export function questReward(id, overrides) {
  const q = QUESTS[id], o = overrides?.[id] || {};
  const base = QUEST_REWARD[q.kind];
  return { eclats: Number.isFinite(o.eclats) ? o.eclats : base.eclats, xp: Number.isFinite(o.xp) ? o.xp : base.xp };
}
// une quête non terminée peut être changée une fois par jour
export function rerollQuest(u, kind, idx, overrides) {
  const q = refreshQuests(u, overrides);
  if (q.reroll === q.day) return 'Tu as déjà changé une quête aujourd\'hui.';
  const list = kind === 'weekly' ? q.weekly : q.daily;
  const cur = list[idx];
  if (!cur || cur.done) return 'Quête introuvable ou déjà terminée.';
  const pool = activeQuests(kind, overrides).filter(id => !list.some(x => x.id === id));
  if (!pool.length) return 'Aucune autre quête disponible.';
  list[idx] = { id: pool[seeded(`${u.name}|reroll|${Date.now()}`, pool.length)], p: 0, done: false };
  q.reroll = q.day;
  return null;
}

// ---------- succès ----------
function checkAchievements(u) {
  const got = [];
  for (const a of ACHIEVEMENTS) {
    if (u.achievements.includes(a.id)) continue;
    let ok = false; try { ok = a.check(u, CTX); } catch { ok = false; }
    if (!ok) continue;
    u.achievements.push(a.id);
    u.eclats += a.reward;
    if (a.title && !u.titles.includes(a.title)) u.titles.push(a.title);
    got.push({ id: a.id, label: a.label, reward: a.reward, title: a.title ? TITLES[a.title] : null });
  }
  return got;
}
export function titlesOf(u) {
  const t = new Set(['recrue', ...(u.titles || [])]);
  return [...t].filter(id => TITLES[id]);
}

// ---------- XP ----------
// Ajoute de l'XP et gère les passages de niveau. Renvoie les récompenses obtenues.
export function addXp(u, amount) {
  const before = levelOf(u.xp);
  u.xp = Math.max(0, Math.min(xpForLevel(MAX_LEVEL), Math.round(u.xp + amount)));
  weekly(u).xp += Math.max(0, Math.round(amount));
  const after = levelOf(u.xp);
  let eclats = 0;
  for (let l = before + 1; l <= after; l++) eclats += levelReward(l);
  u.eclats += eclats;
  const skins = after > before ? grantLevelSkins(u, before, after) : [];
  return { before, after, eclats, skins };
}
export function setLevel(u, level) {
  level = Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
  u.xp = xpForLevel(level);
  grantLevelSkins(u, 0, level);
}

// ---------- Elo (duel entre deux comptes) ----------
export function eloUpdate(a, b, aWon, k = 32) {
  const ea = 1 / (1 + 10 ** ((b.elo - a.elo) / 400));
  const delta = Math.round(k * ((aWon ? 1 : 0) - ea));
  a.elo += delta; b.elo -= delta;
  a.elo = Math.max(0, a.elo); b.elo = Math.max(0, b.elo);
  a.eloPeak = Math.max(a.eloPeak, a.elo); b.eloPeak = Math.max(b.eloPeak, b.elo);
  a.seasonDuels++; b.seasonDuels++;
  return delta;
}

// ---------- résultat d'une partie ----------
// res : { won, kills, deaths, assists, score, mode, mapId, agent, dmg, hsKills, knifeKills, shots, hits, plants, defuses, aces, multi3, abilities, ults, roundsWon, mvp, duration, reward }
// mul : { xp, eclats } multiplicateurs (configuration + événement)
export function applyMatch(u, res, { mul = { xp: 1, eclats: 1 }, overrides, eloDelta = null } = {}) {
  ensureUser(u);
  const s = u.stats;
  const eclatsBefore = u.eclats;
  // statistiques
  s.matches++; if (res.won) s.wins++;
  s.kills += res.kills; s.deaths += res.deaths; s.assists += res.assists;
  if (res.mode === 'duel') { s.duels++; if (res.won) s.duelWins++; }
  for (const k of ['hsKills', 'knifeKills', 'dmg', 'shots', 'hits', 'plants', 'defuses', 'aces', 'multi3', 'abilities', 'ults', 'slides', 'adsShots']) s[k] += Math.round(res[k] || 0);
  // série de victoires : +10 % d'XP par victoire d'affilée (à partir de la 2e), jusqu'à +50 %
  u.winStreak = res.won ? (u.winStreak || 0) + 1 : 0;
  const streakBonus = res.won ? Math.min(0.5, 0.1 * Math.max(0, u.winStreak - 1)) : 0;
  if (isFfa(res.mode)) s.ffaKills += res.kills;
  if (res.mvp) s.mvps++;
  s.playTime += Math.round(res.duration || 0);
  const ag = u.agentStats[res.agent] || (u.agentStats[res.agent] = { matches: 0, wins: 0, kills: 0, deaths: 0, dmg: 0 });
  ag.matches++; if (res.won) ag.wins++; ag.kills += res.kills; ag.deaths += res.deaths; ag.dmg += Math.round(res.dmg || 0);
  const mp = u.mapStats[res.mapId] || (u.mapStats[res.mapId] = { matches: 0, wins: 0, kills: 0, deaths: 0 });
  mp.matches++; if (res.won) mp.wins++; mp.kills += res.kills; mp.deaths += res.deaths;
  const wk = weekly(u); wk.kills += res.kills; if (res.won) wk.wins++;
  // statistiques par mode et par arme, meilleure série, joueurs croisés
  u.modeStats ||= {};
  const md = u.modeStats[res.mode] || (u.modeStats[res.mode] = { matches: 0, wins: 0, kills: 0, deaths: 0 });
  md.matches++; if (res.won) md.wins++; md.kills += res.kills; md.deaths += res.deaths;
  u.weaponKills ||= {};
  for (const [w, n] of Object.entries(res.weaponKills || {})) if (typeof n === 'number') u.weaponKills[w] = (u.weaponKills[w] || 0) + n;
  if ((res.bestStreak || 0) > (u.bestStreak || 0)) u.bestStreak = res.bestStreak;
  u.recent ||= [];
  for (const k of res.others || []) {
    const e = u.recent.find(x => x.k === k);
    if (e) { e.t = Date.now(); e.n++; } else u.recent.unshift({ k, t: Date.now(), n: 1 });
  }
  u.recent.sort((a, b) => b.t - a.t); if (u.recent.length > 20) u.recent.length = 20;
  // Éclats de la partie (déjà multipliés par le serveur de jeu)
  u.eclats += res.reward;
  // XP
  const baseXp = Math.round((XP.match + res.kills * XP.kill + res.assists * XP.assist + (res.roundsWon || 0) * XP.roundWin + (res.won ? XP.win : 0)
    + (res.plants || 0) * XP.plant + (res.defuses || 0) * XP.defuse + (res.mvp ? XP.mvp : 0)) * mul.xp * (1 + streakBonus));
  const xpGain = baseXp;
  // quêtes
  const q = refreshQuests(u, overrides);
  const questsDone = [];
  const statOf = { matches: 1, wins: res.won ? 1 : 0, duelWins: res.mode === 'duel' && res.won ? 1 : 0, ffaKills: isFfa(res.mode) ? res.kills : 0 };
  let questXp = 0;
  for (const item of [...q.daily, ...q.weekly]) {
    if (item.done) continue;
    const def = QUESTS[item.id]; if (!def) continue;
    const inc = def.stat in statOf ? statOf[def.stat] : Math.round(res[def.stat] || 0);
    if (!inc) continue;
    item.p = Math.min(def.goal, item.p + inc);
    if (item.p >= def.goal) {
      item.done = true; s.questsDone++;
      const r = questReward(item.id, overrides);
      const e = Math.round(r.eclats * mul.eclats);
      u.eclats += e; questXp += Math.round(r.xp * mul.xp);
      questsDone.push({ id: item.id, label: def.label, eclats: e, xp: Math.round(r.xp * mul.xp) });
    }
  }
  const lv = addXp(u, xpGain + questXp);
  const achievements = checkAchievements(u);
  // historique
  const acc = res.shots ? Math.round(res.hits / res.shots * 100) : null;
  u.history.unshift({
    t: Date.now(), mode: res.mode, map: res.mapId, agent: res.agent, won: !!res.won, kills: res.kills, deaths: res.deaths, assists: res.assists,
    score: res.score, dmg: Math.round(res.dmg || 0), hs: res.hsKills || 0, acc, mvp: !!res.mvp, xp: xpGain + questXp, eclats: u.eclats - eclatsBefore,
    elo: eloDelta, dur: Math.round(res.duration || 0), result: res.scoreLine || '',
  });
  if (u.history.length > HISTORY_MAX) u.history.length = HISTORY_MAX;
  return {
    xp: xpGain, questXp, level: lv.after, levelBefore: lv.before, levelEclats: lv.eclats, skins: lv.skins,
    questsDone, achievements, eloDelta, elo: u.elo, eclatsTotal: u.eclats - eclatsBefore, acc,
    winStreak: u.winStreak, streakBonus,
  };
}

// ---------- bonus de connexion ----------
export function dailyLogin(u, mul = 1) {
  const today = dayKey(), yest = dayKey(Date.now() - 86400000);
  if (u.daily.last === today) return null;
  u.daily.streak = u.daily.last === yest ? u.daily.streak + 1 : 1;
  u.daily.best = Math.max(u.daily.best || 0, u.daily.streak);
  u.daily.last = today;
  const day = ((u.daily.streak - 1) % DAILY_BONUS.length) + 1;
  const eclats = Math.round(DAILY_BONUS[day - 1] * mul);
  u.eclats += eclats;
  const achievements = checkAchievements(u);
  return { day, streak: u.daily.streak, eclats, achievements };
}

// ---------- vues ----------
export function publicCard(u, online = null) {
  ensureUser(u);
  const li = levelInfo(u.xp), rk = rankFor(u);
  return {
    name: u.name, level: li.level, title: u.customTitle || (u.title && TITLES[u.title] ? TITLES[u.title] : null), role: u.role || 'player',
    elo: u.elo, rank: rk.name, rankColor: rk.color, created: u.created, online,
    stats: { matches: u.stats.matches, wins: u.stats.wins, kills: u.stats.kills, deaths: u.stats.deaths, assists: u.stats.assists, duels: u.stats.duels, duelWins: u.stats.duelWins, hsKills: u.stats.hsKills, mvps: u.stats.mvps, acc: u.stats.shots ? Math.round(u.stats.hits / u.stats.shots * 100) : null, playTime: u.stats.playTime },
    agentStats: u.agentStats, mapStats: u.mapStats, achievements: u.achievements, history: u.history.slice(0, 10), agent: u.agent,
    banner: u.banner || 'nuit', motto: u.motto || '', showcase: (u.showcase || []).filter(id => u.achievements.includes(id)).slice(0, 3),
    modeStats: u.modeStats || {}, favWeapon: Object.entries(u.weaponKills || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || null, bestStreak: u.bestStreak || 0,
    endorse: u.endorse || {}, fairplay: Object.values(u.endorse || {}).reduce((a, b) => a + b, 0) >= 10, tourHist: (u.tourHist || []).slice(0, 10), tournamentWins: u.tournamentWins || 0,
    lfg: !!u.lfg,
  };
}
export function privateProgress(u, overrides) {
  ensureUser(u);
  const q = refreshQuests(u, overrides);
  const li = levelInfo(u.xp), rk = rankFor(u);
  const quest = x => ({ ...x, label: QUESTS[x.id].label, goal: QUESTS[x.id].goal, reward: questReward(x.id, overrides) });
  return {
    xp: u.xp, level: li.level, lvlCur: li.cur, lvlNeed: li.need, elo: u.elo, eloPeak: u.eloPeak, rank: rk.name, rankColor: rk.color, ranked: u.seasonDuels > 0, seasonDuels: u.seasonDuels,
    quests: { daily: q.daily.map(quest), weekly: q.weekly.map(quest), canReroll: q.reroll !== q.day, day: q.day, week: q.week },
    achievements: u.achievements, titles: titlesOf(u), title: u.title, history: u.history, agentStats: u.agentStats, mapStats: u.mapStats,
    week: weekly(u), daily: u.daily, seasons: u.seasons, friendsCount: u.friends.length,
    banner: u.banner || 'nuit', motto: u.motto || '', showcase: u.showcase || [], blockInvites: !!u.blockInvites, noWatch: !!u.noWatch, lfg: !!u.lfg,
    modeStats: u.modeStats || {}, weaponKills: u.weaponKills || {}, bestStreak: u.bestStreak || 0, endorse: u.endorse || {}, tourHist: u.tourHist || [], tournamentWins: u.tournamentWins || 0,
    loadouts: u.loadouts || null, customGames: u.customGames || [], aimBest: u.aimBest || 0, winStreak: u.winStreak || 0, customStatus: u.customStatus || '', dnd: !!u.dnd,
  };
}

// skins réservés : impossibles à acheter, et on ne peut équiper un skin de niveau qu'en le possédant
export const isLevelSkin = id => !!SKINS.find(s => s.id === id)?.level;
