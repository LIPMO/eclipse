// Connecteur MCP (1.22) : permet à Claude (claude.ai → Connecteurs) de consulter l'état du serveur
// et de lancer une mise à jour. Protocole MCP « Streamable HTTP » réduit à l'essentiel : requêtes JSON-RPC en POST,
// réponses JSON. L'accès se fait par une adresse secrète /mcp/<jeton>, générée par le propriétaire dans
// l'administration (Système → Connecteur Claude). Seule l'empreinte du jeton est enregistrée.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_BODY = 100000;
const hash = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const noIp = s => String(s).replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[IP]').replace(/\b(?:[0-9a-f]{1,4}:){3,7}[0-9a-f]{1,4}\b/gi, '[IP]');

const TOOLS = [
  { name: 'resume', description: 'À utiliser en premier : résumé du serveur en un appel (version, état de santé, joueurs, alertes, mise à jour, signalements en attente).', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'sante', description: 'Contrôles de santé du serveur : écriture des données, sauvegardes, mémoire, réseau, intégrité des fichiers, etc. Renvoie chaque point en ok, attention ou problème.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'alertes', description: 'Problèmes récents : erreurs serveur, alertes de sécurité (connexions refusées, adresses secrètes invalides), fichiers modifiés, ralentissements.', inputSchema: { type: 'object', properties: { nombre: { type: 'integer', minimum: 1, maximum: 100, description: 'Nombre d\'alertes par catégorie (20 par défaut)' } } }, annotations: { readOnlyHint: true } },
  { name: 'statut_serveur', description: 'Version du jeu en ligne, empreinte de build, temps depuis le démarrage, mémoire, joueurs connectés, parties en cours, comptes, alertes d\'intégrité et maintenance.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'mise_a_jour', description: 'État de la mise à jour automatique : commit installé, dernier commit sur GitHub, dernière vérification, demande en attente.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'joueurs_en_ligne', description: 'Liste des joueurs connectés (pseudo, compte ou invité, où ils sont). Aucune adresse IP.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'salons', description: 'Salons ouverts et parties en cours (mode, carte, joueurs, état).', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'journaux', description: 'Derniers événements du journal du serveur (adresses IP masquées).', inputSchema: { type: 'object', properties: { nombre: { type: 'integer', minimum: 1, maximum: 200, description: 'Nombre d\'événements (50 par défaut)' }, type: { type: 'string', description: 'Filtrer par catégorie : securite, admin, partie, compte, chat, systeme…' } } }, annotations: { readOnlyHint: true } },
  { name: 'signalements', description: 'Signalements de joueurs en attente de traitement.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'statistiques', description: 'Statistiques de la journée et records (pic de joueurs, parties, inscriptions).', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  { name: 'nouveautes', description: 'Les dernières notes de version affichées aux joueurs.', inputSchema: { type: 'object', properties: { nombre: { type: 'integer', minimum: 1, maximum: 10 } } }, annotations: { readOnlyHint: true } },
  { name: 'lancer_mise_a_jour', description: 'Demande au serveur d\'installer tout de suite la dernière version de GitHub. Sans « forcer », la mise à jour attend la fin des parties en cours. Nécessite le service de mise à jour à distance (scripts/installer-maj-auto.sh).', inputSchema: { type: 'object', properties: { forcer: { type: 'boolean', description: 'Mettre à jour même si des parties sont en cours (les joueurs sont déconnectés quelques secondes)' } } }, annotations: { readOnlyHint: false, destructiveHint: false } },
];

export class Mcp {
  constructor(ctx) { this.ctx = ctx; } // { admin, accounts, clients, rooms, social, version, build, integrityAlerts, newsPath }
  get A() { return this.ctx.admin; }
  get st() { return this.A.state.mcp || null; }

  // ---- administration ----
  info() { const m = this.st; return { enabled: !!m?.hash, created: m?.created || 0, lastUsed: m?.lastUsed || 0, calls: m?.calls || 0, by: m?.by || null }; }
  generate(by) {
    const token = crypto.randomBytes(24).toString('base64url');
    this.A.state.mcp = { hash: hash(token), created: Date.now(), by, lastUsed: 0, calls: 0 };
    this.A.save();
    return token;
  }
  disable() { this.A.state.mcp = null; this.A.save(); }

  // ---- HTTP ----
  async handle(req, res, token) {
    const send = (code, obj, extra = {}) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra }); res.end(obj === undefined ? undefined : JSON.stringify(obj)); };
    const m = this.st;
    const ok = m?.hash && typeof token === 'string' && token.length >= 20 && token.length <= 100 && crypto.timingSafeEqual(Buffer.from(hash(token)), Buffer.from(m.hash));
    if (!ok) {
      this.A.log('securite', 'Connecteur MCP : adresse secrète invalide');
      await new Promise(r => setTimeout(r, 400));
      return send(404, { error: 'Introuvable' });
    }
    if (req.method !== 'POST') return send(405, { error: 'POST uniquement' }, { Allow: 'POST' });
    let body;
    try {
      body = await new Promise((resolve, reject) => {
        let size = 0; const chunks = [];
        req.on('data', ch => { size += ch.length; if (size > MAX_BODY) { reject(new Error('trop gros')); req.destroy(); } else chunks.push(ch); });
        req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch { reject(new Error('json')); } });
        req.on('error', reject);
      });
    } catch { return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Requête JSON invalide' } }); }
    const list = Array.isArray(body) ? body : [body];
    const out = [];
    for (const msg of list.slice(0, 20)) { const r = await this.rpc(msg); if (r) out.push(r); }
    m.lastUsed = Date.now();
    if (!out.length) { res.writeHead(202, { 'Cache-Control': 'no-store' }); res.end(); return; }
    send(200, Array.isArray(body) ? out : out[0]);
  }

  async rpc(msg) {
    if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Requête invalide' } };
    const isNote = msg.id === undefined || msg.id === null;
    const reply = result => (isNote ? null : { jsonrpc: '2.0', id: msg.id, result });
    const error = (code, message) => (isNote ? null : { jsonrpc: '2.0', id: msg.id, error: { code, message } });
    switch (msg.method) {
      case 'initialize': {
        const asked = msg.params?.protocolVersion;
        return reply({ protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'eclipse-serveur', title: 'Serveur ECLIPSE', version: this.ctx.version },
          instructions: 'Serveur du jeu ECLIPSE. Commence par resume (vue d\'ensemble). Puis : sante et alertes pour les problèmes, mise_a_jour et lancer_mise_a_jour pour les versions, joueurs_en_ligne, salons, journaux, signalements, statistiques, nouveautes. Les adresses IP ne sont jamais affichées.' });
      }
      case 'ping': return reply({});
      case 'tools/list': return reply({ tools: TOOLS });
      case 'tools/call': {
        const name = msg.params?.name, args = msg.params?.arguments || {};
        if (!TOOLS.some(t => t.name === name)) return error(-32602, `Outil inconnu : ${name}`);
        this.st.calls = (this.st.calls || 0) + 1;
        try {
          const data = await this.call(name, args);
          return reply({ content: [{ type: 'text', text: name === 'resume' ? this.summaryText(data) : JSON.stringify(data, null, 2) }], structuredContent: data });
        } catch (e) {
          return reply({ content: [{ type: 'text', text: e.message || String(e) }], isError: true });
        }
      }
      default:
        if (msg.method.startsWith('notifications/')) return null;
        return error(-32601, `Méthode inconnue : ${msg.method}`);
    }
  }

  // résumé en français, lisible directement dans la conversation
  summaryText(d) {
    const l = [`ECLIPSE ${d.version} — santé : ${d.sante === 'ok' ? 'OK' : d.sante === 'warn' ? 'attention' : 'problème'}`,
      `Joueurs : ${d.joueurs_connectes} connecté(s), ${d.en_partie} en partie, ${d.parties_en_cours} partie(s) en cours`,
      `Mise à jour : ${d.a_jour === true ? 'à jour' : d.a_jour === false ? 'pas à jour' : 'état inconnu'}`,
      `Signalements en attente : ${d.signalements_en_attente}`];
    l.push(d.besoin_d_action ? 'À regarder :\n- ' + d.a_surveiller.join('\n- ') : 'Rien à signaler.');
    return l.join('\n');
  }

  async call(name, a) {
    const { admin, accounts, clients, rooms, social } = this.ctx;
    const online = admin.onlineClients();
    if (name === 'sante') {
      const r = admin.runAction('health');
      return { global: r.overall, points: r.checks.map(c => ({ point: c.name, etat: c.state, detail: c.detail || null })) };
    }
    if (name === 'alertes') {
      const n = Math.max(1, Math.min(100, parseInt(a.nombre, 10) || 20));
      const errs = (admin.errors || []).slice(-n).reverse().map(e => ({ le: new Date(e.t).toISOString(), texte: noIp(e.text) }));
      const secu = admin.logs.filter(l => l.type === 'securite').slice(-n).reverse().map(l => ({ le: new Date(l.t).toISOString(), texte: noIp(l.text) }));
      return { erreurs_serveur: errs, securite: secu, integrite: this.ctx.integrityAlerts.slice(0, n), ralentissements: admin.slowSamples >= 3 ? 'oui, le serveur est lent en ce moment' : 'non' };
    }
    if (name === 'resume') {
      const h = admin.runAction('health'), up = admin.updInfo(), s = up.status || {};
      const alertes = (admin.errors || []).length + this.ctx.integrityAlerts.length;
      const secu = admin.logs.filter(l => l.type === 'securite' && Date.now() - l.t < 86400000).length;
      const enLigne = admin.onlineClients().length;
      const attention = [];
      if (h.overall !== 'ok') attention.push(...h.checks.filter(c => c.state !== 'ok').map(c => `${c.name} : ${c.detail || c.state}`));
      if (this.ctx.integrityAlerts.length) attention.push(`${this.ctx.integrityAlerts.length} alerte(s) d'intégrité`);
      if (!up.installed) attention.push('service de mise à jour à distance non installé');
      else if (s.deployed && s.latest && s.deployed !== s.latest) attention.push('une version plus récente existe sur GitHub');
      if (secu) attention.push(`${secu} événement(s) de sécurité sur 24 h`);
      return {
        version: this.ctx.version, build: this.ctx.build, sante: h.overall, joueurs_connectes: enLigne, en_partie: admin.inGameCount(), parties_en_cours: [...rooms.values()].filter(r => r.match).length,
        a_jour: s.deployed && s.latest ? s.deployed === s.latest : null, signalements_en_attente: admin.state.reports.filter(r => !r.status || r.status === 'open' || r.status === 'pending').length,
        alertes_recentes: alertes, securite_24h: secu, a_surveiller: attention, besoin_d_action: attention.length > 0,
      };
    }
    if (name === 'statut_serveur') {
      const mem = process.memoryUsage(), users = Object.values(accounts.data.users);
      return {
        version: this.ctx.version, build: this.ctx.build, demarre_depuis_min: Math.round(process.uptime() / 60), node: process.version,
        memoire_mo: Math.round(mem.rss / 1048576), joueurs_connectes: online.length, invites: online.filter(c => !c.account).length, en_partie: admin.inGameCount(),
        salons: rooms.size, parties_en_cours: [...rooms.values()].filter(r => r.match).length, comptes: users.length,
        maintenance: !!admin.state.config.maintenance, alertes_integrite: this.ctx.integrityAlerts.slice(0, 20),
      };
    }
    if (name === 'mise_a_jour') {
      const u = admin.updInfo(), s = u.status || {};
      return {
        version_en_ligne: this.ctx.version, build: this.ctx.build, service_installe: u.installed,
        etat: s.state || null, message: s.msg || null, derniere_verification: s.at ? new Date(s.at).toISOString() : null,
        commit_installe: s.deployed || null, dernier_commit_github: s.latest || null, message_dernier_commit: s.latestMsg || null,
        a_jour: s.deployed && s.latest ? s.deployed === s.latest : null,
        demande_en_attente: u.pending ? { par: u.pending.by, le: new Date(u.pending.at).toISOString(), forcee: !!u.pending.force } : null,
        conseil: u.installed ? null : 'Le service de mise à jour à distance n\'est pas installé : lancer une fois « sudo bash /opt/eclipse-git/scripts/installer-maj-auto.sh » sur le serveur. Les mises à jour automatiques toutes les 5 minutes peuvent fonctionner sans lui.',
      };
    }
    if (name === 'joueurs_en_ligne') {
      return { total: online.length, joueurs: online.slice(0, 200).map(c => { const s = social.status(c); return { pseudo: c.name, compte: !!c.account, ou: s.status, salon: s.roomName || null, connecte_depuis_min: Math.round((Date.now() - c.since) / 60000) }; }) };
    }
    if (name === 'salons') {
      return { total: rooms.size, salons: [...rooms.values()].slice(0, 100).map(r => ({ nom: r.name, mode: r.mode, carte: r.mapId, joueurs: [...r.members.values()].filter(m => !m.isBot).length, bots: [...r.members.values()].filter(m => m.isBot).length, max: r.maxPlayers, etat: r.state, prive: !!r.private, perso: !!r.custom })) };
    }
    if (name === 'journaux') {
      const n = Math.max(1, Math.min(200, parseInt(a.nombre, 10) || 50));
      const type = typeof a.type === 'string' ? a.type.slice(0, 20) : '';
      const rows = admin.logs.filter(l => !type || l.type === type).slice(-n);
      return { evenements: rows.map(l => ({ le: new Date(l.t).toISOString(), type: l.type, texte: noIp(l.text) })) };
    }
    if (name === 'signalements') {
      const open = admin.state.reports.filter(r => !r.status || r.status === 'open' || r.status === 'pending');
      return { en_attente: open.length, derniers: open.slice(0, 15).map(r => ({ le: new Date(r.t || r.at || 0).toISOString(), contre: r.target, par: r.from || r.by || null, motif: r.category, texte: noIp(r.text || r.reason || '').slice(0, 200) })) };
    }
    if (name === 'statistiques') {
      const s = admin.state.stats || {}, day = new Date().toISOString().slice(0, 10);
      const top = o => Object.entries(o || {}).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([k, v]) => ({ nom: k, n: v }));
      const last7 = Object.keys(s.matchesByDay || {}).sort().slice(-7).map(d => ({ jour: d, parties: s.matchesByDay[d] || 0, inscriptions: s.regsByDay?.[d] || 0 }));
      return {
        aujourdhui: { parties: s.matchesByDay?.[day] || 0, inscriptions: s.regsByDay?.[day] || 0, eclats_gagnes: s.earnByDay?.[day] || 0, eclats_depenses: s.spendByDay?.[day] || 0 },
        record_joueurs: { joueurs: s.peak || 0, le: s.peakAt ? new Date(s.peakAt).toISOString() : null },
        total: { parties: s.matches || 0, eliminations: s.kills || 0, tirs_tete: s.headshots || 0 },
        sept_derniers_jours: last7, modes_preferes: top(s.modes), cartes_preferees: top(s.maps), agents_preferes: top(s.agents), armes_preferees: top(s.weapons),
      };
    }
    if (name === 'nouveautes') {
      const n = Math.max(1, Math.min(10, parseInt(a.nombre, 10) || 3));
      let news = []; try { news = JSON.parse(fs.readFileSync(this.ctx.newsPath(), 'utf8')); } catch { /* */ }
      return { versions: news.slice(0, n) };
    }
    if (name === 'lancer_mise_a_jour') {
      const u = admin.updInfo();
      if (!u.installed) throw new Error('Le service de mise à jour à distance n\'est pas installé sur le serveur : lancer une fois « sudo bash /opt/eclipse-git/scripts/installer-maj-auto.sh ».');
      if (u.pending) throw new Error('Une demande de mise à jour est déjà en attente.');
      const dir = path.join(admin.ctx.dataDir, 'maj');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'demande'), JSON.stringify({ at: Date.now(), by: 'Claude (connecteur)', force: !!a.forcer }));
      admin.audit('Claude (connecteur)', 'Mise à jour à distance demandée', a.forcer ? 'forcée' : '');
      return { ok: true, message: a.forcer ? 'Mise à jour forcée demandée : le serveur l\'installe dans quelques secondes.' : 'Mise à jour demandée : elle sera installée dès qu\'aucune partie n\'est en cours.' };
    }
    throw new Error('Outil inconnu');
  }
}
