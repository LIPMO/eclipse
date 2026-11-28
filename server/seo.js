// Pages de présentation pour les moteurs de recherche (1.20) : du vrai texte en HTML, générées par le serveur
// à partir des données du jeu (agents, modes, cartes, nouveautés). Aucun script, aucune donnée personnelle.
import fs from 'node:fs';
import { AGENTS, AGENT_ORDER, ABILITY_ICONS, ROLES, SKINS } from '../shared/data.js';
import { MAP_INFO, MAP_ORDER, mapsForMode } from '../shared/maps.js';

const SITE = (process.env.SITE_URL || 'https://eclipseee.online').replace(/\/$/, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = id => id; // les identifiants d'agents sont déjà en minuscules sans accent

export const MODES = [
  { id: 'assault', name: 'Assaut 5v5', short: 'Pose ou désamorce le Noyau', text: 'Deux équipes de cinq s\'affrontent en manches. Les attaquants doivent poser le Noyau sur l\'un des deux sites (A ou B) et le défendre jusqu\'à l\'explosion ; les défenseurs doivent les éliminer ou désamorcer le Noyau. Entre les manches, chacun achète ses armes et son armure avec les crédits gagnés. Les équipes changent de côté à la mi-temps : la première à 7 manches gagne.' },
  { id: 'duel', name: 'Duel 1v1', short: 'Face à face, premier à 5 manches', text: 'Un contre un sur de petites arènes. Entre deux comptes, le duel compte pour le classement Elo de la saison : c\'est le mode pour prouver qui vise le mieux.' },
  { id: 'ffa', name: 'Mêlée', short: 'Chacun pour soi', text: 'Jusqu\'à 8 joueurs, réapparition immédiate et équipement complet : le premier à 25 éliminations gagne. Idéal pour s\'échauffer. Éliminer le meneur rapporte une prime.' },
  { id: 'gungame', name: 'Gun Game', short: 'Une nouvelle arme à chaque élimination', text: 'Chaque élimination te fait passer à l\'arme suivante, du fusil de précision au pistolet. Le premier qui réussit une élimination au couteau, au dernier niveau, remporte la partie.' },
  { id: 'lives', name: 'Dernier debout', short: 'Trois vies chacun', text: 'Chaque joueur a un nombre limité de vies. Une fois toutes ses vies perdues, il est éliminé définitivement : le dernier encore en jeu gagne.' },
];

function page({ path, title, desc, h1, body, crumbs = [], ld = null }) {
  const url = SITE + path;
  const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['Accueil', '/'], ...crumbs].map(([n, p], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE + p })) };
  return `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website"><meta property="og:site_name" content="ECLIPSE"><meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/img/og-image.png"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify(bc)}</script>
${ld ? `<script type="application/ld+json">${JSON.stringify(ld)}</script>` : ''}
<style>:root{color-scheme:dark}*{scrollbar-width:thin;scrollbar-color:rgba(139,92,255,.6) transparent}::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(139,92,255,.6);border-radius:8px}::-webkit-scrollbar-button{display:none}
:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#090c15;color:#e9ecf5;line-height:1.6}
a{color:#7cf0ff}header,main,footer{max-width:1000px;margin:0 auto;padding:16px}
header{display:flex;align-items:center;gap:18px;flex-wrap:wrap;border-bottom:1px solid #1d2338}
header .logo{font-weight:800;letter-spacing:.3em;color:#fff;text-decoration:none;font-size:20px}nav a{margin-right:14px;text-decoration:none;color:#c4c9dc}nav a:hover{color:#fff}
.play{margin-left:auto;background:linear-gradient(135deg,#a07bff,#5b2fd6);color:#fff;text-decoration:none;font-weight:800;letter-spacing:.12em;padding:10px 22px}
h1{font-size:36px;letter-spacing:.04em;margin:18px 0 6px}h2{margin-top:28px;border-left:4px solid #8b5cff;padding-left:10px}.lead{font-size:18px;color:#c4c9dc}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}.card{background:#11152a;border:1px solid #1d2338;padding:14px;border-top:3px solid var(--c,#8b5cff)}
.card h3{margin:0 0 4px}.card a{text-decoration:none}.muted{color:#8d93ab;font-size:14px}.ab{display:flex;gap:12px;margin:10px 0;padding:10px;background:#11152a;border-left:3px solid var(--c,#8b5cff)}
.ab .ic{font-size:28px;line-height:1}.cta{display:inline-block;margin:24px 0;background:linear-gradient(135deg,#a07bff,#5b2fd6);color:#fff;text-decoration:none;font-weight:800;letter-spacing:.12em;padding:14px 30px;font-size:18px}
footer{border-top:1px solid #1d2338;color:#8d93ab;font-size:13px;margin-top:30px}ul{padding-left:20px}
</style></head><body>
<header><a class="logo" href="/">ECLIPSE</a><nav><a href="/jeu">Le jeu</a><a href="/agents">Agents</a><a href="/modes">Modes</a><a href="/cartes">Cartes</a><a href="/guide">Guide</a><a href="/nouveautes">Nouveautés</a></nav><a class="play" href="/">JOUER</a></header>
<main><h1>${esc(h1)}</h1>${body}
<a class="cta" href="/">JOUER GRATUITEMENT</a></main>
<footer>ECLIPSE — shooter tactique gratuit dans le navigateur · <a href="/mentions-legales.html">Mentions légales</a> · <a href="/cgu.html">CGU</a> · <a href="/confidentialite.html">Confidentialité</a> · <a href="https://github.com/LIPMO/eclipse">Code source (AGPL-3.0)</a> · <a href="/telecharger"><b>⬇ Télécharger le launcher</b></a></footer>
</body></html>`;
}

const roleOf = a => ROLES[a.role] || { icon: '•', desc: '' };
const agentCard = id => { const a = AGENTS[id]; return `<div class="card" style="--c:${a.color}"><h3><a href="/agents/${slug(id)}">${esc(a.name)}</a></h3><div class="muted">${roleOf(a).icon} ${esc(a.role)}</div><p>${esc(a.bio)}</p></div>`; };

function pJeu() {
  return page({ path: '/jeu', title: 'ECLIPSE — shooter tactique 5v5 gratuit dans le navigateur', desc: `ECLIPSE est un FPS tactique gratuit jouable dans le navigateur : ${AGENT_ORDER.length} agents à capacités, ${MODES.length} modes, ${MAP_ORDER.length} cartes, parties perso entre amis, duels classés.`,
    h1: 'ECLIPSE, le shooter tactique gratuit',
    body: `<p class="lead">ECLIPSE est un jeu de tir tactique en équipe qui se joue directement dans ton navigateur, sans téléchargement. Choisis un agent, achète tes armes et affronte d'autres joueurs ou des bots.</p>
    <h2>Ce qui t'attend</h2><ul>
    <li><b>${AGENT_ORDER.length} agents</b> avec chacun trois capacités : fumées, flashs, murs, soins, grappin, drone, pièges… (<a href="/agents">voir les agents</a>)</li>
    <li><b>${MODES.length} modes de jeu</b> : Assaut 5v5, Duel 1v1 classé, Mêlée, Gun Game et Dernier debout (<a href="/modes">voir les modes</a>)</li>
    <li><b>${MAP_ORDER.length} cartes</b>, des grands sites d'Assaut aux petites arènes de duel (<a href="/cartes">voir les cartes</a>)</li>
    <li><b>Salon de groupe</b> : joue avec jusqu'à 3 amis, dans la même équipe</li>
    <li><b>Parties personnalisées</b> : vitesse, dégâts, armes autorisées, argent illimité, taille des équipes…</li>
    <li><b>${SKINS.length} skins d'armes</b> en collections, tenues d'agents, quêtes quotidiennes et hebdomadaires, succès et titres</li>
    <li>Clans, tournois, amis, classements et duels classés par saison</li>
    <li>Jouable au clavier et à la souris, à la manette, et sur téléphone</li></ul>
    <h2>Gratuit et sans installation</h2><p>Le jeu tourne dans Chrome, Firefox, Edge ou Safari. Tu peux jouer en invité tout de suite, ou créer un compte gratuit pour garder ta progression, tes skins et tes amis.</p>`,
    crumbs: [['Le jeu', '/jeu']],
    ld: { '@context': 'https://schema.org', '@type': 'VideoGame', name: 'ECLIPSE', url: SITE + '/', genre: ['Shooter', 'Tactical shooter', 'FPS'], gamePlatform: ['Web browser'], applicationCategory: 'Game', operatingSystem: 'Any', inLanguage: 'fr', offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 1, maxValue: 10 }, playMode: ['MultiPlayer', 'SinglePlayer'] } });
}
function pAgents() {
  const byRole = Object.keys(ROLES).map(r => `<h2>${ROLES[r].icon} ${esc(r)}s</h2><p class="muted">${esc(ROLES[r].desc)}</p><div class="grid">${AGENT_ORDER.filter(id => AGENTS[id].role === r).map(agentCard).join('')}</div>`).join('');
  return page({ path: '/agents', title: `Les ${AGENT_ORDER.length} agents d'ECLIPSE : rôles et capacités`, desc: `Découvre les ${AGENT_ORDER.length} agents d'ECLIPSE : duellistes, initiateurs, contrôleurs et sentinelles, avec leurs capacités et leur ultime.`,
    h1: `Les ${AGENT_ORDER.length} agents`, body: `<p class="lead">Chaque agent a deux capacités et un ultime. Choisis ton style : ouvrir les combats, préparer l'assaut, couper la carte ou défendre ton équipe.</p>${byRole}`, crumbs: [['Agents', '/agents']] });
}
function pAgent(id) {
  const a = AGENTS[id]; const r = roleOf(a);
  const abs = ['q', 'e', 'x'].map(k => { const b = a.abilities[k]; return `<div class="ab" style="--c:${a.color}"><span class="ic">${ABILITY_ICONS[b.type] || '•'}</span><div><b>${esc(b.name)}</b> <span class="muted">${k === 'x' ? `· ultime (${b.cost} points)` : `· touche ${k.toUpperCase()} · ${b.charges} charge${b.charges > 1 ? 's' : ''}`}</span><br>${esc(b.desc)}</div></div>`; }).join('');
  const others = AGENT_ORDER.filter(x => x !== id && AGENTS[x].role === a.role);
  return page({ path: '/agents/' + slug(id), title: `${a.name} — agent ${a.role} d'ECLIPSE : capacités et conseils`, desc: `${a.name}, agent ${a.role.toLowerCase()} d'ECLIPSE. ${a.bio} Capacités : ${['q', 'e', 'x'].map(k => a.abilities[k].name).join(', ')}.`,
    h1: `${a.name} · ${a.role}`, body: `<p class="lead">${esc(a.bio)}</p><p>${r.icon} <b>${esc(a.role)}</b> : ${esc(r.desc)}</p><h2>Capacités</h2>${abs}
    <h2>Tenues</h2><p>Ombre, Néon, Givre, Or et Éclipse : ces tenues se débloquent en montant la maîtrise de ${esc(a.name)} (en jouant des parties avec cet agent).</p>
    ${others.length ? `<h2>Autres ${esc(a.role.toLowerCase())}s</h2><div class="grid">${others.map(agentCard).join('')}</div>` : ''}`,
    crumbs: [['Agents', '/agents'], [a.name, '/agents/' + slug(id)]] });
}
function pModes() {
  return page({ path: '/modes', title: 'Modes de jeu d\'ECLIPSE : Assaut 5v5, Duel classé, Mêlée, Gun Game', desc: 'Tous les modes d\'ECLIPSE : Assaut 5v5 avec pose du Noyau, Duel 1v1 classé Elo, Mêlée, Gun Game, Dernier debout et parties personnalisées.',
    h1: 'Les modes de jeu', body: MODES.map(m => `<h2 id="${m.id}">${esc(m.name)}</h2><p class="muted">${esc(m.short)} · cartes : ${mapsForMode(m.id).map(id => esc(MAP_INFO[id].name)).join(', ')}</p><p>${esc(m.text)}</p>`).join('')
      + `<h2 id="perso">Parties personnalisées</h2><p>Crée tes propres règles et rejoue-les avec tes amis : vitesse des joueurs, dégâts reçus, armes autorisées (pistolets, snipers, fusils à pompe ou couteau seulement), argent illimité, durée des manches, taille des équipes de 1v1 à 5v5, gravité basse, grosses têtes… Après chaque partie, tout le monde revient au salon.</p>`,
    crumbs: [['Modes', '/modes']] });
}
function pCartes() {
  return page({ path: '/cartes', title: `Les ${MAP_ORDER.length} cartes d'ECLIPSE`, desc: `Les cartes d'ECLIPSE : ${MAP_ORDER.map(id => MAP_INFO[id].name).join(', ')}. Sites d'Assaut et arènes de duel.`,
    h1: 'Les cartes', body: `<div class="grid">${MAP_ORDER.map(id => { const m = MAP_INFO[id]; const modes = MODES.filter(x => mapsForMode(x.id).includes(id)).map(x => x.name); return `<div class="card" style="--c:${m.theme?.accent || '#8b5cff'}"><h3>${esc(m.name)}</h3><div class="muted">${esc(m.subtitle)}</div><p>${m.small ? 'Petite arène pensée pour les duels et les combats rapprochés.' : 'Grande carte avec deux sites (A et B) pour l\'Assaut 5v5.'}</p><p class="muted">Modes : ${esc(modes.join(', '))}</p></div>`; }).join('')}</div>`,
    crumbs: [['Cartes', '/cartes']] });
}
function pGuide() {
  return page({ path: '/guide', title: 'Guide pour débuter sur ECLIPSE : commandes, économie, conseils', desc: 'Bien débuter sur ECLIPSE : commandes clavier et manette, achat des armes, capacités, glissade, visée au viseur et conseils pour gagner tes premières parties.',
    h1: 'Guide du débutant', body: `<h2>Commandes de base</h2><ul><li><b>ZQSD / WASD</b> : se déplacer · <b>Espace</b> : sauter · <b>C</b> : s'accroupir (en courant : glissade)</li><li><b>Clic gauche</b> : tirer · <b>Clic droit</b> : viser (viseur ou lunette) · <b>R</b> : recharger</li><li><b>Q / E</b> : capacités · <b>X</b> : ultime · <b>B</b> : boutique · <b>Tab</b> : tableau des scores</li><li>Toutes les touches se changent dans les paramètres ; la manette est aussi prise en charge.</li></ul>
    <h2>L'économie en Assaut</h2><p>Au début de chaque manche, tu as quelques secondes pour acheter. Gagner une manche, éliminer un ennemi ou poser le Noyau rapporte des crédits. Si ton équipe manque d'argent, faites une manche « éco » au pistolet pour acheter des fusils à la suivante.</p>
    <h2>Conseils pour débuter</h2><ul><li>Vise à hauteur de tête : les tirs à la tête font beaucoup plus de dégâts.</li><li>Arrête-toi pour tirer : tirer en courant est moins précis.</li><li>Utilise tes capacités avant d'entrer sur un site : une fumée ou un flash change tout.</li><li>Entraîne-toi contre les bots ou sur le champ de tir avant les parties classées.</li><li>Joue avec des amis dans le salon de groupe : vous êtes toujours dans la même équipe.</li></ul>
    <h2>Progression</h2><p>Chaque partie rapporte de l'XP et des Éclats. Les quêtes du jour et de la semaine, les succès et les collections de skins donnent des récompenses en plus. La maîtrise de chaque agent débloque des tenues.</p>`,
    crumbs: [['Guide', '/guide']] });
}
function pNews(newsPath) {
  let news = []; try { news = JSON.parse(fs.readFileSync(newsPath, 'utf8')); } catch { /* aucune */ }
  return page({ path: '/nouveautes', title: 'Nouveautés et mises à jour d\'ECLIPSE', desc: `Les dernières mises à jour d'ECLIPSE${news[0] ? ` : version ${news[0].version}, ${news[0].title}` : ''}.`,
    h1: 'Nouveautés', body: news.slice(0, 15).map(n => `<h2>Version ${esc(n.version)} — ${esc(n.title)}</h2><p class="muted">${esc(n.date || '')}</p><ul>${(n.items || []).map(i => `<li>${esc(i)}</li>`).join('')}</ul>`).join('') || '<p>Aucune nouveauté pour le moment.</p>',
    crumbs: [['Nouveautés', '/nouveautes']] });
}
function sitemap(newsPath) {
  let last = new Date().toISOString().slice(0, 10);
  try { const n = JSON.parse(fs.readFileSync(newsPath, 'utf8')); if (n[0]?.date) last = n[0].date; } catch { /* */ }
  const urls = [['/', '1.0', 'weekly'], ['/jeu', '0.9', 'weekly'], ['/agents', '0.8', 'weekly'], ...AGENT_ORDER.map(id => ['/agents/' + slug(id), '0.6', 'monthly']), ['/modes', '0.7', 'monthly'], ['/cartes', '0.7', 'monthly'], ['/guide', '0.7', 'monthly'], ['/nouveautes', '0.6', 'weekly'], ['/telecharger', '0.7', 'weekly'],
    ['/mentions-legales.html', '0.2', 'yearly'], ['/cgu.html', '0.2', 'yearly'], ['/confidentialite.html', '0.2', 'yearly']];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([p, pr, f]) => `  <url><loc>${SITE}${p}</loc><lastmod>${last}</lastmod><changefreq>${f}</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`;
}

// ---------- page de téléchargement du launcher (1.24) ----------
const mo = n => (n ? (n / 1048576).toFixed(0) + ' Mo' : 'dernière version');
const KIND_LABEL = { windows: ['Windows — installateur', 'Recommandé : s\'installe en un clic, sans droits administrateur, et se met à jour tout seul.'], portable: ['Windows — version portable', 'Sans installation (clé USB…). Pas de mise à jour automatique.'], linux: ['Linux — AppImage', 'Rendre le fichier exécutable, puis l\'ouvrir.'], mac: ['macOS', ''] };
export function pDownload(info) {
  const rel = info && info.available ? info : null;
  const win = rel?.files.find(f => f.kind === 'windows');
  const date = rel?.published ? new Date(rel.published).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const body = rel ? `
<p class="lead">Le launcher ouvre ECLIPSE dans sa propre fenêtre, sans barre de navigateur, avec des réglages de performance (images par seconde illimitées, carte graphique la plus puissante) et la boutique du jour sur l'accueil. Ton compte reste le même que sur le site.</p>
${win ? `<a class="cta" href="${esc(win.url)}">⬇ TÉLÉCHARGER POUR WINDOWS</a><div class="muted">${rel.version ? `Version ${esc(rel.version)} · ${mo(win.size)} · publiée le ${esc(date)}` : 'Dernière version publiée'}</div>` : ''}
<h2>Installation en 1 clic</h2>
<ol><li>Ouvre le fichier téléchargé <b>${esc(win?.name || 'ECLIPSE-Launcher-Setup.exe')}</b>.</li><li>Le launcher s'installe tout seul (aucune question, pas besoin d'être administrateur) et se lance.</li><li>Un raccourci <b>ECLIPSE</b> est créé sur le bureau. Clique sur <b>JOUER</b>.</li></ol>
<p class="muted">Les mises à jour du launcher s'installent ensuite toutes seules ; celles du jeu sont instantanées.</p>
<h2>Toutes les versions</h2>
<div class="grid">${rel.files.map(f => `<div class="card"><h3>${esc((KIND_LABEL[f.kind] || [f.name])[0])}</h3><p class="muted">${esc((KIND_LABEL[f.kind] || ['', ''])[1])}</p><a href="${esc(f.url)}">⬇ ${esc(f.name)}</a> <span class="muted">(${mo(f.size)})</span></div>`).join('')}</div>
<h2>Signature et authenticité</h2>
<div class="ab" style="--c:#19e3c4"><div class="ic">✔</div><div><b>Compilé et signé par GitHub.</b> Chaque version est fabriquée automatiquement par les serveurs de GitHub à partir du code public du jeu, puis accompagnée d'une <a href="${esc(rel.attestations)}">attestation de provenance signée</a> (Sigstore) : elle prouve que le fichier vient bien de ce code et n'a pas été modifié.</div></div>
${rel.signedWindows
    ? '<div class="ab" style="--c:#19e3c4"><div class="ic">✔</div><div><b>Signé numériquement pour Windows</b> (certificat Authenticode, éditeur « SignPath Foundation »). Free code signing provided by <a href="https://about.signpath.io/">SignPath.io</a>, certificate by <a href="https://signpath.org/">SignPath Foundation</a> — <a href="https://github.com/LIPMO/eclipse/blob/main/CODE_SIGNING_POLICY.md">politique de signature</a>.</div></div>'
    : `<div class="ab" style="--c:#ffcf5a"><div class="ic">ℹ</div><div><b>Si Windows affiche « Windows a protégé votre ordinateur »</b> : c'est l'écran SmartScreen, normal pour un petit jeu indépendant qui n'a pas encore de certificat payant. Clique sur <b>Informations complémentaires</b>, puis sur <b>Exécuter quand même</b>. Tu peux vérifier le fichier ci-dessous avant de le lancer.</div></div>`}
<h3>Vérifier un fichier (facultatif)</h3>
<p class="muted">Empreintes SHA-256 : elles doivent être identiques à celles calculées sur ton ordinateur.</p>
<ul>${rel.files.filter(f => f.sha256).map(f => `<li><b>${esc(f.name)}</b><br><code style="word-break:break-all">${esc(f.sha256)}</code></li>`).join('') || `<li class="muted">Elles sont dans le fichier <a href="https://github.com/${esc(rel.repo)}/releases/latest/download/SHA256SUMS.txt">SHA256SUMS.txt</a> de la publication.</li>`}</ul>
<p class="muted">Windows (PowerShell) : <code>Get-FileHash .\${esc(win?.name || 'ECLIPSE-Launcher-Setup.exe')}</code> · Attestation (avec l'outil GitHub) : <code>gh attestation verify ${esc(win?.name || 'ECLIPSE-Launcher-Setup.exe')} -R ${esc(rel.repo)}</code></p>
<p class="muted">Toutes les versions : <a href="${esc(rel.page)}">page de la publication sur GitHub</a>.</p>`
    : `<p class="lead">Le launcher ECLIPSE arrive très bientôt. En attendant, le jeu se joue directement dans ton navigateur, sans rien installer.</p>
<p class="muted">${info?.repo ? `Les versions publiées apparaîtront ici et sur <a href="https://github.com/${esc(info.repo)}/releases">GitHub</a>.` : ''}</p>`;
  return page({ path: '/telecharger', title: 'Télécharger le launcher ECLIPSE (Windows, gratuit)', desc: 'Télécharge gratuitement le launcher ECLIPSE pour Windows : installation en un clic, mises à jour automatiques, fichiers compilés et signés par GitHub.', h1: 'Télécharger le launcher ECLIPSE', body, crumbs: [['Télécharger', '/telecharger']],
    ld: rel ? { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'ECLIPSE Launcher', operatingSystem: 'Windows, Linux', applicationCategory: 'GameApplication', softwareVersion: rel.version, offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, downloadUrl: win?.url } : null });
}

// renvoie { type, body } pour une adresse de présentation, sinon null
export function seoRoute(url, newsPath) {
  const u = url.replace(/\/+$/, '') || '/';
  if (u === '/sitemap.xml') return { type: 'application/xml; charset=utf-8', body: sitemap(newsPath) };
  const html = b => ({ type: 'text/html; charset=utf-8', body: b });
  if (u === '/jeu') return html(pJeu());
  if (u === '/agents') return html(pAgents());
  if (u.startsWith('/agents/')) { const id = u.slice(8).toLowerCase(); return AGENTS[id] ? html(pAgent(id)) : null; }
  if (u === '/modes') return html(pModes());
  if (u === '/cartes') return html(pCartes());
  if (u === '/guide') return html(pGuide());
  if (u === '/nouveautes') return html(pNews(newsPath));
  return null;
}
export const SEO_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
