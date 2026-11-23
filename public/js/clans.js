// Clans (onglet CLAN) : créer, inviter, rôles, chat de clan, classement des clans.
import { notify, openModal, closeModal, viewProfile, hub, emojify } from './hub.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE = { owner: 'Chef', officer: 'Officier', member: 'Membre' };
const ROLE_ICON = { owner: '★', officer: '◆', member: '' };
const C = { data: null, chat: [], lb: null, unread: 0 };
let net, state, toast;

export const clanTagOf = () => C.data?.clan?.tag || null;

export function initClans(ctx) {
  ({ net, state, toast } = ctx);
  hub.clanStaff = () => !!C.data?.clan && C.data.clan.myRole !== 'member';
  net.on('clan', m => {
    // le classement est redemandé quand on change de clan ou que le nombre de membres change
    const changed = (C.data?.clan?.tag || null) !== (m.clan?.tag || null) || (C.data?.clan?.members?.length || 0) !== (m.clan?.members?.length || 0);
    C.data = m; updateBadge();
    if (state.tab === 'clan') { renderClan(); if (changed) net.send('clanLeaderboard'); }
  });
  net.on('clanNotice', m => toast(m.text, 4000));
  net.on('clanInvite', m => {
    notify({ kind: 'CLAN', type: 'clan', text: `${m.from} t'invite à rejoindre le clan [${m.tag}] ${m.name}.`, ms: 30000, actions: [['Rejoindre', () => net.send('clanAccept', { tag: m.tag })], ['Refuser', () => net.send('clanDecline', { tag: m.tag })]] });
  });
  net.on('clanChat', m => {
    C.chat.push({ ...m, t: Date.now() });
    if (C.chat.length > 150) C.chat.shift();
    if (state.tab === 'clan') renderClanChat(); else { C.unread++; updateBadge(); }
    if (state.game?.addClanChat) state.game.addClanChat(m);
  });
  net.on('clanView', m => showClan(m.clan));
  net.on('clanLeaderboard', m => { C.lb = m; if (state.tab === 'clan') renderClanLb(); });
}

function updateBadge() {
  const b = $('clan-badge'); if (!b) return;
  const n = (C.data?.invites?.length || 0) + C.unread;
  b.textContent = n ? String(n) : '';
}

export function openClanTab() { C.unread = 0; updateBadge(); net.send('clanGet'); net.send('clanLeaderboard', { kind: C.lbKind || 'all' }); renderClan(); }

export function renderClan() {
  const root = $('clan-root'); if (!root) return;
  if (state.guest) { root.innerHTML = '<div class="panel empty-big">Les clans sont réservés aux comptes.</div>'; return; }
  const d = C.data;
  if (!d) { root.innerHTML = '<div class="panel">Chargement…</div>'; return; }
  const cl = d.clan;
  let left;
  if (!cl) {
    const need = d.minLevel || 3, lvl = d.myLevel || 1, locked = lvl < need;
    left = `<div class="panel"><h3>CRÉER UN CLAN</h3>
        <p class="muted small">Le tag (2 à 5 lettres ou chiffres) s'affiche devant le pseudo de chaque membre, en partie et dans les salons.${need > 1 ? ` Niveau ${need} requis.` : ''}</p>
        ${locked ? `<p class="cl-lock">🔒 Tu es niveau <b>${lvl}</b> : il faut le niveau <b>${need}</b> pour créer un clan. Joue quelques parties pour gagner de l'XP, ou rejoins un clan sur invitation (sans condition de niveau).</p>` : ''}
        <form id="cl-create" class="cl-form"><input id="cl-tag" maxlength="5" placeholder="TAG" autocomplete="off" style="text-transform:uppercase" ${locked ? 'disabled' : ''}><input id="cl-name" maxlength="24" placeholder="Nom du clan" ${locked ? 'disabled' : ''}><button class="btn primary" type="submit" ${locked ? 'disabled' : ''}>CRÉER</button></form></div>
      <div class="panel"><h3>INVITATIONS REÇUES (${d.invites.length})</h3>
        ${d.invites.map(i => `<div class="fr-row on"><b>[${esc(i.tag)}]</b> ${esc(i.name)} <span class="muted small">${i.members} membre(s)</span><span class="grow"></span><button class="btn small ghost" data-c="view" data-t="${esc(i.tag)}">VOIR</button><button class="btn small primary" data-c="accept" data-t="${esc(i.tag)}">REJOINDRE</button><button class="btn small ghost" data-c="decline" data-t="${esc(i.tag)}">✕</button></div>`).join('') || '<p class="muted">Aucune invitation. Un chef ou un officier peut t\'inviter depuis son onglet CLAN.</p>'}</div>`;
  } else {
    const staff = cl.myRole !== 'member';
    const owner = cl.myRole === 'owner';
    const on = cl.members.filter(m => m.online).length;
    left = `<div class="panel cl-head"><div class="cl-tag">[${esc(cl.tag)}]</div><div class="grow"><h2>${esc(cl.name)}</h2>
        <div class="muted small">${cl.members.length}/${cl.max} membres · ${on} en ligne · ${cl.xp.toLocaleString('fr-FR')} XP · ${cl.wins} victoires${cl.rank ? ` · ${cl.rank}<sup>e</sup> au classement` : ''} · ton rôle : <b>${ROLE[cl.myRole]}</b></div>
        ${cl.desc ? `<p class="cl-desc">${esc(cl.desc)}</p>` : ''}${cl.motd ? `<p class="cl-motd">📢 ${esc(cl.motd)}</p>` : ''}</div></div>
      <div class="panel"><h3>MISSION DE LA SEMAINE</h3><p class="small">Faire <b>${cl.week.goal}</b> éliminations ensemble cette semaine : +100 Éclats pour chaque membre et +500 XP pour le clan.</p><div class="pf-bar"><i style="width:${Math.min(100, cl.week.kills / cl.week.goal * 100)}%"></i></div><div class="muted small">${cl.week.kills} / ${cl.week.goal} ${cl.week.done ? '· <b class="gold">accomplie ✔</b>' : ''} · ${cl.week.xp.toLocaleString('fr-FR')} XP cette semaine</div></div>
      ${staff ? `<div class="panel"><h3>INVITER UN JOUEUR</h3><form id="cl-inv" class="fr-add"><input id="cl-inv-name" maxlength="16" placeholder="Pseudo"><button class="btn primary" type="submit">INVITER</button></form>
        ${cl.invites?.length ? `<p class="muted small" style="margin-top:8px">En attente : ${cl.invites.map(n => `${esc(n)} <a href="#" data-c="uninvite" data-n="${esc(n)}" title="Annuler">✕</a>`).join(' · ')}</p>` : ''}
        <form id="cl-desc" class="fr-add"><input id="cl-desc-in" maxlength="140" placeholder="Description du clan" value="${esc(cl.desc)}"><button class="btn ghost" type="submit">MODIFIER</button></form>
        <form id="cl-motd" class="fr-add"><input id="cl-motd-in" maxlength="140" placeholder="Message du jour (affiché aux membres à la connexion)" value="${esc(cl.motd || '')}"><button class="btn ghost" type="submit">PUBLIER</button></form>
        <form id="cl-welcome" class="fr-add"><input id="cl-welcome-in" maxlength="200" placeholder="Message de bienvenue (envoyé à chaque nouveau membre)" value="${esc(cl.welcome || '')}"><button class="btn ghost" type="submit">ENREGISTRER</button></form></div>` : ''}
      <div class="panel"><h3>MEMBRES</h3>
        ${cl.members.map(m => `<div class="fr-row ${m.online ? 'on' : ''}"><span class="dot ${m.online ? 'on' : ''}"></span><div class="fr-who"><b class="link" data-c="profile" data-n="${esc(m.name)}">${ROLE_ICON[m.role]} ${esc(m.name)}</b> <span class="muted small">niv. ${m.level} · ${ROLE[m.role]} · ${m.xp.toLocaleString('fr-FR')} XP apportée</span></div><span class="grow"></span>
          ${owner && m.role !== 'owner' ? `${m.role === 'member' ? `<button class="btn small ghost" data-c="role" data-r="officer" data-n="${esc(m.name)}">PROMOUVOIR</button>` : `<button class="btn small ghost" data-c="role" data-r="member" data-n="${esc(m.name)}">RÉTROGRADER</button>`}<button class="btn small ghost" data-c="role" data-r="owner" data-n="${esc(m.name)}" title="Donner le rôle de chef">★</button>` : ''}
          ${(owner && m.role !== 'owner') || (cl.myRole === 'officer' && m.role === 'member') ? `<button class="btn small ghost" data-c="kick" data-n="${esc(m.name)}" title="Exclure">✕</button>` : ''}</div>`).join('')}
        <div class="cl-actions"><button class="btn ghost small" data-c="leave">QUITTER LE CLAN</button>${owner ? '<button class="btn danger small" data-c="disband">DISSOUDRE</button>' : ''}</div>
      </div>`;
  }
  root.innerHTML = `<div class="fr-grid"><div>${left}</div><div>
      ${cl ? `<div class="panel fr-mp"><h3>CHAT DU CLAN</h3><div id="cl-log" class="mp-log"></div><form id="cl-chat" class="fr-add"><input id="cl-text" maxlength="200" placeholder="Message au clan…"><button class="btn primary" type="submit">ENVOYER</button></form><p class="muted small">En partie ou dans un salon, écris <b>/c message</b> pour parler à ton clan.</p></div>` : ''}
      <div class="panel"><h3>CLASSEMENT DES CLANS <span class="seg small" id="cl-lbk"><button data-c="lbk" data-k="all" class="${C.lbKind !== 'week' ? 'active' : ''}">TOUT</button><button data-c="lbk" data-k="week" class="${C.lbKind === 'week' ? 'active' : ''}">SEMAINE</button></span></h3><div id="cl-lb"></div><p class="muted small">L'XP gagnée en partie par chaque membre s'ajoute à celle de son clan.</p></div>
    </div></div>`;
  renderClanChat(); renderClanLb();
  const f = id => $(id);
  if (f('cl-create')) f('cl-create').onsubmit = e => {
    e.preventDefault();
    const tag = f('cl-tag').value.trim().toUpperCase(), name = f('cl-name').value.trim();
    if (!/^[A-Z0-9]{2,5}$/.test(tag)) return toast('Tag invalide : 2 à 5 lettres ou chiffres, sans espace ni accent.');
    if (name.length < 3) return toast('Nom du clan : 3 caractères minimum.');
    net.send('clanCreate', { tag, name });
  };
  if (f('cl-inv')) f('cl-inv').onsubmit = e => { e.preventDefault(); const n = f('cl-inv-name').value.trim(); if (n) net.send('clanInvite', { name: n }); f('cl-inv-name').value = ''; };
  if (f('cl-desc')) f('cl-desc').onsubmit = e => { e.preventDefault(); net.send('clanDesc', { desc: f('cl-desc-in').value }); };
  if (f('cl-motd')) f('cl-motd').onsubmit = e => { e.preventDefault(); net.send('clanMotd', { motd: f('cl-motd-in').value }); };
  if (f('cl-welcome')) f('cl-welcome').onsubmit = e => { e.preventDefault(); net.send('clanWelcome', { text: f('cl-welcome-in').value }); };
  if (f('cl-chat')) f('cl-chat').onsubmit = e => { e.preventDefault(); const t = f('cl-text').value.trim(); if (t) net.send('clanChat', { text: t }); f('cl-text').value = ''; };
  root.onclick = e => {
    const b = e.target.closest('[data-c]'); if (!b) return;
    e.preventDefault();
    const { c, n, t, r } = b.dataset;
    if (c === 'accept') net.send('clanAccept', { tag: t });
    if (c === 'decline') net.send('clanDecline', { tag: t });
    if (c === 'view') net.send('clanView', { tag: t });
    if (c === 'uninvite') net.send('clanCancelInvite', { name: n });
    if (c === 'profile') viewProfile(n);
    if (c === 'kick' && confirm(`Exclure ${n} du clan ?`)) net.send('clanKick', { name: n });
    if (c === 'role') { if (r !== 'owner' || confirm(`Donner le rôle de chef à ${n} ? Tu deviendras officier.`)) net.send('clanRole', { name: n, role: r }); }
    if (c === 'leave' && confirm(C.data?.clan?.myRole === 'owner' ? 'Quitter le clan ? Un officier (ou le plus ancien membre) deviendra chef.' : 'Quitter le clan ?')) net.send('clanLeave');
    if (c === 'disband' && confirm('Dissoudre définitivement le clan ? Tous les membres seront retirés.')) net.send('clanDisband');
    if (c === 'lbview') net.send('clanView', { tag: t });
    if (c === 'lbk') { C.lbKind = b.dataset.k; net.send('clanLeaderboard', { kind: C.lbKind }); renderClan(); }
  };
}

function renderClanChat() {
  const log = $('cl-log'); if (!log) return;
  log.innerHTML = C.chat.map(m => m.from ? `<div class="in"><b>${esc(m.from)}</b> : ${esc(emojify(m.text))}</div>` : `<div class="muted"><i>${esc(m.text)}</i></div>`).join('') || '<div class="muted small">Aucun message pour l\'instant.</div>';
  log.scrollTop = log.scrollHeight;
}

function renderClanLb() {
  const el = $('cl-lb'); if (!el) return;
  const d = C.lb;
  if (!d) { el.innerHTML = '<p class="muted">Chargement…</p>'; return; }
  const mine = C.data?.clan?.tag;
  el.innerHTML = d.rows.length ? `<table class="tbl lb"><thead><tr><th>#</th><th>Clan</th><th>Membres</th><th>XP</th></tr></thead><tbody>${d.rows.slice(0, 20).map(r => `<tr class="${r.tag === mine ? 'me' : ''}"><td>${r.pos}</td><td><a href="#" data-c="lbview" data-t="${esc(r.tag)}"><b>[${esc(r.tag)}]</b> ${esc(r.name)}</a></td><td>${r.members}</td><td class="v">${r.xp.toLocaleString('fr-FR')}</td></tr>`).join('')}
    ${d.me && d.me.pos > 20 ? `<tr class="sep"><td colspan="4">…</td></tr><tr class="me"><td>${d.me.pos}</td><td><b>[${esc(d.me.tag)}]</b> ${esc(d.me.name)}</td><td>${d.me.members}</td><td class="v">${d.me.xp.toLocaleString('fr-FR')}</td></tr>` : ''}</tbody></table>` : '<p class="muted">Aucun clan pour l\'instant : crée le premier !</p>';
}

function showClan(cl) {
  if (!cl) return;
  openModal(`<h2>[${esc(cl.tag)}] ${esc(cl.name)}</h2>
    <p class="muted">${cl.members.length}/${cl.max} membres · ${cl.xp.toLocaleString('fr-FR')} XP · ${cl.wins} victoires${cl.rank ? ` · ${cl.rank}<sup>e</sup>` : ''}</p>
    ${cl.desc ? `<p>${esc(cl.desc)}</p>` : ''}
    <div class="cl-members">${cl.members.map(m => `<div class="fr-row ${m.online ? 'on' : ''}"><span class="dot ${m.online ? 'on' : ''}"></span><b class="link" data-p="${esc(m.name)}">${ROLE_ICON[m.role]} ${esc(m.name)}</b><span class="muted small">niv. ${m.level} · ${ROLE[m.role]}</span></div>`).join('')}</div>`);
  $('mmodal-in').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { closeModal(); viewProfile(b.dataset.p); } };
}
