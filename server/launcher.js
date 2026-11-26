// Informations sur la dernière version du launcher (page /telecharger et /api/launcher).
// Les fichiers sont compilés par GitHub Actions (.github/workflows/launcher.yml) et publiés sur GitHub Releases ;
// on lit la dernière publication (mise en cache 10 min) et le fichier d'empreintes SHA256SUMS.txt.
const REPO = process.env.LAUNCHER_REPO || 'LIPMO/eclipse';
const TTL = 10 * 60 * 1000;
let cache = { at: 0, info: null, pending: null };

const KIND = name => /Setup\.exe$/i.test(name) ? 'windows' : /Portable\.exe$/i.test(name) ? 'portable' : /\.AppImage$/i.test(name) ? 'linux' : /\.dmg$/i.test(name) ? 'mac' : null;

async function getJSON(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'ECLIPSE-Server', Accept: 'application/vnd.github+json' } });
    if (!r.ok) return { status: r.status, data: null };
    return { status: r.status, data: url.endsWith('.txt') ? await r.text() : await r.json() };
  } finally { clearTimeout(t); }
}

async function load() {
  const rel = await getJSON(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (rel.status === 404) return { available: false, reason: 'aucune version publiée', repo: REPO };
  if (!rel.data) throw new Error(`GitHub a répondu ${rel.status}`);
  const r = rel.data;
  const sums = {};
  const sumAsset = (r.assets || []).find(a => a.name === 'SHA256SUMS.txt');
  if (sumAsset) {
    try { const s = await getJSON(sumAsset.browser_download_url); for (const line of String(s.data || '').split('\n')) { const m = line.trim().match(/^([0-9a-f]{64})\s+\*?(.+)$/i); if (m) sums[m[2].trim()] = m[1].toLowerCase(); } } catch { /* empreintes indisponibles */ }
  }
  const files = (r.assets || []).filter(a => KIND(a.name)).map(a => ({ name: a.name, kind: KIND(a.name), size: a.size, url: a.browser_download_url, sha256: sums[a.name] || null, downloads: a.download_count }));
  return {
    available: files.length > 0, repo: REPO, version: String(r.tag_name || '').replace(/^launcher-v/, '').replace(/^v/, ''), tag: r.tag_name,
    published: r.published_at, page: r.html_url, files,
    // indiqué par le serveur de compilation dans les notes de version
    signedWindows: /Signature Windows \(Authenticode\)\s*:\s*oui/i.test(r.body || ''),
    attestations: `https://github.com/${REPO}/attestations`,
  };
}

function fallbackInfo(error) {
  const base = `https://github.com/${REPO}/releases/latest/download/`;
  const files = ['ECLIPSE-Launcher-Setup.exe', 'ECLIPSE-Launcher-Portable.exe', 'ECLIPSE-Launcher.AppImage'].map(name => ({ name, kind: KIND(name), size: null, url: base + name, sha256: null }));
  return { available: true, fallback: true, error, repo: REPO, version: null, published: null, page: `https://github.com/${REPO}/releases/latest`, files, signedWindows: false, attestations: `https://github.com/${REPO}/attestations` };
}
// renvoie la dernière info connue (peut être null au tout premier appel) et rafraîchit en arrière-plan si besoin
export function launcherInfo() {
  if (Date.now() - cache.at > TTL && !cache.pending) {
    cache.pending = load().then(info => { cache.info = info; cache.at = Date.now(); }).catch(e => {
      cache.at = Date.now() - TTL + 120000; // nouvel essai dans 2 min
      // GitHub injoignable ou limite atteinte : on garde la dernière info connue, sinon les liens directs (noms de fichiers fixes)
      if (!cache.info?.available) cache.info = fallbackInfo(String(e.message || e));
    }).finally(() => { cache.pending = null; });
  }
  return cache.info;
}
// attend le premier chargement (au plus quelques secondes) : utilisé par la page de téléchargement
export async function launcherInfoFresh() {
  const now = launcherInfo();
  if (now) return now;
  try { await cache.pending; } catch { /* */ }
  return cache.info;
}
export const LAUNCHER_REPO = REPO;
