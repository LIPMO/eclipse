// Tournois (onglet TOURNOIS) : inscription, tableau à élimination directe, accès à son match.
import { notify, viewProfile } from './hub.js';
import { profile } from './store.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STATUS = { open: 'Inscriptions ouvertes', running: 'En cours', done: 'Terminé', cancelled: 'Annulé' };
const T = { list: [], sel: null };
let net, state, toast, showTab;

export function initTournaments(ctx) {
  ({ net, state, toast, showTab } = ctx);
  net.on('tournaments', m => { T.list = m.list || []; updateBadge(); if (state.tab === 'tournaments') renderTournaments(); });
  net.on('tourNotice', m => toast(m.text, 5000));
  net.on('tourNew', m => {
    notify({ kind: 'TOURNOI', text: `Nouveau tournoi « ${m.name} » : ${m.size} places, ${m.prize} Éclats pour le vainqueur.`, ms: 15000, actions: [['Voir', () => showTab('tournaments')], ['Plus tard', null]] });
  });
  net.on('tourMatch', m => {
    notify({ kind: `TOURNOI · ${m.round.toUpperCase()}`, text: `Ton match contre ${m.opponent} est prêt (« ${m.name} »). Rejoins-le dans les ${m.minutes} minutes, sinon c'est un forfait.`, ms: 60000, cls: 'gold',
      actions: [['Jouer', () => { if (state.game) { toast('Termine ta partie d\'abord.'); return; } net.send('tourPlay', { id: m.id }); }], ['Plus tard', null]] });
  });
  setInterval(updateCountdowns, 1000);
}

function updateBadge() {
  const b = $('tour-badge'); if (!b) return;
  const n = T.list.filter(t => t.myMatch && t.myMatch.status !== 'done').length || T.list.filter(t => t.status === 'open' && !t.registered).length;
  b.textContent = n ? String(n) : '';
}

export function openTournamentsTab() { net.send('tourList'); renderTournaments(); }

function updateCountdowns() {
  document.querySelectorAll('[data-deadline]').forEach(el => {
    const s = Math.max(0, Math.round((+el.dataset.deadline - Date.now()) / 1000));
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  });
}

export function renderTournaments() {
  const root = $('tour-root'); if (!root) return;
  const list = T.list;
  if (!list.length) { root.innerHTML = '<div class="panel empty-big">Aucun tournoi pour l\'instant. Les tournois sont organisés par l\'équipe d\'ECLIPSE : tu seras prévenu dès qu\'un tournoi ouvre ses inscriptions.</div>'; return; }
  if (!T.sel || !list.some(t => t.id === T.sel)) T.sel = (list.find(t => t.myMatch) || list.find(t => t.status === 'running') || list.find(t => t.status === 'open') || list[0]).id;
  const t = list.find(x => x.id === T.sel);
  root.innerHTML = `<div class="tr-grid">
    <div class="panel tr-list"><h3>TOURNOIS</h3>${list.map(x => `<div class="tr-item ${x.id === T.sel ? 'sel' : ''} st-${x.status}" data-t="sel" data-id="${esc(x.id)}">
        <b>${esc(x.name)}</b><div class="muted small">${STATUS[x.status]} · ${x.count}/${x.size} joueurs · ${x.prize} Éclats${x.myMatch ? ' · <span class="gold">ton match t\'attend</span>' : x.registered ? ' · inscrit' : ''}</div></div>`).join('')}
      <p class="muted small">Duels 1v1 à élimination directe, premier à ${t.target} manches. Le vainqueur gagne les Éclats et le titre <b>Champion</b>, le finaliste la moitié des Éclats.</p></div>
    <div>${detail(t)}</div></div>`;
  updateCountdowns();
  root.onclick = e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const a = b.dataset.t;
    if (a === 'sel') { T.sel = b.dataset.id; renderTournaments(); }
    if (a === 'reg') net.send('tourRegister', { id: t.id });
    if (a === 'unreg' && confirm('Te désinscrire de ce tournoi ?')) net.send('tourUnregister', { id: t.id });
    if (a === 'play') { if (state.game) { toast('Termine ta partie d\'abord.'); return; } net.send('tourPlay', { id: t.id }); }
    if (a === 'prof') viewProfile(b.dataset.n);
  };
}

function detail(t) {
  const me = profile.name;
  let head = `<div class="panel"><h2>${esc(t.name)}</h2><div class="muted">${STATUS[t.status]} · ${t.count}/${t.size} joueurs · premier à ${t.target} manches · ${t.prize} Éclats${t.minLevel > 1 ? ` · niveau ${t.minLevel} minimum` : ''}${t.startAt && t.status === 'open' ? ` · départ prévu le ${new Date(t.startAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</div>`;
  if (t.status === 'open') {
    if (state.guest) head += '<p class="muted">Crée un compte pour participer aux tournois.</p>';
    else head += t.registered ? '<p>Tu es inscrit. Le tableau sera tiré au départ du tournoi : reste connecté, tu seras prévenu quand ton match est prêt.</p><button class="btn ghost" data-t="unreg">SE DÉSINSCRIRE</button>'
      : t.count >= t.size ? '<p class="muted">Tournoi complet.</p>' : '<button class="btn primary" data-t="reg">S\'INSCRIRE</button>';
    head += `<h3 style="margin-top:16px">INSCRITS</h3><div class="tr-players">${t.players.map(n => `<span class="link" data-t="prof" data-n="${esc(n)}">${esc(n)}</span>`).join('') || '<span class="muted">Personne pour l\'instant.</span>'}</div>`;
  }
  if (t.myMatch) head += `<div class="tr-mine"><div><b>Ton match :</b> contre <b>${esc(t.myMatch.opponent)}</b>${t.myMatch.status === 'ready' && t.myMatch.deadline ? ` · forfait dans <b data-deadline="${t.myMatch.deadline}"></b>` : t.myMatch.status === 'playing' ? ' · en cours' : ''}</div><button class="btn primary" data-t="play">REJOINDRE MON MATCH</button></div>`;
  if (t.eliminated) head += '<p class="muted">Tu as été éliminé. Merci d\'avoir participé !</p>';
  if (t.status === 'done') head += `<div class="tr-champ">🏆 <b>${esc(t.champion)}</b> remporte le tournoi${t.runnerUp ? ` · finaliste : ${esc(t.runnerUp)}` : ''}</div>`;
  head += '</div>';
  if (!t.rounds.length) return head;
  const cell = (m, n) => {
    const cls = m.winner ? (m.winner === n ? 'w' : 'l') : '';
    return n ? `<div class="tr-p ${cls} ${n === me ? 'me' : ''}"><span class="link" data-t="prof" data-n="${esc(n)}">${esc(n)}</span>${m.winner === n && m.score ? `<i>${esc(m.score)}</i>` : ''}</div>` : `<div class="tr-p tbd">${m.bye ? 'exempté' : 'à déterminer'}</div>`;
  };
  const bracket = `<div class="panel"><h3>TABLEAU</h3><div class="tr-bracket">${t.rounds.map(rd => `<div class="tr-round"><div class="tr-rname">${esc(rd.name)}</div>${rd.matches.map(m => `<div class="tr-match st-${m.status}">${cell(m, m.p1)}${cell(m, m.p2)}${m.forfeit ? '<div class="tr-note">forfait</div>' : m.status === 'playing' ? '<div class="tr-note live">en cours</div>' : ''}</div>`).join('')}</div>`).join('')}</div></div>`;
  return head + bracket;
}
