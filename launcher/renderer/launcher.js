// Interface du launcher ECLIPSE 2
const $ = id => document.getElementById(id);
const L = window.launcher;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let settings = null, online = false, shop = null, initial = null;

function toast(text, ms = 2600) {
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
document.querySelectorAll('.nav').forEach(b => { b.onclick = () => show(b.dataset.view); });
$('latest-news').onclick = () => show('news');
$('btn-min').onclick = () => L.minimize();
$('btn-close').onclick = () => L.close();
document.querySelectorAll('[data-link]').forEach(b => {
  b.onclick = () => {
    if (b.dataset.link === 'source') { L.openLink('https://github.com/LIPMO/eclipse'); return; }
    const site = settings?.site || 'https://eclipseee.online';
    L.openLink(site + { download: '/telecharger', site: '/', cgu: '/cgu.html', privacy: '/confidentialite.html', legal: '/mentions-legales.html' }[b.dataset.link] || '/');
  };
});

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
    $('play-hint').textContent = s.version ? `Version du jeu ${s.version} · Entrée pour jouer` : 'Entrée pour jouer';
  } else {
    $('srv-text').textContent = `Serveur hors ligne · ${s.error || host}`;
    $('srv-mini').textContent = 'Hors ligne';
    $('st-players').textContent = $('st-matches').textContent = $('st-ping').textContent = '—';
    $('play-hint').textContent = 'Le jeu réessaiera tout seul de se connecter.';
  }
}

// ---------- notes de mise à jour ----------
async function loadNews() {
  const news = (await L.news()) || [];
  $('news-list').innerHTML = news.length ? news.map(n => `<article class="news-item">
      <div class="nh"><span class="nv">v${esc(n.version)}</span><span class="nt">${esc(n.title)}</span><span class="nd">${esc(fmtDate(n.date))}</span></div>
      <ul>${(n.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul></article>`).join('') : '<p class="help">Notes indisponibles : serveur injoignable.</p>';
  if (news[0]) $('latest-news').querySelector('.ln-title').textContent = `v${news[0].version} — ${news[0].title}`;
}

// ---------- boutique du jour ----------
function shopTimer() {
  if (!shop) return '—';
  const left = Math.max(0, shop.resetAt - Date.now());
  const h = Math.floor(left / 3600000), m = Math.floor(left % 3600000 / 60000), s = Math.floor(left % 60000 / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
async function loadShop() {
  shop = await L.shop();
  if (!shop || !shop.theme) { $('shop-card').hidden = true; return; }
  $('shop-card').hidden = false;
  $('sc-theme').textContent = 'THÈME : ' + shop.theme.toUpperCase();
  $('sc-items').innerHTML = (shop.featured || []).map(i => `<div class="sc-i"><i></i><span>${esc(i.name)}</span><b>-${i.off} %</b></div>`).join('')
    + (shop.bundle ? `<div class="sc-i pack"><i></i><span>${esc(shop.bundle.name)}</span><b>-${shop.bundle.off} %</b></div>` : '');
  // couleurs des skins appliquées par le code (la politique de sécurité du launcher interdit les styles écrits dans le HTML)
  const okColor = c => /^#[0-9a-f]{3,8}$/i.test(String(c || ''));
  $('sc-items').querySelectorAll('.sc-i:not(.pack)').forEach((el, k) => { const i = shop.featured[k]; if (okColor(i?.body)) el.style.setProperty('--c1', i.body); if (okColor(i?.accent)) el.style.setProperty('--c2', i.accent); });
  $('sc-timer').textContent = shopTimer();
}
$('sc-go').onclick = () => L.play('boutique');
setInterval(() => { if (shop) { $('sc-timer').textContent = shopTimer(); if (Date.now() > shop.resetAt + 3000) loadShop(); } }, 1000);

// ---------- jouer ----------
async function play() {
  const btn = $('btn-play');
  if (btn.disabled) return;
  btn.disabled = true;
  btn.querySelector('span').textContent = 'LANCEMENT…';
  const r = await L.play();
  if (!r.ok) toast(r.error || 'Lancement impossible');
  setTimeout(() => { btn.disabled = false; btn.querySelector('span').textContent = 'JOUER'; }, 1500);
}
$('btn-play').onclick = play;
document.addEventListener('keydown', e => { if (e.key === 'Enter' && $('view-home').classList.contains('active') && document.activeElement?.tagName !== 'INPUT') play(); });

// ---------- mise à jour du launcher ----------
const UPD_TEXT = {
  idle: '', dev: 'Version de développement : pas de mise à jour automatique.', unavailable: 'Mise à jour automatique indisponible.',
  portable: 'Version portable : télécharge les nouvelles versions sur la page de téléchargement.',
  inactive: 'Cette installation ne se met pas à jour toute seule : télécharge les nouvelles versions sur la page de téléchargement.',
  checking: 'Recherche d\'une mise à jour…', latest: 'Le launcher est à jour.', error: 'Vérification impossible pour le moment.',
};
function renderUpd(u) {
  let text = UPD_TEXT[u.state] ?? '';
  if (u.state === 'downloading') text = `Téléchargement de la version ${u.version || ''}… ${u.percent || 0} %`;
  if (u.state === 'ready') text = `Version ${u.version} prête à être installée.`;
  $('upd-state').textContent = text;
  $('ab-upd').textContent = text;
  $('upd-bar').hidden = u.state !== 'ready';
  $('upd-text').textContent = `Nouvelle version du launcher (${u.version || ''}) téléchargée.`;
}
L.onUpdate(renderUpd);
$('upd-go').onclick = () => L.installUpdate();
$('s-checkupd').onclick = async () => renderUpd(await L.checkUpdate());

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
  $('s-fps').checked = settings.fpsUnlock; $('s-gpu').checked = settings.highPerfGpu; $('s-perf').checked = settings.perfMode !== false;
  $('s-autostart').checked = settings.autoStart; $('s-autoupd').checked = settings.autoUpdate;
  $('autostart-wrap').hidden = !['win32', 'darwin'].includes(settings.platform);
  $('restart-row').hidden = !initial || (initial.fpsUnlock === settings.fpsUnlock && initial.highPerfGpu === settings.highPerfGpu && initial.perfMode === (settings.perfMode !== false));
  $('ver').textContent = `Launcher v${settings.version}`;
  $('ab-ver').textContent = `ECLIPSE Launcher v${settings.version}`;
}
async function save(patch) {
  const r = await L.setSettings(patch);
  if (!r.ok) { toast(r.error); return false; }
  settings = { ...settings, ...r.settings };
  renderSettings();
  return true;
}
$('s-size').onchange = e => save({ size: e.target.value });
$('s-fps').onchange = e => save({ fpsUnlock: e.target.checked });
$('s-gpu').onchange = e => save({ highPerfGpu: e.target.checked });
$('s-perf').onchange = e => save({ perfMode: e.target.checked });
$('s-nettest').onclick = async () => {
  const msg = $('s-net-msg'), btn = $('s-nettest');
  msg.className = 'help'; msg.textContent = 'Mesure en cours…'; btn.disabled = true;
  const r = await L.netTest();
  btn.disabled = false;
  if (!r.ok) { msg.className = 'help err'; msg.textContent = `Échec : ${r.error}.`; return; }
  const good = r.avg < 80 && r.jitter < 20 && !r.lost;
  msg.className = 'help ' + (good ? 'ok' : 'err');
  msg.textContent = `Ping ${r.avg} ms (min ${r.min}, max ${r.max}) · variation ${r.jitter} ms${r.lost ? ` · ${r.lost} perdu(s)` : ''}. ` +
    (good ? 'Connexion excellente.' : r.jitter >= 20 || r.lost ? 'Connexion instable : préfère un câble à la Wi-Fi et ferme les téléchargements.' : 'Ping élevé : le serveur est loin ou la connexion chargée.');
};
$('s-autostart').onchange = e => save({ autoStart: e.target.checked });
$('s-autoupd').onchange = e => save({ autoUpdate: e.target.checked });
$('s-restart').onclick = () => L.restart();
$('s-test').onclick = async () => {
  const msg = $('s-server-msg');
  msg.className = 'help'; msg.textContent = 'Test en cours…';
  const s = await L.status($('s-server').value);
  msg.className = 'help ' + (s.online ? 'ok' : 'err');
  msg.textContent = s.online ? `Serveur joignable (${s.ping} ms${s.players != null ? ` · ${s.players} joueur(s) en ligne` : ''}).` : `Serveur injoignable : ${s.error}.`;
};
$('s-save').onclick = async () => {
  if (await save({ server: $('s-server').value })) { toast('Adresse enregistrée'); refreshStatus(); loadNews(); loadShop(); }
};
$('s-server').onkeydown = e => { if (e.key === 'Enter') $('s-save').click(); };
$('s-cache').onclick = async () => { await L.clearCache(); toast('Cache vidé : la dernière version du jeu sera chargée.'); };
$('s-reset').onclick = async () => { settings = { ...settings, ...(await L.resetSettings()) }; renderSettings(); refreshStatus(); toast('Paramètres réinitialisés'); };

// ---------- démarrage ----------
(async () => {
  settings = await L.getSettings();
  initial = { fpsUnlock: settings.fpsUnlock, highPerfGpu: settings.highPerfGpu, perfMode: settings.perfMode !== false };
  renderSettings();
  refreshStatus(); loadNews(); loadShop();
  renderUpd(await L.update());
  setInterval(refreshStatus, 15000);
})();
