// Panneau d'administration ECLIPSE
import { AGENTS, SKINS, WEAPONS, isFfa } from '/shared/data.js';
import { MAP_INFO, mapsForMode } from '/shared/maps.js';
import { TITLES, REPORT_REASONS, RANKS } from '/shared/progress.js';

const $ = id => document.getElementById(id);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ROLE = { owner: 'Propriétaire', admin: 'Admin', mod: 'Modérateur', player: 'Joueur' };
const MODE = { assault: 'Assaut 5v5', duel: 'Duel 1v1', ffa: 'Mêlée', gungame: 'Gun Game' };
const PHASE = { warmup: 'Préparation', buy: 'Achat', live: 'En cours', planted: 'Noyau posé', end: 'Fin de manche', over: 'Terminée' };
const DIFF = { easy: 'Facile', normal: 'Normal', hard: 'Difficile', expert: 'Expert' };
const LB_KINDS = [['level', 'Niveau'], ['week', 'Semaine'], ['elo', 'Elo duel'], ['kills', 'Éliminations'], ['wins', 'Victoires']];
const toLocalInput = t => { if (!t) return ''; const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const LOG_TYPES = { securite: 'Sécurité', systeme: 'Système', auth: 'Connexions', connexion: 'Déconnexions', partie: 'Parties', kill: 'Éliminations', moderation: 'Modération', admin: 'Admin' };
const DURATIONS = [['15', '15 minutes'], ['60', '1 heure'], ['360', '6 heures'], ['1440', '1 jour'], ['4320', '3 jours'], ['10080', '7 jours'], ['43200', '30 jours'], ['0', 'Définitif']];

const S = {
  token: null, me: null, view: 'dashboard', auto: true, ov: null, hist: [], range: 60,
  players: [], rooms: [], acc: { q: '', sort: 'created', dir: 'desc', page: 1, filter: 'all', data: null },
  modTab: 'bans', reportFilter: 'open', logTab: 'events', logType: '', logQ: '', logs: [], chat: [], chatQ: '', chatRoom: '',
  config: null, news: null, drawer: null, lbKind: 'level', matchQ: '', matchMode: '',
};
const lvl = () => S.me?.level || 0;

// ---------- formatage ----------
const pad = n => String(n).padStart(2, '0');
const fmtTime = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const fmtDate = t => t ? new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtDay = t => t ? new Date(t).toLocaleDateString('fr-FR') : '—';
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const d = Math.floor(sec / 86400), hh = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60);
  if (d) return `${d} j ${hh} h`; if (hh) return `${hh} h ${m} min`; if (m) return `${m} min`; return `${sec} s`;
}
const fmtBytes = b => b > 1e9 ? (b / 1e9).toFixed(2) + ' Go' : b > 1e6 ? (b / 1e6).toFixed(1) + ' Mo' : Math.round(b / 1e3) + ' Ko';
const roleBadge = r => r && r !== 'player' ? `<span class="badge ${r}">${ROLE[r]}</span>` : '';
const kd = (k, d) => d ? (k / d).toFixed(2) : String(k || 0);
const until = t => !t ? '<span class="badge danger">Définitif</span>' : `${fmtDate(t)} <span class="muted small">(${fmtDur((t - Date.now()) / 1000)})</span>`;

// ---------- API ----------
async function api(path, body) {
  const r = await fetch('/admin/api/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + S.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== 'login') { showLogin('Session expirée, reconnecte-toi.'); throw new Error('Session expirée'); }
  if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
  return data;
}
async function download(path, name) {
  try {
    const r = await fetch('/admin/api/' + path, { headers: { Authorization: 'Bearer ' + S.token } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Erreur ${r.status}`);
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Téléchargement lancé');
  } catch (e) { toast(e.message, true); }
}
async function act(path, body, okMsg) {
  try { const r = await api(path, body); if (okMsg) toast(okMsg); await refresh(true); return r; }
  catch (e) { toast(e.message, true); return null; }
}

// ---------- interface : notifications, fenêtres ----------
function toast(text, err = false) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = text;
  $('toasts').appendChild(t); setTimeout(() => t.remove(), err ? 6000 : 3000);
}
let modalResolve = null;
function fieldHTML(f) {
  const v = f.value ?? '';
  const help = f.help ? `<div class="help">${h(f.help)}</div>` : '';
  if (f.type === 'checkbox') return `<label class="check"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''}> ${h(f.label)}</label>`;
  if (f.type === 'select') return `<div class="field"><label>${h(f.label)}</label><select name="${f.name}">${f.options.map(([o, l]) => `<option value="${h(o)}" ${String(o) === String(v) ? 'selected' : ''}>${h(l)}</option>`).join('')}</select>${help}</div>`;
  if (f.type === 'textarea') return `<div class="field"><label>${h(f.label)}</label><textarea name="${f.name}" maxlength="${f.max || 300}" placeholder="${h(f.placeholder || '')}" ${f.required ? 'required' : ''}>${h(v)}</textarea>${help}</div>`;
  return `<div class="field"><label>${h(f.label)}</label><input name="${f.name}" type="${f.type || 'text'}" value="${h(v)}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} placeholder="${h(f.placeholder || '')}" ${f.required ? 'required' : ''} ${f.maxlength ? `maxlength="${f.maxlength}"` : ''}>${help}</div>`;
}
function modal({ title, body = '', fields = [], ok = 'Valider', danger = false, wide = false, noCancel = false }) {
  const f = $('modal-form');
  f.className = 'modal-in' + (wide ? ' wide' : '');
  f.innerHTML = `<button type="button" class="x" data-modal="cancel">✕</button><h2>${h(title)}</h2>${body}${fields.map(fieldHTML).join('')}
    <div class="foot">${noCancel ? '' : '<button type="button" class="btn ghost" data-modal="cancel">Annuler</button>'}<button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${h(ok)}</button></div>`;
  $('modal').classList.remove('hidden');
  setTimeout(() => (f.querySelector('input:not([type=checkbox]),select,textarea') || f.querySelector('[type=submit]')).focus(), 30);
  return new Promise(res => { if (modalResolve) modalResolve(null); modalResolve = res; });
}
function closeModal(val) { $('modal').classList.add('hidden'); const r = modalResolve; modalResolve = null; if (r) r(val); }
$('modal-form').addEventListener('submit', e => {
  e.preventDefault();
  const vals = {};
  for (const el of e.target.querySelectorAll('[name]')) vals[el.name] = el.type === 'checkbox' ? el.checked : el.value;
  closeModal(vals);
});
$('modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.dataset.modal === 'cancel') closeModal(null); });
const confirmBox = async (text, { danger = true, ok = 'Confirmer' } = {}) => !!(await modal({ title: 'Confirmation', body: `<p>${h(text)}</p>`, ok, danger }));
function openDrawer(kind, id, html) { S.drawer = { kind, id }; $('drawer-body').innerHTML = html; $('drawer').classList.remove('hidden'); }
function closeDrawer() { S.drawer = null; $('drawer').classList.add('hidden'); }
$('drawer').addEventListener('click', e => { if (e.target.id === 'drawer') closeDrawer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('modal').classList.contains('hidden')) closeModal(null); else if (S.drawer) closeDrawer(); } });

// ---------- graphiques ----------
function lineChart(canvas, series, { yMin = 0, labels = [] } = {}) {
  const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const g = canvas.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, W, H);
  const pts = series[0]?.points || [];
  g.font = '12px Rajdhani, sans-serif'; g.fillStyle = '#8a93ad';
  if (pts.length < 2) { g.fillText('Pas encore assez de données (un point par minute).', 12, H / 2); return; }
  const L = 34, R = 10, T = 10, B = 22;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const maxY = Math.max(4, ...series.flatMap(s => s.points.map(p => p.v)));
  const X = t => L + (t - t0) / Math.max(1, t1 - t0) * (W - L - R), Y = v => T + (1 - (v - yMin) / (maxY - yMin)) * (H - T - B);
  g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const v = yMin + (maxY - yMin) * i / 4, y = Y(v); g.beginPath(); g.moveTo(L, y); g.lineTo(W - R, y); g.stroke(); g.fillText(Math.round(v), 4, y + 4); }
  for (let i = 0; i <= 4; i++) { const t = t0 + (t1 - t0) * i / 4; const d = new Date(t); g.fillText(`${pad(d.getHours())}:${pad(d.getMinutes())}`, Math.min(W - 40, X(t) - 14), H - 6); }
  for (const s of series) {
    g.strokeStyle = s.color; g.lineWidth = 2; g.beginPath();
    s.points.forEach((p, i) => (i ? g.lineTo(X(p.t), Y(p.v)) : g.moveTo(X(p.t), Y(p.v))));
    g.stroke();
  }
  let lx = L + 6; for (const s of series) { g.fillStyle = s.color; g.fillRect(lx, T, 10, 3); g.fillStyle = '#c3c9da'; g.fillText(s.label, lx + 14, T + 5); lx += g.measureText(s.label).width + 34; }
  void labels;
}
const bars = (items, empty = 'Aucune donnée pour le moment') => {
  if (!items?.length) return `<div class="muted small">${empty}</div>`;
  const max = Math.max(1, ...items.map(i => i.value));
  return `<div class="bars">${items.map(i => `<div class="bar"><span>${h(i.label)}</span><div class="t"><i style="width:${(i.value / max * 100).toFixed(1)}%"></i></div><span class="n">${i.value}</span></div>`).join('')}</div>`;
};

// ---------- vues ----------
const VIEWS = {
  dashboard: {
    title: 'Tableau de bord', live: true,
    async load() { S.hist = (await api('history')).points; },
    render() {
      const o = S.ov; if (!o) return '<div class="empty">Chargement…</div>';
      const k = (v, l, s = '') => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
      const hs = o.totals.kills ? Math.round(o.totals.headshots / o.totals.kills * 100) : 0;
      const tickCls = o.tick.avg > 20 ? 'bad' : o.tick.avg > 10 ? 'warn-t' : 'ok';
      return `<div class="grid kpis">
        ${k(o.online, 'Joueurs en ligne', `${o.guests} invité(s) · ${o.connections} connexion(s)`)}
        ${k(o.inGame, 'En partie', `${o.matches} partie(s) en cours`)}
        ${k(o.rooms, 'Salons ouverts')}
        ${k(o.accounts, 'Comptes inscrits', `+${o.newToday} aujourd'hui · ${o.staff} membre(s) du staff`)}
        ${k(o.peak, 'Pic de connexions', o.peakAt ? 'le ' + fmtDate(o.peakAt) : '')}
        ${k(fmtDur(o.uptime), 'Serveur en ligne depuis')}
        ${k(o.cpu + ' %', 'Processeur (jeu)', `charge ${o.load.join(' / ')} · ${o.cores} cœurs`)}
        ${k(fmtBytes(o.memory.rss), 'Mémoire du jeu', `système : ${fmtBytes(o.memory.total - o.memory.free)} / ${fmtBytes(o.memory.total)}`)}
        ${k(`<span class="${tickCls}">${o.tick.avg} ms</span>`, 'Calcul par tick', `max ${o.tick.max} ms · budget 33 ms`)}
        ${k(o.net.outKBs + ' Ko/s', 'Trafic sortant', `${o.net.outMsgs} msg/s envoyés · ${o.net.inMsgs} reçus`)}
        ${k(o.totals.matchesToday, 'Parties aujourd\'hui', `${o.totals.matches} depuis le début`)}
        ${k(o.totals.kills, 'Éliminations', `${hs} % à la tête`)}
        ${k(`<span class="${o.openReports ? 'bad' : ''}">${o.openReports}</span>`, 'Signalements ouverts')}
        ${k(o.activeBans, 'Bans actifs', `${o.activeMutes} silence(s) en cours`)}
      </div>
      <div class="grid cols-2" style="margin-top:14px">
        <div class="card" style="grid-column:1/-1"><h3>Joueurs connectés
          <span class="seg">${[[60, '1 h'], [360, '6 h'], [1440, '24 h']].map(([v, l]) => `<button data-act="range" data-v="${v}" class="${S.range === v ? 'active' : ''}">${l}</button>`).join('')}</span></h3>
          <canvas class="chart" id="ch-online"></canvas></div>
        <div class="card"><h3>Modes de jeu joués</h3>${bars(o.topModes)}</div>
        <div class="card"><h3>Cartes les plus jouées</h3>${bars(o.topMaps)}</div>
        <div class="card"><h3>Agents les plus choisis</h3>${bars(o.topAgents)}</div>
        <div class="card"><h3>Éliminations par arme</h3>${bars(o.topWeapons)}</div>
        <div class="card"><h3>Inscriptions par jour</h3>${bars(o.regsByDay.map(([d, v]) => ({ label: d.slice(5).split('-').reverse().join('/'), value: v })))}</div>
        <div class="card"><h3>Parties par jour</h3>${bars(o.matchesByDay.map(([d, v]) => ({ label: d.slice(5).split('-').reverse().join('/'), value: v })))}</div>
        <div class="card" style="grid-column:1/-1"><h3>Serveur</h3><dl class="kv">
          <dt>Version du jeu</dt><dd>${h(o.version)}</dd><dt>Node.js</dt><dd>${h(o.node)}</dd>
          <dt>Système</dt><dd>${h(o.platform)}</dd><dt>Machine</dt><dd>${h(o.hostname)}</dd>
          <dt>Maintenance</dt><dd>${o.maintenance ? '<span class="badge danger">ACTIVE</span>' : '<span class="badge ok">non</span>'}</dd></dl></div>
      </div>`;
    },
    after() {
      const c = $('ch-online'); if (!c) return;
      const since = Date.now() - S.range * 60000;
      const pts = S.hist.filter(p => p.t >= since);
      lineChart(c, [
        { label: 'En ligne', color: '#8b5cff', points: pts.map(p => ({ t: p.t, v: p.online })) },
        { label: 'En partie', color: '#19e3c4', points: pts.map(p => ({ t: p.t, v: p.inGame })) },
      ]);
    },
  },

  players: {
    title: 'Joueurs connectés', live: true,
    async load() { S.players = await api('players'); },
    render() {
      return `<div class="toolbar"><input class="grow" data-input="playerQ" placeholder="Rechercher un joueur, une IP, un salon…" value="${h(S.playerQ || '')}"><span class="muted" id="pl-count"></span></div><div id="list"></div>`;
    },
    update() {
      const q = (S.playerQ || '').toLowerCase();
      const rows = S.players.filter(p => !q || p.name.toLowerCase().includes(q) || String(p.ip).includes(q) || (p.room?.name || '').toLowerCase().includes(q));
      $('pl-count').textContent = `${rows.length} / ${S.players.length} joueur(s)`;
      $('list').innerHTML = rows.length ? `<div class="tbl-wrap"><table><thead><tr><th>Joueur</th><th>IP</th><th>Salon</th><th>En partie</th><th>Connecté depuis</th><th>Actions</th></tr></thead><tbody>
        ${rows.map(p => `<tr>
          <td><b>${h(p.name)}</b> ${p.guest ? '<span class="badge guest">Invité</span>' : roleBadge(p.role)} ${p.muted ? '<span class="badge danger">Silence</span>' : ''}</td>
          <td class="muted">${h(p.ip)}</td>
          <td>${p.room ? `<a data-act="openRoom" data-id="${h(p.room.id)}">${h(p.room.name)}</a> <span class="badge ${p.room.state === 'playing' ? 'live' : 'lobby'}">${p.room.state === 'playing' ? 'EN JEU' : 'LOBBY'}</span>` : '<span class="muted">Menu</span>'}</td>
          <td>${p.match ? `${p.match.kills}/${p.match.deaths}/${p.match.assists} · ${p.match.alive ? `<span class="ok">${p.match.hp} PV</span>` : '<span class="bad">mort</span>'} · ${h(AGENTS[p.match.agent]?.name || '')}` : '<span class="muted">—</span>'}</td>
          <td>${fmtDur((Date.now() - p.since) / 1000)}</td>
          <td><div class="acts">
            <button class="btn small" data-act="pm" data-id="${h(p.id)}" data-name="${h(p.name)}">Message</button>
            <button class="btn small" data-act="kick" data-id="${h(p.id)}" data-name="${h(p.name)}">Expulser</button>
            <button class="btn small" data-act="mute" data-id="${h(p.id)}" data-name="${h(p.name)}">Silence</button>
            <button class="btn small danger" data-act="ban" data-id="${h(p.id)}" data-name="${h(p.name)}">Bannir</button>
            ${p.match?.alive ? `<button class="btn small" data-act="slay" data-id="${h(p.id)}" data-name="${h(p.name)}">Éliminer</button>` : ''}
            ${p.account ? `<button class="btn small ghost" data-act="openAccount" data-name="${h(p.name)}">Fiche</button>` : ''}
          </div></td></tr>`).join('')}</tbody></table></div>` : '<div class="tbl-wrap"><div class="empty">Aucun joueur connecté.</div></div>';
    },
  },

  accounts: {
    title: 'Comptes', live: false,
    async load() {
      const a = S.acc;
      a.data = await api(`accounts?q=${encodeURIComponent(a.q)}&sort=${a.sort}&dir=${a.dir}&page=${a.page}&filter=${a.filter}`);
    },
    render() {
      const a = S.acc;
      return `<div class="toolbar">
        <input class="grow" data-input="accQ" placeholder="Rechercher un pseudo…" value="${h(a.q)}">
        <span class="seg">${[['all', 'Tous'], ['online', 'En ligne'], ['staff', 'Staff'], ['banned', 'Bannis']].map(([v, l]) => `<button data-act="accFilter" data-v="${v}" class="${a.filter === v ? 'active' : ''}">${l}</button>`).join('')}</span>
        ${lvl() >= 2 ? '<button class="btn small" data-act="exportAccounts">⇩ Export CSV</button>' : ''}
      </div><div id="list"></div>`;
    },
    update() {
      const a = S.acc, d = a.data; if (!d) return;
      const th = (k, l) => `<th class="sort" data-act="accSort" data-k="${k}">${l}${a.sort === k ? (a.dir === 'asc' ? ' ▲' : ' ▼') : ''}</th>`;
      $('list').innerHTML = `<div class="tbl-wrap"><table><thead><tr>${th('name', 'Pseudo')}${th('role', 'Rôle')}${th('created', 'Inscrit le')}${th('eclats', 'Éclats')}${th('matches', 'Parties')}${th('wins', 'Victoires')}${th('kills', 'Élim.')}<th>K/D</th>${th('skins', 'Skins')}<th>Statut</th></tr></thead><tbody>
        ${d.rows.map(r => `<tr class="click" data-act="openAccount" data-name="${h(r.name)}">
          <td><b>${h(r.name)}</b></td><td>${roleBadge(r.role) || '<span class="muted">Joueur</span>'}</td><td>${fmtDay(r.created)}</td><td>${r.eclats}</td><td>${r.matches}</td><td>${r.wins}</td><td>${r.kills}</td><td>${kd(r.kills, r.deaths)}</td><td>${r.skins}/${SKINS.length}</td>
          <td>${r.online ? '<span class="badge live">En ligne</span>' : ''} ${r.banned ? '<span class="badge danger">Banni</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="10" class="empty">Aucun compte trouvé.</td></tr>'}
        </tbody></table></div>
        <div class="pager"><span class="muted">${d.total} compte(s) · page ${d.page}/${d.pages}</span>
          <button class="btn small" data-act="accPage" data-v="${d.page - 1}" ${d.page <= 1 ? 'disabled' : ''}>◀</button>
          <button class="btn small" data-act="accPage" data-v="${d.page + 1}" ${d.page >= d.pages ? 'disabled' : ''}>▶</button></div>`;
    },
  },

  rooms: {
    title: 'Salons & parties', live: true,
    async load() { S.rooms = await api('rooms'); },
    render() { return `<div class="toolbar">${lvl() >= 2 ? '<button class="btn primary small" data-act="roomCreate">＋ Créer un salon officiel</button>' : ''}<span class="muted" id="rm-count"></span></div><div id="list"></div>`; },
    update() {
      $('rm-count').textContent = `${S.rooms.length} salon(s) · ${S.rooms.filter(r => r.match).length} partie(s) en cours`;
      $('list').innerHTML = S.rooms.length ? `<div class="tbl-wrap"><table><thead><tr><th>Salon</th><th>Mode</th><th>Carte</th><th>État</th><th>Manche</th><th>Score</th><th>Chrono</th><th>Joueurs</th><th>Hôte</th><th></th></tr></thead><tbody>
        ${S.rooms.map(r => `<tr class="click" data-act="openRoom" data-id="${h(r.id)}">
          <td><b>${h(r.name)}</b> ${r.official ? '<span class="badge admin">Officiel</span>' : ''} ${r.quick ? '<span class="badge">Duel rapide</span>' : ''}</td>
          <td>${MODE[r.mode]}</td><td>${h(r.map)}</td>
          <td>${r.match ? `<span class="badge live">${PHASE[r.match.phase] || r.match.phase}</span>${r.match.paused ? ' <span class="badge danger">PAUSE</span>' : ''}` : '<span class="badge lobby">Lobby</span>'}</td>
          <td>${r.match && !isFfa(r.mode) ? r.match.round : '—'}</td>
          <td>${r.match && !isFfa(r.mode) ? `${r.match.score.alpha} – ${r.match.score.beta}` : '—'}</td>
          <td>${r.match ? fmtDur(r.match.timer) : '—'}</td>
          <td>${r.humans} <span class="muted">+ ${r.bots} bot(s) / ${r.max}</span></td><td>${h(r.host)}</td>
          <td><button class="btn small">Gérer</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="tbl-wrap"><div class="empty">Aucun salon ouvert.</div></div>';
    },
  },

  moderation: {
    title: 'Modération', live: true,
    async load() {
      const [bans, mutes, reports, filter, names] = await Promise.all([api('bans'), api('mutes'), api('reports'), api('filter'), api('names')]);
      Object.assign(S, { bans, mutes, reports, filterWords: filter.words, nameWords: names.words });
    },
    render() {
      const open = (S.reports || []).filter(r => !r.resolved).length;
      return `<div class="tabs">${[['bans', `Bans (${S.bans?.length || 0})`], ['mutes', `Silences (${S.mutes?.length || 0})`], ['reports', `Signalements${open ? ` (${open})` : ''}`], ['filter', 'Filtre de mots'], ['names', 'Pseudos interdits']].map(([v, l]) => `<button data-act="modTab" data-v="${v}" class="${S.modTab === v ? 'active' : ''}">${l}</button>`).join('')}</div><div id="list"></div>`;
    },
    update() {
      const t = S.modTab;
      let html = '';
      if (t === 'bans') html = `<div class="toolbar"><button class="btn primary small" data-act="newBan">＋ Nouveau ban</button><span class="muted small">Les bans temporaires se lèvent automatiquement à expiration.</span></div>
        <div class="tbl-wrap"><table><thead><tr><th>Cible</th><th>Type</th><th>Raison</th><th>Par</th><th>Le</th><th>Expire</th><th></th></tr></thead><tbody>
        ${S.bans.map(b => `<tr><td><b>${h(b.label)}</b></td><td>${b.type === 'ip' ? 'Adresse IP' : 'Compte'}</td><td>${h(b.reason)}</td><td>${h(b.by)}</td><td>${fmtDate(b.at)}</td><td>${until(b.until)}</td>
          <td><button class="btn small" data-act="unban" data-id="${h(b.id)}" data-name="${h(b.label)}">Débannir</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Aucun ban actif.</td></tr>'}</tbody></table></div>`;
      if (t === 'mutes') html = `<div class="toolbar"><button class="btn primary small" data-act="newMute">＋ Réduire un compte au silence</button></div>
        <div class="tbl-wrap"><table><thead><tr><th>Joueur</th><th>Raison</th><th>Par</th><th>Le</th><th>Expire</th><th></th></tr></thead><tbody>
        ${S.mutes.map(m => `<tr><td><b>${h(m.label)}</b> ${m.key.startsWith('guest:') ? '<span class="badge guest">Invité</span>' : ''}</td><td>${h(m.reason)}</td><td>${h(m.by)}</td><td>${fmtDate(m.at)}</td><td>${until(m.until)}</td>
          <td><button class="btn small" data-act="unmute" data-id="${h(m.id)}" data-name="${h(m.label)}">Lever</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Personne n\'est réduit au silence.</td></tr>'}</tbody></table></div>`;
      if (t === 'reports') {
        const rows = S.reports.filter(r => S.reportFilter === 'all' || !r.resolved);
        html = `<div class="toolbar"><span class="seg">${[['open', 'À traiter'], ['all', 'Tous']].map(([v, l]) => `<button data-act="reportFilter" data-v="${v}" class="${S.reportFilter === v ? 'active' : ''}">${l}</button>`).join('')}</span>
          <span class="muted small">Les joueurs signalent depuis le jeu (bouton ⚑ du salon, menu pause, profil) ou avec <b>/signaler pseudo raison</b>.</span></div>
          <div class="tbl-wrap"><table><thead><tr><th>Le</th><th>De</th><th>Contre</th><th>Motif</th><th>Détails</th><th>Preuves</th><th>Statut</th><th></th></tr></thead><tbody>
          ${rows.map(r => {
            const n = S.reports.filter(x => x.target?.toLowerCase() === r.target?.toLowerCase()).length;
            const ev = r.evidence;
            const proofs = [ev ? `En partie : ${ev.kills}/${ev.deaths}, ${ev.kills ? Math.round(ev.hs / ev.kills * 100) : 0} % tête, ${ev.shots ? Math.round(ev.hits / ev.shots * 100) : 0} % précision, ${ev.dmg} dégâts${ev.strikes ? `, <b class="bad">${ev.strikes} alerte(s) de mouvement</b>` : ''}` : '',
              r.suspect ? `<b class="bad">${r.suspect} alerte(s) anti-triche</b>` : '',
              r.chat?.length ? `<details><summary>${r.chat.length} message(s) récents</summary>${r.chat.map(m => `<div class="small">${fmtTime(m.t)} · ${h(m.text)}</div>`).join('')}</details>` : ''].filter(Boolean).join('<br>');
            return `<tr><td>${fmtDate(r.t)}</td><td>${h(r.from)}</td><td><b>${h(r.target)}</b>${n > 1 ? ` <span class="badge danger">${n} signalements</span>` : ''}</td><td><span class="badge ${r.category === 'cheat' ? 'danger' : ''}">${h(REPORT_REASONS[r.category] || 'Autre')}</span></td><td>${h(r.reason || '—')}<div class="muted small">${h(r.room)}</div></td><td class="small">${proofs || '<span class="muted">—</span>'}</td>
            <td>${r.resolved ? '<span class="badge ok">Traité</span>' : '<span class="badge danger">À traiter</span>'}</td>
            <td><div class="acts">${r.resolved ? `<button class="btn small" data-act="reportReopen" data-id="${h(r.id)}">Rouvrir</button>` : `<button class="btn small" data-act="reportResolve" data-id="${h(r.id)}">Marquer traité</button>`}
              ${r.targetAccount ? `<button class="btn small ghost" data-act="openAccount" data-name="${h(r.target)}">Fiche</button><button class="btn small" data-act="accWarn" data-name="${h(r.target)}">Avertir</button>` : ''}
              <button class="btn small danger" data-act="reportBan" data-name="${h(r.target)}">Sanctionner</button>
              ${lvl() >= 2 ? `<button class="btn small ghost" data-act="reportDelete" data-id="${h(r.id)}">Supprimer</button>` : ''}</div></td></tr>`;
          }).join('') || '<tr><td colspan="8" class="empty">Aucun signalement.</td></tr>'}</tbody></table></div>`;
      }
      if (t === 'names') html = `<div class="card"><h3>Mots interdits dans les pseudos</h3>
        <p class="muted small">Un mot par ligne (2 caractères minimum). Un pseudo qui contient l'un de ces mots est refusé à l'inscription. Les comptes existants ne sont pas modifiés (utilise « Renommer » dans leur fiche).</p>
        <div class="field"><textarea id="name-words" style="min-height:200px" ${lvl() < 2 ? 'readonly' : ''}>${h((S.nameWords || []).join('\n'))}</textarea></div>
        ${lvl() >= 2 ? '<button class="btn primary" data-act="namesSave">Enregistrer</button>' : ''}</div>`;
      if (t === 'filter') html = `<div class="card"><h3>Mots filtrés dans le chat</h3>
        <p class="muted small">Un mot ou une expression par ligne. Ils sont remplacés par des étoiles dans le chat ; l'original reste visible ici dans le journal du chat.</p>
        <div class="field"><textarea id="filter-words" style="min-height:240px" ${lvl() < 2 ? 'readonly' : ''}>${h((S.filterWords || []).join('\n'))}</textarea></div>
        ${lvl() >= 2 ? '<button class="btn primary" data-act="filterSave">Enregistrer le filtre</button>' : '<span class="muted small">Seuls les administrateurs peuvent modifier le filtre.</span>'}</div>`;
      $('list').innerHTML = html;
    },
    keepWhileEditing: true,
  },

  chat: {
    title: 'Chat en direct', live: true,
    async load(full) {
      const last = full ? 0 : (S.chat[S.chat.length - 1]?.id || 0);
      const rows = await api(`chat?since=${last}&q=${encodeURIComponent(S.chatQ)}&room=${encodeURIComponent(S.chatRoom)}`);
      S.chatNew = rows; S.chat = full ? rows : S.chat.concat(rows).slice(-1000);
      if (full) S.rooms = await api('rooms');
    },
    render() {
      return `<div class="toolbar"><input class="grow" data-input="chatQ" placeholder="Rechercher un message ou un joueur…" value="${h(S.chatQ)}">
        <select data-input="chatRoom"><option value="">Tous les salons</option>${S.rooms.map(r => `<option value="${h(r.id)}" ${S.chatRoom === r.id ? 'selected' : ''}>${h(r.name)}</option>`).join('')}</select>
        ${lvl() >= 2 ? '<button class="btn small danger" data-act="chatClear">Vider le journal</button>' : ''}</div>
        <div class="feed" id="feed"></div>`;
    },
    update(full) {
      const feed = $('feed'); if (!feed) return;
      const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
      const line = m => `<div class="ln"><span class="tm">${fmtTime(m.t)}</span><span class="small muted">${h(m.roomName)}</span>
        <span><b>${h(m.from)}</b> : ${h(m.text)} ${m.original ? `<span class="badge danger" title="Message original : ${h(m.original)}">filtré</span>` : ''}</span>
        <span class="acts">${m.account ? `<button class="btn small" data-act="chatMute" data-name="${h(m.from)}">Silence</button><button class="btn small danger" data-act="chatBan" data-name="${h(m.from)}">Bannir</button>` : ''}</span></div>`;
      if (full) feed.innerHTML = S.chat.map(line).join('') || '<div class="empty">Aucun message pour le moment.</div>';
      else if (S.chatNew?.length) { if (feed.querySelector('.empty')) feed.innerHTML = ''; feed.insertAdjacentHTML('beforeend', S.chatNew.map(line).join('')); }
      if (atBottom || full) feed.scrollTop = feed.scrollHeight;
    },
    incremental: true,
  },

  announce: {
    title: 'Annonces', live: false,
    async load() { S.players = await api('players'); S.config = (await api('config')).config; S.schedule = await api('schedule'); },
    render() {
      return `<div class="grid cols-2">
        <div class="card" style="grid-column:1/-1"><h3>Annonces programmées</h3>
          <p class="muted small">Envoyées automatiquement à l'heure choisie à tous les joueurs connectés, une seule fois ou à intervalle régulier.</p>
          <div class="row"><div class="field" style="flex:2"><label>Message</label><input id="sc-text" maxlength="300" placeholder="Ex. : Tournoi dans 30 minutes, rejoignez le salon officiel !"></div>
            <div class="field"><label>Date et heure</label><input id="sc-at" type="datetime-local" value="${toLocalInput(Date.now() + 3600000)}"></div>
            <div class="field"><label>Répétition</label><select id="sc-rep"><option value="0">Une seule fois</option><option value="30">Toutes les 30 min</option><option value="60">Toutes les heures</option><option value="180">Toutes les 3 h</option><option value="1440">Tous les jours</option><option value="10080">Toutes les semaines</option></select></div></div>
          <button class="btn primary" data-act="schedAdd">Programmer</button>
          <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Prochain envoi</th><th>Message</th><th>Répétition</th><th>Par</th><th></th></tr></thead><tbody>
          ${S.schedule.map(a => `<tr><td>${fmtDate(a.at)}</td><td>${h(a.text)}</td><td>${a.repeat ? `toutes les ${a.repeat >= 1440 ? a.repeat / 1440 + ' j' : a.repeat >= 60 ? a.repeat / 60 + ' h' : a.repeat + ' min'}` : 'une fois'}</td><td>${h(a.by)}</td><td><button class="btn small danger" data-act="schedDel" data-id="${h(a.id)}">Supprimer</button></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Aucune annonce programmée.</td></tr>'}</tbody></table></div></div>
        <div class="card"><h3>Annonce à tous les joueurs</h3>
          <p class="muted small">S'affiche immédiatement en haut de l'écran de tous les joueurs connectés, en jeu comme dans les menus.</p>
          <div class="field"><textarea id="bc-text" maxlength="300" placeholder="Ex. : Redémarrage du serveur dans 5 minutes !"></textarea></div>
          <button class="btn primary" data-act="broadcast">Envoyer à ${S.players.length} joueur(s)</button></div>
        <div class="card"><h3>Message du jour (MOTD)</h3>
          <p class="muted small">Bandeau affiché dans le menu JOUER pour tous les joueurs (y compris ceux qui se connectent plus tard).</p>
          <div class="field"><textarea id="motd-text" maxlength="300" placeholder="Ex. : Tournoi samedi à 20 h, inscriptions dans le chat !">${h(S.config.motd)}</textarea></div>
          <div class="row"><button class="btn primary" data-act="motdSave">Publier</button><button class="btn ghost" data-act="motdClear">Retirer</button></div></div>
        <div class="card"><h3>Message privé</h3>
          <div class="field"><label>Destinataire</label><select id="pm-to">${S.players.map(p => `<option value="${h(p.id)}">${h(p.name)}</option>`).join('') || '<option value="">Aucun joueur connecté</option>'}</select></div>
          <div class="field"><textarea id="pm-text" maxlength="300" placeholder="Ton message…"></textarea></div>
          <button class="btn primary" data-act="pmSend" ${S.players.length ? '' : 'disabled'}>Envoyer</button></div>
      </div>`;
    },
  },

  news: {
    title: 'Notes de mise à jour', live: false,
    async load() { S.news = await api('news'); },
    render() {
      return `<div class="toolbar"><button class="btn small" data-act="newsAdd">＋ Nouvelle note</button><button class="btn primary small" data-act="newsSave">Enregistrer et publier</button>
        <span class="muted small">Affichées dans le launcher (onglet NOTES DE MISE À JOUR). La première note est la plus récente.</span></div>
        <div id="news-list">${S.news.map((n, i) => `<div class="news-ed" data-i="${i}">
          <div class="hd"><button class="btn small ghost" data-act="newsUp" data-i="${i}" ${i ? '' : 'disabled'}>▲</button><button class="btn small ghost" data-act="newsDown" data-i="${i}" ${i < S.news.length - 1 ? '' : 'disabled'}>▼</button><button class="btn small danger" data-act="newsDel" data-i="${i}">Supprimer</button></div>
          <div class="row"><div class="field" style="max-width:120px"><label>Version</label><input data-f="version" value="${h(n.version)}" maxlength="12"></div>
            <div class="field" style="max-width:180px"><label>Date</label><input type="date" data-f="date" value="${h(n.date)}"></div>
            <div class="field"><label>Titre</label><input data-f="title" value="${h(n.title)}" maxlength="120"></div></div>
          <div class="field"><label>Points (un par ligne)</label><textarea data-f="items">${h((n.items || []).join('\n'))}</textarea></div></div>`).join('') || '<div class="empty card">Aucune note. Ajoute la première !</div>'}</div>`;
    },
  },

  config: {
    title: 'Configuration', live: false,
    async load() { const r = await api('config'); S.config = r.config; S.weaponDefaults = r.weaponDefaults; S.weapons = r.weapons; },
    render() {
      const c = S.config;
      const chk = (k, l, help = '') => `<label class="check"><input type="checkbox" data-k="${k}" ${c[k] ? 'checked' : ''}> ${l}</label>${help ? `<div class="muted small" style="margin:-6px 0 10px 26px">${help}</div>` : ''}`;
      const num = (k, l, min, max, step = 1, help = '') => `<div class="field"><label>${l}</label><input type="number" data-k="${k}" value="${c[k]}" min="${min}" max="${max}" step="${step}">${help ? `<div class="help">${help}</div>` : ''}</div>`;
      return `<div class="grid cols-2">
        <div class="card" data-section="access"><h3>Accès au serveur</h3>
          ${chk('maintenance', 'Mode maintenance', 'Expulse tous les joueurs (sauf le staff) et bloque les connexions.')}
          <div class="field"><label>Message de maintenance</label><input data-k="maintenanceMsg" value="${h(c.maintenanceMsg)}" maxlength="200"></div>
          ${chk('registrationOpen', 'Inscriptions ouvertes')}
          ${chk('guestsAllowed', 'Connexion en invité autorisée')}
          ${chk('guestRooms', 'Les invités peuvent créer des salons')}
          ${chk('chatEnabled', 'Chat activé', 'Si désactivé, seul le staff peut écrire.')}
          <div class="row">${num('maxPlayers', 'Joueurs connectés max', 1, 5000)}${num('maxRooms', 'Salons max', 1, 500)}</div>
          <button class="btn primary" data-act="cfgSave" data-section="access">Enregistrer</button></div>
        <div class="card" data-section="eco"><h3>Économie</h3>
          ${num('rewardMul', 'Multiplicateur d\'Éclats gagnés', 0, 10, 0.1, '2 = événement « Éclats doublés ». 0 = aucune récompense.')}
          ${num('startEclats', 'Éclats offerts à l\'inscription', 0, 100000)}
          <button class="btn primary" data-act="cfgSave" data-section="eco">Enregistrer</button>
          <h3 style="margin-top:22px">Durées des manches (secondes)</h3>
          <div class="row">${num('buyTime', 'Achat (Assaut)', 5, 120)}${num('roundTime', 'Manche (Assaut)', 20, 600)}${num('fuseTime', 'Noyau posé', 10, 180)}</div>
          <div class="row">${num('duelBuyTime', 'Achat (Duel)', 3, 60)}${num('duelRoundTime', 'Manche (Duel)', 15, 600)}</div>
          <p class="muted small">S'applique aux nouvelles manches, sans redémarrage.</p>
          <button class="btn primary" data-act="cfgSave" data-section="eco">Enregistrer</button></div>
        <div class="card" style="grid-column:1/-1"><h3>Équilibrage des armes</h3>
          <p class="muted small">Dégâts par balle (par plomb pour le Brute) et multiplicateur de tir à la tête. Appliqué immédiatement par le serveur.</p>
          <div class="tbl-wrap"><table><thead><tr><th>Arme</th><th>Type</th><th>Dégâts</th><th>× Tête</th><th>Par défaut</th><th></th></tr></thead><tbody>
          ${Object.entries(S.weapons).map(([id, w]) => { const d = S.weaponDefaults[id]; const mod = w.damage !== d.damage || w.headMul !== d.headMul; return `<tr data-w="${id}">
            <td><b>${h(w.name)}</b> ${mod ? '<span class="badge admin">modifiée</span>' : ''}</td><td>${h(w.type)}</td>
            <td><input type="number" data-wf="damage" value="${w.damage}" min="1" max="300" style="width:80px"></td>
            <td><input type="number" data-wf="headMul" value="${w.headMul}" min="1" max="6" step="0.1" style="width:80px"></td>
            <td class="muted">${d.damage} · ×${d.headMul}</td><td>${mod ? `<button class="btn small ghost" data-act="wReset" data-id="${id}">Rétablir</button>` : ''}</td></tr>`; }).join('')}
          </tbody></table></div><div style="margin-top:10px"><button class="btn primary" data-act="weaponsSave">Enregistrer l'équilibrage</button></div></div>
        <div class="card" data-section="chatcfg"><h3>Chat et sanctions automatiques</h3>
          ${num('slowMode', 'Mode lent (secondes entre deux messages, 0 = désactivé)', 0, 120)}
          ${chk('blockLinks', 'Bloquer les liens dans le chat', 'Empêche la publicité et les liens piégés (le staff peut toujours en envoyer).')}
          ${chk('autoMute', 'Silence automatique', 'Après plusieurs messages filtrés ou liens en 10 minutes.')}
          <div class="row">${num('autoMuteThreshold', 'Infractions avant silence', 1, 20)}${num('autoMuteMinutes', 'Durée du silence (min)', 1, 1440)}</div>
          ${num('warnBanAt', 'Avertissements avant ban automatique de 24 h (0 = jamais)', 0, 20)}
          <button class="btn primary" data-act="cfgSave" data-section="chatcfg">Enregistrer</button></div>
        <div class="card danger-zone"><h3>Zone sensible</h3>
          <p class="muted small">Remet à zéro les statistiques globales du tableau de bord (parties, éliminations, popularité). Les comptes ne sont pas touchés.</p>
          <button class="btn danger" data-act="statsReset">Réinitialiser les statistiques globales</button></div>
      </div>`;
    },
  },

  logs: {
    title: 'Journaux', live: true,
    async load(full) {
      if (S.logTab === 'audit') { S.audit = await api('audit'); return; }
      const last = full ? 0 : (S.logs[S.logs.length - 1]?.id || 0);
      const rows = await api(`logs?since=${last}&type=${S.logType}&q=${encodeURIComponent(S.logQ)}`);
      S.logsNew = rows; S.logs = full ? rows : S.logs.concat(rows).slice(-1500);
    },
    render() {
      const tabs = `<div class="tabs"><button data-act="logTab" data-v="events" class="${S.logTab === 'events' ? 'active' : ''}">Événements</button>${lvl() >= 2 ? `<button data-act="logTab" data-v="audit" class="${S.logTab === 'audit' ? 'active' : ''}">Actions du staff (audit)</button>` : ''}</div>`;
      if (S.logTab === 'audit') return tabs + '<div id="list"></div>';
      return tabs + `<div class="toolbar"><div class="chips"><span class="chip ${!S.logType ? 'on' : ''}" data-act="logType" data-v="">Tout</span>${Object.entries(LOG_TYPES).map(([k, l]) => `<span class="chip ${S.logType === k ? 'on' : ''}" data-act="logType" data-v="${k}">${l}</span>`).join('')}</div>
        <input class="grow" data-input="logQ" placeholder="Rechercher…" value="${h(S.logQ)}">${lvl() >= 2 ? '<button class="btn small" data-act="exportLogs">⇩ Exporter</button>' : ''}</div><div class="feed" id="feed"></div>`;
    },
    update(full) {
      if (S.logTab === 'audit') {
        $('list').innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Membre</th><th>Action</th><th>Détail</th></tr></thead><tbody>
          ${(S.audit || []).map(a => `<tr><td>${fmtDate(a.t)}</td><td><b>${h(a.by)}</b></td><td>${h(a.action)}</td><td class="muted">${h(a.detail)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Aucune action enregistrée.</td></tr>'}</tbody></table></div>`;
        return;
      }
      const feed = $('feed'); if (!feed) return;
      const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
      const line = l => `<div class="ln"><span class="tm">${fmtTime(l.t)}</span><span class="ty ty-${l.type}">${LOG_TYPES[l.type] || l.type}</span><span>${h(l.text)}</span><span></span></div>`;
      if (full) feed.innerHTML = S.logs.map(line).join('') || '<div class="empty">Aucun événement.</div>';
      else if (S.logsNew?.length) { if (feed.querySelector('.empty')) feed.innerHTML = ''; feed.insertAdjacentHTML('beforeend', S.logsNew.map(line).join('')); }
      if (atBottom || full) feed.scrollTop = feed.scrollHeight;
    },
    incremental: true,
  },

  anticheat: {
    title: 'Anti-triche', live: true,
    async load() { S.suspects = await api('suspects'); },
    render() { return `<div class="toolbar"><span class="muted small">Joueurs ayant déclenché une alerte : déplacement impossible (vitesse, vol, téléportation) ou statistiques anormales en fin de partie (tirs à la tête, précision, éliminations sans mourir). Une alerte n'est pas une preuve : vérifie les signalements et le contexte avant de sanctionner.</span></div><div id="list"></div>`; },
    update() {
      $('list').innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Joueur</th><th>Alertes</th><th>Dernière</th><th>Signalements</th><th>K/D</th><th>% tête</th><th>Précision</th><th>Dernières alertes</th><th></th></tr></thead><tbody>
        ${(S.suspects || []).map(s => `<tr><td><b>${h(s.name)}</b> ${s.account ? '' : '<span class="badge guest">Invité</span>'} ${s.online ? '<span class="badge live">En ligne</span>' : ''} ${s.banned ? '<span class="badge danger">Banni</span>' : ''}</td>
          <td><b class="${s.count >= 5 ? 'bad' : ''}">${s.count}</b></td><td>${fmtDate(s.last)}</td><td>${s.reports || 0}</td><td>${s.kd ?? '—'}</td><td>${s.hs != null ? s.hs + ' %' : '—'}</td><td>${s.acc != null ? s.acc + ' %' : '—'}</td>
          <td class="small">${s.alerts.slice(0, 3).map(a => `<div>${fmtDate(a.t)} — ${h(a.reason)}</div>`).join('')}</td>
          <td><div class="acts">${s.account ? `<button class="btn small ghost" data-act="openAccount" data-name="${h(s.name)}">Fiche</button><button class="btn small danger" data-act="accBan" data-name="${h(s.name)}">Bannir</button>` : ''}<button class="btn small ghost" data-act="suspectClear" data-key="${h(s.key)}">Effacer</button></div></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Aucune alerte. 👍</td></tr>'}</tbody></table></div>`;
    },
  },

  tournaments: {
    title: 'Tournois', live: true,
    async load() { S.tours = (await api('tournaments')).list; },
    render() { return `<div class="toolbar">${lvl() >= 2 ? '<button class="btn" data-act="tourCreate">＋ Nouveau tournoi</button>' : ''}<span class="muted small">Duels 1v1 à élimination directe. Les joueurs s'inscrivent dans l'onglet TOURNOIS du jeu ; chaque match ouvre un salon privé réservé aux deux joueurs. Absent 5 min ou départ en cours de match = forfait.</span></div><div id="list"></div>`; },
    update() {
      const ST = { open: 'Inscriptions', running: 'En cours', done: 'Terminé', cancelled: 'Annulé' };
      $('list').innerHTML = (S.tours || []).map(t => `<div class="card" style="margin-bottom:14px"><div class="toolbar" style="margin:0 0 8px"><h3 style="margin:0">${h(t.name)}</h3><span class="badge">${ST[t.status]}</span>
          <span class="muted small">${t.count}/${t.size} joueurs · premier à ${t.target} manches · ${t.prize} Éclats${t.minLevel > 1 ? ` · niv. ${t.minLevel}+` : ''} · créé par ${h(t.by || '?')} le ${fmtDate(t.created)}${t.startAt && t.status === 'open' ? ` · départ ${fmtDate(t.startAt)}` : ''}</span><span class="grow"></span>
          ${lvl() >= 2 && t.status === 'open' ? `<button class="btn small" data-act="tourStart" data-id="${h(t.id)}">Lancer maintenant</button>` : ''}
          ${lvl() >= 2 && (t.status === 'open' || t.status === 'running') ? `<button class="btn small danger" data-act="tourCancel" data-id="${h(t.id)}">Annuler</button>` : ''}
          ${lvl() >= 2 && (t.status === 'done' || t.status === 'cancelled') ? `<button class="btn small ghost" data-act="tourDelete" data-id="${h(t.id)}">Supprimer</button>` : ''}</div>
        ${t.status === 'done' ? `<p>🏆 <b>${h(t.champion)}</b> · finaliste : ${h(t.runnerUp || '—')}</p>` : ''}${t.cancelReason ? `<p class="muted small">Annulé : ${h(t.cancelReason)}</p>` : ''}
        ${t.status === 'open' ? `<p class="small">Inscrits : ${t.players.map(h).join(', ') || '<span class="muted">aucun</span>'}</p>` : ''}
        ${t.rounds.length ? `<div class="tr-adm">${t.rounds.map(rd => `<div><div class="muted small"><b>${h(rd.name)}</b></div>${rd.matches.map(m => `<div class="tr-adm-m">${[m.p1, m.p2].map(n => n ? `<span class="${m.winner === n ? 'ok' : m.winner ? 'muted' : ''}">${h(n)}</span>${t.status === 'running' && m.p1 && m.p2 && !m.winner ? ` <a href="#" data-act="tourWinner" data-id="${h(t.id)}" data-match="${h(m.id)}" data-name="${h(n)}" title="Déclarer vainqueur">✓</a>` : ''}` : `<span class="muted">${m.bye ? 'exempté' : '—'}</span>`).join(' <span class="muted">vs</span> ')}${m.forfeit ? ' <span class="muted small">(forfait)</span>' : ''}${m.status === 'playing' ? ' <span class="badge live">en cours</span>' : ''}</div>`).join('')}</div>`).join('')}</div>` : ''}
      </div>`).join('') || '<div class="empty">Aucun tournoi. Crée le premier avec le bouton ci-dessus.</div>';
    },
  },

  clans: {
    title: 'Clans', live: false,
    async load() { S.clanData = (await api('clans')).clans; },
    render() { return `<div class="toolbar"><input class="grow" data-input="clanQ" placeholder="Rechercher un clan ou un membre…" value="${h(S.clanQ || '')}"><span class="muted small">Le chef et les officiers gèrent leur clan en jeu ; ici tu peux renommer un clan au nom inapproprié, retirer un membre ou dissoudre un clan.</span></div><div id="list"></div>`; },
    update() {
      const q = (S.clanQ || '').toLowerCase();
      const rows = (S.clanData || []).filter(c => !q || c.tag.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.members.some(m => m.name.toLowerCase().includes(q)));
      const role = { owner: '★ ', officer: '◆ ', member: '' };
      $('list').innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>#</th><th>Clan</th><th>Chef</th><th>Membres</th><th>XP</th><th>Victoires</th><th>Créé le</th><th></th></tr></thead><tbody>
        ${rows.map((c, i) => `<tr><td>${i + 1}</td><td><b>[${h(c.tag)}]</b> ${h(c.name)}${c.desc ? `<div class="muted small">${h(c.desc)}</div>` : ''}</td><td>${h(c.owner)}</td>
          <td class="small">${c.members.map(m => `<span>${role[m.role] || ''}${h(m.name)}${m.role !== 'owner' ? ` <a href="#" data-act="clanKick" data-tag="${h(c.tag)}" data-name="${h(m.name)}" title="Retirer du clan">✕</a>` : ''}</span>`).join(' · ')}</td>
          <td>${c.xp}</td><td>${c.wins}/${c.matches}</td><td>${fmtDate(c.created)}</td>
          <td><div class="acts"><button class="btn small ghost" data-act="clanRename" data-tag="${h(c.tag)}" data-name="${h(c.name)}">Renommer</button><button class="btn small danger" data-act="clanDisband" data-tag="${h(c.tag)}">Dissoudre</button></div></td></tr>`).join('') || '<tr><td colspan="8" class="empty">Aucun clan.</td></tr>'}</tbody></table></div>`;
    },
  },

  matches: {
    title: 'Historique des parties', live: false,
    async load() { S.matchData = await api(`matches?q=${encodeURIComponent(S.matchQ)}&mode=${S.matchMode}`); },
    render() {
      return `<div class="toolbar"><input class="grow" data-input="matchQ" placeholder="Rechercher un salon ou un joueur…" value="${h(S.matchQ)}">
        <span class="seg">${[['', 'Tous'], ['assault', 'Assaut'], ['duel', 'Duel'], ['ffa', 'Mêlée'], ['gungame', 'Gun Game']].map(([v, l]) => `<button data-act="matchMode" data-v="${v}" class="${S.matchMode === v ? 'active' : ''}">${l}</button>`).join('')}</span>
        ${lvl() >= 2 ? '<button class="btn small" data-act="exportMatches">⇩ Export CSV</button>' : ''}</div><div id="list"></div>`;
    },
    update() {
      const d = S.matchData; if (!d) return;
      $('list').innerHTML = `<div class="card" style="margin-bottom:14px"><h3>Équilibrage des agents (joueurs humains)</h3>
        ${d.agents.length ? `<table><thead><tr><th>Agent</th><th>Parties</th><th>Victoires</th><th>Taux de victoire</th><th>K/D</th></tr></thead><tbody>${d.agents.sort((a, b) => b.played - a.played).map(a => `<tr><td><b>${h(a.name)}</b></td><td>${a.played}</td><td>${a.won}</td><td><span class="${a.played >= 10 && (a.winRate > 60 || a.winRate < 40) ? 'bad' : ''}">${a.winRate} %</span></td><td>${kd(a.kills, a.deaths)}</td></tr>`).join('')}</tbody></table><p class="muted small">Un taux de victoire durablement au-dessus de 60 % ou sous 40 % (sur au moins 10 parties) signale un agent à rééquilibrer.</p>` : '<div class="muted small">Pas encore de données.</div>'}</div>
        <div class="tbl-wrap"><table><thead><tr><th>Fin</th><th>Salon</th><th>Mode</th><th>Carte</th><th>Durée</th><th>Score</th><th>Vainqueur</th><th>MVP</th><th>Joueurs</th></tr></thead><tbody>
        ${d.rows.map(m => `<tr><td>${fmtDate(m.t)}</td><td>${h(m.room)}</td><td>${MODE[m.mode] || m.mode}</td><td>${h(MAP_INFO[m.map]?.name || m.map)}</td><td>${fmtDur(m.duration)}</td><td>${h(m.score || '—')}</td><td>${h(m.winner)}</td><td>${h(m.mvp)}</td>
          <td class="small">${m.players.map(p => `<span class="${p.team === 'alpha' ? 'ok' : p.team === 'beta' ? 'bad' : ''}">${h(p.name)}</span> ${p.kills}/${p.deaths}`).join(' · ') || '<span class="muted">bots uniquement</span>'}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">Aucune partie terminée.</td></tr>'}</tbody></table></div>`;
    },
  },

  progression: {
    title: 'Progression & saisons', live: false,
    async load() {
      const jobs = [api('seasons'), api('leaderboard?kind=' + S.lbKind)];
      if (lvl() >= 2) jobs.push(api('config'), api('quests'));
      const [seasons, lb, cfg, quests] = await Promise.all(jobs);
      Object.assign(S, { seasons, lb }); if (cfg) S.config = cfg.config; if (quests) S.quests = quests.quests;
    },
    render() {
      const se = S.seasons, c = S.config || {};
      const admin = lvl() >= 2;
      const chk = (k, l, help = '') => `<label class="check"><input type="checkbox" data-k="${k}" ${c[k] ? 'checked' : ''} ${admin ? '' : 'disabled'}> ${l}</label>${help ? `<div class="muted small" style="margin:-6px 0 10px 26px">${help}</div>` : ''}`;
      const num = (k, l, min, max, step = 1, help = '') => `<div class="field"><label>${l}</label><input type="number" data-k="${k}" value="${c[k] ?? ''}" min="${min}" max="${max}" step="${step}" ${admin ? '' : 'disabled'}>${help ? `<div class="help">${help}</div>` : ''}</div>`;
      const evOn = c.eventUntil > Date.now();
      return `<div class="grid cols-2">
        <div class="card"><h3>${h(se.season.name)} <span class="muted small">depuis le ${fmtDay(se.season.started)}</span></h3>
          <p class="muted small">Le classement Elo ne concerne que les duels entre deux joueurs inscrits. À la fin de la saison, chaque joueur classé reçoit des Éclats selon son rang, puis son Elo est rapproché de 1 000 de moitié.</p>
          ${bars(se.distribution, 'Aucun joueur classé pour le moment')}
          <div class="small muted" style="margin-top:8px">${RANKS.map(r => `${r.name} ≥ ${r.min} : ${r.reward} Éclats`).join(' · ')}</div>
          ${admin ? '<button class="btn primary" data-act="seasonNew" style="margin-top:12px">Terminer la saison et en lancer une nouvelle</button>' : ''}
          ${se.history.length ? `<h3 style="margin-top:18px">Saisons passées</h3><table><thead><tr><th>Saison</th><th>Fin</th><th>Classés</th><th>Champion</th><th>Éclats distribués</th></tr></thead><tbody>${se.history.map(x => `<tr><td>${h(x.name)}</td><td>${fmtDay(x.ended)}</td><td>${x.players}</td><td>${h(x.top?.[0]?.name || '—')} ${x.top?.[0] ? `(${x.top[0].elo})` : ''}</td><td>${x.rewarded}</td></tr>`).join('')}</tbody></table>` : ''}</div>
        <div class="card" data-section="event"><h3>Événement temporaire ${evOn ? '<span class="badge live">EN COURS</span>' : ''}</h3>
          <p class="muted small">Multiplie l'XP et/ou les Éclats gagnés jusqu'à la date choisie. Une bannière s'affiche pour tous les joueurs.</p>
          <div class="field"><label>Nom de l'événement</label><input data-k="eventName" value="${h(c.eventName || '')}" maxlength="60" placeholder="Week-end XP double" ${admin ? '' : 'disabled'}></div>
          <div class="row">${num('eventXpMul', 'XP ×', 0, 10, 0.1)}${num('eventEclatsMul', 'Éclats ×', 0, 10, 0.1)}</div>
          <div class="field"><label>Fin de l'événement</label><input type="datetime-local" data-k="eventUntil" value="${toLocalInput(c.eventUntil)}" ${admin ? '' : 'disabled'}></div>
          ${admin ? `<div class="row"><button class="btn primary" data-act="cfgSave" data-section="event">${evOn ? 'Mettre à jour' : 'Lancer l\'événement'}</button>${evOn ? '<button class="btn danger" data-act="eventStop">Arrêter maintenant</button>' : ''}</div>` : ''}
          <h3 style="margin-top:22px">Réglages permanents</h3>
          <div data-section="prog">${num('xpMul', 'Multiplicateur d\'XP permanent', 0, 10, 0.1)}
          ${chk('weaponUnlocks', 'Déblocage des armes par niveau', 'Assaut et Duel uniquement (en Mêlée, tout le monde a l\'équipement complet). Niveau 2 : Viper et Brute · 3 : Tempest et Lancer · 5 : Longbow. Les invités sont considérés niveau 1 ; les bots suivent le niveau du joueur le plus bas.')}
          ${chk('dailyBonus', 'Bonus de connexion quotidien', '50 à 400 Éclats selon la série de jours consécutifs (7 jours).')}
          ${admin ? '<button class="btn primary" data-act="cfgSave" data-section="prog">Enregistrer</button>' : ''}</div></div>
        ${admin && S.quests ? `<div class="card" style="grid-column:1/-1"><h3>Catalogue des quêtes</h3>
          <p class="muted small">Chaque joueur reçoit 3 quêtes du jour et 3 de la semaine parmi les quêtes actives. Laisse une récompense vide pour garder la valeur par défaut.</p>
          <div class="tbl-wrap"><table><thead><tr><th>Active</th><th>Quête</th><th>Type</th><th>Objectif</th><th>Éclats</th><th>XP</th></tr></thead><tbody>
          ${S.quests.map(q => `<tr data-q="${q.id}"><td><input type="checkbox" data-qf="on" ${q.off ? '' : 'checked'}></td><td>${h(q.label)}</td><td>${q.kind === 'daily' ? 'Jour' : 'Semaine'}</td><td>${q.goal}</td>
            <td><input type="number" data-qf="eclats" value="${q.eclats ?? ''}" placeholder="${q.base.eclats}" min="0" style="width:90px"></td><td><input type="number" data-qf="xp" value="${q.xp ?? ''}" placeholder="${q.base.xp}" min="0" style="width:90px"></td></tr>`).join('')}</tbody></table></div>
          <button class="btn primary" data-act="questsSave" style="margin-top:10px">Enregistrer les quêtes</button></div>` : ''}
        <div class="card" style="grid-column:1/-1"><h3>Classements <span class="seg">${LB_KINDS.map(([v, l]) => `<button data-act="lbKind" data-v="${v}" class="${S.lbKind === v ? 'active' : ''}">${l}</button>`).join('')}</span></h3>
          <div class="tbl-wrap"><table><thead><tr><th>#</th><th>Joueur</th><th>Niveau</th><th>Valeur</th><th>Rang Elo</th></tr></thead><tbody>
          ${S.lb.rows.map(r => `<tr class="click" data-act="openAccount" data-name="${h(r.name)}"><td>${r.pos}</td><td><b>${h(r.name)}</b> ${r.title ? `<span class="badge">${h(r.title)}</span>` : ''}</td><td>${r.level}</td><td>${r.v}</td><td style="color:${r.rankColor}">${h(r.rank)} (${r.elo})</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Aucun joueur classé.</td></tr>'}</tbody></table></div></div>
      </div>`;
    },
  },

  economy: {
    title: 'Économie', live: false,
    async load() { S.eco = await api('economy'); },
    render() {
      const e = S.eco;
      const k = (v, l, s = '') => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
      const days = arr => arr.map(([d, v]) => ({ label: d.slice(5).split('-').reverse().join('/'), value: v }));
      return `<div class="grid kpis">
        ${k(e.total.toLocaleString('fr-FR'), 'Éclats en circulation', `${e.accounts} compte(s)`)}${k(e.avg.toLocaleString('fr-FR'), 'Éclats par compte (moyenne)')}
        ${k('×' + e.mul.eclats, 'Multiplicateur d\'Éclats actuel', e.event ? 'événement en cours' : '')}${k('×' + e.mul.xp, 'Multiplicateur d\'XP actuel')}</div>
      <div class="grid cols-2" style="margin-top:14px">
        <div class="card"><h3>Éclats gagnés par jour</h3>${bars(days(e.earnByDay))}</div>
        <div class="card"><h3>Éclats dépensés par jour (skins)</h3>${bars(days(e.spendByDay))}</div>
        <div class="card"><h3>Skins possédés</h3>${bars(e.skins)}</div>
        <div class="card"><h3>Répartition des niveaux</h3>${bars(e.levels)}</div>
        <div class="card"><h3>Comptes les plus riches</h3><table><tbody>${e.richest.map(r => `<tr class="click" data-act="openAccount" data-name="${h(r.name)}"><td><b>${h(r.name)}</b></td><td>niv. ${r.level}</td><td>${r.eclats.toLocaleString('fr-FR')} Éclats</td></tr>`).join('')}</tbody></table></div>
        <div class="card"><h3>Cadeau collectif</h3>
          <p class="muted small">Offre des Éclats et/ou de l'XP à tous les comptes (ou seulement aux joueurs connectés). Les joueurs connectés reçoivent une notification.</p>
          <div class="row"><div class="field"><label>Éclats</label><input id="gift-eclats" type="number" value="200" min="0" max="100000"></div><div class="field"><label>XP</label><input id="gift-xp" type="number" value="0" min="0" max="1000000"></div></div>
          <div class="field"><label>Destinataires</label><select id="gift-target"><option value="all">Tous les comptes</option><option value="online">Joueurs connectés uniquement</option></select></div>
          <div class="field"><label>Message (facultatif)</label><input id="gift-msg" maxlength="200" placeholder="Merci de jouer à ECLIPSE !"></div>
          <button class="btn primary" data-act="gift">Envoyer le cadeau</button></div>
      </div>`;
    },
  },

  system: {
    title: 'Système & métriques', live: true,
    async load() {
      const [staff, metrics] = await Promise.all([lvl() >= 1 ? api('accounts?filter=staff&sort=role&dir=desc').then(r => r.rows) : [], api('metrics')]);
      S.staff = staff; S.metrics = metrics;
    },
    after() {
      const m = S.metrics; if (!m) return;
      const since = Date.now() - S.range * 60000, pts = m.points.filter(p => p.t >= since);
      if ($('ch-ping')) lineChart($('ch-ping'), [{ label: 'Ping moyen des joueurs (ms)', color: '#19e3c4', points: pts.map(p => ({ t: p.t, v: p.ping || 0 })) }]);
      if ($('ch-err')) lineChart($('ch-err'), [{ label: 'Erreurs / min', color: '#ff4f6d', points: pts.map(p => ({ t: p.t, v: p.errors || 0 })) }, { label: 'Tick moyen (ms)', color: '#ffcf5a', points: pts.map(p => ({ t: p.t, v: p.tick || 0 })) }]);
    },
    render() {
      const o = S.ov || {}, m = S.metrics || { now: {}, pings: [], errors: [] }, n = m.now;
      const k = (v, l, s = '') => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div>${s ? `<div class="s">${s}</div>` : ''}</div>`;
      return `<div class="grid kpis">
        ${k(n.online ?? 0, 'Joueurs connectés', `${n.inGame ?? 0} en partie`)}
        ${k(`<span class="${n.avgPing > 150 ? 'bad' : n.avgPing > 80 ? 'warn-t' : 'ok'}">${n.avgPing ?? 0} ms</span>`, 'Latence moyenne', `max ${n.maxPing ?? 0} ms`)}
        ${k(`<span class="${n.errorsLastHour ? 'bad' : 'ok'}">${n.errorsLastHour ?? 0}</span>`, 'Erreurs (dernière heure)')}
        ${k(`${n.tick ?? 0} ms`, 'Calcul par tick', `max ${n.tickMax ?? 0} ms · budget 33 ms`)}
        ${k((n.cpu ?? 0) + ' %', 'Processeur (jeu)')}${k(n.mem ? fmtBytes(n.mem) : '—', 'Mémoire du jeu')}</div>
      <div class="grid cols-2" style="margin-top:14px">
        <div class="card"><h3>Latence <span class="seg">${[[60, '1 h'], [360, '6 h'], [1440, '24 h']].map(([v, l]) => `<button data-act="range" data-v="${v}" class="${S.range === v ? 'active' : ''}">${l}</button>`).join('')}</span></h3><canvas class="chart" id="ch-ping"></canvas></div>
        <div class="card"><h3>Erreurs et charge du serveur</h3><canvas class="chart" id="ch-err"></canvas></div>
        <div class="card"><h3>Ping des joueurs connectés</h3>${m.pings.length ? `<table><thead><tr><th>Joueur</th><th>Ping</th><th>Salon</th></tr></thead><tbody>${m.pings.slice(0, 30).map(p => `<tr><td>${h(p.name)}</td><td class="${p.ping > 150 ? 'bad' : p.ping > 80 ? 'warn-t' : 'ok'}">${p.ping ? p.ping + ' ms' : '—'}</td><td class="muted">${h(p.room)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted small">Aucun joueur connecté.</div>'}</div>
        <div class="card"><h3>Dernières erreurs</h3>${m.errors.length ? `<div class="feed" style="max-height:300px">${m.errors.map(e => `<div class="ln"><span class="tm">${fmtTime(e.t)}</span><span></span><span>${h(e.text)}</span><span></span></div>`).join('')}</div>` : '<div class="muted small">Aucune erreur enregistrée. 👍</div>'}</div>
      </div>
      <div class="grid cols-2" style="margin-top:14px">
        <div class="card"><h3>Mon compte</h3><dl class="kv"><dt>Pseudo</dt><dd><b>${h(S.me.name)}</b></dd><dt>Rôle</dt><dd>${roleBadge(S.me.role)}</dd></dl>
          <h3 style="margin-top:18px">Ce que chaque rôle peut faire</h3>
          <dl class="kv small"><dt><span class="badge mod">Modérateur</span></dt><dd>Voir tout, expulser, réduire au silence, bannir jusqu'à 7 jours, gérer les salons et les parties, traiter les signalements.</dd>
          <dt><span class="badge admin">Admin</span></dt><dd>En plus : comptes (Éclats, skins, mots de passe, rôles modérateur), annonces, notes, configuration, équilibrage, exports, bans définitifs.</dd>
          <dt><span class="badge owner">Propriétaire</span></dt><dd>Tout, y compris nommer des admins, télécharger la sauvegarde complète et redémarrer le serveur.</dd></dl></div>
        <div class="card"><h3>Équipe (${S.staff.length})</h3>${S.staff.length ? `<table><tbody>${S.staff.map(s => `<tr class="click" data-act="openAccount" data-name="${h(s.name)}"><td><b>${h(s.name)}</b></td><td>${roleBadge(s.role)}</td><td>${s.online ? '<span class="badge live">En ligne</span>' : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">Aucun membre.</div>'}
          <p class="muted small">Pour nommer quelqu'un : Comptes → clic sur le joueur → Changer le rôle.</p></div>
        <div class="card"><h3>Sauvegardes et exports</h3>
          <div class="row" style="align-items:center">${lvl() >= 3 ? '<button class="btn primary" data-act="backup">⇩ Sauvegarde complète</button>' : ''}
          ${lvl() >= 2 ? '<button class="btn" data-act="exportAccounts">⇩ Comptes (CSV)</button><button class="btn" data-act="exportLogs">⇩ Journaux (JSON)</button>' : '<span class="muted small">Réservé aux administrateurs.</span>'}</div>
          <p class="muted small">La sauvegarde complète contient tous les comptes (mots de passe hachés) et la configuration. Garde-la en lieu sûr.</p></div>
        <div class="card danger-zone"><h3>Serveur</h3><dl class="kv"><dt>Version</dt><dd>${h(o.version || '')}</dd><dt>En ligne depuis</dt><dd>${o.uptime != null ? fmtDur(o.uptime) : ''}</dd><dt>Node.js</dt><dd>${h(o.node || '')}</dd><dt>Système</dt><dd>${h(o.platform || '')}</dd></dl>
          ${lvl() >= 3 ? '<button class="btn danger" data-act="restart" style="margin-top:12px">Redémarrer le serveur</button><p class="muted small">Les joueurs sont déconnectés quelques secondes. Le service systemd ou Docker relance le jeu automatiquement.</p>' : ''}</div>
      </div>`;
    },
    keepWhileEditing: true,
  },
};

// ---------- tiroirs : compte et salon ----------
async function openAccount(name) {
  try {
    const a = await api('account?name=' + encodeURIComponent(name));
    const L = lvl();
    const btn = (act, label, cls = '') => `<button class="btn small ${cls}" data-act="${act}" data-name="${h(a.name)}">${label}</button>`;
    openDrawer('account', a.name, `<h2>${h(a.name)} ${roleBadge(a.role)}</h2>
      <div>${a.online ? '<span class="badge live">En ligne</span>' : '<span class="badge">Hors ligne</span>'} ${a.banned ? '<span class="badge danger">Banni</span>' : ''}</div>
      <div class="acts-grid">
        ${btn('accBan', 'Bannir', 'danger')}${btn('accMute', 'Silence')}
        ${btn('accWarn', 'Avertir')}${btn('accNote', 'Ajouter une note')}
        ${L >= 2 ? btn('accXp', 'Niveau / XP') + btn('accElo', 'Elo') + btn('accTitle', 'Titres') + (a.warnings ? btn('accWarnReset', 'Effacer les avertissements') : '') + btn('accEclats', 'Éclats') + btn('accSkin', 'Offrir un skin') + btn('accSkinsNone', 'Retirer les skins') + btn('accResetStats', 'Remettre les stats à zéro') + btn('accResetPw', 'Nouveau mot de passe') + btn('accRename', 'Renommer') + btn('accRole', 'Changer le rôle') + btn('accLogout', 'Déconnecter partout') + btn('accDelete', 'Supprimer le compte', 'danger') : ''}
      </div>
      <h3>PROGRESSION</h3><dl class="kv">
        <dt>Niveau</dt><dd><b>${a.level}</b> <span class="muted small">(${a.lvlCur} / ${a.lvlNeed} XP · ${a.xp} XP au total)</span></dd>
        <dt>Elo duel</dt><dd>${a.elo} — ${h(a.rank)} <span class="muted small">(record ${a.eloPeak} · ${a.seasonDuels} duel(s) classé(s) cette saison)</span></dd>
        <dt>Titre</dt><dd>${h(a.title || '—')} <span class="muted small">${a.titles.length} débloqué(s)</span></dd>
        <dt>Succès</dt><dd>${a.achievements.length ? a.achievements.map(h).join(', ') : '<span class="muted">aucun</span>'}</dd>
        <dt>Amis</dt><dd>${a.friends.length ? a.friends.map(h).join(', ') : '<span class="muted">aucun</span>'}</dd>
        <dt>Série de connexion</dt><dd>${a.daily?.streak || 0} jour(s) (record ${a.daily?.best || 0})</dd></dl>
      <h3>MODÉRATION</h3><dl class="kv">
        <dt>Avertissements</dt><dd>${a.warnings ? `<b class="bad">${a.warnings}</b>` : '0'}</dd>
        <dt>Signalements reçus</dt><dd>${a.reports ? `<b class="bad">${a.reports}</b>` : '0'}</dd>
        <dt>Anti-triche</dt><dd>${a.suspect ? `<b class="bad">${a.suspect.count} alerte(s)</b>${a.suspect.alerts.map(x => `<div class="small muted">${fmtDate(x.t)} — ${h(x.reason)}</div>`).join('')}` : '<span class="muted">aucune alerte</span>'}</dd>
        ${a.linked?.length ? `<dt>Comptes liés (même IP)</dt><dd>${a.linked.map(l => `<a data-act="openAccount" data-name="${h(l.name)}">${h(l.name)}</a>${l.banned ? ' <span class="badge danger">banni</span>' : ''}`).join(', ')}</dd>` : ''}
        ${a.ipHistory?.length ? `<dt>Dernières IP</dt><dd class="small">${a.ipHistory.map(x => `${h(x.ip)} <span class="muted">(${fmtDate(x.t)})</span>`).join('<br>')}</dd>` : ''}</dl>
      <h3>NOTES DU STAFF</h3>${a.notes.length ? a.notes.map(n => `<div class="small note">${fmtDate(n.t)} · <b>${h(n.by)}</b> : ${h(n.text)} <a class="muted" data-act="accNoteDel" data-name="${h(a.name)}" data-id="${h(n.id)}">supprimer</a></div>`).join('') : '<div class="muted small">Aucune note.</div>'}
      <h3>INFORMATIONS</h3><dl class="kv">
        <dt>Inscrit le</dt><dd>${fmtDate(a.created)}</dd><dt>Dernière connexion</dt><dd>${fmtDate(a.lastSeen)}</dd>
        <dt>Temps de jeu</dt><dd>${fmtDur(a.stats.playTime || 0)} en partie · ${fmtDur(a.stats.online || 0)} connecté</dd><dt>Éclats</dt><dd><b>${a.eclats}</b></dd>
        <dt>Parties / victoires</dt><dd>${a.stats.matches} / ${a.stats.wins}</dd><dt>Éliminations / morts</dt><dd>${a.stats.kills} / ${a.stats.deaths} (K/D ${kd(a.stats.kills, a.stats.deaths)})</dd>
        <dt>Duels gagnés</dt><dd>${a.stats.duelWins} / ${a.stats.duels}</dd><dt>Agent le plus joué</dt><dd>${h(AGENTS[a.topAgent]?.name || a.topAgent)}</dd>
        <dt>Skins possédés</dt><dd>${a.owned.map(id => h(SKINS.find(s => s.id === id)?.name || id)).join(', ')}</dd>
        <dt>Sessions actives</dt><dd>${a.sessions}</dd>${a.ips?.length ? `<dt>IP actuelle</dt><dd>${a.ips.map(h).join(', ')}</dd>` : ''}</dl>
      <h3>HISTORIQUE DES BANS</h3>${a.bans.length ? a.bans.map(b => `<div class="small">${fmtDate(b.at)} par ${h(b.by)} — ${h(b.reason)} — expire : ${until(b.until)}</div>`).join('') : '<div class="muted small">Aucun ban actif.</div>'}
      <h3>DERNIÈRES PARTIES</h3>${a.history.length ? `<table><tbody>${a.history.slice(0, 10).map(x => `<tr><td class="small">${fmtDate(x.t)}</td><td>${MODE[x.mode] || x.mode}</td><td class="${x.won ? 'ok' : 'bad'}">${x.won ? 'V' : 'D'} ${h(x.result || '')}</td><td>${x.kills}/${x.deaths}/${x.assists}</td><td class="small">${x.dmg} dég.${x.acc != null ? ` · ${x.acc} %` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="muted small">Aucune partie.</div>'}`);
  } catch (e) { toast(e.message, true); }
}

async function openRoom(id, silent) {
  try {
    const r = await api('room?id=' + encodeURIComponent(id));
    const m = r.match;
    const b = (act, label, cls = '', extra = '') => `<button class="btn small ${cls}" data-act="${act}" data-id="${h(r.id)}" ${extra}>${label}</button>`;
    const team = t => t === 'alpha' ? '<span style="color:#19e3c4">Alpha</span>' : t === 'beta' ? '<span style="color:#ff4f6d">Oméga</span>' : '—';
    const html = `<h2>${h(r.name)}</h2>
      <div>${r.official ? '<span class="badge admin">Officiel</span> ' : ''}${r.quick ? '<span class="badge">Duel rapide</span> ' : ''}${m ? `<span class="badge live">${PHASE[m.phase] || m.phase}</span>${m.paused ? ' <span class="badge danger">PAUSE</span>' : ''}` : '<span class="badge lobby">Lobby</span>'}</div>
      <div class="acts-grid">
        ${!m ? b('roomStart', '▶ Lancer la partie', 'primary') + b('roomSettings', 'Réglages') : ''}
        ${m ? b('roomPause', m.paused ? '▶ Reprendre' : '❚❚ Pause', '', `data-paused="${m.paused ? 1 : 0}"`) : ''}
        ${m && !isFfa(r.mode) ? b('roomSkip', 'Annuler la manche') : ''}
        ${m ? b('roomEnd', 'Terminer la partie', 'danger') : ''}
        ${b('roomMsg', 'Message au salon')}${b('roomBotAdd', '＋ Bot')}${r.bots ? b('roomBotDel', '− Bot') : ''}
        ${b('roomClose', 'Fermer le salon', 'danger')}
      </div>
      <dl class="kv"><dt>Mode</dt><dd>${MODE[r.mode]}</dd><dt>Carte</dt><dd>${h(r.map)}</dd><dt>Objectif</dt><dd>${r.mode === 'gungame' ? r.target + ' armes' : isFfa(r.mode) ? r.target + ' éliminations' : 'premier à ' + r.target + ' manches'}</dd>
        <dt>Bots</dt><dd>${DIFF[r.difficulty]}</dd><dt>Hôte</dt><dd>${h(r.host)}</dd>
        ${m ? `<dt>Manche</dt><dd>${!isFfa(r.mode) ? m.round + (m.half ? ' (2e mi-temps)' : '') : '—'}</dd><dt>Score</dt><dd>${!isFfa(r.mode) ? `${team('alpha')} ${m.score.alpha} – ${m.score.beta} ${team('beta')}` : '—'}</dd><dt>Chrono</dt><dd>${fmtDur(m.timer)}</dd>` : ''}</dl>
      <h3>JOUEURS (${r.humans} + ${r.bots} bot(s) / ${r.max})</h3>
      <table><thead><tr><th>Joueur</th><th>Équipe</th><th>Agent</th>${m ? '<th>É/M/A</th><th>PV</th>' : ''}<th></th></tr></thead><tbody>
      ${r.members.map(x => `<tr><td><b>${h(x.name)}</b> ${x.isBot ? '<span class="badge guest">Bot</span>' : ''}</td><td>${team(x.team)}</td><td>${h(AGENTS[x.agent]?.name || '')}</td>
        ${m ? `<td>${x.stats ? `${x.stats.kills}/${x.stats.deaths}/${x.stats.assists}` : '—'}</td><td>${x.stats ? (x.stats.alive ? x.stats.hp : '<span class="bad">mort</span>') : '—'}</td>` : ''}
        <td><div class="acts">${x.isBot ? `<button class="btn small ghost" data-act="roomBotDel" data-id="${h(r.id)}" data-bot="${h(x.id)}">Retirer</button>` : `<button class="btn small" data-act="kick" data-id="${h(x.id)}" data-name="${h(x.name)}">Expulser</button>${x.stats?.alive ? `<button class="btn small" data-act="slay" data-id="${h(x.id)}" data-name="${h(x.name)}">Éliminer</button>` : ''}`}</div></td></tr>`).join('')}
      </tbody></table>`;
    if (silent && S.drawer?.kind !== 'room') return;
    openDrawer('room', r.id, html);
    S.roomCache = r;
  } catch (e) { if (silent) closeDrawer(); toast(e.message, true); }
}

// ---------- actions ----------
const durationField = (value = '60') => ({ name: 'minutes', label: 'Durée', type: 'select', value, options: lvl() >= 2 ? DURATIONS : DURATIONS.filter(([v]) => v !== '0' && +v <= 10080) });
const ACT = {
  refresh: () => refresh(),
  logout,
  closeDrawer,
  range: d => { S.range = +d.v; render(); },
  // joueurs connectés
  async pm(d) { const v = await modal({ title: `Message privé à ${d.name}`, fields: [{ name: 'text', label: 'Message', type: 'textarea', required: true }], ok: 'Envoyer' }); if (v?.text) act('message', { id: d.id, text: v.text }, 'Message envoyé'); },
  async kick(d) { const v = await modal({ title: `Expulser ${d.name}`, fields: [{ name: 'reason', label: 'Raison (affichée au joueur)', maxlength: 200 }], ok: 'Expulser', danger: true }); if (v) act('kick', { id: d.id, reason: v.reason }, `${d.name} a été expulsé`); },
  async mute(d) { const v = await modal({ title: `Réduire ${d.name} au silence`, fields: [durationField('60'), { name: 'reason', label: 'Raison', maxlength: 200 }], ok: 'Appliquer' }); if (v) act('mute', { id: d.id, minutes: +v.minutes, reason: v.reason }, `${d.name} ne peut plus écrire`); },
  async ban(d) {
    const v = await modal({ title: `Bannir ${d.name}`, fields: [durationField('1440'), { name: 'reason', label: 'Raison (affichée au joueur)', maxlength: 200, required: true }, { name: 'withIp', label: 'Bannir aussi son adresse IP', type: 'checkbox' }], ok: 'Bannir', danger: true });
    if (v) act('ban', { id: d.id, minutes: +v.minutes, reason: v.reason, withIp: v.withIp }, `${d.name} a été banni`);
  },
  async slay(d) { if (await confirmBox(`Éliminer ${d.name} dans sa partie en cours ?`, { ok: 'Éliminer' })) act('slay', { id: d.id }, `${d.name} a été éliminé`); },
  openAccount: d => openAccount(d.name),
  openRoom: d => openRoom(d.id),
  // comptes
  accFilter: d => { S.acc.filter = d.v; S.acc.page = 1; show('accounts'); },
  accSort: d => { const a = S.acc; if (a.sort === d.k) a.dir = a.dir === 'asc' ? 'desc' : 'asc'; else { a.sort = d.k; a.dir = d.k === 'name' ? 'asc' : 'desc'; } refresh(); },
  accPage: d => { S.acc.page = +d.v; refresh(); },
  async accBan(d) { const v = await modal({ title: `Bannir le compte ${d.name}`, fields: [durationField('1440'), { name: 'reason', label: 'Raison', required: true, maxlength: 200 }], ok: 'Bannir', danger: true }); if (v && await act('ban', { name: d.name, minutes: +v.minutes, reason: v.reason }, 'Compte banni')) openAccount(d.name); },
  async accMute(d) { const v = await modal({ title: `Silence pour ${d.name}`, fields: [durationField('60'), { name: 'reason', label: 'Raison', maxlength: 200 }], ok: 'Appliquer' }); if (v) act('mute', { name: d.name, minutes: +v.minutes, reason: v.reason }, 'Silence appliqué'); },
  async accEclats(d) {
    const v = await modal({ title: `Éclats de ${d.name}`, fields: [{ name: 'mode', label: 'Opération', type: 'select', value: 'add', options: [['add', 'Ajouter (ou retirer avec un nombre négatif)'], ['set', 'Définir le total']] }, { name: 'value', label: 'Montant', type: 'number', value: 500, required: true }], ok: 'Appliquer' });
    if (v && await act('account/eclats', { name: d.name, mode: v.mode, value: +v.value }, 'Éclats mis à jour')) openAccount(d.name);
  },
  async accSkin(d) {
    const v = await modal({ title: `Offrir un skin à ${d.name}`, fields: [{ name: 'skin', label: 'Skin', type: 'select', value: 'all', options: [['all', '★ Tous les skins'], ...SKINS.filter(s => s.id !== 'default').map(s => [s.id, `${s.name} (${s.price} Éclats)`])] }], ok: 'Offrir' });
    if (v && await act('account/skins', { name: d.name, skin: v.skin }, 'Skin offert')) openAccount(d.name);
  },
  async accSkinsNone(d) { if (await confirmBox(`Retirer tous les skins de ${d.name} ?`)) { await act('account/skins', { name: d.name, skin: 'none' }, 'Skins retirés'); openAccount(d.name); } },
  async accResetStats(d) { if (await confirmBox(`Remettre à zéro les statistiques de ${d.name} ?`)) { await act('account/resetStats', { name: d.name }, 'Statistiques remises à zéro'); openAccount(d.name); } },
  async accResetPw(d) {
    if (!await confirmBox(`Générer un nouveau mot de passe pour ${d.name} ? Il sera déconnecté de partout.`)) return;
    const r = await act('account/resetPassword', { name: d.name });
    if (r) await modal({ title: 'Nouveau mot de passe', body: `<p>Transmets ce mot de passe à <b>${h(d.name)}</b> en privé. Il ne sera plus affiché.</p><div class="secret">${h(r.password)}</div>`, ok: 'J\'ai noté le mot de passe', noCancel: true });
  },
  async accRename(d) { const v = await modal({ title: `Renommer ${d.name}`, fields: [{ name: 'newName', label: 'Nouveau pseudo', value: d.name, maxlength: 16, required: true, help: '3 à 16 caractères : lettres, chiffres, _ ou -' }], ok: 'Renommer' }); if (v && await act('account/rename', { name: d.name, newName: v.newName }, 'Compte renommé')) { closeDrawer(); refresh(); } },
  async accRole(d) {
    const opts = lvl() >= 3 ? [['player', 'Joueur'], ['mod', 'Modérateur'], ['admin', 'Administrateur'], ['owner', 'Propriétaire']] : [['player', 'Joueur'], ['mod', 'Modérateur']];
    const v = await modal({ title: `Rôle de ${d.name}`, fields: [{ name: 'role', label: 'Rôle', type: 'select', value: 'mod', options: opts }], ok: 'Appliquer' });
    if (v && await act('account/role', { name: d.name, role: v.role }, 'Rôle mis à jour')) openAccount(d.name);
  },
  async accLogout(d) { if (await confirmBox(`Déconnecter ${d.name} de tous ses appareils ?`, { danger: false })) act('account/logout', { name: d.name }, 'Sessions révoquées'); },
  async accDelete(d) {
    const v = await modal({ title: `Supprimer ${d.name}`, body: '<p>Action <b>définitive</b> : le compte, ses Éclats et ses skins seront perdus.</p>', fields: [{ name: 'confirm', label: `Tape « ${d.name} » pour confirmer` }], ok: 'Supprimer définitivement', danger: true });
    if (v && v.confirm === d.name) { if (await act('account/delete', { name: d.name }, 'Compte supprimé')) closeDrawer(); } else if (v) toast('Confirmation incorrecte', true);
  },
  exportAccounts: () => download('export/accounts', 'eclipse-comptes.csv'),
  async accWarn(d) {
    const v = await modal({ title: `Avertir ${d.name}`, body: `<p class="muted small">Le joueur reçoit le message immédiatement s'il est connecté. ${S.config?.warnBanAt ? '' : ''}Au seuil configuré (Configuration → Chat), un ban de 24 h est appliqué automatiquement.</p>`, fields: [{ name: 'reason', label: 'Motif (affiché au joueur)', required: true, maxlength: 200 }], ok: 'Avertir' });
    if (!v) return;
    const r = await act('warn', { name: d.name, reason: v.reason });
    if (r) { toast(r.banned ? `${d.name} : ${r.warnings} avertissements, ban automatique de 24 h` : `Avertissement n°${r.warnings} envoyé`); if (S.drawer?.kind === 'account') openAccount(d.name); }
  },
  async accWarnReset(d) { if (await confirmBox(`Effacer les avertissements de ${d.name} ?`, { danger: false })) { await act('warn/reset', { name: d.name }, 'Avertissements effacés'); openAccount(d.name); } },
  async accNote(d) { const v = await modal({ title: `Note interne sur ${d.name}`, body: '<p class="muted small">Visible uniquement par l\'équipe.</p>', fields: [{ name: 'text', label: 'Note', type: 'textarea', required: true, max: 500 }], ok: 'Ajouter' }); if (v?.text && await act('account/note', { name: d.name, text: v.text }, 'Note ajoutée')) openAccount(d.name); },
  async accNoteDel(d) { if (await confirmBox('Supprimer cette note ?')) { await act('account/note', { name: d.name, delete: d.id }, 'Note supprimée'); openAccount(d.name); } },
  async accXp(d) {
    const v = await modal({ title: `Niveau de ${d.name}`, fields: [{ name: 'mode', label: 'Opération', type: 'select', value: 'level', options: [['level', 'Définir le niveau'], ['add', 'Ajouter de l\'XP (négatif pour retirer)']] }, { name: 'value', label: 'Valeur', type: 'number', value: 10, required: true }], ok: 'Appliquer' });
    if (v && await act('account/xp', { name: d.name, mode: v.mode, value: +v.value }, 'Progression mise à jour')) openAccount(d.name);
  },
  async accElo(d) { const v = await modal({ title: `Elo de ${d.name}`, fields: [{ name: 'value', label: 'Nouvel Elo', type: 'number', value: 1000, min: 0, max: 5000, required: true }], ok: 'Appliquer' }); if (v && await act('account/elo', { name: d.name, value: +v.value }, 'Elo mis à jour')) openAccount(d.name); },
  async accTitle(d) {
    const v = await modal({ title: `Titres de ${d.name}`, fields: [{ name: 'title', label: 'Titre', type: 'select', value: 'fondateur', options: Object.entries(TITLES) }, { name: 'op', label: 'Action', type: 'select', value: 'add', options: [['add', 'Attribuer'], ['remove', 'Retirer']] }], ok: 'Appliquer' });
    if (v && await act('account/title', { name: d.name, title: v.title, remove: v.op === 'remove' }, 'Titres mis à jour')) openAccount(d.name);
  },
  // anti-triche, parties, progression, économie
  suspectClear: d => act('suspect/clear', { key: d.key }, 'Alertes effacées'),
  async tourCreate() {
    const v = await modal({ title: 'Nouveau tournoi', fields: [
      { name: 'name', label: 'Nom', required: true, maxlength: 40, placeholder: 'Coupe du samedi' },
      { name: 'size', label: 'Places', type: 'select', value: '8', options: [['4', '4 joueurs'], ['8', '8 joueurs'], ['16', '16 joueurs'], ['32', '32 joueurs']] },
      { name: 'target', label: 'Manches pour gagner un match', type: 'select', value: '3', options: [['2', 'Premier à 2'], ['3', 'Premier à 3'], ['4', 'Premier à 4'], ['5', 'Premier à 5'], ['7', 'Premier à 7']] },
      { name: 'prize', label: 'Éclats pour le vainqueur (le finaliste reçoit la moitié)', type: 'number', value: 2000, min: 0, max: 100000 },
      { name: 'minLevel', label: 'Niveau minimum', type: 'number', value: 1, min: 1, max: 100 },
      { name: 'startAt', label: 'Départ automatique (facultatif)', type: 'datetime-local', help: 'Laisse vide pour lancer toi-même. Il faut au moins 2 inscrits.' },
    ], ok: 'Créer' });
    if (!v) return;
    act('tournament/create', { ...v, startAt: v.startAt ? new Date(v.startAt).getTime() : null }, 'Tournoi créé : les joueurs connectés sont prévenus');
  },
  async tourStart(d) { if (await confirmBox('Lancer le tournoi maintenant ? Les inscriptions seront fermées et le tableau tiré au sort.', { danger: false, ok: 'Lancer' })) act('tournament/start', { id: d.id }, 'Tournoi lancé'); },
  async tourCancel(d) { if (await confirmBox('Annuler ce tournoi ? Les matchs en cours seront interrompus, aucune récompense ne sera versée.', { ok: 'Annuler le tournoi' })) act('tournament/cancel', { id: d.id }, 'Tournoi annulé'); },
  async tourDelete(d) { if (await confirmBox('Supprimer ce tournoi de l\'historique ?', { ok: 'Supprimer' })) act('tournament/delete', { id: d.id }, 'Tournoi supprimé'); },
  async tourWinner(d) { if (await confirmBox(`Déclarer ${d.name} vainqueur de ce match ? (litige, déconnexion…)`, { danger: false, ok: 'Confirmer' })) act('tournament/winner', { id: d.id, match: d.match, name: d.name }, 'Match arbitré'); },
  async clanDisband(d) { if (await confirmBox(`Dissoudre le clan [${d.tag}] ? Tous ses membres seront retirés.`, { ok: 'Dissoudre' })) act('clan/disband', { tag: d.tag }, 'Clan dissous'); },
  async clanKick(d) { if (await confirmBox(`Retirer ${d.name} du clan [${d.tag}] ?`, { ok: 'Retirer' })) act('clan/kick', { tag: d.tag, name: d.name }, `${d.name} retiré du clan`); },
  async clanRename(d) { const v = await modal({ title: `Renommer [${d.tag}]`, fields: [{ name: 'name', label: 'Nouveau nom (la description est effacée)', value: d.name, maxlength: 24, required: true }], ok: 'Renommer' }); if (v?.name) act('clan/rename', { tag: d.tag, name: v.name }, 'Clan renommé'); },
  matchMode: d => { S.matchMode = d.v; show('matches'); },
  exportMatches: () => download('export/matches', 'eclipse-parties.csv'),
  lbKind: d => { S.lbKind = d.v; refresh(); },
  async seasonNew() {
    const v = await modal({ title: 'Nouvelle saison', body: `<p>La saison <b>${h(S.seasons.season.name)}</b> se termine : les joueurs classés reçoivent leur récompense de rang, puis leur Elo est rapproché de 1 000 de moitié. Action définitive.</p>`, fields: [{ name: 'name', label: 'Nom de la nouvelle saison', value: `Saison ${S.seasons.season.n + 1}`, maxlength: 40 }, { name: 'rewards', label: 'Distribuer les récompenses de rang', type: 'checkbox', value: true }], ok: 'Lancer la nouvelle saison', danger: true });
    if (v) { const r = await act('season/new', { name: v.name, rewards: v.rewards }); if (r) toast(`${r.season.name} lancée · ${r.rewarded} joueur(s) récompensé(s)`); }
  },
  eventStop: () => act('config/save', { patch: { eventUntil: 0 } }, 'Événement arrêté'),
  async questsSave() {
    const quests = {};
    for (const tr of document.querySelectorAll('tr[data-q]')) quests[tr.dataset.q] = { off: !tr.querySelector('[data-qf=on]').checked, eclats: tr.querySelector('[data-qf=eclats]').value, xp: tr.querySelector('[data-qf=xp]').value };
    await act('quests/save', { quests }, 'Quêtes enregistrées');
  },
  async gift() {
    const eclats = +$('gift-eclats').value || 0, xp = +$('gift-xp').value || 0, target = $('gift-target').value;
    if (!await confirmBox(`Offrir ${eclats} Éclats et ${xp} XP à ${target === 'online' ? 'tous les joueurs connectés' : 'tous les comptes'} ?`, { danger: false, ok: 'Offrir' })) return;
    const r = await act('gift', { eclats, xp, target, message: $('gift-msg').value });
    if (r) toast(`Cadeau envoyé à ${r.count} compte(s)`);
  },
  async schedAdd() {
    const text = $('sc-text').value.trim(), at = new Date($('sc-at').value).getTime();
    if (!text || !at) return toast('Écris un message et choisis une date', true);
    if (await act('schedule/add', { text, at, repeat: +$('sc-rep').value }, 'Annonce programmée')) $('sc-text').value = '';
  },
  schedDel: d => act('schedule/delete', { id: d.id }, 'Annonce supprimée'),
  namesSave: () => act('names/save', { words: $('name-words').value.split('\n') }, 'Liste enregistrée'),
  // salons
  async roomCreate() {
    const v = await modal({ title: 'Créer un salon officiel', body: '<p class="muted small">Un salon officiel reste ouvert même vide ; le premier joueur qui le rejoint en devient l\'hôte.</p>', fields: [
      { name: 'name', label: 'Nom', value: 'Salon officiel', maxlength: 28 },
      { name: 'mode', label: 'Mode', type: 'select', value: 'assault', options: Object.entries(MODE) },
      { name: 'mapId', label: 'Carte', type: 'select', value: 'dune', options: Object.values(MAP_INFO).map(m => [m.id, `${m.name}${m.small ? ' (duel)' : ''}`]), help: 'Si la carte ne correspond pas au mode, une carte adaptée est choisie.' },
      { name: 'difficulty', label: 'Difficulté des bots', type: 'select', value: 'normal', options: Object.entries(DIFF) },
      { name: 'bots', label: 'Nombre de bots', type: 'number', value: 0, min: 0, max: 9 },
    ], ok: 'Créer' });
    if (v) act('room/create', { ...v, bots: +v.bots }, 'Salon créé');
  },
  roomStart: d => act('room/start', { id: d.id }, 'Partie lancée').then(() => openRoom(d.id)),
  roomPause: d => act('room/pause', { id: d.id, paused: d.paused !== '1' }, d.paused === '1' ? 'Partie reprise' : 'Partie en pause').then(() => openRoom(d.id)),
  async roomSkip(d) { if (await confirmBox('Annuler la manche en cours ? Aucune équipe ne marque de point.', { ok: 'Annuler la manche' })) { await act('room/skip', { id: d.id }, 'Manche annulée'); openRoom(d.id); } },
  async roomEnd(d) {
    const r = S.roomCache;
    const opts = [['', 'Aucun vainqueur'], ...(isFfa(r.mode) ? r.members.map(m => [m.id, m.name]) : [['alpha', 'Équipe Alpha'], ['beta', 'Équipe Oméga']])];
    const v = await modal({ title: 'Terminer la partie', fields: [{ name: 'winner', label: 'Vainqueur', type: 'select', value: '', options: opts }], ok: 'Terminer', danger: true });
    if (v) { await act('room/end', { id: d.id, winner: v.winner || null }, 'Partie terminée'); openRoom(d.id); }
  },
  async roomMsg(d) { const v = await modal({ title: 'Message au salon', fields: [{ name: 'text', label: 'Message (affiché dans le chat du salon)', type: 'textarea', required: true }], ok: 'Envoyer' }); if (v?.text) act('room/message', { id: d.id, text: v.text }, 'Message envoyé'); },
  async roomBotAdd(d) {
    const r = S.roomCache;
    let team = '';
    if (!isFfa(r.mode)) { const v = await modal({ title: 'Ajouter un bot', fields: [{ name: 'team', label: 'Équipe', type: 'select', value: '', options: [['', 'Équilibrer automatiquement'], ['alpha', 'Alpha'], ['beta', 'Oméga']] }], ok: 'Ajouter' }); if (!v) return; team = v.team; }
    await act('room/bot', { id: d.id, action: 'add', team }, 'Bot ajouté'); openRoom(d.id);
  },
  roomBotDel: d => act('room/bot', { id: d.id, action: 'remove', botId: d.bot }, 'Bot retiré').then(() => openRoom(d.id)),
  async roomSettings(d) {
    const r = S.roomCache;
    const v = await modal({ title: 'Réglages du salon', fields: [
      { name: 'name', label: 'Nom', value: r.name, maxlength: 28 },
      { name: 'mode', label: 'Mode', type: 'select', value: r.mode, options: Object.entries(MODE), help: 'Changer de mode retire les bots.' },
      { name: 'mapId', label: 'Carte', type: 'select', value: r.mapId, options: mapsForMode(r.mode).map(id => [id, MAP_INFO[id].name]) },
      { name: 'target', label: isFfa(r.mode) ? 'Éliminations pour gagner' : 'Manches pour gagner', type: 'number', value: r.target, min: 2, max: 60 },
      { name: 'difficulty', label: 'Difficulté des bots', type: 'select', value: r.difficulty, options: Object.entries(DIFF) },
    ], ok: 'Enregistrer' });
    if (v) { await act('room/settings', { id: d.id, ...v }, 'Salon mis à jour'); openRoom(d.id); }
  },
  async roomClose(d) { if (await confirmBox('Fermer ce salon ? Les joueurs retournent au menu.', { ok: 'Fermer le salon' })) { if (await act('room/close', { id: d.id }, 'Salon fermé')) closeDrawer(); } },
  // modération
  modTab: d => { S.modTab = d.v; render(); },
  reportFilter: d => { S.reportFilter = d.v; render(); },
  unban: d => act('unban', { id: d.id }, `${d.name} a été débanni`),
  unmute: d => act('unmute', { id: d.id }, `Silence levé pour ${d.name}`),
  async newBan() {
    const v = await modal({ title: 'Nouveau ban', fields: [
      { name: 'type', label: 'Cible', type: 'select', value: 'name', options: [['name', 'Compte (pseudo)'], ['ip', 'Adresse IP']] },
      { name: 'value', label: 'Pseudo ou adresse IP', required: true, maxlength: 45 },
      durationField('1440'), { name: 'reason', label: 'Raison', required: true, maxlength: 200 },
    ], ok: 'Bannir', danger: true });
    if (v) act('ban', { [v.type]: v.value.trim(), minutes: +v.minutes, reason: v.reason }, 'Ban appliqué');
  },
  async newMute() { const v = await modal({ title: 'Réduire un compte au silence', fields: [{ name: 'name', label: 'Pseudo', required: true, maxlength: 16 }, durationField('60'), { name: 'reason', label: 'Raison', maxlength: 200 }], ok: 'Appliquer' }); if (v) act('mute', { name: v.name.trim(), minutes: +v.minutes, reason: v.reason }, 'Silence appliqué'); },
  reportResolve: d => act('report/resolve', { id: d.id, resolved: true }, 'Signalement traité'),
  reportReopen: d => act('report/resolve', { id: d.id, resolved: false }, 'Signalement rouvert'),
  reportDelete: d => act('report/delete', { id: d.id }, 'Signalement supprimé'),
  async reportBan(d) {
    const online = S.players.find(p => p.name.toLowerCase() === d.name.toLowerCase());
    const v = await modal({ title: `Sanctionner ${d.name}`, fields: [{ name: 'kind', label: 'Sanction', type: 'select', value: 'mute', options: [['mute', 'Silence'], ['ban', 'Ban']] }, durationField('60'), { name: 'reason', label: 'Raison', required: true, maxlength: 200 }], ok: 'Appliquer', danger: true });
    if (!v) return;
    const target = online ? { id: online.id } : { name: d.name };
    act(v.kind, { ...target, minutes: +v.minutes, reason: v.reason }, 'Sanction appliquée');
  },
  filterSave: () => act('filter/save', { words: $('filter-words').value.split('\n') }, 'Filtre enregistré'),
  // chat
  async chatClear() { if (await confirmBox('Vider tout le journal du chat ?')) { await act('chat/clear', {}, 'Journal vidé'); S.chat = []; render(true); } },
  chatMute: d => ACT.accMute(d),
  chatBan: d => ACT.accBan(d),
  // annonces
  async broadcast() { const text = $('bc-text').value.trim(); if (!text) return toast('Écris un message', true); const r = await act('broadcast', { text }); if (r) { toast(`Annonce envoyée à ${r.sent} joueur(s)`); $('bc-text').value = ''; } },
  motdSave: () => act('config/save', { patch: { motd: $('motd-text').value } }, 'Message du jour publié'),
  async motdClear() { $('motd-text').value = ''; await act('config/save', { patch: { motd: '' } }, 'Message du jour retiré'); },
  async pmSend() { const id = $('pm-to').value, text = $('pm-text').value.trim(); if (!id || !text) return toast('Choisis un joueur et écris un message', true); if (await act('message', { id, text }, 'Message envoyé')) $('pm-text').value = ''; },
  // notes
  newsAdd: () => { collectNews(); S.news.unshift({ version: '', date: new Date().toISOString().slice(0, 10), title: '', items: [] }); render(); },
  newsUp: d => { collectNews(); const i = +d.i; [S.news[i - 1], S.news[i]] = [S.news[i], S.news[i - 1]]; render(); },
  newsDown: d => { collectNews(); const i = +d.i; [S.news[i + 1], S.news[i]] = [S.news[i], S.news[i + 1]]; render(); },
  async newsDel(d) { collectNews(); if (await confirmBox('Supprimer cette note ?')) { S.news.splice(+d.i, 1); render(); } },
  async newsSave() { collectNews(); const r = await act('news/save', { news: S.news }); if (r) toast(`${r.count} note(s) publiée(s) dans le launcher`); },
  // configuration
  async cfgSave(d) {
    const card = document.querySelector(`[data-section="${d.section}"]`);
    const patch = {};
    for (const el of card.querySelectorAll('[data-k]')) patch[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.type === 'datetime-local' ? (el.value ? new Date(el.value).getTime() : 0) : el.value;
    if (d.section === 'event' && patch.eventUntil && patch.eventUntil < Date.now()) return toast('La date de fin doit être dans le futur.', true);
    if (patch.maintenance && !S.config.maintenance && !await confirmBox('Activer la maintenance ? Tous les joueurs (hors staff) seront déconnectés.', { ok: 'Activer' })) return;
    await act('config/save', { patch }, 'Configuration enregistrée');
  },
  async weaponsSave() {
    const weapons = {};
    for (const tr of document.querySelectorAll('tr[data-w]')) weapons[tr.dataset.w] = { damage: +tr.querySelector('[data-wf=damage]').value, headMul: +tr.querySelector('[data-wf=headMul]').value };
    await act('config/save', { patch: { weapons } }, 'Équilibrage enregistré');
  },
  wReset: d => act('config/save', { patch: { weapons: { [d.id]: { reset: true } } } }, 'Valeurs par défaut rétablies'),
  async statsReset() { if (await confirmBox('Réinitialiser toutes les statistiques globales ?')) act('stats/reset', {}, 'Statistiques réinitialisées'); },
  // journaux
  logTab: d => { S.logTab = d.v; show('logs'); },
  logType: d => { S.logType = d.v; show('logs'); },
  exportLogs: () => download('export/logs', 'eclipse-journaux.json'),
  // système
  backup: () => download('backup', `eclipse-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`),
  async restart() { if (await confirmBox('Redémarrer le serveur maintenant ? Tous les joueurs seront déconnectés quelques secondes.', { ok: 'Redémarrer' })) { await act('restart', {}, 'Redémarrage en cours…'); setTimeout(() => location.reload(), 6000); } },
};
function collectNews() {
  for (const el of document.querySelectorAll('.news-ed')) {
    const n = S.news[+el.dataset.i]; if (!n) continue;
    for (const f of el.querySelectorAll('[data-f]')) n[f.dataset.f] = f.dataset.f === 'items' ? f.value.split('\n').map(s => s.trim()).filter(Boolean) : f.value;
  }
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});
let inputTimer = null;
document.addEventListener('input', e => {
  const k = e.target.dataset.input; if (!k) return;
  clearTimeout(inputTimer);
  inputTimer = setTimeout(() => {
    if (k === 'playerQ') { S.playerQ = e.target.value; VIEWS.players.update(); }
    if (k === 'accQ') { S.acc.q = e.target.value; S.acc.page = 1; refresh(); }
    if (k === 'chatQ') { S.chatQ = e.target.value; refresh(false, true); }
    if (k === 'chatRoom') { S.chatRoom = e.target.value; refresh(false, true); }
    if (k === 'logQ') { S.logQ = e.target.value; refresh(false, true); }
    if (k === 'matchQ') { S.matchQ = e.target.value; refresh(); }
    if (k === 'clanQ') { S.clanQ = e.target.value; VIEWS.clans.update(); }
  }, k === 'playerQ' ? 50 : 300);
});

// ---------- navigation et rafraîchissement ----------
function render(full = true) {
  const v = VIEWS[S.view];
  $('view').innerHTML = v.render();
  v.update?.(full);
  v.after?.();
}
async function show(view) {
  if (!VIEWS[view] || ['announce', 'news', 'config', 'economy'].includes(view) && lvl() < 2) view = 'dashboard';
  S.view = view;
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === view));
  $('title').textContent = VIEWS[view].title;
  if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
  $('view').innerHTML = '<div class="empty">Chargement…</div>';
  await refresh(false, true);
}
async function refresh(silent = false, full = false) {
  const v = VIEWS[S.view];
  try {
    S.ov = await api('overview');
    updateBadges();
    await v.load?.(full || !v.incremental);
    if (v.incremental && !full && document.getElementById('feed')) v.update(false);
    else if (v.update && document.getElementById('list') && !full) v.update(true);
    else render(true);
    if (S.drawer?.kind === 'room') openRoom(S.drawer.id, true);
  } catch (e) { if (!silent) toast(e.message, true); }
}
function updateBadges() {
  const o = S.ov; if (!o) return;
  $('n-players').textContent = o.online || '';
  $('n-rooms').textContent = o.rooms || '';
  $('n-reports').textContent = o.openReports || '';
  $('n-suspects').textContent = o.suspects || '';
  $('maint-badge').classList.toggle('hidden', !o.maintenance);
}
document.querySelectorAll('#nav a').forEach(a => a.addEventListener('click', () => show(a.dataset.view)));
$('auto').addEventListener('change', e => { S.auto = e.target.checked; });
setInterval(() => {
  if (!S.me || !S.auto || !$('modal').classList.contains('hidden') || document.hidden) return;
  const v = VIEWS[S.view];
  const editing = document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.activeElement.dataset.input;
  if (v.live && !editing) refresh(true);
  else if (!v.live && !editing) api('overview').then(o => { S.ov = o; updateBadges(); }).catch(() => {});
}, 3000);

// ---------- connexion ----------
function showLogin(msg = '') {
  S.me = null;
  $('app').classList.add('hidden'); $('login').classList.remove('hidden');
  $('login-form').classList.remove('hidden'); $('claim-form').classList.add('hidden');
  $('l-err').textContent = msg;
}
function showClaim() {
  $('app').classList.add('hidden'); $('login').classList.remove('hidden');
  $('login-form').classList.add('hidden'); $('claim-form').classList.remove('hidden');
}
async function startApp() {
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  $('me').innerHTML = `Connecté : <b>${h(S.me.name)}</b> ${roleBadge(S.me.role)}`;
  document.querySelectorAll('[data-min]').forEach(el => el.classList.toggle('hidden', lvl() < +el.dataset.min));
  show(location.hash.slice(1) || 'dashboard');
}
async function boot() {
  let skipGame = false;
  try { skipGame = sessionStorage.getItem('eclipse_admin_skipgame') === '1'; } catch { /* indisponible */ }
  try { S.token = localStorage.getItem('eclipse_admin_token') || (skipGame ? null : localStorage.getItem('eclipse_token')); } catch { S.token = null; }
  if (!S.token) return showLogin();
  try {
    S.me = await api('me');
    if (S.me.level >= 1) return startApp();
    if (S.me.setupPending) return showClaim();
    showLogin('Ce compte n\'a pas accès à l\'administration.');
  } catch { /* showLogin déjà affiché */ }
}
function logout() {
  try { localStorage.removeItem('eclipse_admin_token'); sessionStorage.setItem('eclipse_admin_skipgame', '1'); } catch { /* indisponible */ }
  S.token = null; closeDrawer(); showLogin('Tu es déconnecté.');
}
$('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('l-err').textContent = '';
  try {
    const r = await fetch('/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('l-name').value.trim(), password: $('l-pass').value }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Connexion impossible');
    S.token = data.token;
    try { localStorage.setItem('eclipse_admin_token', data.token); sessionStorage.removeItem('eclipse_admin_skipgame'); } catch { /* indisponible */ }
    S.me = { name: data.name, role: data.role, level: data.level, setupPending: data.setupPending };
    if (S.me.level >= 1) startApp(); else showClaim();
  } catch (err) { $('l-err').textContent = err.message; }
});
$('claim-form').addEventListener('submit', async e => {
  e.preventDefault();
  $('c-err').textContent = '';
  try {
    await api('claim', { code: $('c-code').value.trim() });
    S.me = await api('me');
    toast('Tu es maintenant propriétaire du serveur !');
    startApp();
  } catch (err) { $('c-err').textContent = err.message; }
});
window.addEventListener('resize', () => VIEWS[S.view]?.after?.());
boot();
