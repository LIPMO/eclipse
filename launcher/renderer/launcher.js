// Interface du launcher
const $ = id => document.getElementById(id);
const L = window.launcher;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FALLBACK_NEWS = [
  { version: '1.2', date: '2026-11-20', title: 'Le launcher ECLIPSE est arrivé', items: ['Bouton JOUER, état du serveur en direct et notes de mise à jour.', 'Le jeu s\'ouvre dans sa propre fenêtre, en plein écran ou fenêtré.'] },
];
let settings = null, online = false, statusTimer = null;

function toast(text, ms = 2500) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), ms);
}
function fmtDate(d) {
  const x = new Date(d + 'T12:00:00');
  return isNaN(x) ? d : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ---------- navigation ----------
function show(view) {
  document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
}
document.querySelectorAll('.nav').forEach(b => b.onclick = () => show(b.dataset.view));
$('latest-news').onclick = () => show('news');
$('btn-min').onclick = () => L.minimize();
$('btn-close').onclick = () => L.close();

// ---------- état du serveur ----------
async function refreshStatus() {
  const s = await L.status();
  online = !!s.online;
  for (const id of ['dot', 'dot-mini']) $(id).className = 'dot ' + (online ? 'on' : 'off');
  const host = settings ? new URL(settings.server).host : '';
  if (online) {
    $('srv-text').textContent = `Serveur en ligne · ${host}`;
    $('srv-mini').textContent = `En ligne · ${s.ping} ms`;
    $('st-players').textContent = s.players ?? '—';
    $('st-matches').textContent = s.matches ?? '—';
    $('st-ping').textContent = s.ping + ' ms';
    $('play-hint').textContent = s.version ? `Version du jeu ${s.version}` : ' ';
  } else {
    $('srv-text').textContent = `Serveur hors ligne · ${s.error || host}`;
    $('srv-mini').textContent = 'Hors ligne';
    $('st-players').textContent = $('st-matches').textContent = $('st-ping').textContent = '—';
    $('play-hint').textContent = 'Le jeu affichera une page de reconnexion si le serveur reste injoignable.';
  }
}

// ---------- notes de mise à jour ----------
async function loadNews() {
  const news = (await L.news()) || FALLBACK_NEWS;
  $('news-list').innerHTML = news.map(n => `<article class="news-item">
      <div class="nh"><span class="nv">v${esc(n.version)}</span><span class="nt">${esc(n.title)}</span><span class="nd">${esc(fmtDate(n.date))}</span></div>
      <ul>${(n.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul></article>`).join('');
  if (news[0]) $('latest-news').querySelector('.ln-title').textContent = `v${news[0].version} — ${news[0].title}`;
}

// ---------- jouer ----------
$('btn-play').onclick = async () => {
  const btn = $('btn-play');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'LANCEMENT…';
  const r = await L.play();
  if (!r.ok) toast(r.error || 'Lancement impossible');
  setTimeout(() => { btn.disabled = false; btn.querySelector('span').textContent = 'JOUER'; }, 1500);
};

// ---------- paramètres ----------
function seg(id, value, onPick) {
  const el = $(id);
  el.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === value));
  el.onclick = e => { const b = e.target.closest('button'); if (!b) return; el.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); onPick(b.dataset.v); };
}
function renderSettings() {
  $('s-server').value = settings.server;
  $('s-size').innerHTML = settings.sizes.map(s => `<option value="${s}">${s.replace('x', ' × ')}</option>`).join('');
  $('s-size').value = settings.size;
  $('s-size').disabled = settings.fullscreen;
  seg('s-display', settings.fullscreen ? 'full' : 'window', v => save({ fullscreen: v === 'full' }));
  seg('s-after', settings.afterLaunch, v => save({ afterLaunch: v }));
  $('ver').textContent = `Launcher v${settings.version}`;
}
async function save(patch) {
  const r = await L.setSettings(patch);
  if (!r.ok) { toast(r.error); return false; }
  settings = { ...settings, ...r.settings };
  renderSettings();
  return true;
}
$('s-size').onchange = e => save({ size: e.target.value });
$('s-test').onclick = async () => {
  const msg = $('s-server-msg');
  msg.className = 'help'; msg.textContent = 'Test en cours…';
  const s = await L.status($('s-server').value);
  msg.className = 'help ' + (s.online ? 'ok' : 'err');
  msg.textContent = s.online ? `Serveur joignable (${s.ping} ms${s.players != null ? ` · ${s.players} joueur(s) en ligne` : ''}).` : `Serveur injoignable : ${s.error}.`;
};
$('s-save').onclick = async () => {
  if (await save({ server: $('s-server').value })) { toast('Adresse enregistrée'); refreshStatus(); loadNews(); }
};
$('s-server').onkeydown = e => { if (e.key === 'Enter') $('s-save').click(); };
$('s-cache').onclick = async () => { await L.clearCache(); toast('Cache vidé : la dernière version du jeu sera chargée.'); };
$('s-reset').onclick = async () => { settings = { ...settings, ...(await L.resetSettings()) }; renderSettings(); refreshStatus(); toast('Paramètres réinitialisés'); };

// ---------- démarrage ----------
(async () => {
  settings = await L.getSettings();
  renderSettings();
  refreshStatus();
  loadNews();
  statusTimer = setInterval(refreshStatus, 15000);
})();
