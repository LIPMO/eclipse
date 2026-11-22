// Manifeste d'intégrité : empreinte SHA-256 de chaque fichier servi aux joueurs.
//   node scripts/integrity.mjs           -> génère integrity.json
//   node scripts/integrity.mjs --verify  -> vérifie les fichiers présents (code de sortie 1 si modifiés)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// fichiers de Three.js réellement utilisés par le jeu (le reste du paquet n'est jamais servi)
const VENDOR = ['node_modules/three/build/three.module.js', 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'];
const walk = dir => fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
export const servable = () => [...walk('public'), ...walk('shared'), ...VENDOR.filter(f => fs.existsSync(path.join(ROOT, f)))].map(f => f.split(path.sep).join('/'));
export const hashFile = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--verify')) {
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'integrity.json'), 'utf8')).files;
    let bad = 0;
    for (const f of servable()) {
      if (!man[f]) { console.log('FICHIER AJOUTÉ :', f); bad++; }
      else if (man[f] !== hashFile(f)) { console.log('FICHIER MODIFIÉ :', f); bad++; }
    }
    let later = 0;
    for (const f of Object.keys(man)) {
      if (fs.existsSync(path.join(ROOT, f))) continue;
      // les fichiers de node_modules (Three.js) sont installés ensuite par « npm ci » : ce n'est pas une anomalie
      if (f.startsWith('node_modules/')) { later++; continue; }
      console.log('FICHIER MANQUANT :', f); bad++;
    }
    console.log(bad ? `${bad} anomalie(s) détectée(s)` : `Tous les fichiers sont intacts.${later ? ` (${later} fichier(s) de bibliothèque seront installés par npm)` : ''}`);
    process.exit(bad ? 1 : 0);
  }
  const files = Object.fromEntries(servable().sort().map(f => [f, hashFile(f)]));
  fs.writeFileSync(path.join(ROOT, 'integrity.json'), JSON.stringify({ generated: new Date().toISOString(), files }, null, 1));
  console.log(`integrity.json : ${Object.keys(files).length} fichiers`);
}
