// Test rapide du serveur (lancé par « npm test » et par GitHub Actions à chaque envoi).
// Démarre le jeu sur un port libre avec un dossier de données temporaire, puis vérifie l'essentiel.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
let ok = 0, ko = 0;
const t = (c, l, x = '') => { c ? ok++ : ko++; console.log((c ? '✔ ' : '✘ ') + l + (x ? ' — ' + x : '')); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const freePort = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

const port = await freePort(), B = `http://127.0.0.1:${port}`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'eclipse-test-'));
const srv = spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: data, MAX_ACCOUNTS_PER_IP: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; srv.stdout.on('data', d => { log += d; }); srv.stderr.on('data', d => { log += d; });
const stop = code => { srv.kill('SIGTERM'); try { fs.rmSync(data, { recursive: true, force: true }); } catch { /* */ } process.exit(code); };
setTimeout(() => { console.log('Délai dépassé\n' + log); stop(1); }, 60000).unref();
for (let i = 0; i < 50 && !/serveur prêt/.test(log); i++) await wait(200);
t(/serveur prêt/.test(log), 'Le serveur démarre', /serveur prêt/.test(log) ? '' : log.slice(-500));

try {
  t((await (await fetch(B + '/healthz')).text()) === 'ok', 'Point de santé /healthz');
  const st = await (await fetch(B + '/api/status')).json();
  t(st.version === PKG.version, 'Version annoncée par /api/status', st.version);
  const home = await fetch(B + '/');
  t(home.status === 200 && home.headers.get('x-frame-options') === 'DENY' && /ECLIPSE/.test(await home.text()), 'Page d\'accueil servie avec les en-têtes de sécurité');
  t((await fetch(B + '/js/main.js')).status === 200, 'Fichiers du jeu servis (vérifiés par l\'intégrité)');
  { const en = await (await fetch(B + '/i18n/en.json')).json(); t(Object.keys(en.strings || {}).length > 1000 && (en.patterns || []).length > 20, 'Traduction anglaise servie', String(Object.keys(en.strings || {}).length)); }
  t((await fetch(B + '/js/gamepad.js')).status === 200 && (await fetch(B + '/js/i18n.js')).status === 200, 'Modules manette et traduction servis');
  t(!/Fichier modifié|ne correspond pas|intégrité/i.test(log.replace(/Mode protégé[^\n]*/g, '')), 'Aucune alerte d\'intégrité au démarrage');
  t([403, 404].includes((await fetch(B + '/../data/accounts.json')).status) || (await fetch(B + '/%2e%2e/server/accounts.js')).status === 404, 'Fichiers du serveur inaccessibles');
  t((await fetch(B + '/admin/api/overview')).status === 401, 'Administration protégée');
  // partie complète par WebSocket : invité, partie contre des bots
  const w = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: B } }); const msgs = [];
  w.on('message', d => msgs.push(JSON.parse(d)));
  await new Promise((res, rej) => { w.on('open', res); w.on('error', rej); });
  const wf = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const m = msgs.find(f); if (m) return m; await wait(30); } return null; };
  w.send(JSON.stringify({ type: 'hello', name: 'Testeur' }));
  t(!!await wf(m => m.type === 'welcome'), 'Connexion en invité');
  w.send(JSON.stringify({ type: 'quickBots', mode: 'ffa', difficulty: 'easy' }));
  t(!!await wf(m => m.type === 'matchStart'), 'Partie contre des bots lancée');
  t(!!await wf(m => m.type === 'snap', 3000), 'Le serveur envoie l\'état de la partie');
  w.close();
} catch (e) { t(false, 'Erreur inattendue', e.message); }

console.log(`\n${ok} réussis, ${ko} échoués`);
stop(ko ? 1 : 0);
