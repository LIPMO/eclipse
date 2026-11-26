// Page affichée dans la fenêtre du jeu quand le serveur ne répond pas : nouvel essai automatique toutes les 10 s
const q = new URLSearchParams(location.search);
const server = q.get('server');
document.getElementById('msg').textContent = `Impossible de se connecter à ${server || 'au serveur'}.`;
document.getElementById('err').textContent = q.get('error') ? `Détail : ${q.get('error')}` : '';
let n = 10;
const retry = () => { if (server) location.href = server; };
document.getElementById('retry').onclick = retry;
setInterval(() => {
  n--;
  document.getElementById('auto').textContent = n > 0 ? `Nouvel essai automatique dans ${n} s…` : 'Connexion…';
  if (n <= 0) retry();
}, 1000);
