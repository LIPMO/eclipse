// API pour le bot Discord (1.38) : /api/bot/…, protégée par une clé (Authorization: Bearer <clé>).
// La clé se règle dans Administration → Configuration (« Clé de l'API du bot »), ou par la variable BOT_API_KEY.
// Aucune adresse IP, aucun mot de passe, aucune donnée privée n'est renvoyée.
import crypto from 'node:crypto';

export function createBotApi(ctx) {
  const { accounts, admin, clients, rooms, social, tournaments, creators, publicCard, roomSummary, dailyShop, createRoom, roomCode, closeRoom, version } = ctx;
  const key = () => String(process.env.BOT_API_KEY || admin.state.config.botApiKey || '');
  const authOk = req => {
    const k = key(); if (k.length < 24) return false;
    const got = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const a = Buffer.from(got), b = Buffer.from(k);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const online = () => [...clients.values()].filter(c => c.name);
  const statusOf = key => { const c = online().find(c => c.account === key); return social.status(c).status; };

  const routes = {
    'GET status': () => {
      const all = [...rooms.values()];
      return { version, online: online().length, rooms: all.length, matches: all.filter(r => r.match).length, uptime: Math.round(process.uptime()), maintenance: !!admin.state.config.maintenance };
    },
    'GET player': q => {
      const u = accounts.get(q.name); if (!u) return [404, { error: 'Joueur introuvable' }];
      const k = accounts.key(u.name), card = publicCard(u, statusOf(k));
      return { ...card, agentStats: undefined, mapStats: undefined, history: card.history?.slice(0, 5), clan: u.clan ? accounts.data.clans?.[u.clan]?.tag || null : null, status: statusOf(k) };
    },
    'GET leaderboard': q => {
      const kind = ['level', 'elo', 'week', 'kills', 'wins'].includes(q.kind) ? q.kind : 'level';
      return { kind, rows: social.leaderboardRows(kind).slice(0, 15).map(r => ({ pos: r.pos, name: r.name, v: r.v, level: r.level, rank: r.rank })) };
    },
    'GET online': () => ({ count: online().length, players: online().filter(c => c.account).slice(0, 50).map(c => ({ name: c.name, status: social.status(c).status })) }),
    'GET rooms': () => ({ rooms: [...rooms.values()].filter(r => !r.private).map(roomSummary) }),
    'GET shop': () => { const d = dailyShop(); return { theme: d.theme, featured: d.featured, daily: d.daily, bundle: d.bundle }; },
    'GET tournaments': () => ({ list: tournaments.visible().map(t => ({ name: t.name, status: t.status, players: t.players?.length || 0, size: t.size, prize: t.prize, startAt: t.startAt || null })) }),
    'GET creator': q => { const u = creators.byCode(q.code); return u ? { ...creators.publicInfo(u), supporters: creators.supporters(u), earned: u.creator.earned || 0 } : [404, { error: 'Code introuvable' }]; },
    'GET news': () => { try { return { news: JSON.parse(require_news()).slice(0, 3) }; } catch { return { news: [] }; } },
    // crée un salon privé (sans hôte) : on le rejoint avec son code dans JOUER → Rejoindre avec un code. Fermé s'il reste vide 10 min.
    'POST room': body => {
      if ([...rooms.values()].filter(r => r.botRoom).length >= 10) return [429, { error: 'Trop de salons créés par le bot, réessaie plus tard.' }];
      const room = createRoom({ name: String(body.name || 'Salon Discord').replace(/[<>\u0000-\u001f]/g, '').slice(0, 28), mode: body.mode, mapId: body.map, difficulty: 'normal', bots: 0 });
      room.private = true; room.code = roomCode(); room.botRoom = true;
      const iv = setInterval(() => {
        if (!rooms.has(room.id)) return clearInterval(iv);
        const humans = [...room.members.values()].filter(m => !m.isBot).length;
        room.emptySince = humans ? 0 : room.emptySince || Date.now();
        if (room.emptySince && Date.now() - room.emptySince > 600000) { clearInterval(iv); closeRoom(room); }
      }, 30000);
      admin.log('admin', `Bot Discord : salon privé ${room.code} créé (${room.mode})`);
      return { code: room.code, mode: room.mode, map: room.mapId, max: room.maxPlayers };
    },
  };
  const require_news = () => ctx.fs.readFileSync(admin.newsPath(), 'utf8');

  return function handle(req, res) {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
    if (!authOk(req)) return send(401, { error: key().length < 24 ? 'API du bot désactivée (aucune clé configurée)' : 'Clé invalide' });
    const u = new URL(req.url, 'http://x'), name = u.pathname.replace(/^\/api\/bot\/?/, '').split('/')[0];
    const fn = routes[`${req.method} ${name}`];
    if (!fn) return send(404, { error: 'Route inconnue' });
    const run = body => {
      try { const out = fn(body); Array.isArray(out) ? send(out[0], out[1]) : send(200, out); }
      catch (e) { console.error('API bot', e); send(500, { error: 'Erreur serveur' }); }
    };
    if (req.method === 'GET') return run(Object.fromEntries(u.searchParams));
    let raw = ''; req.on('data', d => { raw += d; if (raw.length > 4096) req.destroy(); });
    req.on('end', () => { let b = {}; try { b = JSON.parse(raw || '{}'); } catch { /* */ } run(b); });
  };
}
