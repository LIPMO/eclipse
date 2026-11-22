// Lance le serveur du jeu en installant les dépendances au premier lancement.
//   node scripts/start.mjs [--port 3000]
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(path.join(root, 'node_modules', 'ws')) || !existsSync(path.join(root, 'node_modules', 'three'))) {
  console.log('Installation des dépendances (une seule fois)…');
  const r = spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error('npm install a échoué. Node.js est-il bien installé ?'); process.exit(1); }
}
process.chdir(root);
await import('../server/server.js');
