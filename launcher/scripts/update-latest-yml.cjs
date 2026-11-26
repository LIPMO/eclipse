// Après la signature (SignPath), le fichier de l'installateur change : on remet à jour son empreinte SHA-512 et sa
// taille dans latest.yml, sinon les launchers installés refuseraient la mise à jour (empreinte différente).
// Usage : node scripts/update-latest-yml.cjs dist
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const dir = process.argv[2] || 'dist';
const file = path.join(dir, 'latest.yml');
let yml = fs.readFileSync(file, 'utf8');
const names = [...new Set([...yml.matchAll(/(?:url|path):\s*(\S+\.exe)/g)].map(m => m[1]))];
for (const name of names) {
  const buf = fs.readFileSync(path.join(dir, name));
  const sha512 = crypto.createHash('sha512').update(buf).digest('base64');
  // bloc « - url: <nom> / sha512: … / size: … »
  yml = yml.replace(new RegExp(`(- url: ${name.replace(/[.]/g, '\\.')}\\s*\\n\\s*sha512: )\\S+(\\s*\\n\\s*size: )\\d+`), `$1${sha512}$2${buf.length}`);
  // champs « path / sha512 » de premier niveau
  if (new RegExp(`^path: ${name.replace(/[.]/g, '\\.')}\\s*$`, 'm').test(yml)) yml = yml.replace(/^sha512: \S+$/m, `sha512: ${sha512}`);
  console.log(`${name} : ${buf.length} octets, sha512 ${sha512.slice(0, 16)}…`);
}
yml = yml.replace(/^\s*blockMapSize: \d+\s*\n/gm, ''); // la carte des blocs ne correspond plus au fichier signé
fs.writeFileSync(file, yml);
