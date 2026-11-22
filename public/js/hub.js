// Menus sociaux et progression : profil, quêtes, classement, amis, messages privés, notifications, signalements.
import { AGENTS } from '/shared/data.js';
import { MAP_INFO } from '/shared/maps.js';
import { ACHIEVEMENTS, TITLES, REPORT_REASONS, levelInfo } from '/shared/progress.js';
import { agentIconHTML } from './models.js';
import { profile, setToken } from './store.js';
import { keyName } from './settings.js';
import { WEAPON_UNLOCK, LEVEL_SKINS, DAILY_BONUS } from '/shared/progress.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MODE = { assault: 'Assaut', duel: 'Duel', ffa: 'Mêlée' };
const LB_LABEL = { level: 'XP', week: 'XP cette semaine', elo: 'Elo', kills: 'Éliminations', wins: 'Victoires' };
const fmtDate = t => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtDur = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} h ${m} min` : `${m} min`; };
const kd = (k, d) => d ? (k / d).toFixed(2) : String(k || 0);
const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '—';

let net, state, toast, showTab;
const H = { friends: { friends: [], incoming: [], blocked: [] }, whispers: [], lb: { kind: 'level', scope: 'all', data: null }, mpTo: null };
export const hub = H;

export function initHub(ctx) {
  ({ net, state, toast, showTab } = ctx);
  net.on('friends', m => { H.friends = m; updateFriendsBadge(); if (state.tab === 'friends') renderFriends(); });
  net.on('friendRequest', m => {
    notify({ kind: 'AMI', text: `${m.from} veut t'ajouter en ami.`, ms: 15000, actions: [['Accepter', () => net.send('friendAccept', { name: m.from })], ['Refuser', () => net.send('friendDecline', { name: m.from })]] });
  });
  net.on('invite', m => {
    notify({ kind: 'INVITATION', text: `${m.from} t'invite dans « ${m.roomName} » (${MODE[m.mode] || m.mode}).`, ms: 30000, actions: [['Rejoindre', () => { if (state.game) { toast('Termine ta partie avant de rejoindre.'); return; } net.send('joinRoom', { id: m.roomId }); }], ['Ignorer', null]] });
  });
  net.on('whisper', m => {
    H.whispers.push({ ...m, t: Date.now() });
    if (H.whispers.length > 200) H.whispers.shift();
    if (m.from && !state.game) notify({ kind: 'MESSAGE PRIVÉ', text: `${m.from} : ${m.text}`, ms: 9000, actions: [['Répondre', () => { H.mpTo = m.from; showTab('friends'); }]] });
    if (state.tab === 'friends') renderWhispers();
    const log = $('chat-log');
    if (log && !state.game) { const d = document.createElement('div'); d.className = 'whisper'; d.innerHTML = m.to ? `<i>MP à <b>${esc(m.to)}</b></i> : ${esc(m.text)}` : `<i>MP de <b>${esc(m.from)}</b></i> : ${esc(m.text)}`; log.appendChild(d); log.scrollTop = log.scrollHeight; }
  });
  net.on('playerProfile', m => showPlayerProfile(m.profile));
  net.on('leaderboard', m => { H.lb.data = m; renderLeaderboard(); });
  net.on('dailyBonus', m => {
    notify({ kind: `BONUS QUOTIDIEN · JOUR ${m.day}/7`, text: `+${m.eclats} Éclats ! Série de connexion : ${m.streak} jour(s).${m.day === 7 ? ' Bonus maximal !' : ' Reviens demain pour un bonus plus gros.'}`, ms: 9000, cls: 'gold' });
    for (const a of m.achievements || []) notify({ kind: 'SUCCÈS', text: `${a.label} · +${a.reward} Éclats`, ms: 8000, cls: 'gold' });
  });
  net.on('passwordResult', m => {
    if (m.token) setToken(m.token);
    const el = $('pw-msg'); if (el) { el.textContent = m.text; el.className = m.ok ? 'ok' : 'err'; }
    if (m.ok) { for (const id of ['pw-old', 'pw-new', 'pw-new2']) if ($(id)) $(id).value = ''; }
    if (!el || !$('tab-profile').classList.contains('active')) toast(m.text, 5000);
  });
  net.on('reportResult', m => toast(m.text, 5000));
  net.on('event', m => { state.event = m.event; renderEvent(); });
  net.on('matchSummary', m => {
    const s = m.summary; if (!s) return;
    if (s.level > s.levelBefore) notify({ kind: 'NIVEAU SUPÉRIEUR', text: `Niveau ${s.level} atteint ! +${s.levelEclats} Éclats${s.skins.length ? ' · nouveau skin exclusif dans ta collection' : ''}`, ms: 10000, cls: 'gold' });
  });
  $('mmodal').addEventListener('click', e => { if (e.target.id === 'mmodal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('mmodal').classList.contains('show')) closeModal(); });
  setInterval(renderEvent, 30000);
}

// ---------- notifications ----------
export function notify({ kind, text, ms = 8000, actions = [], cls = '' }) {
  const el = document.createElement('div');
  el.className = 'notif ' + cls;
  el.innerHTML = `<div class="nk">${esc(kind)}</div><div class="nt">${esc(text)}</div>${actions.length ? `<div class="na">${actions.map((a, i) => `<button class="btn small ${i ? 'ghost' : 'primary'}" data-i="${i}">${esc(a[0])}</button>`).join('')}</div>` : ''}<button class="nx">✕</button>`;
  el.onclick = e => {
    const b = e.target.closest('[data-i]');
    if (b) { const fn = actions[+b.dataset.i][1]; if (fn) fn(); el.remove(); }
    if (e.target.classList.contains('nx')) el.remove();
  };
  $('notifs').appendChild(el);
  while ($('notifs').children.length > 5) $('notifs').firstChild.remove();
  if (ms) setTimeout(() => el.remove(), ms);
}

// ---------- fenêtre modale du menu ----------
export function openModal(html) { $('mmodal-in').innerHTML = `<button class="mx" data-close>✕</button>${html}`; $('mmodal').classList.add('show'); $('mmodal-in').querySelector('[data-close]').onclick = closeModal; }
export function closeModal() { $('mmodal').classList.remove('show'); }

export function openReport(name) {
  openModal(`<h2>SIGNALER ${esc(name)}</h2>
    <label>Motif<select id="mr-why">${Object.entries(REPORT_REASONS).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select></label>
    <label>Détails (facultatif)<input id="mr-text" maxlength="200" placeholder="Décris ce qu'il s'est passé"></label>
    <p class="muted small">Le signalement est envoyé à l'équipe de modération avec les derniers messages du joueur. Les abus de signalement sont sanctionnés.</p>
    <button class="btn primary wide" id="mr-send">ENVOYER</button>`);
  $('mr-send').onclick = () => {
    const member = state.room?.members.find(m => m.name === name);
    net.send('report', { id: member?.id, name, reason: $('mr-why').value, text: $('mr-text').value });
    closeModal();
  };
}

// ---------- guide « Comment jouer » ----------
export function openGuide() {
  const k = a => `<kbd>${esc(keyName(profile.settings.keys[a]))}</kbd>`;
  openModal(`<h2>COMMENT JOUER</h2>
    <div class="guide">
      <h3>COMMANDES</h3>
      <div class="g-keys">
        <div>${k('forward')}${k('left')}${k('back')}${k('right')} se déplacer</div><div>${k('jump')} sauter · ${k('crouch')} s'accroupir · ${k('walk')} marcher sans bruit</div>
        <div><kbd>Clic gauche</kbd> tirer · <kbd>Clic droit</kbd> lunette</div><div>${k('reload')} recharger · ${k('slot1')}${k('slot2')}${k('slot3')} changer d'arme</div>
        <div>${k('abilityQ')} ${k('abilityE')} capacités · ${k('ult')} ultime</div><div>${k('buy')} menu d'achat · ${k('interact')} poser / désamorcer</div>
        <div>${k('chat')} chat (tous) · ${k('teamChat')} chat d'équipe</div><div>${k('radio')} puis un chiffre : message radio · ${k('scoreboard')} scores</div>
      </div>
      <p class="muted small">Toutes les touches se changent dans PARAMÈTRES → Touches. Échap ouvre le menu pause (paramètres, signaler un joueur, quitter).</p>
      <h3>MODES</h3>
      <p><b>Assaut 5v5</b> : les attaquants posent le Noyau sur le site A ou B, les défenseurs l'empêchent ou le désamorcent. Achète tes armes au début de chaque manche. Changement de côté à la mi-temps.</p>
      <p><b>Duel 1v1</b> : manches rapides sur petite carte, argent illimité. Entre deux joueurs inscrits, le duel compte pour le <b>classement Elo</b>.</p>
      <p><b>Mêlée</b> : chacun pour soi, réapparition immédiate, équipement complet pour tout le monde.</p>
      <p><b>Entraînement</b> : une partie immédiate contre des bots (de Facile à Expert), seul ou avec tes amis invités.</p>
      <h3>PROGRESSION (COMPTES)</h3>
      <p>Chaque partie rapporte de l'<b>XP</b> et des <b>Éclats</b>. À chaque niveau : des Éclats, et des skins exclusifs aux niveaux ${Object.keys(LEVEL_SKINS).join(', ')}.
      En Assaut et en Duel, certaines armes se débloquent en montant de niveau (Viper et Brute au niveau ${WEAPON_UNLOCK.viper}, Lancer au niveau ${WEAPON_UNLOCK.lancer}, Longbow au niveau ${WEAPON_UNLOCK.longbow}).</p>
      <p>3 <b>quêtes du jour</b> et 3 <b>de la semaine</b> (une peut être changée chaque jour), 24 <b>succès</b> qui donnent des titres, un <b>bonus de connexion</b> de ${DAILY_BONUS[0]} à ${DAILY_BONUS[DAILY_BONUS.length - 1]} Éclats par jour.</p>
      <h3>ENTRE AMIS</h3>
      <p>Ajoute tes amis dans l'onglet AMIS, invite-les dans ton salon ou rejoins le leur en un clic. Un <b>salon privé</b> n'est accessible que par invitation ou avec son code. Commandes de chat : <b>/aide</b>, <b>/mp pseudo message</b>, <b>/r</b>, <b>/ami</b>, <b>/stats</b>.</p>
      <p class="muted small">Un problème avec un joueur ? Bouton ⚑ dans le salon, sur son profil ou dans le menu pause : l'équipe de modération reçoit ton signalement.</p>
    </div>
    <button class="btn primary wide" data-close-guide>C'EST PARTI !</button>`);
  $('mmodal-in').querySelector('[data-close-guide]').onclick = closeModal;
  try { localStorage.setItem('eclipse_guide_vu', '1'); } catch { /* indisponible */ }
}
export function maybeShowGuide() {
  let seen = false; try { seen = localStorage.getItem('eclipse_guide_vu') === '1'; } catch { seen = true; }
  if (!seen) setTimeout(openGuide, 600);
}

// ---------- profil public d'un joueur ----------
export function viewProfile(name) { net.send('viewProfile', { name }); }
function showPlayerProfile(p) {
  const s = p.stats;
  const rel = p.relation;
  const btns = [];
  if (rel === 'none') btns.push(`<button class="btn primary small" data-pa="add">＋ AJOUTER EN AMI</button>`);
  if (rel === 'incoming') btns.push(`<button class="btn primary small" data-pa="accept">ACCEPTER L'AMI</button>`);
  if (rel === 'pending') btns.push(`<span class="muted small">Demande envoyée</span>`);
  if (rel === 'friend') btns.push(`<span class="badge-ok">AMI</span>`);
  if (rel !== 'self' && rel !== 'guest') {
    if (p.online) btns.push(`<button class="btn small" data-pa="mp">MESSAGE</button>`);
    btns.push(rel === 'blocked' ? `<button class="btn small" data-pa="unblock">DÉBLOQUER</button>` : `<button class="btn ghost small" data-pa="block">BLOQUER</button>`);
  }
  if (rel !== 'self') btns.push(`<button class="btn ghost small" data-pa="report">⚑ SIGNALER</button>`);
  const fav = Object.entries(p.agentStats || {}).sort((a, b) => b[1].matches - a[1].matches)[0];
  openModal(`<div class="pp-head">${agentIconHTML(fav ? fav[0] : p.agent, 'lg')}<div>
      <div class="pp-name">${esc(p.name)} ${p.online ? '<span class="dot on"></span>' : '<span class="dot"></span>'}</div>
      <div class="pp-sub">${p.title ? `<span class="title-tag">${esc(p.title)}</span> · ` : ''}Niveau <b>${p.level}</b> · <span style="color:${p.rankColor}">${esc(p.rank)}</span>${p.rank !== 'Non classé' ? ` (${p.elo} Elo)` : ''}</div>
      <div class="muted small">Inscrit le ${new Date(p.created).toLocaleDateString('fr-FR')} · ${fmtDur(s.playTime)} de jeu</div></div></div>
    <div class="pp-stats">
      ${[['Parties', s.matches], ['Victoires', `${s.wins} (${pct(s.wins, s.matches)})`], ['K/D', kd(s.kills, s.deaths)], ['Éliminations', s.kills], ['Têtes', pct(s.hsKills, s.kills)], ['Précision', s.acc != null ? s.acc + ' %' : '—'], ['Duels gagnés', `${s.duelWins}/${s.duels}`], ['MVP', s.mvps]].map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}
    </div>
    <div class="pp-ach">${(p.achievements || []).map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean).map(a => `<span class="ach-chip" title="${esc(a.desc)}">🏆 ${esc(a.label)}</span>`).join('') || '<span class="muted small">Aucun succès pour le moment.</span>'}</div>
    ${p.history?.length ? `<h3>DERNIÈRES PARTIES</h3><div class="hist mini">${p.history.slice(0, 5).map(histRow).join('')}</div>` : ''}
    <div class="pp-actions">${btns.join('')}</div>`);
  $('mmodal-in').onclick = e => {
    const a = e.target.closest('[data-pa]')?.dataset.pa; if (!a) return;
    if (a === 'add') { net.send('friendAdd', { name: p.name }); closeModal(); }
    if (a === 'accept') { net.send('friendAccept', { name: p.name }); closeModal(); }
    if (a === 'block') { if (confirm(`Bloquer ${p.name} ? Tu ne verras plus ses messages.`)) { net.send('block', { name: p.name }); closeModal(); } }
    if (a === 'unblock') { net.send('unblock', { name: p.name }); closeModal(); }
    if (a === 'mp') { H.mpTo = p.name; closeModal(); showTab('friends'); }
    if (a === 'report') openReport(p.name);
  };
}

// ---------- niveau (barre du haut) ----------
export function renderLevel() {
  const pr = profile.progress;
  $('lvl-badge').classList.toggle('hidden', !pr || state.guest);
  if (!pr) return;
  $('lvl-n').textContent = pr.level;
  $('lvl-fill').style.width = pr.lvlNeed ? Math.round(pr.lvlCur / pr.lvlNeed * 100) + '%' : '100%';
  $('lvl-badge').title = `Niveau ${pr.level} · ${pr.lvlCur} / ${pr.lvlNeed} XP · ${pr.rank} (${pr.elo} Elo)`;
}

// ---------- événement ----------
export function renderEvent() {
  const ev = state.event, el = $('event-banner');
  const on = ev && ev.until > Date.now();
  el.classList.toggle('hidden', !on);
  if (on) el.innerHTML = `⚡ <b>${esc(ev.name)}</b> — ${ev.xp !== 1 ? `XP ×${ev.xp}` : ''}${ev.xp !== 1 && ev.eclats !== 1 ? ' · ' : ''}${ev.eclats !== 1 ? `Éclats ×${ev.eclats}` : ''} <span class="muted">jusqu'au ${new Date(ev.until).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</span>`;
}

// ---------- quêtes ----------
export function renderQuests() {
  const el = $('quests'); if (!el) return;
  const pr = profile.progress;
  if (state.guest || !pr) { el.innerHTML = '<div class="q-guest">🎯 <b>Quêtes quotidiennes et hebdomadaires</b> : crée un compte pour gagner de l\'XP, des Éclats et monter de niveau.</div>'; return; }
  const q = pr.quests;
  const item = (x, kind, i) => `<div class="q-item ${x.done ? 'done' : ''}"><div class="q-top"><span>${x.done ? '✔ ' : ''}${esc(x.label)}</span><span class="q-rew"><span class="gem small"></span>${x.reward.eclats} · ${x.reward.xp} XP</span></div>
    <div class="q-bar"><i style="width:${Math.min(100, x.p / x.goal * 100)}%"></i></div><div class="q-bot"><span class="muted">${x.p} / ${x.goal}</span>${!x.done && q.canReroll ? `<button class="q-rr" data-kind="${kind}" data-i="${i}" title="Changer cette quête (1 fois par jour)">↻ changer</button>` : ''}</div></div>`;
  el.innerHTML = `<div class="q-head"><h3>QUÊTES DU JOUR</h3><span class="muted small">renouvelées à minuit (UTC)</span></div>${q.daily.map((x, i) => item(x, 'daily', i)).join('')}
    <div class="q-head"><h3>QUÊTES DE LA SEMAINE</h3><span class="muted small">renouvelées le lundi</span></div>${q.weekly.map((x, i) => item(x, 'weekly', i)).join('')}`;
  el.onclick = e => { const b = e.target.closest('.q-rr'); if (b) net.send('questReroll', { kind: b.dataset.kind, idx: +b.dataset.i }); };
}

// ---------- profil ----------
const histRow = h => `<div class="h-row ${h.won ? 'win' : 'lose'}"><span class="h-res">${h.won ? 'VICTOIRE' : 'DÉFAITE'}${h.result ? ` <b>${esc(h.result)}</b>` : ''}</span>
  <span>${agentIconHTML(h.agent, 'sm')} ${MODE[h.mode] || h.mode} · ${esc(MAP_INFO[h.map]?.name || h.map)}</span><span>${h.kills}/${h.deaths}/${h.assists}${h.mvp ? ' <span class="mvp-badge small">MVP</span>' : ''}</span>
  <span class="muted">${h.dmg} dég.${h.acc != null ? ` · ${h.acc} %` : ''}</span><span class="xp">+${h.xp} XP${h.elo != null ? ` · <b class="${h.elo >= 0 ? 'up' : 'down'}">${h.elo >= 0 ? '+' : ''}${h.elo}</b>` : ''}</span><span class="muted">${fmtDate(h.t)}</span></div>`;

export function renderProfile() {
  const root = $('profile-root');
  const pr = profile.progress, st = profile.stats;
  if (state.guest || !pr) { root.innerHTML = '<div class="panel empty-big">Le profil, la progression et les statistiques détaillées sont réservés aux comptes.<br><br>Déconnecte-toi puis choisis <b>INSCRIPTION</b> : c\'est gratuit.</div>'; return; }
  const li = levelInfo(pr.xp);
  const agents = Object.entries(pr.agentStats || {}).sort((a, b) => b[1].matches - a[1].matches);
  const maps = Object.entries(pr.mapStats || {}).sort((a, b) => b[1].matches - a[1].matches);
  const titleOpts = [['', '— Aucun titre —'], ...pr.titles.map(id => [id, TITLES[id]])];
  root.innerHTML = `
  <div class="panel pf-head">
    <div class="pf-id">${agentIconHTML(profile.agent, 'lg')}<div><div class="pf-name">${esc(profile.name)}</div>
      <label class="pf-title">Titre affiché <select id="pf-title">${titleOpts.map(([v, l]) => `<option value="${v}" ${pr.title === v || (!pr.title && !v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div></div>
    <div class="pf-level"><div class="pf-lv">NIVEAU <b>${li.level}</b></div><div class="pf-bar"><i style="width:${li.need ? li.cur / li.need * 100 : 100}%"></i></div><div class="muted small">${li.cur} / ${li.need} XP · ${pr.xp} XP au total · cette semaine : ${pr.week?.xp || 0} XP</div></div>
    <div class="pf-rank" style="--rc:${pr.rankColor}"><div class="rk">${esc(pr.rank)}</div><div class="muted small">${pr.ranked ? `${pr.elo} Elo en duel · record ${pr.eloPeak} · ${pr.seasonDuels} duel(s) classé(s)` : 'Gagne ou perds un duel contre un autre joueur inscrit (DUEL RAPIDE) pour obtenir ton rang.'}</div></div>
  </div>
  <div class="pf-stats">${[
    ['Parties', st.matches], ['Victoires', `${st.wins} · ${pct(st.wins, st.matches)}`], ['K/D', kd(st.kills, st.deaths)], ['Éliminations', st.kills], ['Assistances', st.assists || 0],
    ['Tirs à la tête', pct(st.hsKills, st.kills)], ['Précision', pct(st.hits, st.shots)], ['Dégâts', (st.dmg || 0).toLocaleString('fr-FR')], ['MVP', st.mvps || 0], ['Duels', `${st.duelWins}/${st.duels}`],
    ['Noyaux posés', st.plants || 0], ['Désamorçages', st.defuses || 0], ['As', st.aces || 0], ['Temps de jeu', fmtDur(st.playTime)], ['Série de connexion', `${pr.daily?.streak || 0} j (record ${pr.daily?.best || 0})`],
  ].map(([l, v]) => `<div class="pf-stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
  <div class="pf-grid">
    <div class="panel"><h3>STATISTIQUES PAR AGENT</h3>${agents.length ? `<table class="tbl"><tr><th>Agent</th><th>Parties</th><th>Victoires</th><th>K/D</th><th>Dégâts / partie</th></tr>${agents.map(([id, a]) => `<tr><td>${agentIconHTML(id, 'sm')} ${esc(AGENTS[id]?.name || id)}</td><td>${a.matches}</td><td>${pct(a.wins, a.matches)}</td><td>${kd(a.kills, a.deaths)}</td><td>${Math.round((a.dmg || 0) / a.matches)}</td></tr>`).join('')}</table>` : '<p class="muted">Joue une partie pour voir tes statistiques.</p>'}</div>
    <div class="panel"><h3>STATISTIQUES PAR CARTE</h3>${maps.length ? `<table class="tbl"><tr><th>Carte</th><th>Parties</th><th>Victoires</th><th>K/D</th></tr>${maps.map(([id, m]) => `<tr><td>${esc(MAP_INFO[id]?.name || id)}</td><td>${m.matches}</td><td>${pct(m.wins, m.matches)}</td><td>${kd(m.kills, m.deaths)}</td></tr>`).join('')}</table>` : '<p class="muted">Aucune carte jouée.</p>'}</div>
  </div>
  <div class="panel"><h3>HISTORIQUE DES PARTIES <span class="muted small">(20 dernières)</span></h3><div class="hist">${pr.history.map(histRow).join('') || '<p class="muted">Aucune partie pour le moment.</p>'}</div></div>
  <div class="panel"><h3>SUCCÈS <span class="muted small">${pr.achievements.length} / ${ACHIEVEMENTS.length}</span></h3><div class="ach-grid">${ACHIEVEMENTS.map(a => {
    const got = pr.achievements.includes(a.id);
    return `<div class="ach ${got ? 'got' : ''}"><div class="ai">${got ? '🏆' : '🔒'}</div><div><b>${esc(a.label)}</b><div class="muted small">${esc(a.desc)}</div><div class="small gold">+${a.reward} Éclats${a.title ? ` · titre « ${esc(TITLES[a.title])} »` : ''}</div></div></div>`;
  }).join('')}</div></div>
  ${pr.seasons?.length ? `<div class="panel"><h3>SAISONS PRÉCÉDENTES</h3><table class="tbl"><tr><th>Saison</th><th>Rang final</th><th>Elo</th><th>Récompense</th></tr>${pr.seasons.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.rank)}</td><td>${s.elo} (record ${s.peak})</td><td>${s.reward} Éclats</td></tr>`).join('')}</table></div>` : ''}
  <div class="panel pf-sec"><h3>SÉCURITÉ DU COMPTE</h3>
    <form id="pw-form" class="pw-form"><input id="pw-old" type="password" placeholder="Mot de passe actuel" autocomplete="current-password" maxlength="72">
      <input id="pw-new" type="password" placeholder="Nouveau mot de passe (8 caractères min.)" autocomplete="new-password" maxlength="72">
      <input id="pw-new2" type="password" placeholder="Confirmer" autocomplete="new-password" maxlength="72">
      <button class="btn primary" type="submit">CHANGER LE MOT DE PASSE</button></form>
    <div id="pw-msg"></div>
    <button class="btn ghost small" id="pf-logoutall">DÉCONNECTER MES AUTRES APPAREILS</button>
    <p class="muted small">Change ton mot de passe si tu penses qu'il a été vu ou volé : tes autres appareils seront déconnectés.</p></div>`;
  $('pf-title').onchange = e => net.send('setTitle', { id: e.target.value || null });
  $('pw-form').onsubmit = e => {
    e.preventDefault();
    if ($('pw-new').value !== $('pw-new2').value) { $('pw-msg').textContent = 'Les deux nouveaux mots de passe ne correspondent pas.'; $('pw-msg').className = 'err'; return; }
    net.send('changePassword', { old: $('pw-old').value, password: $('pw-new').value });
  };
  $('pf-logoutall').onclick = () => { if (confirm('Déconnecter tous tes autres appareils ?')) net.send('logoutAll'); };
}

// ---------- classement ----------
export function loadLeaderboard() { net.send('leaderboard', { kind: H.lb.kind, scope: H.lb.scope }); }
export function renderLeaderboard() {
  const d = H.lb.data, el = $('lb-list'); if (!d) { el.innerHTML = '<div class="empty">Chargement…</div>'; return; }
  $('lb-season').textContent = d.kind === 'elo' ? `${d.season?.name || ''} · classement Elo des duels entre joueurs inscrits` : d.kind === 'week' ? 'XP gagnée depuis lundi' : `${d.total} joueur(s) classé(s)`;
  const val = r => d.kind === 'elo' ? `<span style="color:${r.rankColor}">${esc(r.rank)}</span> · ${r.v}` : r.v.toLocaleString('fr-FR');
  const row = r => `<tr class="${r.name === profile.name ? 'me' : ''}" data-name="${esc(r.name)}"><td class="pos p${r.pos}">${r.pos}</td><td><b>${esc(r.name)}</b>${r.title ? ` <span class="title-tag">${esc(r.title)}</span>` : ''}</td><td>Niv. ${r.level}</td><td class="v">${val(r)}</td></tr>`;
  el.innerHTML = d.rows.length ? `<table class="tbl lb"><tr><th>#</th><th>Joueur</th><th>Niveau</th><th>${LB_LABEL[d.kind]}</th></tr>${d.rows.map(row).join('')}
    ${d.me && d.me.pos > d.rows.length ? `<tr class="sep"><td colspan="4">…</td></tr>${row(d.me)}` : ''}</table>` : '<div class="empty">Personne n\'est encore classé ici. Sois le premier !</div>';
  el.onclick = e => { const tr = e.target.closest('tr[data-name]'); if (tr) viewProfile(tr.dataset.name); };
}

// ---------- amis ----------
function updateFriendsBadge() {
  const n = H.friends.incoming.length, on = H.friends.friends.filter(f => f.online).length;
  $('friends-badge').textContent = n ? n : on ? on : '';
  $('friends-badge').className = 'nav-badge' + (n ? ' warn' : '');
}
export function renderFriends() {
  const root = $('friends-root');
  if (state.guest) { root.innerHTML = '<div class="panel empty-big">Les amis, les invitations et les messages privés sont réservés aux comptes.</div>'; return; }
  const F = H.friends;
  const inRoom = !!state.room;
  root.innerHTML = `<div class="fr-grid">
    <div>
      <div class="panel"><h3>AJOUTER UN AMI</h3><form id="fr-add" class="fr-add"><input id="fr-name" maxlength="16" placeholder="Pseudo du joueur"><button class="btn primary" type="submit">AJOUTER</button></form></div>
      ${F.incoming.length ? `<div class="panel"><h3>DEMANDES REÇUES (${F.incoming.length})</h3>${F.incoming.map(n => `<div class="fr-row"><b>${esc(n)}</b><span class="grow"></span><button class="btn primary small" data-f="accept" data-n="${esc(n)}">ACCEPTER</button><button class="btn ghost small" data-f="decline" data-n="${esc(n)}">REFUSER</button></div>`).join('')}</div>` : ''}
      <div class="panel"><h3>MES AMIS (${F.friends.filter(f => f.online).length} en ligne / ${F.friends.length})</h3>
        ${F.friends.map(f => `<div class="fr-row ${f.online ? 'on' : ''}"><span class="dot ${f.online ? 'on' : ''}"></span><div class="fr-who"><b class="link" data-f="profile" data-n="${esc(f.name)}">${esc(f.name)}</b> <span class="muted small">niv. ${f.level}${f.title ? ' · ' + esc(f.title) : ''}</span><div class="muted small">${esc(f.status)}${f.roomName ? ` · ${esc(f.roomName)}` : ''}</div></div>
          <span class="grow"></span>
          ${f.roomId && !f.full ? `<button class="btn small" data-f="join" data-n="${esc(f.name)}">REJOINDRE</button>` : ''}
          ${f.online && inRoom && f.roomId !== state.room?.id ? `<button class="btn small" data-f="invite" data-n="${esc(f.name)}">INVITER</button>` : ''}
          ${f.online ? `<button class="btn ghost small" data-f="mp" data-n="${esc(f.name)}">MP</button>` : ''}
          <button class="btn ghost small" data-f="remove" data-n="${esc(f.name)}" title="Retirer de mes amis">✕</button></div>`).join('') || '<p class="muted">Ajoute des amis avec leur pseudo, ou depuis le classement et les salons.</p>'}
      </div>
      ${F.blocked.length ? `<div class="panel"><h3>JOUEURS BLOQUÉS</h3>${F.blocked.map(n => `<div class="fr-row"><b>${esc(n)}</b><span class="grow"></span><button class="btn ghost small" data-f="unblock" data-n="${esc(n)}">DÉBLOQUER</button></div>`).join('')}</div>` : ''}
    </div>
    <div class="panel fr-mp"><h3>MESSAGES PRIVÉS</h3>
      <div class="mp-to">À : <select id="mp-to"><option value="">— choisir —</option>${[...new Set([...F.friends.filter(f => f.online).map(f => f.name), ...(H.mpTo ? [H.mpTo] : [])])].map(n => `<option ${n === H.mpTo ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div id="mp-log" class="mp-log"></div>
      <form id="mp-form" class="fr-add"><input id="mp-text" maxlength="200" placeholder="Ton message…"><button class="btn primary" type="submit">ENVOYER</button></form>
      <p class="muted small">Dans le chat d'un salon, tu peux aussi écrire <b>/mp pseudo message</b> ou <b>/r message</b> pour répondre.</p>
    </div></div>`;
  renderWhispers();
  $('fr-add').onsubmit = e => { e.preventDefault(); const n = $('fr-name').value.trim(); if (n) net.send('friendAdd', { name: n }); $('fr-name').value = ''; };
  $('mp-to').onchange = e => { H.mpTo = e.target.value || null; renderWhispers(); };
  $('mp-form').onsubmit = e => { e.preventDefault(); const t = $('mp-text').value.trim(); if (!H.mpTo) { toast('Choisis un destinataire.'); return; } if (t) net.send('whisper', { name: H.mpTo, text: t }); $('mp-text').value = ''; };
  root.onclick = e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    const n = b.dataset.n, f = b.dataset.f;
    if (f === 'accept') net.send('friendAccept', { name: n });
    if (f === 'decline') net.send('friendDecline', { name: n });
    if (f === 'remove' && confirm(`Retirer ${n} de tes amis ?`)) net.send('friendRemove', { name: n });
    if (f === 'unblock') net.send('unblock', { name: n });
    if (f === 'join') net.send('joinFriend', { name: n });
    if (f === 'invite') net.send('invite', { name: n });
    if (f === 'mp') { H.mpTo = n; renderFriends(); $('mp-text')?.focus(); }
    if (f === 'profile') viewProfile(n);
  };
}
function renderWhispers() {
  const log = $('mp-log'); if (!log) return;
  const who = H.mpTo;
  const msgs = H.whispers.filter(m => !who || m.from === who || m.to === who);
  log.innerHTML = msgs.map(m => `<div class="${m.to ? 'out' : 'in'}"><span class="muted small">${fmtDate(m.t)}</span> <b>${esc(m.to ? 'Moi' : m.from)}</b> : ${esc(m.text)}</div>`).join('') || '<div class="muted">Aucun message.</div>';
  log.scrollTop = log.scrollHeight;
}

// invitation depuis le salon
export function openInvitePicker() {
  const online = H.friends.friends.filter(f => f.online && f.roomId !== state.room?.id);
  openModal(`<h2>INVITER UN AMI</h2>${online.length ? online.map(f => `<div class="fr-row"><span class="dot on"></span><b>${esc(f.name)}</b><span class="muted small">${esc(f.status)}</span><span class="grow"></span><button class="btn primary small" data-inv="${esc(f.name)}">INVITER</button></div>`).join('') : '<p class="muted">Aucun ami connecté disponible. Ajoute des amis dans l\'onglet AMIS.</p>'}
    ${state.room?.code ? `<p>Code du salon : <b class="code">${esc(state.room.code)}</b> — partage-le à n'importe qui.</p>` : ''}`);
  $('mmodal-in').onclick = e => { const b = e.target.closest('[data-inv]'); if (b) { net.send('invite', { name: b.dataset.inv }); b.disabled = true; b.textContent = 'INVITÉ'; } };
}
