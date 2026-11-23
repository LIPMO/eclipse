// Menus sociaux et progression : profil, quêtes, classement, amis, messages privés, notifications, signalements.
import { AGENTS, GUN_LADDER } from '/shared/data.js';
import { MAP_INFO } from '/shared/maps.js';
import { ACHIEVEMENTS, TITLES, REPORT_REASONS, levelInfo } from '/shared/progress.js';
import { agentIconHTML } from './models.js';
import { profile, setToken } from './store.js';
import { keyName } from './settings.js';
import { playNotify } from './audio.js';
import { isTouchDevice } from './touch.js';
import { WEAPON_UNLOCK, LEVEL_SKINS, DAILY_BONUS, BANNERS, ENDORSE, CHAT_EMOJI } from '/shared/progress.js';
import { WEAPONS } from '/shared/data.js';
// :gg: → 👍 dans les messages affichés
export const emojify = t => String(t ?? '').replace(/:[a-z0-9]{2,6}:/g, m => CHAT_EMOJI[m] || m);
const WNAME = id => WEAPONS[id]?.name || { fire: 'Feu', shock: 'Électricité', frost: 'Givre' }[id] || id || '—';
const MODE_STATS = (ms = {}) => Object.entries(ms).length ? `<table class="tbl"><tr><th>Mode</th><th>Parties</th><th>Victoires</th><th>K/D</th></tr>${Object.entries(ms).sort((a, b) => b[1].matches - a[1].matches).map(([m, v]) => `<tr><td>${esc(MODE[m] || m)}</td><td>${v.matches}</td><td>${pct(v.wins, v.matches)}</td><td>${kd(v.kills, v.deaths)}</td></tr>`).join('')}</table>` : '<p class="muted">Aucune partie.</p>';
const ENDORSE_HTML = (e = {}) => Object.entries(ENDORSE).map(([k, l]) => `<span class="endorse">${l} <b>${e[k] || 0}</b></span>`).join('');

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MODE = { assault: 'Assaut', duel: 'Duel', ffa: 'Mêlée', gungame: 'Gun Game', lives: 'Dernier debout' };
const LB_LABEL = { level: 'XP', week: 'XP cette semaine', elo: 'Elo', kills: 'Éliminations', wins: 'Victoires' };
const fmtDate = t => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`; };
const fmtDur = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h} h ${m} min` : `${m} min`; };
const kd = (k, d) => d ? (k / d).toFixed(2) : String(k || 0);
const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '—';

let net, state, toast, showTab;
const H = { friends: { friends: [], incoming: [], blocked: [] }, whispers: [], lb: { kind: 'level', scope: 'all', data: null }, mpTo: null, party: null, unread: {} };
export const hub = H;

export function initHub(ctx) {
  ({ net, state, toast, showTab } = ctx);
  net.on('friends', m => { H.friends = m; updateFriendsBadge(); if (state.tab === 'friends') renderFriends(); });
  net.on('friendRequest', m => {
    notify({ kind: 'AMI', type: 'friend', text: `${m.from} veut t'ajouter en ami.`, ms: 15000, actions: [['Accepter', () => net.send('friendAccept', { name: m.from })], ['Refuser', () => net.send('friendDecline', { name: m.from })]] });
  });
  net.on('invite', m => {
    notify({ kind: 'INVITATION', type: 'invite', text: `${m.from} t'invite dans « ${m.roomName} » (${MODE[m.mode] || m.mode}).`, ms: 30000, actions: [['Rejoindre', () => { if (state.game) { toast('Termine ta partie avant de rejoindre.'); return; } net.send('joinRoom', { id: m.roomId }); }], ['Ignorer', null]] });
  });
  net.on('whisper', m => {
    H.whispers.push({ ...m, t: Date.now() });
    if (H.whispers.length > 200) H.whispers.shift();
    if (m.from && !(state.tab === 'friends' && H.mpTo === m.from)) { H.unread[m.from] = (H.unread[m.from] || 0) + 1; updateFriendsBadge(); if (state.tab === 'friends') renderFriends(); }
    if (m.from && !state.game) notify({ kind: 'MESSAGE PRIVÉ', type: 'friend', text: `${m.from} : ${m.text}`, ms: 9000, actions: [['Répondre', () => { H.mpTo = m.from; showTab('friends'); }]] });
    if (state.tab === 'friends') renderWhispers();
    const log = $('chat-log');
    if (log && !state.game) { const d = document.createElement('div'); d.className = 'whisper'; d.innerHTML = m.to ? `<i>MP à <b>${esc(m.to)}</b></i> : ${esc(m.text)}` : `<i>MP de <b>${esc(m.from)}</b></i> : ${esc(m.text)}`; log.appendChild(d); log.scrollTop = log.scrollHeight; }
  });
  net.on('playerProfile', m => showPlayerProfile(m.profile));
  net.on('party', m => { H.party = m.party; renderPartyBar(); if (state.tab === 'friends') renderFriends(); });
  net.on('partyInvite', m => notify({ kind: 'GROUPE', type: 'invite', text: `${m.from} t'invite dans son groupe (${m.size}/4). Vous jouerez ensemble : tu suivras ${m.from} dans ses parties.`, ms: 30000,
    actions: [['Rejoindre', () => net.send('partyAccept', { id: m.id })], ['Refuser', () => net.send('partyDecline', { id: m.id })]] }));
  net.on('partyFollow', m => notify({ kind: 'GROUPE', text: `${m.from} (chef du groupe) a rejoint « ${m.roomName} ». Rejoins-le quand ta partie est finie.`, ms: 30000,
    actions: [['Rejoindre', () => { if (state.game) { toast('Termine ta partie d\'abord.'); return; } net.send('joinRoom', { id: m.roomId }); }], ['Plus tard', null]] }));
  net.on('recent', m => { H.recent = m; renderRecent(); });
  net.on('gift', m => notify({ kind: 'CADEAU', type: 'friend', text: `${m.from} t'a offert ${m.amount} Éclats !`, cls: 'gold' }));
  net.on('friendOnline', m => { if (profile.settings.notifFriendOnline !== false) notify({ kind: 'AMI EN LIGNE', type: 'friend', text: m.name, ms: 6000, group: 'online', fmt: names => names.length === 1 ? `${names[0]} vient de se connecter.` : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]} viennent de se connecter.` }); });
  net.on('endorsed', m => toast(`Tu as recommandé ${m.name} (${ENDORSE[m.kind]}).`));
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
const NOTIF_PREF = { friend: 'notifFriends', invite: 'notifInvite', clan: 'notifClan', tour: 'notifTour' };
const groups = new Map(); // notifications regroupées : même catégorie sans bouton, rapprochées dans le temps
export function notify({ kind, text, ms = 8000, actions = [], cls = '', type = null, group = null }) {
  if (type && NOTIF_PREF[type] && profile.settings[NOTIF_PREF[type]] === false) return;
  const gk = group || (!actions.length ? kind : null);
  const prev = gk && groups.get(gk);
  if (prev && prev.el.isConnected) {
    prev.items.push(text); prev.n++;
    prev.el.querySelector('.nk').textContent = `${kind} · ${prev.n}`;
    prev.el.querySelector('.nt').textContent = group && prev.fmt ? prev.fmt(prev.items) : prev.items.slice(-3).join(' · ') + (prev.items.length > 3 ? ` (+${prev.items.length - 3})` : '');
    clearTimeout(prev.t); if (ms) prev.t = setTimeout(() => prev.el.remove(), ms);
    return;
  }
  const el = document.createElement('div');
  el.className = 'notif ' + cls;
  if (profile.settings.notifSound !== false) playNotify();
  el.innerHTML = `<div class="nk">${esc(kind)}</div><div class="nt">${esc(text)}</div>${actions.length ? `<div class="na">${actions.map((a, i) => `<button class="btn small ${i ? 'ghost' : 'primary'}" data-i="${i}">${esc(a[0])}</button>`).join('')}</div>` : ''}<button class="nx">✕</button>`;
  el.onclick = e => {
    const b = e.target.closest('[data-i]');
    if (b) { const fn = actions[+b.dataset.i][1]; if (fn) fn(); el.remove(); }
    if (e.target.classList.contains('nx')) el.remove();
  };
  $('notifs').appendChild(el);
  while ($('notifs').children.length > 5) $('notifs').firstChild.remove();
  const g = gk ? { el, items: [text], n: 1, t: null, fmt: arguments[0].fmt } : null;
  if (ms) { const t = setTimeout(() => el.remove(), ms); if (g) g.t = t; }
  if (g) groups.set(gk, g);
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
      ${isTouchDevice() ? `<h3>SUR TÉLÉPHONE</h3><p>Tiens le téléphone <b>en paysage</b>. Pouce gauche : <b>joystick</b> (incline peu pour marcher sans bruit). Pouce droit : <b>glisse pour viser</b>. ◉ tirer (tu peux viser en gardant le doigt dessus), ⤒ sauter, ⤓ s'accroupir, ↻ recharger, ⇄ changer d'arme, Q E X capacités, ◆ marquer une position, F poser / désamorcer, $ achats, ☰ scores, II pause. Taille, opacité et sensibilité : PARAMÈTRES → Tactile.</p>` : ''}
      <h3>COMMANDES</h3>
      <div class="g-keys">
        <div>${k('forward')}${k('left')}${k('back')}${k('right')} se déplacer</div><div>${k('jump')} sauter · ${k('crouch')} s'accroupir · ${k('walk')} marcher sans bruit</div>
        <div><kbd>Clic gauche</kbd> tirer · <kbd>Clic droit</kbd> lunette</div><div>${k('reload')} recharger · ${k('slot1')}${k('slot2')}${k('slot3')} changer d'arme</div>
        <div>${k('abilityQ')} ${k('abilityE')} capacités · ${k('ult')} ultime</div><div>${k('buy')} menu d'achat · ${k('interact')} poser / désamorcer</div>
        <div>${k('chat')} chat (tous) · ${k('teamChat')} chat d'équipe</div><div>${k('radio')} puis un chiffre : message radio · ${k('scoreboard')} scores</div>
        <div>${k('mark')} marquer une position pour ton équipe (vise un ennemi : alerte rouge)</div>
      </div>
      <p class="muted small">Toutes les touches se changent dans PARAMÈTRES → Touches. Échap ouvre le menu pause (paramètres, signaler un joueur, quitter).</p>
      <h3>MODES</h3>
      <p><b>Assaut 5v5</b> : les attaquants posent le Noyau sur le site A ou B, les défenseurs l'empêchent ou le désamorcent. Achète tes armes au début de chaque manche. Changement de côté à la mi-temps.</p>
      <p><b>Duel 1v1</b> : manches rapides sur petite carte, argent illimité. Entre deux joueurs inscrits, le duel compte pour le <b>classement Elo</b>.</p>
      <p><b>Mêlée</b> : chacun pour soi, réapparition immédiate, équipement complet pour tout le monde.</p>
      <p><b>Dernier debout</b> : chacun pour soi avec un nombre de vies limité (3 par défaut). Quand tu n'as plus de vie, tu es éliminé : le dernier joueur encore en jeu gagne.</p>
      <p><b>Champ de tir</b> : choisis la difficulté « Champ de tir » en entraînement pour t'exercer sur des cibles qui bougent mais ne tirent pas.</p>
      <p><b>Gun Game</b> : chacun pour soi, une seule arme. Chaque élimination te donne l'arme suivante (${GUN_LADDER.length} armes). La dernière est le couteau : le premier qui élimine au couteau gagne. Se faire tuer au couteau fait reculer d'une arme.</p>
      <p><b>Entraînement</b> : une partie immédiate contre des bots (de Facile à Expert), seul ou avec tes amis invités.</p>
      <h3>PROGRESSION (COMPTES)</h3>
      <p>Chaque partie rapporte de l'<b>XP</b> et des <b>Éclats</b>. À chaque niveau : des Éclats, et des skins exclusifs aux niveaux ${Object.keys(LEVEL_SKINS).join(', ')}.
      En Assaut et en Duel, certaines armes se débloquent en montant de niveau (Viper et Brute au niveau ${WEAPON_UNLOCK.viper}, Lancer au niveau ${WEAPON_UNLOCK.lancer}, Longbow au niveau ${WEAPON_UNLOCK.longbow}).</p>
      <p>3 <b>quêtes du jour</b> et 3 <b>de la semaine</b> (une peut être changée chaque jour), 24 <b>succès</b> qui donnent des titres, un <b>bonus de connexion</b> de ${DAILY_BONUS[0]} à ${DAILY_BONUS[DAILY_BONUS.length - 1]} Éclats par jour.</p>
      <h3>KILLCAM, CLANS ET TOURNOIS</h3>
      <p>Après ta mort, la <b>killcam</b> rejoue les 3 dernières secondes vues par ton adversaire (désactivable dans PARAMÈTRES → Interface). Rejoins ou crée un <b>clan</b> (onglet CLAN, niveau 3) : son tag s'affiche devant ton pseudo et l'XP de ses membres le fait monter au classement. Les <b>tournois</b> (onglet TOURNOIS) sont des duels à élimination directe : le vainqueur gagne des Éclats et le titre Champion.</p>
      <h3>ENTRE AMIS</h3>
      <p>Ajoute tes amis dans l'onglet AMIS, invite-les dans ton salon ou rejoins le leur en un clic. Forme un <b>groupe</b> (jusqu'à 4) : tout le groupe suit le chef dans ses parties, et <b>/g message</b> écrit au groupe. Un <b>salon privé</b> n'est accessible que par invitation ou avec son code. Commandes de chat : <b>/aide</b>, <b>/mp pseudo message</b>, <b>/r</b>, <b>/ami</b>, <b>/stats</b>.</p>
      <p class="muted small">Un problème avec un joueur ? Bouton ⚑ dans le salon, sur son profil ou dans le menu pause : l'équipe de modération reçoit ton signalement.</p>
    </div>
    <div class="row"><button class="btn primary grow" data-close-guide>C'EST PARTI !</button><button class="btn ghost" data-tour>VISITE GUIDÉE DU MENU</button></div>`);
  let first = false; try { first = localStorage.getItem('eclipse_tour_vu') !== '1'; } catch { /* */ }
  $('mmodal-in').querySelector('[data-close-guide]').onclick = () => { closeModal(); if (first) startTour(); };
  $('mmodal-in').querySelector('[data-tour]').onclick = () => { closeModal(); startTour(); };
  try { localStorage.setItem('eclipse_guide_vu', '1'); } catch { /* indisponible */ }
}

// ---------- visite guidée interactive : met en lumière chaque élément du menu, étape par étape ----------
const TOUR = [
  ['#quick-duel', 'DUEL RAPIDE', 'Un 1 contre 1 contre un autre joueur. Entre deux comptes, il compte pour ton rang Elo.'],
  ['#quick-ffa', 'MÊLÉE ET GUN GAME', 'Chacun pour soi, réapparition immédiate : parfait pour s\'échauffer.'],
  ['#quick-bots', 'ENTRAÎNEMENT', 'Une partie immédiate contre des bots, du niveau Facile à Expert, ou le champ de tir.'],
  ['#quests', 'QUÊTES', 'Des objectifs du jour et de la semaine qui rapportent de l\'XP et des Éclats.'],
  ['#room-list', 'SALONS', 'Les parties ouvertes par les autres joueurs. ★ pour garder un salon en favori.'],
  ['[data-tab="agents"]', 'AGENTS', 'Choisis ton agent et découvre ses capacités. Raccourci : touche 2.'],
  ['[data-tab="collection"]', 'COLLECTION', 'Les skins de tes armes et la boutique du jour.'],
  ['[data-tab="friends"]', 'AMIS ET GROUPE', 'Ajoute des amis, écris-leur et forme un groupe de 4 pour jouer ensemble.'],
  ['[data-tab="clan"]', 'CLAN', 'Rejoins ou crée un clan dès le niveau 3.'],
  ['[data-tab="settings"]', 'PARAMÈTRES', 'Touches, viseur, graphismes, accessibilité… Touche / pour chercher un réglage.'],
];
export function startTour(i = 0) {
  try { localStorage.setItem('eclipse_tour_vu', '1'); } catch { /* */ }
  document.getElementById('tour')?.remove();
  if (i === 0 && state.tab !== 'play') showTab('play');
  const steps = TOUR.filter(([sel]) => { const e = document.querySelector(sel); return e && e.offsetParent; });
  const st = steps[i]; if (!st) return;
  const target = document.querySelector(st[0]);
  target.scrollIntoView({ block: 'center', behavior: 'instant' });
  const r = target.getBoundingClientRect();
  const el = document.createElement('div'); el.id = 'tour';
  const below = r.bottom + 170 < innerHeight;
  el.innerHTML = `<div class="tour-spot" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div>
    <div class="tour-box" style="left:${Math.max(12, Math.min(innerWidth - 352, r.left))}px;top:${below ? r.bottom + 14 : Math.max(12, r.top - 164)}px">
      <div class="muted small">ÉTAPE ${i + 1} / ${steps.length}</div><h3>${esc(st[1])}</h3><p>${esc(st[2])}</p>
      <div class="row"><button class="btn ghost small" data-t="skip">PASSER</button><span class="grow"></span>${i ? '<button class="btn ghost small" data-t="prev">← PRÉCÉDENT</button>' : ''}<button class="btn primary small" data-t="next">${i === steps.length - 1 ? 'TERMINER' : 'SUIVANT →'}</button></div></div>`;
  document.body.appendChild(el);
  const end = () => { el.remove(); document.removeEventListener('keydown', key, true); };
  const key = e => { if (e.key === 'Escape') { e.stopPropagation(); end(); } if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); end(); startTour(i + 1); } if (e.key === 'ArrowLeft' && i) { end(); startTour(i - 1); } };
  document.addEventListener('keydown', key, true);
  el.onclick = e => { const a = e.target.closest('[data-t]')?.dataset.t; if (!a) return; end(); if (a === 'next') startTour(i + 1); if (a === 'prev') startTour(i - 1); };
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
  if (rel !== 'self' && rel !== 'guest' && !p.clan && H.clanStaff?.()) btns.push(`<button class="btn small" data-pa="clan">INVITER DANS MON CLAN</button>`);
  if (rel !== 'self' && rel !== 'guest') {
    if (p.online) btns.push(`<button class="btn small" data-pa="mp">MESSAGE</button>`);
    if (p.online && rel === 'friend' && state.room) btns.push(`<button class="btn small" data-pa="invite">INVITER DANS MON SALON</button>`);
    if (p.online && rel === 'friend' && !(H.party?.members || []).some(m => m.name === p.name) && (!H.party || H.party.lead)) btns.push(`<button class="btn small" data-pa="party">＋ MON GROUPE</button>`);
    btns.push(rel === 'blocked' ? `<button class="btn small" data-pa="unblock">DÉBLOQUER</button>` : `<button class="btn ghost small" data-pa="block">BLOQUER</button>`);
  }
  if (rel !== 'self') btns.push(`<button class="btn ghost small" data-pa="report">⚑ SIGNALER</button>`);
  const fav = Object.entries(p.agentStats || {}).sort((a, b) => b[1].matches - a[1].matches)[0];
  if (rel !== 'self' && rel !== 'guest') btns.push(`<button class="btn ghost small" data-pa="compare">⇄ COMPARER</button>`);
  if (rel === 'friend') btns.push(`<button class="btn ghost small" data-pa="gift">🎁 OFFRIR DES ÉCLATS</button>`);
  btns.push(`<button class="btn ghost small" data-pa="share">🔗 LIEN</button>`);
  openModal(`<div class="pp-banner" style="background:${(BANNERS[p.banner] || BANNERS.nuit).css}"></div><div class="pp-head">${`<span class="rank-frame" style="--rc:${p.rankColor}">${agentIconHTML(fav ? fav[0] : p.agent, 'lg')}</span>`}<div>
      <div class="pp-name">${p.clan ? `<span class="clan-tag" title="${esc(p.clan.name)}">[${esc(p.clan.tag)}]</span> ` : ''}${esc(p.name)} ${p.online ? '<span class="dot on"></span>' : '<span class="dot"></span>'}</div>
      <div class="pp-sub">${p.title ? `<span class="title-tag">${esc(p.title)}</span> · ` : ''}Niveau <b>${p.level}</b> · <span style="color:${p.rankColor}">${esc(p.rank)}</span>${p.rank !== 'Non classé' ? ` (${p.elo} Elo)` : ''}</div>
      <div class="muted small">Inscrit le ${new Date(p.created).toLocaleDateString('fr-FR')} · ${fmtDur(s.playTime)} de jeu${p.lfg ? ' · <span class="badge-ok">CHERCHE UNE ÉQUIPE</span>' : ''}${p.fairplay ? ' · <span class="gold">🤝 Fair-play</span>' : ''}</div>
      ${p.motto ? `<div class="pp-motto">« ${esc(p.motto)} »</div>` : ''}</div></div>
    ${p.showcase?.length ? `<div class="pp-showcase">${p.showcase.map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean).map(a => `<div class="sc-item">🏆<b>${esc(a.label)}</b><span class="muted small">${esc(a.desc)}</span></div>`).join('')}</div>` : ''}
    <div class="pp-stats">
      ${[['Parties', s.matches], ['Victoires', `${s.wins} (${pct(s.wins, s.matches)})`], ['K/D', kd(s.kills, s.deaths)], ['Éliminations', s.kills], ['Têtes', pct(s.hsKills, s.kills)], ['Précision', s.acc != null ? s.acc + ' %' : '—'], ['Duels gagnés', `${s.duelWins}/${s.duels}`], ['MVP', s.mvps]].map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}
    </div>
    <div class="pp-extra"><span>Meilleure série : <b>${p.bestStreak || 0}</b></span><span>Arme favorite : <b>${esc(WNAME(p.favWeapon))}</b></span><span>Tournois gagnés : <b>${p.tournamentWins || 0}</b></span></div>
    <div class="endorse-row">${ENDORSE_HTML(p.endorse)}</div>
    <details><summary>Statistiques par mode</summary>${MODE_STATS(p.modeStats)}</details>
    <div class="pp-ach">${(p.achievements || []).map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean).map(a => `<span class="ach-chip" title="${esc(a.desc)}">🏆 ${esc(a.label)}</span>`).join('') || '<span class="muted small">Aucun succès pour le moment.</span>'}</div>
    ${p.history?.length ? `<h3>DERNIÈRES PARTIES</h3><div class="hist mini">${p.history.slice(0, 5).map(histRow).join('')}</div>` : ''}
    <div class="pp-actions">${btns.join('')}</div>`);
  $('mmodal-in').onclick = e => {
    const a = e.target.closest('[data-pa]')?.dataset.pa; if (!a) return;
    if (a === 'add') { net.send('friendAdd', { name: p.name }); closeModal(); }
    if (a === 'clan') { net.send('clanInvite', { name: p.name }); closeModal(); }
    if (a === 'accept') { net.send('friendAccept', { name: p.name }); closeModal(); }
    if (a === 'block') { if (confirm(`Bloquer ${p.name} ? Tu ne verras plus ses messages.`)) { net.send('block', { name: p.name }); closeModal(); } }
    if (a === 'unblock') { net.send('unblock', { name: p.name }); closeModal(); }
    if (a === 'mp') { H.mpTo = p.name; closeModal(); showTab('friends'); }
    if (a === 'invite') { net.send('invite', { name: p.name }); closeModal(); }
    if (a === 'party') { net.send('partyInvite', { name: p.name }); closeModal(); }
    if (a === 'report') openReport(p.name);
    if (a === 'share') { const url = `${location.origin}/#profil=${encodeURIComponent(p.name)}`; (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast('Lien copié !'), () => toast(url, 6000)); }
    if (a === 'gift') { const n = Math.round(Number(prompt(`Combien d'Éclats offrir à ${p.name} ? (10 à 100, 100 par jour au maximum)`, '50'))); if (n) net.send('gift', { name: p.name, amount: n }); }
    if (a === 'compare') compareWith(p);
  };
}
// comparer ses statistiques avec celles d'un autre joueur
function compareWith(p) {
  const me = profile.stats || {}, o = p.stats || {};
  const rows = [['Parties', me.matches, o.matches], ['Victoires', pct(me.wins, me.matches), pct(o.wins, o.matches)], ['K/D', kd(me.kills, me.deaths), kd(o.kills, o.deaths)], ['Éliminations', me.kills, o.kills],
    ['Tirs à la tête', pct(me.hsKills, me.kills), pct(o.hsKills, o.kills)], ['Précision', pct(me.hits, me.shots), o.acc != null ? o.acc + ' %' : '—'], ['MVP', me.mvps || 0, o.mvps || 0], ['Duels gagnés', `${me.duelWins || 0}/${me.duels || 0}`, `${o.duelWins}/${o.duels}`],
    ['Niveau', profile.progress?.level ?? '—', p.level], ['Elo', profile.progress?.elo ?? '—', p.elo]];
  const num = v => parseFloat(String(v).replace(',', '.'));
  openModal(`<h2>COMPARAISON</h2><table class="tbl cmp"><tr><th></th><th>${esc(profile.name)}</th><th>${esc(p.name)}</th></tr>${rows.map(([l, a, b]) => { const x = num(a), y = num(b); return `<tr><td>${l}</td><td class="${x > y ? 'gold' : ''}">${a ?? '—'}</td><td class="${y > x ? 'gold' : ''}">${b ?? '—'}</td></tr>`; }).join('')}</table>`);
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
  <div class="panel pf-custom" style="--bn:${(BANNERS[pr.banner] || BANNERS.nuit).css}">
    <h3>PERSONNALISATION DU PROFIL</h3>
    <div class="pf-banners">${Object.entries(BANNERS).map(([id, b]) => `<button class="bn ${pr.banner === id ? 'on' : ''} ${li.level < b.level ? 'locked' : ''}" data-banner="${id}" style="background:${b.css}" title="${esc(b.name)}${li.level < b.level ? ` — niveau ${b.level}` : ''}">${li.level < b.level ? '🔒' : ''}<span>${esc(b.name)}</span></button>`).join('')}</div>
    <div class="row"><input id="pf-motto" maxlength="80" placeholder="Ta devise (affichée sur ton profil)" value="${esc(pr.motto || '')}"><button class="btn small" id="pf-motto-save">ENREGISTRER</button></div>
    <div class="set-label" style="margin-top:10px">Vitrine : 3 succès mis en avant</div>
    <div class="pf-show">${[0, 1, 2].map(i => `<select data-show="${i}"><option value="">— vide —</option>${pr.achievements.map(id => { const a = ACHIEVEMENTS.find(x => x.id === id); return a ? `<option value="${id}" ${pr.showcase?.[i] === id ? 'selected' : ''}>${esc(a.label)}</option>` : ''; }).join('')}</select>`).join('')}</div>
    <label class="check"><input type="checkbox" id="pf-lfg" ${pr.lfg ? 'checked' : ''}> Je cherche une équipe (visible par mes amis)</label>
    <label class="check"><input type="checkbox" id="pf-blockinv" ${pr.blockInvites ? 'checked' : ''}> Refuser toutes les invitations (salons et clans)</label>
    <label class="check"><input type="checkbox" id="pf-nowatch" ${pr.noWatch ? 'checked' : ''}> Refuser que mes amis regardent mes parties</label>
    <div class="row"><button class="btn ghost small" id="pf-share">🔗 COPIER LE LIEN DE MON PROFIL</button></div>
  </div>
  <div class="pf-stats">${[
    ['Parties', st.matches], ['Victoires', `${st.wins} · ${pct(st.wins, st.matches)}`], ['K/D', kd(st.kills, st.deaths)], ['Éliminations', st.kills], ['Assistances', st.assists || 0],
    ['Tirs à la tête', pct(st.hsKills, st.kills)], ['Précision', pct(st.hits, st.shots)], ['Dégâts', (st.dmg || 0).toLocaleString('fr-FR')], ['MVP', st.mvps || 0], ['Duels', `${st.duelWins}/${st.duels}`],
    ['Noyaux posés', st.plants || 0], ['Désamorçages', st.defuses || 0], ['As', st.aces || 0], ['Temps de jeu', fmtDur(st.playTime)], ['Série de connexion', `${pr.daily?.streak || 0} j (record ${pr.daily?.best || 0})`],
    ['Meilleure série', pr.bestStreak || 0], ['Arme favorite', esc(WNAME(Object.entries(pr.weaponKills || {}).sort((a, b) => b[1] - a[1])[0]?.[0]))], ['Tournois gagnés', pr.tournamentWins || 0],
  ].map(([l, v]) => `<div class="pf-stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div>
  <div class="pf-grid">
    <div class="panel"><h3>STATISTIQUES PAR AGENT</h3>${agents.length ? `<table class="tbl"><tr><th>Agent</th><th>Parties</th><th>Victoires</th><th>K/D</th><th>Dégâts / partie</th></tr>${agents.map(([id, a]) => `<tr><td>${agentIconHTML(id, 'sm')} ${esc(AGENTS[id]?.name || id)}</td><td>${a.matches}</td><td>${pct(a.wins, a.matches)}</td><td>${kd(a.kills, a.deaths)}</td><td>${Math.round((a.dmg || 0) / a.matches)}</td></tr>`).join('')}</table>` : '<p class="muted">Joue une partie pour voir tes statistiques.</p>'}</div>
    <div class="panel"><h3>STATISTIQUES PAR MODE</h3>${MODE_STATS(pr.modeStats)}</div>
    <div class="panel"><h3>ÉLIMINATIONS PAR ARME</h3>${Object.keys(pr.weaponKills || {}).length ? `<table class="tbl"><tr><th>Arme</th><th>Éliminations</th></tr>${Object.entries(pr.weaponKills).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w, n]) => `<tr><td>${esc(WNAME(w))}</td><td>${n}</td></tr>`).join('')}</table>` : '<p class="muted">Aucune élimination.</p>'}</div>
    <div class="panel"><h3>RECOMMANDATIONS REÇUES</h3><div class="endorse-row">${ENDORSE_HTML(pr.endorse)}</div>${Object.values(pr.endorse || {}).reduce((a, b) => a + b, 0) >= 10 ? '<p class="gold">🤝 Badge fair-play obtenu !</p>' : '<p class="muted small">10 recommandations = badge fair-play sur ton profil.</p>'}</div>
    <div class="panel"><h3>TOURNOIS</h3>${(pr.tourHist || []).length ? `<table class="tbl"><tr><th>Tournoi</th><th>Résultat</th><th>Date</th></tr>${pr.tourHist.map(t => `<tr><td>${esc(t.name)}</td><td class="${t.place === 'Vainqueur' ? 'gold' : ''}">${esc(t.place)}</td><td>${new Date(t.t).toLocaleDateString('fr-FR')}</td></tr>`).join('')}</table>` : '<p class="muted">Aucun tournoi joué. Inscris-toi dans l\'onglet TOURNOIS !</p>'}</div>
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
  root.querySelectorAll('[data-banner]').forEach(b => { b.onclick = () => { if (b.classList.contains('locked')) { toast(`Bannière débloquée au ${b.title.split('— ')[1] || 'niveau supérieur'}.`); return; } net.send('setProfile', { banner: b.dataset.banner }); }; });
  $('pf-motto-save').onclick = () => net.send('setProfile', { motto: $('pf-motto').value });
  root.querySelectorAll('[data-show]').forEach(sel => { sel.onchange = () => net.send('setProfile', { showcase: [...root.querySelectorAll('[data-show]')].map(x => x.value).filter(Boolean) }); });
  $('pf-lfg').onchange = e => net.send('setProfile', { lfg: e.target.checked });
  $('pf-blockinv').onchange = e => net.send('setProfile', { blockInvites: e.target.checked });
  $('pf-nowatch').onchange = e => net.send('setProfile', { noWatch: e.target.checked });
  $('pf-share').onclick = () => { const url = `${location.origin}/#profil=${encodeURIComponent(profile.name)}`; (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => toast('Lien copié : ' + url, 4000), () => toast(url, 6000)); };
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
  const n = H.friends.incoming.length + Object.values(H.unread).reduce((a, b) => a + b, 0), on = H.friends.friends.filter(f => f.online).length;
  $('friends-badge').textContent = n ? n : on ? on : '';
  $('friends-badge').className = 'nav-badge' + (n ? ' warn' : '');
}
function renderRecent() {
  const el = $('fr-recent'); if (!el) return;
  const d = H.recent;
  if (!d) return;
  el.innerHTML = (d.suggestions.length ? `<div class="set-label">Suggestions d'amis (joueurs souvent croisés)</div>${d.suggestions.map(r => `<div class="fr-row"><b class="link" data-f="profile" data-n="${esc(r.name)}">${esc(r.name)}</b><span class="muted small">niv. ${r.level} · ${r.n} parties ensemble</span><span class="grow"></span><button class="btn small primary" data-f="radd" data-n="${esc(r.name)}">＋ AMI</button></div>`).join('')}<div class="set-label" style="margin-top:10px">Toutes tes dernières rencontres</div>` : '')
    + (d.rows.map(r => `<div class="fr-row ${r.online ? 'on' : ''}"><span class="dot ${r.online ? 'on' : ''}"></span><b class="link" data-f="profile" data-n="${esc(r.name)}">${esc(r.name)}</b><span class="muted small">niv. ${r.level} · ${ago(r.t)}</span><span class="grow"></span>${r.friend ? '<span class="badge-ok small">AMI</span>' : `<button class="btn ghost small" data-f="radd" data-n="${esc(r.name)}">＋ AMI</button>`}<button class="btn ghost small" data-f="rrep" data-n="${esc(r.name)}" title="Signaler">⚑</button></div>`).join('') || '<p class="muted small">Les joueurs (avec un compte) croisés en partie apparaîtront ici.</p>');
}
export function renderFriends() {
  const root = $('friends-root');
  if (state.guest) { root.innerHTML = '<div class="panel empty-big">Les amis, les invitations et les messages privés sont réservés aux comptes.</div>'; return; }
  const F = H.friends;
  const inRoom = !!state.room;
  root.innerHTML = `<div class="fr-grid">
    <div>
      ${partyPanel()}
      <div class="panel"><h3>AJOUTER UN AMI</h3><form id="fr-add" class="fr-add"><input id="fr-name" maxlength="16" placeholder="Pseudo du joueur"><button class="btn primary" type="submit">AJOUTER</button></form></div>
      ${F.incoming.length ? `<div class="panel"><h3>DEMANDES REÇUES (${F.incoming.length})</h3>${F.incoming.map(n => `<div class="fr-row"><b>${esc(n)}</b><span class="grow"></span><button class="btn primary small" data-f="accept" data-n="${esc(n)}">ACCEPTER</button><button class="btn ghost small" data-f="decline" data-n="${esc(n)}">REFUSER</button></div>`).join('')}</div>` : ''}
      <div class="panel"><h3>MES AMIS (${F.friends.filter(f => f.online).length} en ligne / ${F.friends.length})</h3>
        ${F.friends.map(f => `<div class="fr-row ${f.online ? 'on' : ''}"><button class="pin ${f.pinned ? 'on' : ''}" data-f="pin" data-n="${esc(f.name)}" title="${f.pinned ? 'Retirer des favoris' : 'Épingler en haut de la liste'}">★</button><span class="dot ${f.online ? 'on' : ''}"></span><div class="fr-who">${f.clan ? `<span class="clan-tag">[${esc(f.clan)}]</span> ` : ''}<b class="link" data-f="profile" data-n="${esc(f.name)}">${esc(f.name)}</b> <span class="muted small">niv. ${f.level}${f.title ? ' · ' + esc(f.title) : ''}</span>${f.lfg ? ' <span class="badge-ok small">CHERCHE UNE ÉQUIPE</span>' : ''}<div class="muted small">${esc(f.status)}${f.roomName ? ` · ${esc(f.roomName)}` : ''}${!f.online && f.lastSeen ? ` · vu ${ago(f.lastSeen)}` : ''}</div></div>
          <span class="grow"></span>
          ${f.watch && !inRoom ? `<button class="btn small" data-f="watch" data-n="${esc(f.name)}" title="Regarder sa partie en spectateur (différé de 10 s)">👁 REGARDER</button>` : ''}
          ${f.roomId && !f.full ? `<button class="btn small" data-f="join" data-n="${esc(f.name)}">REJOINDRE</button>` : ''}
          ${f.online && inRoom && f.roomId !== state.room?.id ? `<button class="btn small" data-f="invite" data-n="${esc(f.name)}">INVITER</button>` : ''}
          ${f.online && (!H.party || H.party.lead) && !(H.party?.members || []).some(m => m.name === f.name) ? `<button class="btn ghost small" data-f="party" data-n="${esc(f.name)}" title="Inviter dans mon groupe (jusqu'à 4 joueurs)">＋ GROUPE</button>` : ''}
          ${f.online || H.unread[f.name] ? `<button class="btn ghost small ${H.unread[f.name] ? 'unread' : ''}" data-f="mp" data-n="${esc(f.name)}">MP${H.unread[f.name] ? ` <b class="nav-badge warn">${H.unread[f.name]}</b>` : ''}</button>` : ''}
          ${H.clanStaff?.() && !f.clan ? `<button class="btn ghost small" data-f="clan" data-n="${esc(f.name)}" title="Inviter dans mon clan">CLAN</button>` : ''}
          <button class="btn ghost small" data-f="remove" data-n="${esc(f.name)}" title="Retirer de mes amis">✕</button></div>`).join('') || '<p class="muted">Ajoute des amis avec leur pseudo, ou depuis le classement et les salons.</p>'}
      </div>
      <div class="panel"><h3>JOUEURS RÉCENTS</h3><div id="fr-recent"><p class="muted small">Chargement…</p></div></div>
      ${F.blocked.length ? `<div class="panel"><h3>JOUEURS BLOQUÉS</h3>${F.blocked.map(n => `<div class="fr-row"><b>${esc(n)}</b><span class="grow"></span><button class="btn ghost small" data-f="unblock" data-n="${esc(n)}">DÉBLOQUER</button></div>`).join('')}</div>` : ''}
    </div>
    <div class="panel fr-mp"><h3>MESSAGES PRIVÉS</h3>
      <div class="mp-to">À : <select id="mp-to"><option value="">— choisir —</option>${[...new Set([...F.friends.filter(f => f.online).map(f => f.name), ...(H.mpTo ? [H.mpTo] : [])])].map(n => `<option ${n === H.mpTo ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div id="mp-log" class="mp-log"></div>
      <form id="mp-form" class="fr-add"><input id="mp-text" maxlength="200" placeholder="Ton message…"><button class="btn primary" type="submit">ENVOYER</button></form>
      <p class="muted small">Dans le chat d'un salon, tu peux aussi écrire <b>/mp pseudo message</b> ou <b>/r message</b> pour répondre.</p>
    </div></div>`;
  renderWhispers();
  net.send('recent');
  renderRecent();
  $('fr-add').onsubmit = e => { e.preventDefault(); const n = $('fr-name').value.trim(); if (n) net.send('friendAdd', { name: n }); $('fr-name').value = ''; };
  $('mp-to').onchange = e => { H.mpTo = e.target.value || null; if (H.mpTo) { delete H.unread[H.mpTo]; updateFriendsBadge(); } renderWhispers(); };
  if ($('party-chat')) $('party-chat').onsubmit = e => { e.preventDefault(); const t = $('party-chat-in').value.trim(); if (t) net.send('partyChat', { text: t }); $('party-chat-in').value = ''; };
  $('mp-form').onsubmit = e => { e.preventDefault(); const t = $('mp-text').value.trim(); if (!H.mpTo) { toast('Choisis un destinataire.'); return; } if (t) net.send('whisper', { name: H.mpTo, text: t }); $('mp-text').value = ''; };
  root.onclick = e => {
    const b = e.target.closest('[data-f]'); if (!b) return;
    const n = b.dataset.n, f = b.dataset.f;
    if (f === 'accept') net.send('friendAccept', { name: n });
    if (f === 'decline') net.send('friendDecline', { name: n });
    if (f === 'remove' && confirm(`Retirer ${n} de tes amis ?`)) net.send('friendRemove', { name: n });
    if (f === 'unblock') net.send('unblock', { name: n });
    if (f === 'join') net.send('joinFriend', { name: n });
    if (f === 'watch') net.send('watchFriend', { name: n });
    if (f === 'invite') net.send('invite', { name: n });
    if (f === 'mp') { H.mpTo = n; delete H.unread[n]; updateFriendsBadge(); renderFriends(); $('mp-text')?.focus(); }
    if (f === 'party') net.send('partyInvite', { name: n });
    if (f === 'pleave' && confirm('Quitter le groupe ?')) net.send('partyLeave');
    if (f === 'pkick') net.send('partyKick', { name: n });
    if (f === 'plead') net.send('partyPromote', { name: n });
    if (f === 'profile') viewProfile(n);
    if (f === 'pin') net.send('pinFriend', { name: n });
    if (f === 'clan') net.send('clanInvite', { name: n });
    if (f === 'radd') net.send('friendAdd', { name: n });
    if (f === 'rrep') openReport(n);
  };
}
function renderWhispers() {
  const log = $('mp-log'); if (!log) return;
  const who = H.mpTo;
  const msgs = H.whispers.filter(m => !who || m.from === who || m.to === who);
  log.innerHTML = msgs.map(m => `<div class="${m.to ? 'out' : 'in'}"><span class="muted small">${fmtDate(m.t)}</span> <b>${esc(m.to ? 'Moi' : m.from)}</b> : ${esc(m.text)}</div>`).join('') || '<div class="muted">Aucun message.</div>';
  log.scrollTop = log.scrollHeight;
}

// ---------- groupe (jusqu'à 4 amis) ----------
function partyPanel() {
  const p = H.party;
  if (!p) return `<div class="panel party-panel"><h3>GROUPE</h3><p class="muted small">Forme un groupe avec jusqu'à 3 amis (bouton <b>＋ GROUPE</b> ci-dessous) : quand le chef rejoint ou lance une partie, tout le groupe le suit, dans la même équipe.</p></div>`;
  return `<div class="panel party-panel"><h3>MON GROUPE (${p.members.length}/${p.max})</h3>
    ${p.members.map(m => `<div class="fr-row on"><span class="dot on"></span><div class="fr-who"><b>${m.leader ? '👑 ' : ''}${esc(m.name)}</b>${m.me ? ' <span class="muted small">(toi)</span>' : ''}<div class="muted small">${esc(m.status)}${m.roomName ? ' · ' + esc(m.roomName) : ''}</div></div><span class="grow"></span>
      ${p.lead && !m.me ? `<button class="btn ghost small" data-f="plead" data-n="${esc(m.name)}" title="Nommer chef">👑</button><button class="btn ghost small" data-f="pkick" data-n="${esc(m.name)}" title="Retirer du groupe">✕</button>` : ''}</div>`).join('')}
    <form id="party-chat" class="fr-add"><input id="party-chat-in" maxlength="140" placeholder="Message au groupe (ou /g message)"><button class="btn ghost" type="submit">ENVOYER</button></form>
    <p class="muted small">${p.lead ? 'Tu es le chef : lance une partie (Mêlée, Entraînement, salon…), ton groupe te suit.' : `Tu suis <b>${esc(p.leader)}</b> dans ses parties.`}</p>
    <button class="btn ghost small" data-f="pleave">QUITTER LE GROUPE</button></div>`;
}
// petit encadré du groupe sur l'écran Jouer
export function renderPartyBar() {
  let el = $('party-bar');
  const host = document.querySelector('#tab-play .quick-actions');
  if (!host) return;
  if (!el) { el = document.createElement('div'); el.id = 'party-bar'; host.parentNode.insertBefore(el, host.nextSibling); el.onclick = e => { if (e.target.closest('[data-pb]')) showTab('friends'); }; }
  const p = H.party;
  el.classList.toggle('hidden', !p);
  if (p) el.innerHTML = `<b>GROUPE ${p.members.length}/${p.max}</b> ${p.members.map(m => `<span class="pb-m ${m.leader ? 'lead' : ''}">${m.leader ? '👑 ' : ''}${esc(m.name)}</span>`).join('')}<span class="grow"></span><span class="muted small">${p.lead ? 'ton groupe te suivra' : `tu suis ${esc(p.leader)}`}</span><button class="btn ghost small" data-pb>GÉRER</button>`;
}

// invitation depuis le salon
export function openInvitePicker() {
  const online = H.friends.friends.filter(f => f.online && f.roomId !== state.room?.id);
  openModal(`<h2>INVITER UN AMI</h2>${online.length ? online.map(f => `<div class="fr-row"><span class="dot on"></span><b>${esc(f.name)}</b><span class="muted small">${esc(f.status)}</span><span class="grow"></span><button class="btn primary small" data-inv="${esc(f.name)}">INVITER</button></div>`).join('') : '<p class="muted">Aucun ami connecté disponible. Ajoute des amis dans l\'onglet AMIS.</p>'}
    ${state.room?.code ? `<p>Code du salon : <b class="code">${esc(state.room.code)}</b> — partage-le à n'importe qui.</p>` : ''}`);
  $('mmodal-in').onclick = e => { const b = e.target.closest('[data-inv]'); if (b) { net.send('invite', { name: b.dataset.inv }); b.disabled = true; b.textContent = 'INVITÉ'; } };
}
