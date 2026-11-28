// Espace créateur (1.35) : eclipseee.online/createur
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Number(n || 0).toLocaleString('fr-FR');
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* */ } } };
  let ws = null, D = null, color = null, retry = 0;

  function show(v) { for (const el of document.querySelectorAll('.view')) el.classList.toggle('hidden', el.id !== 'v-' + v); }
  function send(type, data = {}) { if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, ...data })); }

  function connect() {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { retry = 0; const t = store.get('eclipse_token'); if (t) send('creatorAuth', { token: t }); else show('login'); };
    ws.onclose = () => { setTimeout(connect, Math.min(10000, 1000 * 2 ** retry++)); };
    ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch { return; } (H[m.type] || (() => {}))(m); };
  }
  const H = {
    creatorAuthed(m) {
      if (m.token) store.set('eclipse_token', m.token);
      $('who').innerHTML = `<span>${esc(m.name)}</span><button class="btn small ghost" id="logout">Déconnexion</button>`;
      $('logout').onclick = () => { store.set('eclipse_token', null); location.reload(); };
    },
    creatorAuthError(m) {
      if (m.expired) store.set('eclipse_token', null);
      show('login'); $('l-err').textContent = m.expired ? '' : m.text;
    },
    creatorError(m) { const el = document.querySelector('.view:not(.hidden) .err:not(#l-err)') || $('e-err'); el.textContent = m.text; },
    creatorSaved(m) { $('e-ok').textContent = m.created ? 'Code créé !' : 'Enregistré ✔'; setTimeout(() => { $('e-ok').textContent = ''; }, 2500); },
    creator(m) { D = m; render(); },
  };

  function render() {
    const c = D.creator;
    document.querySelectorAll('.share-pct').forEach(e => { e.textContent = D.share; });
    if (!c) { $('c-name').textContent = D.name.toUpperCase(); show('create'); setTimeout(() => $('c-code').focus(), 50); return; }
    show('dash');
    document.documentElement.style.setProperty('--cc', c.color);
    $('d-disabled').classList.toggle('hidden', !c.disabled);
    $('d-off').classList.toggle('hidden', D.enabled !== false);
    $('d-code').textContent = c.code;
    $('d-slogan').textContent = c.slogan ? `« ${c.slogan} »` : '';
    $('d-link').value = `${location.origin}/?soutien=${encodeURIComponent(c.code)}`;
    $('k-earned').textContent = fmt(c.earned); $('k-today').textContent = fmt(c.today); $('k-week').textContent = fmt(c.week);
    $('k-sup').textContent = fmt(c.supporters); $('k-sales').textContent = fmt(c.sales);
    $('k-spent').textContent = c.spent ? `${fmt(c.spent)} Éclats dépensés par tes fans` : '';
    $('k-cap').textContent = `plafond : ${fmt(D.cap)} / jour`;
    $('r-min').textContent = D.minMatches; $('r-cap').textContent = fmt(D.cap);
    // graphique 30 jours
    const max = Math.max(1, ...c.days.map(d => d[1]));
    $('d-chart').innerHTML = c.days.map(([d, v]) => `<div class="bar" title="${d.slice(8)}/${d.slice(5, 7)} : ${fmt(v)} Éclats"><i style="height:${Math.max(v ? 4 : 1, v / max * 100)}%"></i></div>`).join('')
      + `<div class="axis"><span>${c.days[0][0].slice(8)}/${c.days[0][0].slice(5, 7)}</span><span>aujourd'hui</span></div>`;
    $('d-recent').innerHTML = c.recent.length ? c.recent.map(r => `<div class="rc"><span class="rc-item">${esc(r.item)}</span><span class="muted small">${new Date(r.t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><b>+${fmt(r.gain)}</b></div>`).join('')
      : '<p class="muted">Aucun achat pour l\'instant. Partage ton lien pour que tes fans te soutiennent !</p>';
    // formulaire (sans écraser ce que le joueur est en train de taper)
    if (!render.filled) {
      render.filled = true;
      $('e-code').value = c.code; $('e-slogan').value = c.slogan || '';
      for (const k of ['youtube', 'twitch', 'tiktok']) $('e-' + k).value = c.rawLinks[k] || '';
      color = c.color;
    }
    $('e-code').disabled = !!c.canChangeAt;
    $('e-code-help').textContent = c.canChangeAt ? `Prochain changement possible le ${new Date(c.canChangeAt).toLocaleDateString('fr-FR')}.` : 'Changement possible une fois par semaine. Tes soutiens sont conservés.';
    $('e-colors').innerHTML = D.colors.map(col => `<button type="button" class="sw ${col === color ? 'on' : ''}" data-c="${col}" style="--sw:${col}" aria-label="Couleur ${col}"></button>`).join('');
    preview();
  }
  function preview() {
    if (!D?.creator) return;
    const code = ($('e-code').value || D.creator.code).toUpperCase(), slogan = $('e-slogan').value.trim();
    $('e-preview').innerHTML = `<div class="cr-card" style="--cc:${esc(color)}"><b class="cr-code">${esc(code)}</b><span class="cr-by">par ${esc(D.name)} · niv. ${D.creator.level}</span>${slogan ? `<i class="cr-slogan">« ${esc(slogan)} »</i>` : ''}</div>`;
  }
  const cleanCode = el => { el.value = el.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); };

  $('login-form').onsubmit = e => {
    e.preventDefault(); $('l-err').textContent = '';
    send('creatorAuth', { name: $('l-name').value.trim(), password: $('l-pass').value });
  };
  $('c-code').oninput = e => cleanCode(e.target);
  $('c-code').onkeydown = e => { if (e.key === 'Enter') $('c-go').click(); };
  $('c-go').onclick = () => { $('c-err').textContent = ''; const code = $('c-code').value; if (code.length < 3) { $('c-err').textContent = 'Au moins 3 caractères.'; return; } send('creatorSave', { code }); };
  $('e-code').oninput = e => { cleanCode(e.target); preview(); };
  $('e-slogan').oninput = preview;
  $('e-colors').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; for (const x of $('e-colors').children) x.classList.toggle('on', x === b); preview(); };
  $('e-save').onclick = () => {
    $('e-err').textContent = '';
    const data = { color, slogan: $('e-slogan').value, links: { youtube: $('e-youtube').value.trim(), twitch: $('e-twitch').value.trim(), tiktok: $('e-tiktok').value.trim() } };
    if (!$('e-code').disabled && $('e-code').value && $('e-code').value !== D.creator.code) data.code = $('e-code').value;
    send('creatorSave', data);
  };
  $('d-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('d-link').value); } catch { $('d-link').select(); document.execCommand('copy'); }
    $('d-copy').textContent = 'COPIÉ ✔'; setTimeout(() => { $('d-copy').textContent = 'COPIER'; }, 1800);
  };
  // les chiffres se mettent à jour tout seuls
  setInterval(() => { if (D?.creator && document.visibilityState === 'visible') send('creatorGet'); }, 30000);

  // fond animé discret (étoiles violettes)
  (() => {
    const cv = $('bg'), g = cv.getContext('2d'); if (!g) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let W, Hh, pts;
    const size = () => { W = cv.width = innerWidth; Hh = cv.height = innerHeight; pts = Array.from({ length: Math.min(90, Math.round(W * Hh / 16000)) }, () => ({ x: Math.random() * W, y: Math.random() * Hh, r: Math.random() * 1.6 + .3, v: Math.random() * .25 + .05 })); };
    size(); addEventListener('resize', size);
    const draw = () => {
      g.clearRect(0, 0, W, Hh);
      for (const p of pts) { p.y -= p.v; if (p.y < -4) { p.y = Hh + 4; p.x = Math.random() * W; } g.fillStyle = `rgba(190,150,255,${.25 + p.r / 4})`; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
      if (!reduce) setTimeout(() => requestAnimationFrame(draw), 33);
    };
    draw();
  })();

  show('loading');
  connect();
})();
