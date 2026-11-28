// Clips automatiques Medal (launcher 2.3) : quand un moment fort arrive en jeu, le launcher prévient l'application Medal
// installée sur le PC (API locale http://localhost:12665). Medal garde les dernières secondes et range le clip dans la
// bibliothèque du joueur. Rien n'est envoyé sans clé Medal (fournie par Medal aux développeurs) ni si l'option est coupée.
const http = require('http');

// événements d'ECLIPSE (identifiant stable → nom affiché dans Medal)
const EVENTS = {
  kill: 'Élimination', headshot: 'Tir à la tête', knife: 'Élimination au couteau', double: 'Double élimination',
  triple: 'Triple élimination', quadra: 'Quadruple élimination', ace: 'ACE', clutch: 'Clutch', roundWin: 'Manche gagnée',
  matchWin: 'Victoire', brWin: 'Victoire royale', brTop3: 'Top 3', tourWin: 'Tournoi gagné', test: 'Test du launcher',
};

class MedalClips {
  constructor(opts = {}) { this.log = opts.log || (() => {}); this.last = new Map(); this.lastAny = 0; this.ok = null; }
  // envoie un événement ; quelques garde-fous pour ne pas inonder Medal (un même type toutes les 2 s au plus)
  send(id, { key, duration = 30 } = {}) {
    if (!EVENTS[id] || !key) return Promise.resolve({ ok: false, reason: key ? 'événement inconnu' : 'aucune clé Medal' });
    const now = Date.now();
    if (id !== 'test' && (now - (this.last.get(id) || 0) < 2000 || now - this.lastAny < 400)) return Promise.resolve({ ok: false, reason: 'trop rapproché' });
    this.last.set(id, now); this.lastAny = now;
    const body = JSON.stringify({ eventId: `eclipse_${id}`, eventName: EVENTS[id], clipOptions: { duration: Math.max(10, Math.min(120, duration | 0)) } });
    return new Promise(resolve => {
      const req = http.request({ host: '127.0.0.1', port: 12665, path: '/api/v1/event/invoke', method: 'POST', timeout: 1500,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), publicKey: String(key).slice(0, 200) } }, res => {
        res.resume(); this.ok = res.statusCode < 300;
        resolve({ ok: this.ok, status: res.statusCode, reason: this.ok ? '' : `Medal a répondu ${res.statusCode}` });
      });
      req.on('timeout', () => { req.destroy(); this.ok = false; resolve({ ok: false, reason: 'Medal ne répond pas (est-il lancé ?)' }); });
      req.on('error', () => { this.ok = false; resolve({ ok: false, reason: 'Medal n\'est pas lancé sur ce PC' }); });
      req.end(body);
    });
  }
}
module.exports = { MedalClips, MEDAL_EVENTS: EVENTS };
