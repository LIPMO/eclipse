const q = new URLSearchParams(location.search);
const server = q.get('server');
document.getElementById('msg').textContent = `Impossible de se connecter à ${server || 'au serveur'}.`;
document.getElementById('err').textContent = q.get('error') ? `Détail : ${q.get('error')}` : '';
document.getElementById('retry').onclick = () => { if (server) location.href = server; };
