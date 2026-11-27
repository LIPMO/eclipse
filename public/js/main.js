// Interface hors-jeu : connexion, salons, agents, collection, paramètres.
import './i18n.js';
import * as THREE from 'three';
import { Net } from './net.js';
import { Game } from './game.js';
import { profile, save, session, setToken, applyServerProfile } from './store.js';
import { AGENTS, AGENT_ORDER, SKINS, SKINNABLE, WEAPONS, isFfa, RARITY, rarityOf, ROLES, ABILITY_ICONS, OUTFITS, CUSTOM_RULES, CUSTOM_FLAGS, cleanCustomOpts, customSummary } from '/shared/data.js';
import { parseMap, MAP_INFO, mapsForMode } from '/shared/maps.js';
import { masteryOf, BANNERS, TITLES, setKey } from '/shared/progress.js';
import { buildWeapon, buildCharacter, agentIconHTML, drawMapPreview, animateSkins, skinSwatch } from './models.js';
import * as SFX from './audio.js';
import { mountSettings, keyName, sanitizeSettings, applyPreset, loadCustomSounds } from './settings.js';
import { initClans, openClanTab } from './clans.js';
import { initTournaments, openTournamentsTab } from './tournaments.js';
import { initHub, renderLevel, renderQuests, renderProfile, renderFriends, renderLeaderboard, loadLeaderboard, renderEvent, notify, viewProfile, openReport, openInvitePicker, openGuide, maybeShowGuide, hub, emojify, renderPartyBar, startTour, openFeedback, openModal, closeModal, presTag } from './hub.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MODE_LABEL = { assault: 'ASSAUT 5v5', duel: 'DUEL 1v1', ffa: 'MÊLÉE', gungame: 'GUN GAME', lives: 'DERNIER DEBOUT' };
const TARGETS = { assault: [3, 5, 7, 9, 13], duel: [3, 5, 7, 9], ffa: [10, 15, 25, 40], gungame: [8], lives: [1, 2, 3, 5] };
const DIFF_LABEL = { easy: 'Facile', normal: 'Normal', hard: 'Difficile', expert: 'Expert', cible: 'Cibles' };

const net = new Net();
// erreurs JavaScript du navigateur remontées à l'équipe (5 par session, sans données personnelles)
{
  let sent = 0;
  const report = (text, src, line) => {
    if (++sent > 5) return;
    const file = String(src || '').replace(location.origin, '').split('?')[0];
    net.send('clientError', { text: String(text || '').slice(0, 200), src: file.slice(0, 120), line: line || 0, ua: navigator.userAgent.slice(0, 120) });
  };
  window.addEventListener('error', e => { if (e.message) report(e.message, e.filename, e.lineno); });
  window.addEventListener('unhandledrejection', e => report('Promesse rejetée : ' + (e.reason?.message || e.reason), '', 0));
}
const state = { myId: null, guest: true, room: null, rooms: [], game: null, tab: 'login', create: { mode: 'assault', map: 'dune', diff: 'normal' }, authMode: 'login', collWeapon: 'lancer', collSkin: null, agentView: 'ignis' };

// ======================= UTILITAIRES =======================
function toast(text, ms = 3000) {
  const t = $('toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}

function showTab(name) {
  state.tab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === name || (name === 'room' && b.dataset.tab === 'play')));
  if (name === 'agents') renderAgents();
  if (name === 'collection') renderCollection();
  if (name === 'shop') openShopTab();
  if (name === 'settings') mountSettings($('settings-root'));
  if (name === 'play') { net.send('listRooms'); if (!state.guest) net.send('friends'); renderMeCard(); renderQuests(); renderEvent(); renderPartyBar(); renderLobby(); renderFriendsPlaying(state.friendsList); renderPlayCustom(); }
  if (name === 'profile') { net.send('myProfile'); renderProfile(); }
  if (name === 'leaderboard') { renderLeaderboard(); loadLeaderboard(); }
  if (name === 'friends') { net.send('friends'); renderFriends(); }
  if (name === 'clan') openClanTab();
  if (name === 'tournaments') openTournamentsTab();
  previews.active = name === 'agents' ? 'agent' : name === 'collection' ? 'coll' : name === 'play' ? 'lobby' : null;
}

// raccourcis du menu : chiffres 1 à 9 pour les onglets, ? pour la liste des raccourcis
const TAB_KEYS = ['play', 'agents', 'collection', 'profile', 'leaderboard', 'friends', 'clan', 'tournaments', 'settings'];
document.querySelectorAll('.nav button').forEach(b => { const i = TAB_KEYS.indexOf(b.dataset.tab); if (i >= 0) b.title = `Raccourci : touche ${i + 1}`; });
document.addEventListener('keydown', e => {
  if (state.game || e.ctrlKey || e.metaKey || e.altKey || !state.myId || $('nav').classList.contains('locked')) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '') || document.getElementById('tour') || $('mmodal').classList.contains('show')) return;
  if (state.tab === 'settings' && /^[1-9]$/.test(e.key) && document.querySelector('.keybtn.wait')) return;
  if (/^[1-9]$/.test(e.key)) { const t = TAB_KEYS[+e.key - 1]; if (t && !(t === 'play' && state.room)) { e.preventDefault(); showTab(t); } else if (t === 'play' && state.room) showTab('room'); return; }
  if (e.key === '?') { e.preventDefault(); openShortcuts(); }
});
// 1.15 : touche pour couper / remettre tout le son, au menu comme en partie
document.addEventListener('keydown', e => {
  const k = profile.settings.keys?.muteAll;
  if (!k || e.code !== k || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '') || document.querySelector('.keybtn.wait')) return;
  e.preventDefault();
  const m = SFX.toggleMute();
  toast(m ? '🔇 Son coupé (' + keyName(k) + ' pour le remettre)' : '🔊 Son rétabli', 2200);
}, true);
function openShortcuts() {
  const names = ['Jouer', 'Agents', 'Collection', 'Profil', 'Classement', 'Amis', 'Clan', 'Tournois', 'Paramètres'];
  $('mmodal-in').innerHTML = `<button class="mx" data-close>✕</button><h2>RACCOURCIS CLAVIER</h2><div class="g-keys">${names.map((n, i) => `<div><kbd>${i + 1}</kbd> ${n}</div>`).join('')}<div><kbd>?</kbd> cette liste</div><div><kbd>/</kbd> chercher un réglage (Paramètres)</div><div><kbd>Entrée</kbd> écrire dans le chat (salon)</div><div><kbd>Échap</kbd> fermer une fenêtre</div></div>
    <p class="muted small">En partie, toutes les touches se règlent dans PARAMÈTRES → Touches.</p><button class="btn ghost" id="sc-tour">LANCER LA VISITE GUIDÉE</button>`;
  $('mmodal').classList.add('show');
  $('mmodal-in').querySelector('[data-close]').onclick = () => $('mmodal').classList.remove('show');
  $('sc-tour').onclick = () => { $('mmodal').classList.remove('show'); startTour(); };
}

function refreshProfileUI() {
  $('eclats').textContent = profile.eclats;
  $('profile-name').innerHTML = esc(profile.name || '—') + (state.myId ? (state.guest ? '<span class="badge guest">INVITÉ</span>' : '<span class="badge">COMPTE</span>') : '');
  renderMeCard();
  renderLevel();
  if (state.tab === 'collection') renderCollection();
  if (state.tab === 'play') renderQuests();
  if (state.tab === 'profile') renderProfile();
}
document.addEventListener('eclats-changed', refreshProfileUI);

// ======================= AUTHENTIFICATION =======================
function setAuthMode(mode) {
  state.authMode = mode;
  document.querySelectorAll('#auth-tabs button').forEach(b => b.classList.toggle('active', b.dataset.v === mode));
  $('auth-pass').style.display = mode === 'guest' ? 'none' : 'block';
  $('auth-pass2').style.display = mode === 'register' ? 'block' : 'none';
  $('auth-pass').autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('auth-submit').textContent = { login: 'SE CONNECTER', register: 'CRÉER MON COMPTE', guest: 'JOUER EN INVITÉ' }[mode];
  $('auth-help').textContent = mode === 'guest'
    ? 'En invité, ta progression est gardée uniquement dans ce navigateur.'
    : 'Un compte sauvegarde tes Éclats, tes skins et tes statistiques sur le serveur.';
  $('auth-error').textContent = '';
}
document.querySelectorAll('#auth-tabs button').forEach(b => b.onclick = () => setAuthMode(b.dataset.v));
$('auth-form').onsubmit = e => {
  e.preventDefault();
  SFX.initAudio();
  const name = $('auth-name').value.trim(), pass = $('auth-pass').value;
  if (!name) { $('auth-error').textContent = 'Entre un pseudo.'; return; }
  if (state.authMode === 'guest') {
    profile.name = name; save();
    net.send('hello', { name, skins: profile.equipped, agent: profile.agent });
  } else {
    if (state.authMode === 'register' && pass !== $('auth-pass2').value) { $('auth-error').textContent = 'Les mots de passe ne correspondent pas.'; return; }
    net.send(state.authMode, { name, password: pass });
  }
  $('auth-submit').disabled = true;
  setTimeout(() => { $('auth-submit').disabled = false; }, 1500);
};
$('logout-btn').onclick = () => {
  if (!session.account) { location.reload(); return; }
  net.send('logout');
  setToken(null);
  setTimeout(() => location.reload(), 200);
};

net.on('welcome', m => {
  net.send('shop'); // pastille « ! » sur l'onglet BOUTIQUE quand une nouvelle boutique n'a pas été vue
  state.myId = m.id;
  state.guest = !!m.guest;
  session.account = !m.guest;
  if (m.token) setToken(m.token);
  setMotd(m.motd);
  state.event = m.event || null;
  // favoris et record du défi enregistrés seulement sur cet appareil (avant 1.15) : envoyés au compte
  const localFavs = Array.isArray(profile.loadouts) ? profile.loadouts.slice() : null;
  if (m.profile) applyServerProfile(m.profile);
  else { profile.name = m.name; save(); }
  if (!m.guest && m.profile) {
    if (!m.profile.progress?.loadouts && localFavs?.some(Boolean)) { profile.loadouts = localFavs; net.send('saveLoadouts', { loadouts: localFavs }); }
    let aim = 0; try { aim = +localStorage.getItem('eclipse_aim_best') || 0; } catch { /* */ }
    if (aim > (m.profile.progress?.aimBest || 0)) net.send('aimRecord', { score: aim });
  }
  profile.name = m.name;
  $('nav').classList.remove('locked');
  $('logout-btn').style.display = '';
  refreshProfileUI();
  showTab('play');
  maybeShowGuide();
});
net.on('authError', m => {
  $('auth-submit').disabled = false;
  if (m.expired) { setToken(null); showTab('login'); }
  $('auth-error').textContent = m.text;
});
net.on('profile', m => { applyServerProfile(m.profile); refreshProfileUI(); });
net.on('kicked', m => { toast(m.text, 6000); setToken(null); });
net.on('error', m => toast(m.text));

// ---------- messages du staff (annonces, messages privés, expulsions, message du jour) ----------
let sysTimer = null;
state.kicked = false;
function sysNotice(kind, text, ms = 9000) {
  const el = $('sys-notice');
  el.querySelector('.sn-kind').textContent = kind;
  el.querySelector('.sn-text').textContent = text;
  el.classList.add('show');
  el.classList.toggle('kick', kind.startsWith('EXPULS') || kind.startsWith('DÉCONNECT'));
  clearTimeout(sysTimer);
  if (ms) sysTimer = setTimeout(() => el.classList.remove('show'), ms);
}
$('sys-notice').querySelector('.sn-x').onclick = () => $('sys-notice').classList.remove('show');
function setMotd(text) { $('motd').textContent = text || ''; $('motd').classList.toggle('hidden', !text); }
net.on('system', m => {
  if (m.kind === 'motd') return setMotd(m.text);
  if (m.kind === 'kick') { state.kicked = true; return sysNotice('EXPULSÉ DU SERVEUR', m.text, 0); }
  if (m.kind === 'broadcast') return sysNotice(`ANNONCE · ${m.from || 'ÉQUIPE'}`, m.text, 12000);
  if (m.kind === 'pm') return sysNotice(`MESSAGE DE ${m.from || 'L\'ÉQUIPE'}`, m.text, 15000);
  if (m.kind === 'warn') return sysNotice(`AVERTISSEMENT DE ${m.from || 'L\'ÉQUIPE'}`, m.text + '\nAu bout de plusieurs avertissements, ton compte est suspendu automatiquement.', 0);
  if (m.kind === 'gift') return sysNotice('CADEAU', m.text, 12000);
  if (m.kind === 'staff') return notify({ kind: 'STAFF', text: m.text, ms: 10000 });
  sysNotice('INFORMATION', m.text, 8000);
});

// ======================= JOUER : SALONS =======================
function renderMeCard() {
  if (!$('me-card')) return; // remplacé par le salon de groupe (1.17)
  const st = profile.stats;
  const kd = st && st.deaths ? (st.kills / st.deaths).toFixed(2) : (st?.kills || 0);
  const pr = profile.progress;
  $('me-card').innerHTML = `${agentIconHTML(profile.agent, 'lg')}<div><div class="nm">${esc(profile.name || '')}${state.guest ? '<span class="badge guest">INVITÉ</span>' : pr ? `<span class="badge lvl">${presTag(pr.prestige)}NIV. ${pr.level}</span>${pr.ranked ? `<span class="badge" style="color:${pr.rankColor}">${esc(pr.rank)}</span>` : ''}` : ''}</div>
    <div class="st">${st && !state.guest ? `${st.matches} parties · ${st.wins} victoires · ${st.duelWins}/${st.duels} duels gagnés · K/D ${kd}` : 'Crée un compte pour suivre tes statistiques'}</div></div>`;
}

// salons favoris (gardés sur cet appareil, par nom de salon)
const favRooms = (() => { try { return new Set(JSON.parse(localStorage.getItem('eclipse_fav_rooms') || '[]')); } catch { return new Set(); } })();
const saveFav = () => { try { localStorage.setItem('eclipse_fav_rooms', JSON.stringify([...favRooms].slice(-30))); } catch { /* */ } };
function renderRooms() {
  const list = $('room-list');
  const f = state.roomFilter || 'all', free = $('room-free')?.checked;
  const shown = state.rooms.filter(r => (f === 'all' || (f === 'custom' ? r.custom : f === 'other' ? ['gungame', 'lives'].includes(r.mode) : r.mode === f)) && (!free || r.humans < r.max));
  if (!shown.length) { list.innerHTML = `<div class="empty">${state.rooms.length ? 'Aucun salon ne correspond à ce filtre.' : 'Aucun salon ouvert pour le moment. Lance une partie depuis le salon de groupe, ou crée une partie perso publique !'}</div>`; return; }
  const rows = shown.sort((a, b) => favRooms.has(b.name) - favRooms.has(a.name));
  list.innerHTML = rows.map(r => `<div class="room-item ${favRooms.has(r.name) ? 'fav' : ''}" data-id="${r.id}">
    <button class="fav-star ${favRooms.has(r.name) ? 'on' : ''}" data-fav="${esc(r.name)}" title="${favRooms.has(r.name) ? 'Retirer des favoris' : 'Ajouter aux favoris'}">★</button>
    <div><div class="rn">${r.locked ? '<span title="Protégé par un mot de passe">🔒</span> ' : ''}${r.custom ? '<span title="Partie perso (règles modifiées)">🛠</span> ' : ''}${esc(r.name)}</div><div class="muted">${esc(MAP_INFO[r.mapId]?.name || r.mapId)} · ${r.humans} joueur(s)</div></div>
    <span class="pill ${r.mode === 'duel' ? 'duel' : ''}">${MODE_LABEL[r.mode]}</span>
    <span class="pill ${r.state === 'playing' ? 'playing' : ''}">${r.state === 'playing' ? 'EN JEU' : 'LOBBY'}</span>
    <span>${r.players}/${r.max}</span></div>`).join('');
}
$('room-list').onclick = e => {
  const star = e.target.closest('[data-fav]');
  if (star) { const n = star.dataset.fav; if (favRooms.has(n)) favRooms.delete(n); else favRooms.add(n); saveFav(); renderRooms(); toast(favRooms.has(n) ? `« ${n} » ajouté à tes favoris.` : 'Retiré des favoris.'); return; }
  const it = e.target.closest('.room-item'); if (it) net.send('joinRoom', { id: it.dataset.id });
};
$('refresh-rooms').onclick = () => net.send('listRooms');
net.on('rooms', m => { state.rooms = m.rooms; renderRooms(); });
$('open-guide').onclick = openGuide;
$('code-form').onsubmit = e => { e.preventDefault(); const code = $('code-input').value.trim(); if (code) net.send('joinCode', { code }); $('code-input').value = ''; };
// filtres des salons ouverts
state.roomFilter = 'all';
$('room-filter').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; state.roomFilter = b.dataset.v; $('room-filter').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); renderRooms(); };
$('room-free').onchange = () => renderRooms();
// amis en ligne : rejoindre leur salon ou regarder leur partie en un clic
function renderFriendsPlaying(list) {
  const el = $('pb-friends'); if (!el) return;
  if (state.guest) { el.innerHTML = '<p class="muted small">Crée un compte pour ajouter des amis et jouer ensemble.</p>'; return; }
  const on = (list || []).filter(f => f.online).sort((a, b) => (b.roomId ? 1 : 0) - (a.roomId ? 1 : 0));
  const inParty = new Set((hub.party?.members || []).map(m => m.name));
  el.innerHTML = on.length ? on.slice(0, 8).map(f => `<div class="pbf-row"><span class="dot on"></span><div class="pbf-who"><b>${esc(f.alias || f.name)}</b><div class="muted small">${esc(f.customStatus || f.status || '')}${f.roomName ? ' · ' + esc(f.roomName) : ''}</div></div><span class="grow"></span>
      ${!inParty.has(f.name) && (!hub.party || hub.party.lead) && (f.presence || 'online') === 'online' && !f.dnd ? `<button class="btn ghost small" data-pf="party" data-n="${esc(f.name)}" title="Inviter dans mon groupe">＋ GROUPE</button>` : ''}
      ${f.watch ? `<button class="btn ghost small" data-pf="watch" data-n="${esc(f.name)}" title="Regarder sa partie (différé de 10 s)">👁</button>` : ''}
      ${f.roomId && !f.full ? `<button class="btn small" data-pf="join" data-n="${esc(f.name)}">REJOINDRE</button>` : ''}</div>`).join('') + (on.length > 8 ? `<p class="muted small">+${on.length - 8} autre(s) en ligne</p>` : '')
    : '<p class="muted small">Aucun ami en ligne pour le moment. Ajoute des amis dans l\'onglet AMIS.</p>';
}
$('pb-friends').onclick = e => {
  const b = e.target.closest('[data-pf]'); if (!b) return;
  const n = b.dataset.n, a = b.dataset.pf;
  if (a === 'join') net.send('joinFriend', { name: n });
  else if (a === 'watch') net.send('watchFriend', { name: n });
  else if (a === 'party') { net.send('partyInvite', { name: n, cfg: lobby.cfg }); b.disabled = true; b.textContent = 'INVITÉ'; }
};
$('pb-friends-all').onclick = () => showTab('friends');
net.on('friends', m => { state.friendsList = m.friends || []; if (state.tab === 'play') renderFriendsPlaying(state.friendsList); });

// ======================= SALON =======================
net.on('room', m => {
  state.room = m.room; renderRoom(); if (state.tab !== 'room' && !state.game) showTab('room');
  if (state.autoStartRange && Date.now() - state.autoStartRange < 15000 && m.room?.hostId === state.myId && m.room.state === 'lobby' && m.room.difficulty === 'cible') { state.autoStartRange = 0; net.send('start'); }
});
net.on('left', () => { state.room = null; if (!state.game) showTab('play'); });
net.on('chat', m => {
  if (state.game) return;
  const log = $('chat-log');
  const d = document.createElement('div');
  if (m.from === 'SYSTÈME') d.className = 'sys';
  if (m.from !== 'SYSTÈME' && profile.settings.chatMode === 'off') return;
  const from = profile.settings.streamer && m.from !== 'SYSTÈME' && m.from !== profile.name ? 'Joueur' : m.from;
  const clickable = m.from !== 'SYSTÈME' && m.from !== 'GROUPE' && m.from !== profile.name && from === m.from && !String(m.from).startsWith('ADMIN');
  d.innerHTML = `${m.party ? '<span class="tag party">GROUPE</span>' : ''}${m.teamOnly ? '<span class="tag team">ÉQUIPE</span>' : ''}<b ${clickable ? `class="cn" data-cn="${esc(m.from)}" title="Profil, message, signaler…"` : ''}>${esc(from)}</b>${m.title ? ` <span class="title-tag">${esc(m.title)}</span>` : ''} : ${esc(emojify(m.text))}`;
  log.appendChild(d); log.scrollTop = log.scrollHeight;
});
// clic sur un pseudo du chat : petit menu (profil, message privé, signalement, blocage)
$('chat-log').addEventListener('click', e => {
  const b = e.target.closest('[data-cn]'); document.getElementById('name-menu')?.remove();
  if (!b) return;
  const n = b.dataset.cn, r = b.getBoundingClientRect();
  const menu = document.createElement('div'); menu.id = 'name-menu';
  menu.style.left = Math.min(innerWidth - 200, r.left) + 'px'; menu.style.top = (r.bottom + 4) + 'px';
  menu.innerHTML = `<b>${esc(n)}</b>${state.guest ? '' : '<button data-nm="profile">Voir le profil</button><button data-nm="mp">Message privé</button>'}<button data-nm="report">⚑ Signaler</button>${state.guest ? '' : '<button data-nm="block">Bloquer</button>'}`;
  document.body.appendChild(menu);
  menu.onclick = ev => {
    const a = ev.target.closest('[data-nm]')?.dataset.nm; if (!a) return; menu.remove();
    if (a === 'profile') viewProfile(n);
    if (a === 'mp') { $('chat-input').value = `/mp ${n} `; $('chat-input').focus(); }
    if (a === 'report') openReport(n);
    if (a === 'block' && confirm(`Bloquer ${n} ? Tu ne verras plus ses messages.`)) net.send('block', { name: n });
  };
  setTimeout(() => document.addEventListener('click', function off(ev) { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', off); } }), 0);
});
$('chat-input').onkeydown = e => {
  if (e.key !== 'Enter') return;
  const t = e.target.value.trim();
  if (t) net.send('chat', { text: t });
  e.target.value = '';
};

function renderRoom() {
  const r = state.room;
  if (!r) return;
  const host = r.hostId === state.myId;
  const me = r.members.find(m => m.id === state.myId);
  $('room-title').textContent = r.name;
  $('room-code').classList.toggle('hidden', !r.code);
  if (r.code) $('room-code').innerHTML = `SALON PRIVÉ · CODE <b>${esc(r.code)}</b> <button class="btn ghost small" id="copy-code">COPIER</button>`;
  if ($('copy-code')) $('copy-code').onclick = () => { navigator.clipboard?.writeText(r.code).then(() => toast('Code copié !'), () => toast(`Code : ${r.code}`)); };
  $('room-invite').style.display = state.guest ? 'none' : '';
  $('room-sub').textContent = `${r.mode === 'assault' && r.max !== 10 ? `ASSAUT ${r.max / 2}v${r.max / 2}` : MODE_LABEL[r.mode]} · ${MAP_INFO[r.mapId].name} · ${r.mode === 'gungame' ? `${r.target} armes` : r.mode === 'lives' ? `${r.target} vie(s)` : isFfa(r.mode) ? `${r.target} éliminations` : `premier à ${r.target} manches`} · bots ${DIFF_LABEL[r.difficulty]}${r.state === 'playing' ? ' · EN JEU' : ''}`;
  document.querySelector('.room-grid').classList.toggle('ffa', isFfa(r.mode));
  $('team-alpha').querySelector('h3').textContent = isFfa(r.mode) ? 'JOUEURS' : r.mode === 'duel' ? 'DUELLISTE 1' : 'ÉQUIPE ALPHA';
  $('team-beta').querySelector('h3').textContent = r.mode === 'duel' ? 'DUELLISTE 2' : 'ÉQUIPE OMÉGA';
  const member = m => {
    const a = AGENTS[m.agent];
    const other = !m.isBot && m.id !== state.myId;
    return `<div class="member ${m.id === state.myId ? 'me' : ''}" style="--c:${a?.color}">${agentIconHTML(m.agent)}
      <div class="mn">${m.level ? `<span class="mlvl">${presTag(m.prestige)}${m.level}</span>` : ''}${m.clan ? `<span class="clan-tag">[${esc(m.clan)}]</span> ` : ''}<span class="${m.account ? 'link' : ''}" ${m.account ? `data-prof="${esc(m.name)}"` : ''}>${profile.settings.streamer && m.id !== state.myId && !m.isBot ? 'Joueur' : esc(m.name)}</span> ${m.id === r.hostId ? '<span class="host">★ HÔTE</span>' : ''}${m.title ? ` <span class="title-tag">${esc(m.title)}</span>` : ''}<div class="ma">${a?.name || ''} · ${a?.role || ''}</div></div>
      ${other ? `<button class="x rep" data-report="${esc(m.name)}" title="Signaler ce joueur">⚑</button>` : ''}
      ${m.isBot && host && r.state === 'lobby' && !r.tournament ? `<div class="bot-set"><select data-botagent="${esc(m.id)}" title="Agent du bot">${AGENT_ORDER.map(id => `<option value="${id}" ${m.agent === id ? 'selected' : ''}>${esc(AGENTS[id].name)}</option>`).join('')}</select><select data-botdiff="${esc(m.id)}" title="Difficulté du bot"><option value="">Diff. salon</option>${Object.entries(DIFF_LABEL).filter(([k]) => k !== 'cible').map(([k, l]) => `<option value="${k}" ${m.botDiff === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : m.isBot && m.botDiff ? `<div class="muted small">${DIFF_LABEL[m.botDiff] || ''}</div>` : ''}
      ${m.isBot ? (host ? `<button class="x" data-rm="${m.id}" title="Retirer">✕</button>` : '<span class="muted">BOT</span>') : (m.ready ? '<span class="rdy">PRÊT</span>' : '')}</div>`;
  };
  const alpha = r.members.filter(m => m.team === 'alpha' || m.team === 'ffa');
  const beta = r.members.filter(m => m.team === 'beta');
  $('team-alpha').querySelector('.members').innerHTML = alpha.map(member).join('') || '<div class="empty">En attente…</div>';
  $('team-beta').querySelector('.members').innerHTML = beta.map(member).join('') || '<div class="empty">En attente…</div>';
  const cap = isFfa(r.mode) ? r.max : r.max / 2;
  document.querySelectorAll('[data-join]').forEach(b => {
    const n = (b.dataset.join === 'alpha' ? alpha : beta).length;
    b.style.display = isFfa(r.mode) || me?.team === b.dataset.join || r.state !== 'lobby' ? 'none' : '';
    b.disabled = n >= cap;
  });
  document.querySelectorAll('[data-bot]').forEach(b => {
    const n = isFfa(r.mode) ? r.members.length : (b.dataset.bot === 'alpha' ? alpha : beta).length;
    b.disabled = n >= cap || r.members.length >= r.max;
  });
  document.querySelectorAll('#tab-room .host-only').forEach(el => { el.style.display = host ? '' : 'none'; });
  // paramètres hôte
  const maps = mapsForMode(r.mode);
  $('rs-map').innerHTML = maps.map(id => `<option value="${id}">${MAP_INFO[id].name} — ${MAP_INFO[id].subtitle}</option>`).join('');
  $('rs-map').value = r.mapId;
  $('rs-mode').value = r.mode;
  document.querySelectorAll('[data-opt]').forEach(el => { el.checked = !!r.opts?.[el.dataset.opt]; });
  $('rs-pass').placeholder = r.hasPassword ? '🔒 Protégé — nouveau mot de passe (vide = retirer)' : 'Mot de passe du salon (facultatif)';
  $('rs-target').innerHTML = TARGETS[r.mode].map(t => `<option value="${t}">${r.mode === 'gungame' ? t + ' armes (fixe)' : r.mode === 'lives' ? t + ' vie(s) par joueur' : isFfa(r.mode) ? t + ' éliminations' : 'Premier à ' + t + ' manches'}</option>`).join('');
  if (!TARGETS[r.mode].includes(r.target)) $('rs-target').insertAdjacentHTML('beforeend', `<option value="${r.target}">${r.target}</option>`);
  $('rs-target').value = r.target;
  $('rs-diff').value = r.difficulty;
  // parties perso (1.16) : taille du salon, règles, résumé
  $('rs-size').innerHTML = (r.sizes || [r.max]).map(n => `<option value="${n}">${cgSizeLabel(r.mode, n)}</option>`).join('');
  $('rs-size').value = r.max;
  $('rs-rules').innerHTML = Object.entries(CUSTOM_RULES).filter(([, x]) => !x.modes || x.modes.includes(r.mode)).map(([k, x]) => `<label>${esc(x.label)}<select data-rrule="${k}">${x.opts.map(([v, l]) => `<option value="${v}" ${String(r.opts?.[k] ?? x.def) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('');
  const rchips = customSummary(r.opts, r.mode);
  $('room-rules').innerHTML = rchips.length ? `<span>🛠 PARTIE PERSO</span>${rchips.map(x => `<span>${esc(x)}</span>`).join('')}` : '';
  $('rs-save-cg').style.display = host && !state.guest ? '' : 'none';
  $('rs-private').checked = !!r.private;
  const cv = $('room-map-preview').querySelector('canvas');
  drawMapPreview(cv, parseMap(r.mapId));
  $('room-map-preview').querySelector('.map-name').textContent = MAP_INFO[r.mapId].name;
  // salle d'attente : départ automatique au bout d'une minute (ou dès que tout le monde est prêt)
  if (r.autoStartIn > 0 && r.state === 'lobby') { state.autoEnd = performance.now() + r.autoStartIn * 1000; if (!state.autoTimer) { state.autoTimer = setInterval(tickRoomAuto, 250); } tickRoomAuto(); }
  else { clearInterval(state.autoTimer); state.autoTimer = null; $('room-auto').classList.add('hidden'); }
  $('wu-open').style.display = r.state === 'lobby' ? '' : 'none';
  if (r.state !== 'lobby' && wu.run) { wu.run = false; cancelAnimationFrame(wu.raf); }
  $('room-start').style.display = host && r.state === 'lobby' ? '' : 'none';
  $('room-ready').style.display = r.state === 'lobby' ? '' : 'none';
  $('room-ready').classList.toggle('on', !!me?.ready);
  $('room-ready').textContent = me?.ready ? 'PRÊT ✓' : 'PRÊT';
  // choix d'agent
  const takenBy = new Map(r.members.filter(m => m.id !== state.myId && !m.isBot && !isFfa(r.mode) && m.team === me?.team).map(m => [m.agent, m.name]));
  $('agent-pick').innerHTML = AGENT_ORDER.map(id => {
    const a = AGENTS[id];
    return `<div class="agent-card ${me?.agent === id ? 'active' : ''} ${takenBy.has(id) ? 'taken' : ''}" data-id="${id}" style="--c:${a.color}">${agentIconHTML(id)}<div class="an">${a.name}</div><div class="ar">${takenBy.has(id) ? 'pris' : a.role}</div></div>`;
  }).join('');
  const a = AGENTS[me?.agent];
  $('agent-pick-info').innerHTML = a ? ['q', 'e', 'x'].map(k => `<span><b>${k === 'x' ? 'ULTIME' : k.toUpperCase()}</b> · ${a.abilities[k].name}</span>`).join('') : '';
}
// ---- échauffement de la salle d'attente (1.19) : cibles à cliquer pendant 30 s ----
const wu = { run: false, t0: 0, hits: 0, shots: 0, targets: [], raf: 0 };
const wuBest = () => { try { return +localStorage.getItem('eclipse_wu_best') || 0; } catch { return 0; } };
function wuInfo(txt) { $('wu-info').textContent = txt; }
function wuStart() {
  Object.assign(wu, { run: true, t0: performance.now(), hits: 0, shots: 0, targets: [] });
  for (let i = 0; i < 3; i++) wuSpawn();
  cancelAnimationFrame(wu.raf); wu.raf = requestAnimationFrame(wuLoop); SFX.initAudio();
}
function wuSpawn() { const cv = $('wu-cv'); wu.targets.push({ x: 30 + Math.random() * (cv.width - 60), y: 30 + Math.random() * (cv.height - 60), r: 22, born: performance.now() }); }
function wuLoop(now) {
  const cv = $('wu-cv'), g = cv.getContext('2d'); if (!cv.isConnected) return;
  const left = Math.max(0, 30 - (now - wu.t0) / 1000);
  g.fillStyle = '#0b0e1c'; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = 'rgba(255,255,255,.04)'; for (let x = 0; x < cv.width; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, cv.height); g.stroke(); }
  for (const t of wu.targets) {
    const age = (now - t.born) / 1000, r = Math.max(6, t.r - age * 7); t.cr = r;
    g.fillStyle = '#ff4f6d'; g.beginPath(); g.arc(t.x, t.y, r, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(t.x, t.y, r * 0.55, 0, 7); g.fill();
    g.fillStyle = '#ff4f6d'; g.beginPath(); g.arc(t.x, t.y, r * 0.22, 0, 7); g.fill();
  }
  g.fillStyle = '#e9ecf5'; g.font = 'bold 16px sans-serif'; g.fillText(`${left.toFixed(1)} s · ${wu.hits} touchée(s) · précision ${wu.shots ? Math.round(wu.hits / wu.shots * 100) : 0} %`, 12, 22);
  if (left <= 0) {
    wu.run = false;
    const score = Math.round(wu.hits * 100 * (wu.shots ? wu.hits / wu.shots : 0)), best = wuBest();
    if (score > best) try { localStorage.setItem('eclipse_wu_best', String(score)); } catch { /* */ }
    g.fillStyle = 'rgba(8,10,20,.8)'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#fff'; g.font = 'bold 28px sans-serif'; g.textAlign = 'center';
    g.fillText(`SCORE : ${score}${score > best ? ' · NOUVEAU RECORD !' : ''}`, cv.width / 2, cv.height / 2 - 6);
    g.font = '15px sans-serif'; g.fillText(`${wu.hits} cibles · précision ${wu.shots ? Math.round(wu.hits / wu.shots * 100) : 0} % · record ${Math.max(best, score)}`, cv.width / 2, cv.height / 2 + 22); g.textAlign = 'left';
    wuInfo('Clique sur JOUER pour recommencer.'); return;
  }
  wu.raf = requestAnimationFrame(wuLoop);
}
$('wu-cv').addEventListener('mousedown', e => {
  if (!wu.run) return;
  const cv = $('wu-cv'), b = cv.getBoundingClientRect(), x = (e.clientX - b.left) * cv.width / b.width, y = (e.clientY - b.top) * cv.height / b.height;
  wu.shots++;
  const i = wu.targets.findIndex(t => Math.hypot(t.x - x, t.y - y) <= (t.cr || t.r));
  if (i >= 0) { wu.hits++; wu.targets.splice(i, 1); wuSpawn(); SFX.playHit?.(false, false); } else SFX.playClick?.();
});
$('wu-open').onclick = () => { $('wu').classList.remove('hidden'); $('wu-open').classList.add('hidden'); wuInfo(`Clique sur les cibles le plus vite possible (30 s). Record : ${wuBest()}`); };
$('wu-x').onclick = () => { wu.run = false; cancelAnimationFrame(wu.raf); $('wu').classList.add('hidden'); $('wu-open').classList.remove('hidden'); };
$('wu-go').onclick = () => { wuInfo('C\'est parti !'); wuStart(); };
function tickRoomAuto() {
  const el = $('room-auto'); const left = Math.max(0, Math.ceil((state.autoEnd - performance.now()) / 1000));
  if (!state.room || state.room.state !== 'lobby' || state.game) { clearInterval(state.autoTimer); state.autoTimer = null; el.classList.add('hidden'); return; }
  el.classList.remove('hidden'); el.classList.toggle('soon', left <= 10);
  el.innerHTML = `⏱ <b>DÉPART DANS ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</b> · choisis ton agent, puis clique sur PRÊT : la partie part dès que tout le monde est prêt.`;
}
$('agent-pick').onclick = e => {
  const c = e.target.closest('.agent-card'); if (!c) return;
  profile.agent = c.dataset.id; save(); lobby.sig = '';
  net.send('setAgent', { agent: c.dataset.id });
  SFX.initAudio(); SFX.playUI('click');
};
document.querySelectorAll('[data-join]').forEach(b => b.onclick = () => net.send('setTeam', { team: b.dataset.join }));
document.querySelectorAll('[data-bot]').forEach(b => b.onclick = () => net.send('addBot', { team: b.dataset.bot }));
document.querySelectorAll('.team-panel .members').forEach(el => el.onchange = e => {
  const a = e.target.closest('[data-botagent]'); if (a) net.send('botSet', { id: a.dataset.botagent, agent: a.value });
  const d = e.target.closest('[data-botdiff]'); if (d) net.send('botSet', { id: d.dataset.botdiff, diff: d.value || null });
});
document.querySelectorAll('.team-panel .members').forEach(el => el.onclick = e => {
  const x = e.target.closest('[data-rm]'); if (x) net.send('removeBot', { id: x.dataset.rm });
  const rp = e.target.closest('[data-report]'); if (rp) openReport(rp.dataset.report);
  const pf = e.target.closest('[data-prof]'); if (pf) viewProfile(pf.dataset.prof);
});
$('room-invite').onclick = () => { net.send('friends'); setTimeout(openInvitePicker, 150); };
$('rs-private').onchange = e => net.send('roomSettings', { private: e.target.checked });
$('rs-size').onchange = e => net.send('roomSettings', { size: +e.target.value });
$('rs-rules').onchange = e => { const el = e.target.closest('[data-rrule]'); if (!el) return; const x = CUSTOM_RULES[el.dataset.rrule]; net.send('roomSettings', { opts: { [el.dataset.rrule]: typeof x.def === 'number' ? +el.value : el.value } }); };
$('rs-save-cg').onclick = () => {
  const r = state.room; if (!r) return;
  const name = prompt('Nom de la partie perso :', r.name); if (name === null) return;
  net.send('cgSave', { preset: { name: name.trim() || r.name, mode: r.mode, map: r.opts?.randomMap ? 'random' : r.mapId, target: r.target, diff: r.difficulty, size: r.max, bots: r.members.some(m => m.isBot), priv: !!r.private, opts: r.opts } });
};
$('room-leave').onclick = () => net.send('leaveRoom');
$('room-ready').onclick = () => { const me = state.room?.members.find(m => m.id === state.myId); net.send('setReady', { ready: !me?.ready }); };
$('room-start').onclick = () => { SFX.initAudio(); net.send('start'); };
$('rs-fill').onclick = () => net.send('fillBots');
document.querySelectorAll('[data-opt]').forEach(el => { el.onchange = () => net.send('roomSettings', { opts: { [el.dataset.opt]: el.checked } }); });
// mot de passe du salon (1.15)
$('rs-pass-save').onclick = () => { const v = $('rs-pass').value.trim(); net.send('roomSettings', { password: v }); $('rs-pass').value = ''; toast(v ? '🔒 Mot de passe enregistré : les invités et les amis entrent sans.' : 'Mot de passe retiré.', 4000); };
net.on('roomPassword', m => { const v = prompt(`${m.wrong ? 'Mot de passe incorrect. ' : ''}Le salon « ${m.name} » est protégé : mot de passe ?`); if (v) net.send('joinRoom', { id: m.id, password: v }); });
for (const [id, key] of [['rs-map', 'mapId'], ['rs-mode', 'mode'], ['rs-target', 'target'], ['rs-diff', 'difficulty']]) $(id).onchange = e => net.send('roomSettings', { [key]: e.target.value });

// ======================= PARTIE =======================
// ======================= ÉCRAN DE CHARGEMENT (1.21) =======================
// Plan de la carte, mode, ton agent et ses capacités, et une astuce : affiché 3 s au début de chaque partie.
const ROLE_TIPS = {
  Duelliste: ['Tu es fait pour ouvrir le combat : entre le premier sur le site, tes coéquipiers suivent.', 'Garde ta capacité de déplacement pour fuir un duel perdu, pas seulement pour entrer.'],
  Contrôleur: ['Coupe les lignes de vue avant que ton équipe ne traverse : une fumée bien placée vaut une élimination.', 'Reste un peu en retrait : ton rôle est de préparer le terrain, pas de prendre le premier duel.'],
  Initiateur: ['Utilise tes capacités de repérage juste avant que tes coéquipiers n\'entrent : ils sauront où tirer.', 'Annonce ce que tu révèles avec la radio (touche de radio) ou un marqueur.'],
  Sentinelle: ['Protège un site ou un flanc : tes capacités punissent ceux qui passent sans regarder.', 'Place tes pièges avant le début du combat, pas pendant.'],
};
const MODE_TIPS = {
  assault: 'Assaut : achète ton équipement au début de chaque manche (touche d\'achat). Une manche gagnée rapporte plus de crédits.',
  duel: 'Duel : un seul adversaire, chaque erreur compte. Visez la tête et ne gaspillez pas vos capacités.',
  ffa: 'Mêlée : tout le monde contre tout le monde. Bouge sans arrêt et évite les grands espaces découverts.',
  gungame: 'Gun Game : chaque élimination te donne l\'arme suivante. L\'élimination au couteau fait reculer ta victime.',
  lives: 'Dernier debout : tu as peu de vies, joue prudemment et laisse les autres se battre entre eux.',
};
const GEN_TIPS = ['Une glissade (sprint puis accroupi) te rend plus difficile à toucher.', 'Couteau en main : maintiens le clic droit pour charger la force, relâche pour le lancer. Va le ramasser ensuite.', 'En Assaut, clique sur un coéquipier dans le menu d\'achat pour lui offrir une arme.', 'Clic molette : marque une position pour ton équipe.', 'Les tirs à la tête font beaucoup plus de dégâts : vise à hauteur de tête.', 'Recharge à l\'abri, jamais en plein duel.', 'Change de position après une élimination : l\'ennemi sait où tu es.', 'Les pas s\'entendent : marche (touche de marche) pour approcher sans bruit.'];
let loadTimer = null;
function showLoading(m) {
  const el = $('loadscr'); if (!el || m.spectate) return;
  const me = (m.players || []).find(p => p.id === m.you);
  const a = AGENTS[me?.agent] || AGENTS[profile.agent] || AGENTS.ignis;
  const info = MAP_INFO[m.mapId] || { name: m.mapId, subtitle: '' };
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const roleTip = ROLE_TIPS[a.role] ? pick(ROLE_TIPS[a.role]) : '';
  const tip = Math.random() < 0.5 ? MODE_TIPS[m.mode] || pick(GEN_TIPS) : pick(GEN_TIPS);
  const keys = { q: 'abilityQ', e: 'abilityE', x: 'ult' };
  const mates = (m.players || []).filter(p => p.id !== m.you && !isFfa(m.mode) && me && p.team === me.team).length;
  el.innerHTML = `<div class="ls-in" style="--ac:${a.color}">
    <div class="ls-map"><canvas id="ls-cv" width="360" height="260"></canvas><div class="ls-mn">${esc(info.name)}</div><div class="ls-ms">${esc(info.subtitle || '')} · ${MODE_LABEL[m.mode] || ''}${mates ? ` · ${mates + 1} joueurs dans ton équipe` : ''}</div></div>
    <div class="ls-ag"><div class="ls-ah">${agentIconHTML(a.id, 'lg')}<div><div class="ls-an">${esc(a.name)}</div><div class="ls-ar">${esc(a.role.toUpperCase())}</div></div></div>
      ${Object.entries(a.abilities).map(([k, ab]) => `<div class="ls-ab"><kbd>${esc(keyName(profile.settings.keys[keys[k]] || ''))}</kbd><div><b>${esc(ab.name)}</b>${k === 'x' ? ' <span class="gold small">ULTIME</span>' : ''}<div class="small muted">${esc(ab.desc)}</div></div></div>`).join('')}
      ${roleTip ? `<div class="ls-tip"><b>${esc(a.role)} :</b> ${esc(roleTip)}</div>` : ''}
    </div>
    <div class="ls-gen">💡 <b>Astuce :</b> ${esc(tip)}</div>
    <div class="ls-bar"><i></i></div></div>`;
  try { drawMapPreview($('ls-cv'), parseMap(m.mapId)); } catch { /* aperçu indisponible */ }
  el.classList.remove('out'); el.classList.add('show');
  clearTimeout(loadTimer);
  const hide = () => { el.classList.add('out'); clearTimeout(loadTimer); loadTimer = setTimeout(() => el.classList.remove('show', 'out'), 400); removeEventListener('keydown', hide); };
  loadTimer = setTimeout(hide, profile.settings.quickLoad ? 1200 : 3200);
  addEventListener('keydown', hide, { once: true });
}
net.on('matchEnd', () => { $('loadscr')?.classList.remove('show'); });
net.on('matchStart', m => {
  document.getElementById('mmodal').classList.remove('show');
  showLoading(m);
  if (state.game) state.game.destroy();
  $('menu').classList.remove('active');
  state.game = new Game(net, { ...m, guest: state.guest, host: !!(state.room && state.room.hostId === state.myId && state.room.private && !state.room.tournament) }, () => exitGame());
  state.game.onLowFps = () => notify({ kind: 'PERFORMANCES', text: 'Le jeu manque de fluidité sur cet appareil. Activer le préréglage « PC faible » ?', ms: 20000, actions: [['Activer', () => { applyPreset('low'); toast('Préréglage « PC faible » activé (complet à la prochaine partie).', 4000); }], ['Non merci', () => { profile.settings.lowFpsTip = false; save(); }]] });
  if (!m.spectate) state.game.lock();
});
// observation staff : lien /?observer=<id> ouvert depuis le panneau d'administration
// lien de profil partageable : https://…/#profil=Pseudo
net.on('welcome', () => { if (location.hash === '#boutique') { setTimeout(() => showTab('shop'), 500); try { history.replaceState(null, '', location.pathname + location.search); } catch { /* */ } } });
net.on('welcome', () => { const mm = location.hash.match(/^#profil=([A-Za-z0-9_\-]{3,16})$/); if (mm) { setTimeout(() => viewProfile(decodeURIComponent(mm[1])), 600); try { history.replaceState(null, '', location.pathname + location.search); } catch { /* */ } } });
const specParam = (() => { try { return new URLSearchParams(location.search).get('observer'); } catch { return null; } })();
net.on('welcome', m => {
  if (!specParam || m.guest) { if (specParam && m.guest) toast('Connecte-toi avec ton compte staff pour observer une partie.', 6000); return; }
  setTimeout(() => net.send('spectate', { id: specParam }), 300);
  try { history.replaceState(null, '', location.pathname); } catch { /* */ }
});
net.on('watchNotice', m => toast(m.text, 5000));
// retours des joueurs et sondage du jour (1.15)
net.on('feedbackOk', m => toast(m.kind === 'bug' ? '🐞 Merci ! Ton signalement a été envoyé à l\'équipe.' : '💡 Merci ! Ton idée a été envoyée à l\'équipe.', 4500));
net.on('poll', m => { state.poll = m.poll; renderPoll(); });
function renderPoll() {
  const el = $('poll-box'); if (!el) return;
  const p = state.poll;
  if (!p) { el.innerHTML = ''; return; }
  const voted = p.mine !== null && p.mine !== undefined;
  el.innerHTML = `<div class="panel poll"><h3>☑ SONDAGE DU JOUR</h3><p><b>${esc(p.q)}</b></p>${p.opts.map((o, i) => {
    const n = p.counts[i] || 0, pc = p.total ? Math.round(n / p.total * 100) : 0;
    return voted ? `<div class="poll-res ${p.mine === i ? 'mine' : ''}"><div class="pr-bar" style="width:${pc}%"></div><span>${esc(o)}${p.mine === i ? ' ✔' : ''}</span><b>${pc} %</b></div>` : `<button class="btn ghost wide" data-poll="${i}">${esc(o)}</button>`;
  }).join('')}<div class="muted small">${voted ? `${p.total} vote(s) · tu peux changer ton vote en cliquant` : state.guest ? 'Crée un compte pour voter.' : 'Clique sur ta réponse.'}</div></div>`;
  el.onclick = e => { const b = e.target.closest('[data-poll], .poll-res'); if (!b || state.guest) return; const i = b.dataset.poll !== undefined ? +b.dataset.poll : [...el.querySelectorAll('.poll-res')].indexOf(b); if (i >= 0) net.send('pollVote', { id: p.id, idx: i }); };
}
// amis : montée de niveau
net.on('friendLevel', m => notify({ kind: 'AMI', type: 'friend', group: 'friendLevel', text: m.prestige ? `★ ${m.name} est passé prestige ${['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][m.prestige]} !` : `⬆ ${m.name} est passé niveau ${m.level} !` }));
net.on('prestigeDone', m => {
  SFX.playLevelUp?.();
  openModal(`<div class="pres-done"><div class="pres-big">★</div><h2>PRESTIGE ${['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][m.prestige]}</h2><p>Tu repars au niveau 1 avec le titre <b>${esc(m.title || '')}</b> et <span class="gem small"></span> <b>+${m.eclats}</b> Éclats.</p><button class="btn primary" data-close>CONTINUER</button></div>`);
  document.querySelectorAll('#mmodal-in [data-close]').forEach(b => { b.onclick = closeModal; });
});
net.on('specEnd', m => { if (state.game?.spec) { state.game.destroy(); exitGame(); } toast(m.text || 'Observation terminée.', 4000); });
function exitGame() {
  state.game = null;
  $('menu').classList.add('active');
  refreshProfileUI();
  showTab(state.room ? 'room' : 'play');
  // conseil d'entraînement accepté en fin de partie : direction le champ de tir (1.26)
  let go = false; try { go = localStorage.getItem('eclipse_go_range') === '1'; localStorage.removeItem('eclipse_go_range'); } catch { /* */ }
  if (go && (!hub.party || hub.party.lead)) {
    setTimeout(() => {
      if (state.room) net.send('leaveRoom');
      state.autoStartRange = Date.now();
      net.send('lobbyPlay', { cfg: { mode: 'ffa', diff: 'cible', fill: false, map: 'random' } });
      toast('Direction le champ de tir : appuie sur P pour lancer l\'exercice.', 4000);
    }, 600);
  }
}
net.on('backToRoom', () => { if (state.game) { state.game.destroy(); exitGame(); } });

// ======================= APERÇUS 3D =======================
class Preview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#3a3550', 1.6));
    const d = new THREE.DirectionalLight('#ffffff', 2.4); d.position.set(2, 3, 2); this.scene.add(d);
    const r = new THREE.DirectionalLight('#8b5cff', 2); r.position.set(-3, 1, -2); this.scene.add(r);
    this.pivot = new THREE.Group(); this.scene.add(this.pivot);
    this.drag = null; this.rotY = 0.6;
    canvas.addEventListener('pointerdown', e => { this.drag = e.clientX; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (this.drag !== null) { this.rotY += (e.clientX - this.drag) * 0.01; this.drag = e.clientX; } });
    canvas.addEventListener('pointerup', () => { this.drag = null; });
  }
  set(obj, camPos, look) {
    while (this.pivot.children.length) this.pivot.remove(this.pivot.children[0]);
    this.pivot.add(obj);
    this.camera.position.set(...camPos); this.camera.lookAt(...look);
  }
  render(dt) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio())) { this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    if (this.drag === null && !this.fixed && !this.noSpin) this.rotY += dt * 0.5;
    this.pivot.rotation.y = this.fixed ? 0 : this.rotY;
    this.onFrame?.(dt);
    this.renderer.render(this.scene, this.camera);
  }
}
const previews = { active: null, agent: null, coll: null, lobby: null };
let lastT = performance.now();
function previewLoop(t) {
  requestAnimationFrame(previewLoop);
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  if (state.game || !previews.active) return;
  animateSkins(t / 1000);
  const p = previews[previews.active];
  if (p) p.render(dt);
}
requestAnimationFrame(previewLoop);

// ======================= SALON DE GROUPE (1.15) =======================
// Scène plein écran : toi au centre, tes amis autour, pseudo au-dessus de chaque tête, « + » pour inviter.
// Le chef choisit la partie (carte en bas à droite), chacun clique sur PRÊT, compte à rebours, départ ensemble.
const LB_MODES = [
  ['ffa', 'MÊLÉE', 'Chacun pour soi', '8 joueurs · premier à 25 éliminations', '✸', '#8b5cff'],
  ['gungame', 'GUN GAME', 'Une nouvelle arme à chaque élimination', 'Le premier qui élimine au couteau gagne', '⟫', '#ff8a3d'],
  ['assault', 'ASSAUT 5v5', 'Pose ou désamorce le noyau', 'En équipe · premier à 7 manches', '◆', '#19e3c4'],
  ['lives', 'DERNIER DEBOUT', 'Trois vies chacun', 'Le dernier en vie gagne', '♥', '#ff4f6d'],
  ['duel', 'DUEL 1v1', 'Face à face', 'Premier à 5 manches · seul ou à deux', '⚔', '#ffcf5a'],
];
const LB_DIFF = { easy: 'Facile', normal: 'Normal', hard: 'Difficile', expert: 'Expert', cible: 'Cibles' };
// toi au centre (devant), puis à gauche, à droite, et plus loin à gauche
const LB_POS = [[0, 0, 0.4], [-1.65, 0, -0.35], [1.65, 0, -0.35], [-3.2, 0, -1.15]];
const lobby = { sig: '', cdEnd: 0, cdTimer: null, slots: [], env: false, cfg: (() => { const d = { mode: 'ffa', fill: false, diff: 'normal', map: 'random' }; try { return { ...d, ...JSON.parse(localStorage.getItem('eclipse_lobby_v1') || '{}') }; } catch { return d; } })() };
function saveLobbyCfg() { try { localStorage.setItem('eclipse_lobby_v1', JSON.stringify(lobby.cfg)); } catch { /* stockage indisponible */ } }
const lobbyParty = () => hub.party;
const lobbyCanEdit = () => !lobbyParty() || lobbyParty().lead;
const lobbyCfgNow = () => (lobbyParty() && !lobbyParty().lead && lobbyParty().cfg) ? lobbyParty().cfg : lobby.cfg;
// toi d'abord (au centre), puis les autres membres dans l'ordre du groupe
function lobbyMembers() {
  const p = lobbyParty();
  if (p) return [...p.members.filter(m => m.me), ...p.members.filter(m => !m.me)];
  const pr = profile.progress;
  return [{ name: profile.name || '—', me: true, leader: true, ready: true, agent: profile.agent, outfit: pr?.outfits?.[profile.agent] || null, skin: profile.equipped?.lancer || 'default', level: pr?.level || 1, prestige: pr?.prestige || 0, title: null, solo: true,
    banner: BANNERS[pr?.banner]?.css || null, rank: pr?.ranked ? pr.rank : null, rankColor: pr?.rankColor }];
}
// décor de la scène (créé une seule fois) : sol lumineux, anneaux, colonnes au loin, particules
function lobbyEnv(pv) {
  if (lobby.env) return; lobby.env = true;
  const sc = pv.scene;
  sc.fog = new THREE.Fog('#0b0d18', 9, 24);
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d'); const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(139,92,255,0.55)'); gr.addColorStop(0.45, 'rgba(60,40,140,0.25)'); gr.addColorStop(1, 'rgba(10,12,24,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.001; sc.add(floor);
  for (const [r, o] of [[3.2, 0.35], [5.2, 0.18], [7.4, 0.1]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.03, 96), new THREE.MeshBasicMaterial({ color: '#8b5cff', transparent: true, opacity: o, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.002; sc.add(ring);
  }
  // colonnes lumineuses au fond
  const colMat = new THREE.MeshStandardMaterial({ color: '#151a30', roughness: 0.6, metalness: 0.3 });
  for (let i = 0; i < 14; i++) {
    const a = -1.25 + i * (2.5 / 13), r = 11 + (i % 3) * 1.6, h = 2.5 + ((i * 37) % 7) * 0.9;
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.7, h, 0.7), colMat);
    col.position.set(Math.sin(a) * r, h / 2, -Math.cos(a) * r); sc.add(col);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.72), new THREE.MeshBasicMaterial({ color: i % 2 ? '#19e3c4' : '#8b5cff' }));
    edge.position.set(col.position.x, h, col.position.z); sc.add(edge);
  }
  // particules qui montent doucement
  const N = 160, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 16; pos[i * 3 + 1] = Math.random() * 6; pos[i * 3 + 2] = -Math.random() * 9 + 2; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lobby.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#c4b0ff', size: 0.05, transparent: true, opacity: 0.7, depthWrite: false }));
  sc.add(lobby.dust);
}
function buildLobbyStage(members) {
  if (!previews.lobby) { previews.lobby = new Preview($('lobby-canvas')); previews.lobby.fixed = true; previews.lobby.onFrame = lobbyFrame; }
  const pv = previews.lobby; lobbyEnv(pv);
  const g = new THREE.Group();
  const old = new Map(lobby.slots.map(s => [s.member?.name, s]));
  lobby.slots = [];
  for (let i = 0; i < 4; i++) {
    const m = members[i] || null;
    const holder = new THREE.Group(); holder.position.set(...LB_POS[i]);
    let ch;
    if (m) {
      ch = buildCharacter(m.agent || 'ignis', '#19e3c4', m.outfit);
      const w = buildWeapon('rifle', m.skin || 'default'); w.scale.setScalar(1.1); ch.hand.add(w);
    } else {
      // place libre : silhouette holographique
      ch = buildCharacter('ignis', '#8b5cff');
      const ghost = new THREE.MeshBasicMaterial({ color: '#8b5cff', transparent: true, opacity: 0.1, depthWrite: false });
      ch.root.traverse(o => { if (o.isMesh) o.material = ghost; });
      ch.ghostMat = ghost;
    }
    holder.add(ch.root);
    const col = !m ? '#4a3d8c' : m.leader ? '#ffcf5a' : m.ready ? '#3dff8a' : '#6b7290';
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.72, 0.08, 48), new THREE.MeshStandardMaterial({ color: '#141828', emissive: col, emissiveIntensity: m ? 0.5 : 0.2, roughness: 0.35, metalness: 0.4 }));
    disc.position.y = 0.04; holder.add(disc);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.022, 8, 56), new THREE.MeshBasicMaterial({ color: col }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.085; holder.add(ring);
    g.add(holder);
    const prev = m && old.get(m.name);
    lobby.slots.push({ holder, ch, member: m, phase: prev?.phase ?? Math.random() * 6, cheer: m && m.ready && !m.leader && !(prev?.member?.ready) ? 2.4 : 0 });
  }
  pv.set(g, [0, 1.55, 7], [0, 1.15, -0.4]);
}
// animations : balancement, joie quand on se met PRÊT, silhouettes qui pulsent ; pseudos suivent les têtes
function lobbyFrame(dt) {
  const pv = previews.lobby; if (!pv) return;
  const cam = pv.camera, t = performance.now() / 1000;
  const z = 7 * Math.max(1, 1.55 / cam.aspect); // écran étroit : la caméra recule pour garder tout le groupe
  cam.position.set(0, 1.55 + (z - 7) * 0.12, z); cam.lookAt(0, 1.15, -0.4);
  for (const s of lobby.slots) {
    const ch = s.ch;
    if (!s.member) { ch.root.rotation.y = Math.PI + Math.sin(t * 0.5 + s.phase) * 0.6; if (ch.ghostMat) ch.ghostMat.opacity = 0.07 + Math.sin(t * 2 + s.phase) * 0.04; continue; }
    ch.root.rotation.y = Math.PI + Math.sin(t * 0.6 + s.phase) * 0.22;
    ch.root.position.y = Math.sin(t * 1.5 + s.phase) * 0.012;
    if (s.cheer > 0) {
      s.cheer -= dt;
      const k = Math.min(1, s.cheer * 2);
      ch.arms[0].rotation.x = -2.8 * k + Math.sin(t * 12) * 0.25 * k; ch.arms[1].rotation.x = -2.8 * k - Math.sin(t * 12) * 0.25 * k;
      ch.root.position.y += Math.abs(Math.sin(t * 8)) * 0.18 * k;
      if (s.cheer <= 0) { ch.arms[0].rotation.x = 0; ch.arms[1].rotation.x = 0; }
    }
  }
  if (lobby.dust) { const a = lobby.dust.geometry.attributes.position; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * 0.25; if (y > 6) y = 0; a.setY(i, y); } a.needsUpdate = true; }
  // pseudos au-dessus des têtes (projection 3D → écran)
  const W = pv.canvas.clientWidth, H = pv.canvas.clientHeight, ox = pv.canvas.offsetLeft, oy = pv.canvas.offsetTop, tags = $('lobby-slots').children, v = new THREE.Vector3();
  lobby.slots.forEach((s, i) => {
    const el = tags[i]; if (!el) return;
    v.set(s.holder.position.x, s.member ? 2.3 : 1.35, s.holder.position.z).project(cam);
    el.style.transform = `translate(${(ox + (v.x + 1) / 2 * W).toFixed(1)}px, ${(oy + (1 - v.y) / 2 * H).toFixed(1)}px) translate(-50%, -100%)`;
  });
}
function renderLobby() {
  const root = $('lobby'); if (!root) return;
  const p = lobbyParty(), cfg = lobbyCfgNow(), edit = lobbyCanEdit();
  const members = lobbyMembers();
  const me = members.find(m => m.me) || members[0];
  const sig = members.map(m => [m.name, m.agent, m.outfit, m.skin, m.ready, m.leader].join(':')).join('|');
  if (sig !== lobby.sig) { lobby.sig = sig; try { buildLobbyStage(members); } catch (e) { console.warn('Salon : aperçu 3D indisponible', e); } }
  // pseudos (un par place, dans le même ordre que la scène)
  let html = '';
  for (let i = 0; i < 4; i++) {
    const m = members[i];
    if (m) {
      const st = m.leader ? (m.solo ? 'TOI' : '👑 CHEF') : m.busy ? '⏳ EN PARTIE' : m.ready ? '✔ PRÊT' : 'PAS PRÊT';
      const acts = p?.lead && !m.me ? `<div class="lb-acts"><button class="btn ghost small" data-lb="promote" data-n="${esc(m.name)}" title="Nommer chef">👑</button><button class="btn ghost small" data-lb="kick" data-n="${esc(m.name)}" title="Retirer du groupe">✕</button></div>` : '';
      html += `<div class="lb-slot ${m.leader ? 'lead' : m.ready ? 'ready' : ''} ${m.me ? 'me' : ''}"><div class="lb-tag-top" ${m.banner ? `style="background:${m.banner}"` : ''}><span class="lvl">${presTag(m.prestige)}${m.level || 1}</span>${esc(m.name)}</div><div class="lb-tag-sub">${m.rank && m.rank !== 'Non classé' ? `<b style="color:${m.rankColor}">${esc(m.rank)}</b> · ` : ''}${m.title ? esc(m.title) : ''}${m.clan ? ' [' + esc(m.clan) + ']' : ''}</div><div class="lb-tag-st">${st}</div>${acts}</div>`;
    } else if (state.guest) html += `<div class="lb-slot empty locked" title="Crée un compte pour jouer en groupe"><b>🔒</b>COMPTE REQUIS</div>`;
    else if (edit) html += `<button class="lb-slot empty" data-lb="invite"><b>＋</b>INVITER UN AMI</button>`;
    else html += `<div class="lb-slot empty locked"><b>·</b>PLACE LIBRE</div>`;
  }
  $('lobby-slots').innerHTML = html;
  lobbyFrame(0);
  // en-tête
  $('lb-chip').textContent = p ? `GROUPE ${p.members.length}/${p.max}` : 'SALON DE GROUPE';
  $('lobby-who').innerHTML = !p ? (state.guest ? 'Tu joues seul. Crée un compte pour inviter jusqu\'à 3 amis.' : 'Tu es seul : invite jusqu\'à 3 amis pour jouer ensemble, ou lance une partie directement.')
    : p.lead ? `Tu es le chef du groupe (${p.members.length}/${p.max}) : choisis la partie puis clique sur JOUER quand tout le monde est prêt.`
    : `Partie choisie par <b>${esc(p.leader)}</b> (chef du groupe). Clique sur PRÊT.`;
  $('lb-invite').classList.toggle('hidden', state.guest || !edit || (p && p.members.length >= p.max));
  $('lb-leave').classList.toggle('hidden', !p);
  // carte de la partie
  const md = LB_MODES.find(x => x[0] === cfg.mode) || LB_MODES[0];
  const maps = mapsForMode(cfg.mode);
  const mapName = maps.includes(cfg.map) ? (MAP_INFO[cfg.map]?.name || cfg.map) : 'Carte aléatoire';
  $('lb-mc-t').textContent = md[1];
  $('lb-mc-s').textContent = `${cfg.fill ? 'Avec d\'autres joueurs' : `Contre des bots · ${LB_DIFF[cfg.diff] || cfg.diff}`} · ${mapName}`;
  $('lb-mc-k').textContent = edit ? 'PARTIE CHOISIE' : `CHOISIE PAR ${String(p?.leader || '').toUpperCase()}`;
  $('lb-mode-card').classList.toggle('ro', !edit);
  const sigMap = cfg.mode + ':' + cfg.map;
  if (lobby.thumb !== sigMap) { lobby.thumb = sigMap; const cv = $('lb-map-thumb'); const id = maps.includes(cfg.map) ? cfg.map : maps[0]; try { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); drawMapPreview(cv, parseMap(id), { labels: false }); if (!maps.includes(cfg.map)) { const g = cv.getContext('2d'); g.fillStyle = 'rgba(10,12,24,.6)'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#fff'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText('?', cv.width / 2, cv.height / 2 + 12); } } catch { /* aperçu indisponible */ } }
  renderLobbyModes(cfg, edit);
  // bouton principal
  const btn = $('lb-play'), hint = $('lb-hint');
  const counting = p && p.countdown > 0;
  btn.classList.remove('ready', 'wait', 'cancel');
  if (counting) { btn.textContent = 'ANNULER'; btn.classList.add('cancel'); hint.textContent = 'Lancement en cours…'; }
  else if (!p || p.lead) {
    const waiting = p ? p.members.filter(m => !m.leader && !m.ready).map(m => m.name) : [];
    btn.textContent = 'JOUER'; btn.classList.toggle('wait', waiting.length > 0);
    hint.textContent = waiting.length ? `En attente : ${waiting.join(', ')}` : cfg.mode === 'duel' && p && p.members.length > 2 ? 'Le duel se joue à deux.' : cfg.fill ? 'Partie publique (complétée par des bots) · 1 minute pour choisir ton agent.' : 'Partie privée contre des bots · 1 minute pour choisir ton agent.';
  } else { btn.textContent = me?.ready ? '✔ PRÊT' : 'PRÊT'; btn.classList.toggle('ready', !!me?.ready); hint.textContent = me?.ready ? `En attente du lancement par ${p.leader}. Clique pour annuler.` : 'Clique sur PRÊT quand tu es prêt à jouer.'; }
  if (counting) { lobby.cdEnd = performance.now() + p.countdown * 1000; if (!lobby.cdTimer) { lobby.cdTimer = setInterval(tickLobbyCount, 100); tickLobbyCount(); } }
  else stopLobbyCount();
  $('lb-chat').classList.toggle('hidden', !p);
}
// écran « choisis ta partie »
function renderLobbyModes(cfg, edit) {
  const size = lobbyParty()?.members.length || 1;
  $('lb-mode').innerHTML = LB_MODES.map(([v, l, d, sub, ic, c]) => `<button data-v="${v}" class="lb-mode-tile ${cfg.mode === v ? 'active' : ''} ${v === 'duel' && size > 2 ? 'off' : ''}" style="--bg: radial-gradient(ellipse at 30% 20%, ${c}66, transparent 70%), linear-gradient(160deg, ${c}33, #0d1020)"><span class="ic">${ic}</span><b>${l}</b><span>${d}</span><small>${sub}</small></button>`).join('')
    + `<button data-cgopen="1" class="lb-mode-tile cg-tile"><span class="ic">🛠</span><b>PARTIE PERSO</b><span>Tes règles, tes amis</span><small>Armes, vitesse, dégâts, durée, taille…</small></button>`;
  for (const id of ['lb-mode', 'lb-fill', 'lb-diff', 'lb-map']) $(id).classList.toggle('ro', !edit);
  $('lb-fill').querySelectorAll('button').forEach(b => b.classList.toggle('active', (b.dataset.v === '1') === !!cfg.fill));
  $('lb-diff').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === cfg.diff));
  $('lb-diff-l').style.visibility = cfg.fill ? 'hidden' : '';
  const maps = mapsForMode(cfg.mode);
  const key = cfg.mode + ':' + cfg.map;
  if ($('lb-map').dataset.k !== key) {
    $('lb-map').dataset.k = key;
    $('lb-map').innerHTML = `<button class="lb-map-tile ${maps.includes(cfg.map) ? '' : 'active'}" data-v="random"><div class="rnd">🎲</div>ALÉATOIRE</button>` + maps.map(id => `<button class="lb-map-tile ${cfg.map === id ? 'active' : ''}" data-v="${id}"><canvas width="160" height="96"></canvas>${esc(MAP_INFO[id]?.name || id)}</button>`).join('');
    $('lb-map').querySelectorAll('canvas').forEach(cv => { try { drawMapPreview(cv, parseMap(cv.parentElement.dataset.v), { labels: false }); } catch { /* */ } });
  }
}
function tickLobbyCount() {
  const el = $('lobby-count'); const left = Math.ceil((lobby.cdEnd - performance.now()) / 1000);
  el.classList.remove('hidden');
  const txt = left > 0 ? String(left) : 'GO !';
  if (el.textContent !== txt) { el.textContent = txt; el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; SFX.playCountdown?.(left <= 0); }
  if (left <= -2) stopLobbyCount();
}
function stopLobbyCount() { clearInterval(lobby.cdTimer); lobby.cdTimer = null; $('lobby-count')?.classList.add('hidden'); }
function lobbySetCfg(patch) {
  if (!lobbyCanEdit()) return;
  Object.assign(lobby.cfg, patch);
  if (!mapsForMode(lobby.cfg.mode).includes(lobby.cfg.map)) lobby.cfg.map = 'random';
  saveLobbyCfg();
  if (lobbyParty()?.lead) net.send('partySet', { cfg: lobby.cfg });
  renderLobby();
}
function openLobbyInvite() {
  const inParty = new Set((lobbyParty()?.members || []).map(m => m.name));
  const online = (hub.friends.friends || []).filter(f => f.online && !inParty.has(f.name));
  openModal(`<h2>INVITER DANS MON GROUPE</h2><p class="muted small">Jusqu'à 4 joueurs. Tes amis te suivent dans tes parties, dans ton équipe.</p>${online.length ? online.map(f => `<div class="fr-row on"><span class="dot on"></span><b>${esc(f.name)}</b><span class="muted small">${esc(f.status || '')}</span><span class="grow"></span><button class="btn primary small" data-lbi="${esc(f.name)}">INVITER</button></div>`).join('') : '<p class="muted">Aucun ami connecté. Ajoute des amis dans l\'onglet AMIS.</p>'}`);
  $('mmodal-in').onclick = e => { const b = e.target.closest('[data-lbi]'); if (b) { net.send('partyInvite', { name: b.dataset.lbi, cfg: lobby.cfg }); b.disabled = true; b.textContent = 'INVITÉ'; } };
}
const lobbyModes = show => $('lb-modes').classList.toggle('hidden', !show);
$('lb-mode-card').onclick = () => { if (lobbyCanEdit()) lobbyModes(true); else toast(`Partie choisie par ${lobbyParty()?.leader} (chef du groupe).`); };
$('lb-modes-x').onclick = $('lb-modes-ok').onclick = () => lobbyModes(false);
$('lb-modes').addEventListener('keydown', e => { if (e.key === 'Escape') lobbyModes(false); });
$('lb-mode').onclick = e => { if (e.target.closest('[data-cgopen]')) { openCustom('list'); return; } const b = e.target.closest('[data-v]'); if (b) lobbySetCfg({ mode: b.dataset.v }); };
$('lb-fill').onclick = e => { const b = e.target.closest('[data-v]'); if (b) lobbySetCfg({ fill: b.dataset.v === '1' }); };
$('lb-diff').onclick = e => { const b = e.target.closest('[data-v]'); if (b) lobbySetCfg({ diff: b.dataset.v }); };
$('lb-map').onclick = e => { const b = e.target.closest('[data-v]'); if (b) lobbySetCfg({ map: b.dataset.v }); };
$('lb-invite').onclick = () => openLobbyInvite();
$('lb-leave').onclick = () => { if (confirm('Quitter le groupe ?')) net.send('partyLeave'); };
$('lb-play').onclick = () => {
  SFX.initAudio();
  const p = lobbyParty();
  if (p && p.countdown > 0) { net.send('partyCancel'); return; }
  if (!p) { net.send('lobbyPlay', { cfg: lobby.cfg }); return; }
  if (p.lead) { net.send('partySet', { cfg: lobby.cfg }); net.send('lobbyPlay'); return; }
  const me = p.members.find(m => m.me); net.send('partyReady', { ready: !me?.ready });
};
$('lobby-slots').onclick = e => {
  const b = e.target.closest('[data-lb]'); if (!b) return;
  if (b.dataset.lb === 'invite') openLobbyInvite();
  else if (b.dataset.lb === 'kick') net.send('partyKick', { name: b.dataset.n });
  else if (b.dataset.lb === 'promote') net.send('partyPromote', { name: b.dataset.n });
};
$('lb-chat-form').onsubmit = e => { e.preventDefault(); const i = $('lb-chat-in'); const t = i.value.trim(); if (t) net.send('partyChat', { text: t }); i.value = ''; };
$('lb-chat-in').addEventListener('keydown', e => e.stopPropagation());
net.on('party', m => {
  const p = m.party;
  hub.party = p; // ce gestionnaire peut passer avant celui de hub.js
  // le chef garde ses propres réglages ; un membre devenu chef reprend ceux du groupe
  if (p?.lead && p.cfg && lobby.wasMember) { lobby.cfg = { ...p.cfg }; saveLobbyCfg(); }
  lobby.wasMember = !!p && !p.lead;
  if (!p?.lead) lobbyModes(false);
  // groupe créé depuis la liste d'amis : le chef impose ses réglages du salon
  if (p?.lead && p.cfg && JSON.stringify(p.cfg) !== JSON.stringify(lobby.cfg) && !p.countdown && lobby.synced !== JSON.stringify(lobby.cfg)) { lobby.synced = JSON.stringify(lobby.cfg); net.send('partySet', { cfg: lobby.cfg }); }
  renderLobby();
});
net.on('chat', m => {
  if (!m.party && m.from !== 'GROUPE') return;
  const log = $('lb-chat-log'); if (!log) return;
  const d = document.createElement('div');
  if (m.from === 'GROUPE') { d.className = 'sys'; d.textContent = m.text; } else d.innerHTML = `<b>${esc(m.from)}</b> : ${esc(emojify(m.text))}`;
  log.appendChild(d); while (log.children.length > 30) log.firstChild.remove(); log.scrollTop = log.scrollHeight;
});

// ======================= PARTIES PERSONNALISÉES (1.16) =======================
// Modèles prêts à jouer, parties enregistrées sur le compte et éditeur de règles.
// JOUER crée un salon avec ces règles : le groupe suit le chef, on ajuste puis on lance ; après la partie, tout le monde revient au salon.
const CG_TEMPLATES = [
  { id: 't-snipe', name: 'Snipers seulement', mode: 'ffa', map: 'random', target: 15, size: 8, opts: { weapons: 'snipers' } },
  { id: 't-knife', name: 'Couteaux et vitesse', mode: 'ffa', map: 'random', target: 10, size: 8, opts: { weapons: 'knife', speed: 1.25 } },
  { id: 't-head', name: 'Têtes uniquement', mode: 'ffa', map: 'random', target: 15, size: 8, opts: { headOnly: true } },
  { id: 't-tank', name: 'Tanks 2v2', mode: 'assault', map: 'random', target: 5, size: 4, opts: { dmg: 0.33, money: 9000 } },
  { id: 't-crazy', name: 'Course folle', mode: 'ffa', map: 'random', target: 20, size: 8, opts: { speed: 1.5, lowGrav: true, bigHead: true } },
  { id: 't-pistol', name: 'Pistolets 3v3', mode: 'assault', map: 'random', target: 5, size: 6, opts: { weapons: 'pistols', roundTime: 60 } },
  { id: 't-pump', name: 'Duel au fusil à pompe', mode: 'duel', map: 'random', target: 5, size: 2, opts: { weapons: 'shotguns' } },
  { id: 't-gun', name: 'Gun Game éclair', mode: 'gungame', map: 'random', target: 8, size: 8, opts: { speed: 1.25, respawn: 1, timeLimit: 300 } },
];
const CG_COLORS = { ffa: '#8b5cff', gungame: '#ff8a3d', assault: '#19e3c4', lives: '#ff4f6d', duel: '#ffcf5a' };
const CG_SIZES = mode => mode === 'duel' ? [2] : mode === 'assault' ? [2, 4, 6, 8, 10] : [2, 3, 4, 5, 6, 7, 8];
const cgSizeLabel = (mode, n) => mode === 'assault' ? `${n / 2}v${n / 2}` : mode === 'duel' ? '1v1' : `${n} joueurs`;
const cgTargetLabel = (mode, t) => mode === 'gungame' ? `${t} armes` : mode === 'lives' ? `${t} vie(s) par joueur` : isFfa(mode) ? `${t} éliminations` : `Premier à ${t} manches`;
const cg = { view: 'list', edit: null };
const cgMine = () => profile.progress?.customGames || [];
function cgDefaults(mode = 'ffa') { return { id: null, name: 'Ma partie perso', mode, map: 'random', target: TARGETS[mode].includes(25) ? 25 : TARGETS[mode][Math.floor(TARGETS[mode].length / 2)], diff: 'normal', size: CG_SIZES(mode).slice(-1)[0], bots: true, priv: true, opts: cleanCustomOpts({}) }; }
function openCustom(view = 'list') { lobbyModes(false); cg.view = view; $('cg').classList.remove('hidden'); renderCustom(); }
function closeCustom() { $('cg').classList.add('hidden'); }
function cgCard(g, own) {
  const chips = customSummary(g.opts, g.mode);
  const map = g.map && g.map !== 'random' ? (MAP_INFO[g.map]?.name || g.map) : 'Carte aléatoire';
  const c = CG_COLORS[g.mode] || '#8b5cff';
  return `<div class="cg-card" style="--cc:${c};--cc2:${c}33"><h4>${esc(g.name)}</h4><div class="cg-meta">${{ assault: 'ASSAUT', duel: 'DUEL' }[g.mode] || MODE_LABEL[g.mode]} · ${esc(map)} · ${cgSizeLabel(g.mode, g.size || 8)} · ${esc(cgTargetLabel(g.mode, g.target))}</div>
    <div class="cg-chips">${chips.length ? chips.map(x => `<span>${esc(x)}</span>`).join('') : '<span>Règles normales</span>'}</div>
    <div class="cg-acts"><button class="btn primary" data-cg="play" data-id="${g.id}">JOUER</button><button class="btn ghost" data-cg="edit" data-id="${g.id}">${own ? 'MODIFIER' : 'PERSONNALISER'}</button>${own ? `<button class="btn ghost x" data-cg="del" data-id="${g.id}" title="Supprimer">✕</button>` : ''}</div></div>`;
}
function cgFind(id) { return cgMine().find(g => g.id === id) || CG_TEMPLATES.find(g => g.id === id); }
function renderCustom() {
  const body = $('cg-body'); if (!body) return;
  const p = lobbyParty(), member = p && !p.lead;
  if (cg.view === 'list') {
    $('cg-title').textContent = 'PARTIES PERSONNALISÉES';
    const mine = cgMine();
    body.innerHTML = `<p class="cg-intro">Choisis tes règles (armes, vitesse, dégâts, durée…), joue avec tes amis et rejoue autant que tu veux : après chaque partie, tout le monde revient au salon.${member ? ` <b>Seul ${esc(p.leader)}, le chef du groupe, peut lancer une partie perso.</b>` : ''}</p>
      <div class="cg-sec">MES PARTIES PERSO${state.guest ? '' : ` (${mine.length}/12)`}</div>
      <div class="cg-grid"><button class="cg-new" data-cg="new"><span><b>＋</b>CRÉER UNE PARTIE PERSO</span></button>${mine.map(g => cgCard(g, true)).join('')}</div>
      ${state.guest ? '<p class="muted small">Crée un compte pour enregistrer tes parties perso (tu peux quand même en jouer).</p>' : ''}
      <div class="cg-sec">MODÈLES PRÊTS À JOUER</div>
      <div class="cg-grid">${CG_TEMPLATES.map(g => cgCard(g, false)).join('')}</div>`;
    return;
  }
  // éditeur
  const g = cg.edit;
  $('cg-title').textContent = g.id && cgMine().some(x => x.id === g.id) ? 'MODIFIER LA PARTIE PERSO' : 'NOUVELLE PARTIE PERSO';
  const maps = mapsForMode(g.mode);
  const rules = Object.entries(CUSTOM_RULES).filter(([, r]) => !r.modes || r.modes.includes(g.mode));
  body.innerHTML = `<div class="cg-form">
    <label class="full">Nom<input id="cg-name" maxlength="24" value="${esc(g.name)}"></label>
    <div class="full"><div class="lb-opt-k">MODE</div><div class="seg" id="cg-mode">${LB_MODES.map(([v, l]) => `<button data-v="${v}" class="${g.mode === v ? 'active' : ''}">${l}</button>`).join('')}</div></div>
    <label>Carte<select id="cg-map"><option value="random">🎲 Aléatoire</option>${maps.map(id => `<option value="${id}" ${g.map === id ? 'selected' : ''}>${esc(MAP_INFO[id]?.name || id)}</option>`).join('')}</select></label>
    <label>Objectif<select id="cg-target">${[...new Set([...TARGETS[g.mode], g.target])].sort((a, b) => a - b).map(t => `<option value="${t}" ${g.target === t ? 'selected' : ''}>${esc(cgTargetLabel(g.mode, t))}</option>`).join('')}</select></label>
    <label>Taille<select id="cg-size">${CG_SIZES(g.mode).map(n => `<option value="${n}" ${g.size === n ? 'selected' : ''}>${cgSizeLabel(g.mode, n)}</option>`).join('')}</select></label>
    <label>Niveau des bots<select id="cg-diff">${Object.entries(LB_DIFF).map(([v, l]) => `<option value="${v}" ${g.diff === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${rules.map(([k, r]) => `<label>${esc(r.label)}<select data-rule="${k}">${r.opts.map(([v, l]) => `<option value="${v}" ${String(g.opts[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`).join('')}
    <div class="full"><div class="lb-opt-k">OPTIONS</div><div class="cg-flags">
      <label class="check"><input type="checkbox" id="cg-bots" ${g.bots ? 'checked' : ''}> Compléter avec des bots</label>
      <label class="check"><input type="checkbox" id="cg-priv" ${g.priv ? 'checked' : ''}> Salon privé (sur invitation ou code)</label>
      ${CUSTOM_FLAGS.filter(([k]) => !(k === 'friendlyFire' && isFfa(g.mode))).map(([k, l]) => `<label class="check"><input type="checkbox" data-flag="${k}" ${g.opts[k] ? 'checked' : ''}> ${esc(l)}</label>`).join('')}
    </div></div>
    <div class="full"><div class="lb-opt-k">RÉSUMÉ</div><div class="cg-chips" id="cg-sum"></div></div>
  </div>
  <div class="cg-foot"><button class="btn ghost" data-cg="back">RETOUR</button>${state.guest ? '' : '<button class="btn ghost" data-cg="save">💾 ENREGISTRER</button>'}<button class="btn primary" data-cg="playEdit">JOUER</button></div>`;
  cgSummary();
}
function cgSummary() { const el = $('cg-sum'); if (!el) return; const s = customSummary(cg.edit.opts, cg.edit.mode); el.innerHTML = s.length ? s.map(x => `<span>${esc(x)}</span>`).join('') : '<span>Règles normales</span>'; }
// lit le formulaire de l'éditeur
function cgRead() {
  const g = cg.edit, body = $('cg-body');
  g.name = $('cg-name').value.trim().slice(0, 24) || 'Ma partie perso';
  g.map = $('cg-map').value; g.target = +$('cg-target').value; g.size = +$('cg-size').value; g.diff = $('cg-diff').value;
  g.bots = $('cg-bots').checked; g.priv = $('cg-priv').checked;
  body.querySelectorAll('[data-rule]').forEach(el => { const r = CUSTOM_RULES[el.dataset.rule]; g.opts[el.dataset.rule] = typeof r.def === 'number' ? +el.value : el.value; });
  body.querySelectorAll('[data-flag]').forEach(el => { g.opts[el.dataset.flag] = el.checked; });
  return g;
}
function cgPlay(g) {
  const p = lobbyParty();
  if (p && !p.lead) { toast(`Seul ${p.leader}, le chef du groupe, peut lancer une partie perso.`); return; }
  SFX.initAudio();
  net.send('customPlay', { preset: g });
  closeCustom();
}
$('cg-x').onclick = closeCustom;
$('lb-custom').onclick = () => openCustom('list');
$('cg-body').addEventListener('keydown', e => e.stopPropagation());
$('cg-body').addEventListener('change', e => {
  if (cg.view !== 'edit') return;
  cgRead();
  cgSummary();
});
// parties perso sous le lobby : les miennes et quelques modèles
function renderPlayCustom() {
  const el = $('pb-cg'); if (!el) return;
  const mine = cgMine();
  el.innerHTML = `<button class="cg-new" data-cg="new"><span><b>＋</b>CRÉER UNE PARTIE PERSO</span></button>${mine.map(g => cgCard(g, true)).join('')}${CG_TEMPLATES.slice(0, Math.max(3, 7 - mine.length)).map(g => cgCard(g, false)).join('')}`;
}
const cgEditOpen = () => { openCustom('edit'); $('tab-play').scrollTo({ top: 0, behavior: 'smooth' }); };
$('pb-cg-all').onclick = () => { openCustom('list'); $('tab-play').scrollTo({ top: 0, behavior: 'smooth' }); };
$('pb-cg').onclick = e => cgClick(e);
$('cg-body').onclick = e => cgClick(e);
function cgClick(e) {
  const m = e.target.closest('#cg-mode [data-v]');
  if (m && cg.view === 'edit') { cgRead(); const keep = { id: cg.edit.id, name: cg.edit.name, opts: cg.edit.opts, bots: cg.edit.bots, priv: cg.edit.priv, diff: cg.edit.diff }; cg.edit = { ...cgDefaults(m.dataset.v), ...keep }; renderCustom(); return; }
  const b = e.target.closest('[data-cg]'); if (!b) return;
  const a = b.dataset.cg, g = b.dataset.id && cgFind(b.dataset.id);
  if (a === 'new') { cg.edit = cgDefaults(lobby.cfg.mode); cgEditOpen(); }
  else if (a === 'edit' && g) { const own = cgMine().some(x => x.id === g.id); cg.edit = { ...cgDefaults(g.mode), ...JSON.parse(JSON.stringify(g)), id: own ? g.id : null, opts: cleanCustomOpts(g.opts) }; if (!own) cg.edit.name = g.name; cgEditOpen(); }
  else if (a === 'del' && g) { if (confirm(`Supprimer la partie perso « ${g.name} » ?`)) net.send('cgDelete', { id: g.id }); }
  else if (a === 'play' && g) cgPlay({ ...cgDefaults(g.mode), ...g, opts: cleanCustomOpts(g.opts) });
  else if (a === 'back') { cg.view = 'list'; renderCustom(); }
  else if (a === 'save') { net.send('cgSave', { preset: cgRead() }); }
  else if (a === 'playEdit') cgPlay(cgRead());
}
net.on('customGames', m => {
  if (profile.progress) profile.progress.customGames = m.list;
  if (m.saved) { toast('💾 Partie perso enregistrée.'); if (cg.edit) cg.edit.id = m.saved; cg.view = 'list'; }
  if (!$('cg').classList.contains('hidden')) renderCustom();
  renderPlayCustom();
});

// ======================= AGENTS =======================
// Page Agents (1.17) : liste à gauche (filtre par rôle), grand modèle 3D au centre devant le nom géant,
// fiche à droite (rôle, histoire, capacités cliquables, maîtrise et statistiques, bouton pour choisir l'agent)
state.agentRole = 'all'; state.agentAbility = 'q';
const AB_KEYS = { q: 'abilityQ', e: 'abilityE', x: 'ult' };
function renderAgents() {
  const roles = ['all', ...Object.keys(ROLES)];
  $('ag-roles').innerHTML = roles.map(r => `<button data-role="${r}" class="${state.agentRole === r ? 'active' : ''}" title="${r === 'all' ? 'Tous les agents' : esc(ROLES[r].desc)}">${r === 'all' ? 'TOUS' : ROLES[r].icon + ' ' + r.toUpperCase()}</button>`).join('');
  const ids = AGENT_ORDER.filter(id => state.agentRole === 'all' || AGENTS[id].role === state.agentRole);
  if (!AGENTS[state.agentView]) state.agentView = AGENT_ORDER[0];
  $('agents-list').innerHTML = ids.map(id => { const a = AGENTS[id]; return `<button class="ag-item ${id === state.agentView ? 'active' : ''} ${id === profile.agent ? 'mine' : ''}" data-id="${id}" style="--c:${a.color}">${agentIconHTML(id)}<span class="ag-n">${a.name}</span>${id === profile.agent ? '<span class="ag-mine" title="Ton agent">✔</span>' : ''}</button>`; }).join('');
  const a = AGENTS[state.agentView];
  const page = $('ag-page');
  page.style.setProperty('--c', a.color);
  $('ag-bgname').textContent = a.name;
  const st = profile.progress?.agentStats?.[a.id];
  const ms = masteryOf(st);
  const ab = a.abilities[state.agentAbility] || a.abilities.q;
  const role = ROLES[a.role] || { icon: '•', desc: '' };
  const mine = profile.agent === a.id;
  $('agent-detail').innerHTML = `
    <div class="ag-role"><span class="ag-role-ic">${role.icon}</span><div><div class="ag-k">// RÔLE</div><b>${esc(a.role.toUpperCase())}</b></div></div>
    <div class="ag-name">${a.name}</div>
    <div class="ag-bio">${esc(a.bio)}</div>
    <div class="ag-k">// RÔLE : ${esc(role.desc)}</div>
    <div class="ag-k ag-k2">// CAPACITÉS</div>
    <div class="ag-abs">${['q', 'e', 'x'].map(k => `<button class="ag-ab ${k === state.agentAbility ? 'active' : ''} ${k === 'x' ? 'ult' : ''}" data-ab="${k}" title="${esc(a.abilities[k].name)}"><span class="ic">${ABILITY_ICONS[a.abilities[k].type] || '•'}</span><span class="key">${esc(keyName(profile.settings.keys[AB_KEYS[k]]))}</span></button>`).join('')}</div>
    <div class="ag-abd">
      <div class="ag-abn">${esc(ab.name)}</div>
      <div class="ag-abt">${state.agentAbility === 'x' ? `ULTIME · ${ab.cost} points (éliminations et manches)` : `TOUCHE ${esc(keyName(profile.settings.keys[AB_KEYS[state.agentAbility]]))} · ${ab.charges} charge${ab.charges > 1 ? 's' : ''} par manche`}</div>
      <p>${esc(ab.desc)}</p>
    </div>
    ${state.guest || !profile.progress ? '' : `<div class="ag-k ag-k2">// TES STATISTIQUES</div>
    <div class="ag-stats">
      <div class="ag-ms" title="Points : éliminations + 4 par partie + 6 par victoire"><span>MAÎTRISE <b>${ms.level}</b>/10</span><div class="pf-bar"><i style="width:${ms.next ? Math.round((ms.pts - ms.prev) / (ms.next - ms.prev) * 100) : 100}%"></i></div><span class="muted small">${ms.next ? `${ms.pts} / ${ms.next} points` : 'maîtrise maximale !'}</span></div>
      <div class="ag-nums"><div><b>${st?.matches || 0}</b><span>parties</span></div><div><b>${st?.matches ? Math.round(st.wins / st.matches * 100) : 0} %</b><span>victoires</span></div><div><b>${st ? (st.kills / Math.max(1, st.deaths)).toFixed(2) : '0.00'}</b><span>K/D</span></div><div><b>${st?.kills || 0}</b><span>éliminations</span></div></div>
    </div>`}
    ${state.guest || !profile.progress ? '' : `<div class="ag-k ag-k2">// TENUES (débloquées par la maîtrise)</div>
    <div class="ag-outfits">${Object.entries(OUTFITS).map(([id, o]) => { const cur = (profile.progress.outfits?.[a.id] || 'base') === id, lock = ms.level < (o.mastery || 1) && !profile.progress.outfitsAll, prev = (state.agentOutfit ?? (profile.progress.outfits?.[a.id] || 'base')) === id;
      return `<button class="ag-of ${cur ? 'cur' : ''} ${prev ? 'prev' : ''} ${lock ? 'lock' : ''}" data-of="${id}" title="${esc(o.name)}${lock ? ` · maîtrise ${o.mastery} requise` : ''}" style="--a:${o.armor || a.color};--g:${o.glow || a.color}"><i></i><span>${esc(o.name)}${lock ? ' 🔒' + o.mastery : cur ? ' ✔' : ''}</span></button>`; }).join('')}</div>`}
    <button class="ag-pick ${mine ? 'on' : ''}" id="ag-pick">${mine ? '✔ TON AGENT' : 'CHOISIR CET AGENT'}</button>`;
  if (!previews.agent) { previews.agent = new Preview($('ag-canvas')); previews.agent.noSpin = true; }
  const ofView = state.agentOutfit ?? (profile.progress?.outfits?.[a.id] || 'base');
  if (state.agentBuilt !== a.id + (profile.equipped.lancer || '') + ofView) {
    state.agentBuilt = a.id + (profile.equipped.lancer || '') + ofView;
    const ch = buildCharacter(a.id, '#19e3c4', ofView);
    const w = buildWeapon('rifle', profile.equipped.lancer || 'default'); w.scale.setScalar(1.1); ch.hand.add(w);
    ch.root.rotation.y = Math.PI; // face à la caméra
    previews.agent.set(ch.root, [0, 1.15, 4.6], [0, 1.0, 0]);
    previews.agent.rotY = -0.35;
  }
}
function pickAgentView(id) { state.agentView = id; state.agentAbility = 'q'; state.agentOutfit = null; renderAgents(); SFX.initAudio(); SFX.playUI?.('click'); }
$('agents-list').onclick = e => { const r = e.target.closest('.ag-item'); if (r) pickAgentView(r.dataset.id); };
$('ag-roles').onclick = e => { const b = e.target.closest('[data-role]'); if (b) { state.agentRole = b.dataset.role; renderAgents(); } };
$('agent-detail').onclick = e => {
  const ab = e.target.closest('[data-ab]'); if (ab) { state.agentAbility = ab.dataset.ab; renderAgents(); return; }
  const of = e.target.closest('[data-of]');
  if (of) { // aperçu de la tenue ; si elle est débloquée, elle est équipée
    state.agentOutfit = of.dataset.of; renderAgents();
    if (!of.classList.contains('lock')) net.send('setOutfit', { agent: state.agentView, outfit: of.dataset.of });
    else toast(`Tenue « ${OUTFITS[of.dataset.of].name} » : atteins la maîtrise ${OUTFITS[of.dataset.of].mastery} avec cet agent pour la débloquer.`);
    return;
  }
  if (e.target.closest('#ag-pick')) {
    profile.agent = state.agentView; save(); lobby.sig = '';
    net.send('setAgent', { agent: state.agentView });
    toast(`${AGENTS[state.agentView].name} est maintenant ton agent.`); renderAgents(); renderMeCard();
  }
};
net.on('achUnlocked', m => { notify({ kind: 'SUCCÈS', text: `🏆 ${m.label} : +${m.reward} Éclats${m.title ? ` · nouveau titre « ${m.title} »` : ''}`, ms: 10000 }); SFX.playNotify?.(); });
net.on('outfits', m => { if (profile.progress) profile.progress.outfits = m.outfits; toast('Tenue équipée.'); lobby.sig = ''; if (state.tab === 'agents') renderAgents(); });
// flèches haut / bas : agent précédent / suivant
document.addEventListener('keydown', e => {
  if (state.tab !== 'agents' || state.game || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const ids = AGENT_ORDER.filter(id => state.agentRole === 'all' || AGENTS[id].role === state.agentRole);
  const i = ids.indexOf(state.agentView);
  e.preventDefault(); pickAgentView(ids[(i + (e.key === 'ArrowDown' ? 1 : -1) + ids.length) % ids.length] || ids[0]);
});

// ======================= BOUTIQUE DU JOUR (1.23) =======================
// Un thème par jour (une collection), 2 skins en vedette, 6 skins du jour, le pack de la collection et un compte à rebours.
const shopRound = v => Math.max(10, Math.round(v / 10) * 10);
const shopDay = () => new Date().toISOString().slice(0, 10);
function shopTimer() { const d = state.shop; if (!d) return ''; const left = Math.max(0, d.resetAt - Date.now()); const hh = Math.floor(left / 3600000), mm = Math.floor(left % 3600000 / 60000), ss = Math.floor(left % 60000 / 1000); return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; }
function shopTile(i, big) {
  const s = SKINS.find(x => x.id === i.id); if (!s) return '';
  const rar = RARITY[rarityOf(s)], owned = profile.owned.includes(i.id);
  return `<div class="sh-tile ${big ? 'big' : ''} ${owned ? 'owned' : ''}" style="--rc:${rar.color};--b1:${s.body};--b2:${s.accent}">
    <div class="sh-art" style="${swatchCss(s)}"></div>
    ${i.isNew && !owned ? '<span class="sh-new">NOUVEAU</span>' : ''}<span class="sh-off">-${i.off} %</span>
    <div class="sh-info"><div class="sh-name">${esc(i.name)}</div><div class="sh-rar">${rar.name}${s.animated ? ' · animé' : ''}${s.set ? ` · ${esc(s.set)}` : ''}</div>
      <div class="sh-buy">${owned ? '<span class="badge-ok">POSSÉDÉ</span>' : `<span class="sh-price"><s>${i.old}</s> <span class="gem small"></span> <b>${i.price}</b></span>`}
        <span class="sh-btns"><button class="btn small ghost" data-shp="preview" data-id="${esc(i.id)}">APERÇU</button>${owned ? '' : state.guest ? '' : `<button class="btn small primary" data-shp="buy" data-id="${esc(i.id)}">ACHETER</button>`}</span></div></div></div>`;
}
function renderShopTab() {
  const root = $('shop-root'); if (!root) return;
  const d = state.shop;
  if (!d || !d.featured) { root.innerHTML = '<div class="panel empty-big">Chargement de la boutique du jour…</div>'; return; }
  const ref = SKINS.find(x => x.id === d.featured[0]?.id) || {};
  const b = d.bundle, bSkins = b ? b.ids.map(id => SKINS.find(x => x.id === id)).filter(Boolean) : [];
  const missing = bSkins.filter(x => !profile.owned.includes(x.id));
  const bPrice = shopRound(missing.reduce((t, x) => t + x.price, 0) * (100 - (b?.off || 50)) / 100);
  root.innerHTML = `
    <div class="sh-hero" style="--t1:${ref.body || '#1a2036'};--t2:${ref.accent || '#8b5cff'}">
      <div><div class="sh-kick">BOUTIQUE DU JOUR</div><h1>THÈME : ${esc((d.theme || '').toUpperCase())}</h1><div class="sh-sub">Les skins de la collection ${esc(d.theme || '')} sont à l'honneur aujourd'hui.</div></div>
      <div class="sh-clock"><span>NOUVELLE BOUTIQUE DANS</span><b id="shop-timer">${shopTimer()}</b></div>
    </div>
    ${state.guest ? '<p class="muted small">Crée un compte pour acheter des skins avec tes Éclats.</p>' : ''}
    <div class="sh-sec"><h2>EN VEDETTE <small>-${d.featured[0]?.off || 25} %</small></h2><div class="sh-grid big">${d.featured.map(i => shopTile(i, true)).join('')}
      ${b ? `<div class="sh-tile big sh-pack" style="--rc:#ffcf5a;--b1:${ref.body || '#222'};--b2:${ref.accent || '#8b5cff'}">
        <div class="sh-pack-art">${bSkins.map(x => `<i class="${profile.owned.includes(x.id) ? 'got' : ''}" style="${swatchCss(x)}" title="${esc(x.name)}"></i>`).join('')}</div>
        <span class="sh-off">-${b.off} %</span>
        <div class="sh-info"><div class="sh-name">${esc(b.name)}</div><div class="sh-rar">${bSkins.length} skins · ${bSkins.length - missing.length} déjà possédé(s)</div>
          <div class="sh-buy">${missing.length ? `<span class="sh-price"><s>${missing.reduce((t, x) => t + x.price, 0)}</s> <span class="gem small"></span> <b>${bPrice}</b></span>${state.guest ? '' : `<button class="btn small primary" data-shp="bundle">ACHETER LE PACK (${missing.length})</button>`}` : '<span class="badge-ok">COLLECTION COMPLÈTE</span>'}</div>
          <div class="muted small">Tu ne paies que les skins qui te manquent. Compléter la collection débloque aussi son succès (800 Éclats et un titre).</div></div></div>` : ''}
    </div></div>
    <div class="sh-sec"><h2>QUOTIDIEN <small>-${d.daily[0]?.off || 40} %</small></h2><div class="sh-grid">${d.daily.map(i => shopTile(i, false)).join('')}</div></div>
    <p class="muted small">Un skin acheté est débloqué pour toutes les armes. La boutique change chaque jour à ${new Date(d.resetAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.</p>`;
}
function openShopTab() {
  if (!state.shop || !state.shop.featured || Date.now() > state.shop.resetAt) net.send('shop');
  try { localStorage.setItem('eclipse_shop_seen', shopDay()); } catch { /* */ }
  $('shop-badge').textContent = '';
  renderShopTab();
  clearInterval(openShopTab.iv);
  openShopTab.iv = setInterval(() => { if (state.tab !== 'shop') { clearInterval(openShopTab.iv); return; } const el = $('shop-timer'); if (el) el.textContent = shopTimer(); if (state.shop && Date.now() > state.shop.resetAt + 2000) { state.shop = null; net.send('shop'); } }, 1000);
}
$('shop-root').onclick = e => {
  const b = e.target.closest('[data-shp]'); if (!b) return;
  const d = state.shop; if (!d) return;
  if (b.dataset.shp === 'preview') { const s = SKINS.find(x => x.id === b.dataset.id); state.collSkin = b.dataset.id; state.collFilter = 'all'; state.collSet = s?.set || ''; showTab('collection'); return; }
  if (b.dataset.shp === 'buy') {
    const i = d.items.find(x => x.id === b.dataset.id); if (!i) return;
    if (profile.eclats < i.price) { toast(`Il te manque ${i.price - profile.eclats} Éclats.`); return; }
    if (confirm(`Acheter « ${i.name} » pour ${i.price} Éclats (-${i.off} %) ?`)) net.send('buyShop', { id: i.id });
  }
  if (b.dataset.shp === 'bundle' && d.bundle) {
    const miss = d.bundle.ids.filter(id => !profile.owned.includes(id)).map(id => SKINS.find(x => x.id === id)).filter(Boolean);
    const price = shopRound(miss.reduce((t, x) => t + x.price, 0) * (100 - d.bundle.off) / 100);
    if (profile.eclats < price) { toast(`Il te manque ${price - profile.eclats} Éclats.`); return; }
    if (confirm(`Acheter le ${d.bundle.name} : ${miss.length} skin(s) pour ${price} Éclats ?`)) net.send('buyBundle');
  }
};
net.on('bundleBought', m => { toast(`${m.name} : ${m.count} skin(s) ajouté(s) à ta collection !`, 4000); SFX.playPromote?.(); });
// bandeau dans la Collection : lien vers la boutique
function renderShop() {
  const el = $('daily-shop'); if (!el) return;
  const d = state.shop;
  if (!d || !d.featured) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="shop-head"><b>BOUTIQUE DU JOUR · THÈME ${esc((d.theme || '').toUpperCase())}</b> <span class="muted small">${d.items.length} skins en promotion et le pack ${esc(d.theme || '')}</span> <button class="btn small primary" data-tab-go="shop">VOIR LA BOUTIQUE</button></div>`;
  el.onclick = e => { if (e.target.closest('[data-tab-go]')) showTab('shop'); };
}
net.on('shop', m => {
  state.shop = m; renderShop(); if (state.tab === 'shop') renderShopTab();
  let seen = ''; try { seen = localStorage.getItem('eclipse_shop_seen') || ''; } catch { /* */ }
  $('shop-badge').textContent = seen !== m.day && state.tab !== 'shop' ? '!' : '';
});
net.on('profile', () => { if (state.tab === 'shop') renderShopTab(); });
function renderCollection() {
  if (!state.shop || !state.shop.featured || Date.now() > state.shop.resetAt) net.send('shop');
  renderShop();
  $('coll-weapons').innerHTML = SKINNABLE.map(w => `<button class="${w === state.collWeapon ? 'active' : ''}" data-w="${w}">${WEAPONS[w].name.toUpperCase()}<small>${SKINS.find(s => s.id === profile.equipped[w])?.name || 'Standard'}</small></button>`).join('');
  const sel = state.collSkin || profile.equipped[state.collWeapon] || 'default';
  // filtres : tous, possédés, à acheter, par rareté
  const f = state.collFilter || 'all';
  const RORDER = ['common', 'rare', 'epic', 'legendary', 'exclusive'];
  const sets = [...new Set(SKINS.map(s => s.set).filter(Boolean))];
  const list = SKINS.filter(s => (f === 'all' || (f === 'owned' ? profile.owned.includes(s.id) || s.id === 'default' : f === 'buy' ? !profile.owned.includes(s.id) && !s.level && s.price > 0 : rarityOf(s) === f))
    && (!state.collSet || (state.collSet === 'classic' ? !s.set : s.set === state.collSet)));
  if (state.collSort === 'price') list.sort((a, b) => (a.level ? 1e6 + a.level : a.price) - (b.level ? 1e6 + b.level : b.price));
  else if (state.collSort === 'rarity') list.sort((a, b) => RORDER.indexOf(rarityOf(b)) - RORDER.indexOf(rarityOf(a)) || b.price - a.price);
  const ownedN = SKINS.filter(s => s.id === 'default' || profile.owned.includes(s.id)).length;
  $('coll-filters').innerHTML = `<div class="seg small">${[['all', 'TOUS'], ['owned', 'POSSÉDÉS'], ['buy', 'À ACHETER'], ...RORDER.map(r => [r, RARITY[r].name.toUpperCase()])].map(([k, l]) => `<button data-cf="${k}" class="${f === k ? 'active' : ''}">${l}</button>`).join('')}</div>
    <select id="coll-set" title="Collection"><option value="">Toutes les collections</option><option value="classic" ${state.collSet === 'classic' ? 'selected' : ''}>Classiques</option>${sets.map(x => `<option value="${esc(x)}" ${state.collSet === x ? 'selected' : ''}>${esc(x)} (${SKINS.filter(s => s.set === x && profile.owned.includes(s.id)).length}/${SKINS.filter(s => s.set === x).length})</option>`).join('')}</select>
    <span class="grow"></span><span class="muted small">${ownedN}/${SKINS.length} possédés</span>
    ${state.collSet && state.collSet !== 'classic' ? (() => { const all = SKINS.filter(s => s.set === state.collSet), have = all.filter(s => profile.owned.includes(s.id)).length, t = TITLES['set_' + setKey(state.collSet)];
      return `<div class="set-goal ${have === all.length ? 'done' : ''}">${have === all.length ? `✔ COLLECTION ${esc(state.collSet.toUpperCase())} TERMINÉE · titre « ${esc(t)} »` : `🎁 COLLECTION ${esc(state.collSet.toUpperCase())} : ${have}/${all.length} · termine-la pour gagner <b>800 Éclats</b> et le titre « ${esc(t)} »`}<div class="set-bar"><i style="width:${have / all.length * 100}%"></i></div></div>`; })() : ''}
    <select id="coll-sort" title="Trier"><option value="">Ordre d'origine</option><option value="price" ${state.collSort === 'price' ? 'selected' : ''}>Prix croissant</option><option value="rarity" ${state.collSort === 'rarity' ? 'selected' : ''}>Rareté</option></select>`;
  $('coll-skins').innerHTML = list.map(s => {
    const owned = profile.owned.includes(s.id);
    const eq = profile.equipped[state.collWeapon] === s.id;
    const rar = RARITY[rarityOf(s)];
    const sw = `${swatchCss(s)}${s.glow ? `;box-shadow:0 0 14px -2px ${s.accent}` : ''}`;
    const label = eq ? '<div class="sp eq">ÉQUIPÉ</div>' : owned ? '<div class="sp owned">Possédé — cliquer pour équiper</div>' : s.level ? `<div class="sp lock">🔒 Niveau ${s.level}</div>` : `<div class="sp"><span class="gem small"></span>${s.price}</div>`;
    return `<div class="skin-card ${s.id === sel ? 'selected' : ''}" data-s="${s.id}" style="border-top-color:${rar.color}"><div class="sw" style="${sw}"></div><div class="sn">${s.name}</div>${s.id !== 'default' ? `<div class="rar small" style="color:${rar.color}">${rar.name}${s.animated ? ' · animé' : ''}${s.set ? `<span class="muted"> · ${esc(s.set)}</span>` : ''}</div>` : ''}${label}</div>`;
  }).join('') || '<p class="muted">Aucun skin dans cette catégorie.</p>';
  $('coll-title').textContent = `${WEAPONS[state.collWeapon].name.toUpperCase()} · ${SKINS.find(s => s.id === sel).name}`;
  if (!previews.coll) previews.coll = new Preview($('coll-canvas'));
  const w = buildWeapon(WEAPONS[state.collWeapon].model, sel);
  const box = new THREE.Box3().setFromObject(w);
  const c = box.getCenter(new THREE.Vector3());
  w.position.sub(c);
  w.rotation.y = Math.PI / 2;
  const holder = new THREE.Group(); holder.add(w);
  const size = box.getSize(new THREE.Vector3()).length();
  previews.coll.set(holder, [0, size * 0.28, size * 1.05], [0, 0, 0]);
}
// vignette du motif (image générée), sinon dégradé des deux couleurs
function swatchCss(s) {
  if (!s) return '';
  const url = skinSwatch(s.id);
  return url ? `background:url(${url}) center/cover` : `background:linear-gradient(135deg, ${s.body} 0 55%, ${s.accent} 55%)`;
}
$('coll-filters').onclick = e => { const b = e.target.closest('[data-cf]'); if (b) { state.collFilter = b.dataset.cf; renderCollection(); } };
$('coll-filters').onchange = e => { if (e.target.id === 'coll-sort') { state.collSort = e.target.value; renderCollection(); } if (e.target.id === 'coll-set') { state.collSet = e.target.value; renderCollection(); } };
$('coll-weapons').onclick = e => { const b = e.target.closest('button'); if (b) { state.collWeapon = b.dataset.w; state.collSkin = null; renderCollection(); } };
$('coll-skins').onclick = e => {
  const c = e.target.closest('.skin-card'); if (!c) return;
  const id = c.dataset.s, skin = SKINS.find(s => s.id === id);
  const owned = profile.owned.includes(id);
  if (state.collSkin !== id && !owned) { state.collSkin = id; renderCollection(); return; } // 1er clic : aperçu
  if (!owned && skin.level) { toast(state.guest ? `Skin exclusif : crée un compte et atteins le niveau ${skin.level}.` : `Skin exclusif : atteins le niveau ${skin.level} pour le débloquer.`); return; }
  if (!owned) {
    if (profile.eclats < skin.price) { toast(`Il te manque ${skin.price - profile.eclats} Éclats. Joue des parties pour en gagner !`); return; }
    if (!confirm(`Acheter le skin « ${skin.name} » pour ${skin.price} Éclats ? (débloqué pour toutes les armes)`)) return;
    if (session.account) { net.send('buySkin', { skin: id }); net.send('equipSkin', { weapon: state.collWeapon, skin: id }); }
    else { profile.eclats -= skin.price; profile.owned.push(id); equipLocal(id); }
    SFX.initAudio(); SFX.playUI('win');
  } else {
    if (session.account) net.send('equipSkin', { weapon: state.collWeapon, skin: id });
    else equipLocal(id);
  }
  profile.equipped[state.collWeapon] = id;
  state.collSkin = id;
  refreshProfileUI();
};
function equipLocal(id) {
  profile.equipped[state.collWeapon] = id;
  save();
  net.send('setSkins', { skins: profile.equipped });
}

// ======================= PARAMÈTRES =======================
// réglages qui s'appliquent à toute la page (menus et partie)
function applyGlobalSettings() {
  const st = profile.settings, b = document.body;
  b.style.setProperty('--hs', st.hudScale || 1);
  b.style.setProperty('--chs', st.chatSize || 1);
  b.classList.toggle('reduce-motion', !!st.reduceMotion);
  b.classList.toggle('streamer', !!st.streamer);
  b.dataset.cb = st.colorblind || 'none';
  b.style.setProperty('--uif', st.uiFont || 1);
  b.classList.toggle('hi-contrast', !!st.highContrast);
  b.classList.toggle('no-flash', !!st.noFlash);
  b.classList.toggle('readable', !!st.readableFont);
  b.classList.toggle('theme-light', st.menuTheme === 'light');
  for (const [k, c] of [['volWeapons', 'weapons'], ['volSteps', 'steps'], ['volAbilities', 'abilities'], ['volUi', 'ui'], ['volNotif', 'notif']]) SFX.setCategoryVolume(c, st[k] ?? 1);
}
applyGlobalSettings();
let syncT = null, applyingSync = false;
// réglages du compte plus récents que ceux de cet appareil : on les reprend
net.on('settingsSync', m => {
  if (!profile.settings.syncAccount || !(m.at > (profile.settingsAt || 0))) return;
  const clean = sanitizeSettings(m.settings); const keys = clean.keys; delete clean.keys;
  if (clean.syncAccount === false) return;
  Object.assign(profile.settings, clean); if (keys) Object.assign(profile.settings.keys, keys);
  profile.settingsAt = m.at; save();
  applyingSync = true; document.dispatchEvent(new CustomEvent('settings-changed', { detail: { key: '*' } })); applyingSync = false;
  toast('Tes paramètres ont été récupérés depuis ton compte.', 3500);
});
document.addEventListener('settings-changed', e => {
  const k = e.detail?.key;
  applyGlobalSettings();
  // sauvegarde des réglages sur le compte (regroupée)
  if (!applyingSync && !state.guest && profile.settings.syncAccount) { clearTimeout(syncT); syncT = setTimeout(() => { profile.settingsAt = Date.now(); save(); net.send('saveSettings', { settings: profile.settings, at: profile.settingsAt }); }, 2500); }
  if (k === 'vol' || k === '*') SFX.setVolume(profile.settings.vol);
  if ((k === 'keys' || k === '*') && state.tab === 'agents') renderAgents();
});

// ======================= NAVIGATION & CONNEXION =======================
// ======================= CLASSEMENT =======================
for (const [id, key] of [['lb-kind', 'kind'], ['lb-scope', 'scope']]) $(id).onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  hub.lb[key] = b.dataset.v;
  $(id).querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
  loadLeaderboard();
};
initHub({ net, state, toast, showTab });
initClans({ net, state, toast });
initTournaments({ net, state, toast, showTab });

document.querySelector('.nav').id = 'nav';
$('nav').classList.add('locked');
$('logout-btn').style.display = 'none';
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => { if (b.dataset.tab === 'play' && state.room) showTab('room'); else showTab(b.dataset.tab); });
setAuthMode(session.token ? 'login' : 'register');
$('auth-name').value = profile.name || '';
SFX.setVolume(profile.settings.vol);
showTab('login');

// ======================= ANCIENNE VERSION EN CACHE =======================
// Le serveur envoie l'empreinte de la version qu'il sert. Si la page affichée est différente (cache du navigateur,
// onglet ouvert avant une mise à jour), on vide le cache et on recharge une seule fois — la connexion et les réglages sont gardés.
const PAGE_BUILD = document.querySelector('meta[name="eclipse-build"]')?.content || 'dev';
net.on('build', async m => {
  if (!m.build || PAGE_BUILD === 'dev' || m.build === PAGE_BUILD) { try { sessionStorage.removeItem('eclipse_maj'); } catch { /* */ } return; }
  let tried = null; try { tried = sessionStorage.getItem('eclipse_maj'); } catch { /* */ }
  if (tried === m.build) return; // déjà essayé pour cette version : pas de boucle de rechargement
  try { sessionStorage.setItem('eclipse_maj', m.build); } catch { /* */ }
  toast('Nouvelle version du jeu : mise à jour…', 4000);
  try { await fetch('/vider-cache', { cache: 'no-store' }); } catch { /* */ }
  try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch { /* */ }
  try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* */ }
  location.replace(location.pathname + '?v=' + encodeURIComponent(m.build) + location.hash);
});
// nettoie l'adresse après un rechargement de mise à jour
if (/[?&]v=/.test(location.search)) { try { history.replaceState(null, '', location.pathname + location.hash); } catch { /* */ } }

loadCustomSounds(); // MP3 importés pour les sons de touche / d'élimination (1.29)

// ======================= LAUNCHER DÉPASSÉ (1.28.2) =======================
// Le launcher s'identifie (« ECLIPSE-Launcher/2.0.1 »). La version portable et les anciens launchers ne peuvent pas se
// mettre à jour tout seuls : on leur propose la nouvelle version ici, dans le jeu.
(async () => {
  const m = navigator.userAgent.match(/ECLIPSE-Launcher\/(\d+)\.(\d+)\.(\d+)/);
  if (!m) return;
  const mine = [+m[1], +m[2], +m[3]];
  let info = null;
  for (let i = 0; i < 3 && !info?.version; i++) { try { info = await (await fetch('/api/launcher', { cache: 'no-store' })).json(); } catch { /* */ } if (!info?.version) await new Promise(r => setTimeout(r, 3000)); }
  if (!info?.version) return;
  const last = info.version.split('.').map(Number);
  const older = last[0] !== mine[0] ? last[0] > mine[0] : last[1] !== mine[1] ? last[1] > mine[1] : last[2] > mine[2];
  if (!older) return;
  let skip = ''; try { skip = sessionStorage.getItem('eclipse_launcher_skip') || ''; } catch { /* */ }
  if (skip === info.version) return;
  const bar = document.createElement('div');
  bar.id = 'launcher-upd';
  bar.innerHTML = `<span>⬆ <b>Nouvelle version du launcher : ${info.version}</b> (tu as la ${mine.join('.')}). Si elle ne s'installe pas toute seule, télécharge-la ici.</span>
    <a class="btn small primary" href="/telecharger" target="_blank" rel="noopener">TÉLÉCHARGER</a><button class="btn small ghost" type="button">PLUS TARD</button>`;
  bar.querySelector('button').onclick = () => { bar.remove(); try { sessionStorage.setItem('eclipse_launcher_skip', info.version); } catch { /* */ } };
  document.body.appendChild(bar);
  net.on('matchStart', () => bar.remove()); // jamais par-dessus la partie
})();

// ======================= BANDEAU COOKIES =======================
(() => {
  let seen = false; try { seen = localStorage.getItem('eclipse_cookies_ok') === '1'; } catch { /* */ }
  const bar = $('cookie-bar'); if (!bar || seen) return;
  bar.hidden = false;
  $('cookie-ok').onclick = () => { bar.hidden = true; try { localStorage.setItem('eclipse_cookies_ok', '1'); } catch { /* */ } };
  net.on('matchStart', () => { bar.hidden = true; }); // jamais par-dessus la partie
})();

net.on('open', () => { $('conn-status').textContent = 'en ligne'; $('conn-status').classList.add('on'); });
net.on('close', () => {
  $('conn-status').textContent = 'hors ligne'; $('conn-status').classList.remove('on');
  toast('Connexion au serveur perdue… reconnexion', 4000);
  if (state.game) { state.game.destroy(); state.game = null; }
  setTimeout(() => location.reload(), state.kicked ? 8000 : 2500);
});
net.connect().then(() => {
  net.startPing();
  if (session.token) net.send('resume', { token: session.token });
}).catch(() => toast('Impossible de joindre le serveur.'));
