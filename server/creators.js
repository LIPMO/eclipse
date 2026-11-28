// Codes créateur (1.35) : chaque joueur avec un compte peut créer son code. Un joueur qui soutient ce code
// dans la boutique reverse au créateur 50 % des Éclats qu'il dépense en skins (le prix ne change pas pour lui :
// les Éclats du créateur sont créés en plus). Personnalisation sur eclipseee.online/createur.
import { levelOf } from '../shared/progress.js';

export const CREATOR_SHARE = 0.5;
const CODE_RE = /^[A-Z0-9_-]{3,16}$/;
const RESERVED = /^(ADMIN|ADMINISTRATEUR|MODO|MODERATEUR|STAFF|SYSTEME|SYSTEM|SERVEUR|SERVER|ROOT|BOT|ECLIPSE|ECLIPSEEE|SUPPORT|OFFICIEL|OFFICIAL|NULL|UNDEFINED)$/;
const CODE_CHANGE_DAYS = 7;
const MIN_MATCHES = 3;            // un compte tout neuf (double compte) ne rapporte rien
const DAILY_CAP_DEFAULT = 5000;   // Éclats gagnés au plus par créateur et par jour
export const CREATOR_COLORS = ['#a259ff', '#ff4fd8', '#3ec5ff', '#3dffa8', '#ffd23f', '#ff8a3d', '#ff4d5e', '#ffffff'];
const LINKS = {
  youtube: { re: /^@?[A-Za-z0-9._-]{3,30}$/, url: h => `https://www.youtube.com/@${h.replace(/^@/, '')}` },
  twitch: { re: /^[A-Za-z0-9_]{3,25}$/, url: h => `https://www.twitch.tv/${h}` },
  tiktok: { re: /^@?[A-Za-z0-9._]{2,24}$/, url: h => `https://www.tiktok.com/@${h.replace(/^@/, '')}` },
};
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const str = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n);

export class Creators {
  constructor(ctx) { this.ctx = ctx; this.idx = null; }
  get A() { return this.ctx.accounts; }
  // index code → compte, reconstruit à la demande
  index() {
    if (!this.idx) { this.idx = new Map(); for (const [k, u] of Object.entries(this.A.data.users)) if (u?.creator?.code) this.idx.set(u.creator.code, k); }
    return this.idx;
  }
  byCode(code) {
    const k = this.index().get(String(code || '').trim().toUpperCase());
    const u = k ? this.A.get(k) : null;
    return u && u.creator && !u.creator.disabled ? u : null;
  }
  cap() { const v = Number(this.ctx.admin?.state?.config?.creatorDailyCap); return Number.isFinite(v) && v >= 0 ? v : DAILY_CAP_DEFAULT; }
  enabled() { return this.ctx.admin?.state?.config?.creatorCodes !== false; }

  checkCode(code, u) {
    if (!CODE_RE.test(code)) return 'Code invalide : 3 à 16 caractères (lettres, chiffres, _ ou -).';
    if (RESERVED.test(code)) return 'Ce code est réservé, choisis-en un autre.';
    const low = code.toLowerCase();
    if ((this.A.bannedNameWords || []).some(w => w && low.includes(w))) return 'Ce code contient un mot interdit.';
    const owner = this.index().get(code);
    if (owner && owner !== this.A.key(u.name)) return 'Ce code est déjà pris.';
    // pas de code au nom d'un autre joueur (usurpation)
    if (this.A.exists(code) && this.A.key(code) !== this.A.key(u.name)) return 'Ce code est le pseudo d\'un autre joueur.';
    return null;
  }
  // deux comptes qui se sont connectés depuis la même adresse ne peuvent pas se soutenir (doubles comptes)
  sameOwner(a, b) {
    // adresses locales (tunnel, tests) : pas significatives, ignorées
    const real = ip => ip && !/^(127\.|::1$|::ffff:127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|unknown)/.test(ip);
    const ia = new Set((a.ips || []).map(x => x.ip).filter(real));
    return (b.ips || []).some(x => ia.has(x.ip));
  }

  publicInfo(u) {
    const c = u.creator;
    return { code: c.code, name: u.name, color: c.color || CREATOR_COLORS[0], slogan: c.slogan || '', level: levelOf(u.xp || 0),
      links: Object.fromEntries(Object.entries(c.links || {}).filter(([k, h]) => LINKS[k] && h).map(([k, h]) => [k, { handle: h, url: LINKS[k].url(h) }])) };
  }
  supporters(u) {
    const me = this.A.key(u.name); let n = 0;
    for (const x of Object.values(this.A.data.users)) if (x?.support?.key === me) n++;
    return n;
  }
  dashboard(u) {
    const c = u.creator;
    if (!c) return { type: 'creator', creator: null, share: CREATOR_SHARE * 100, colors: CREATOR_COLORS, enabled: this.enabled(), name: u.name, minMatches: MIN_MATCHES };
    const days = [];
    for (let i = 29; i >= 0; i--) { const d = day(Date.now() - i * 86400e3); days.push([d, c.daily?.[d] || 0]); }
    const nextChange = (c.codeChangedAt || 0) + CODE_CHANGE_DAYS * 86400e3;
    return { type: 'creator', name: u.name, share: CREATOR_SHARE * 100, colors: CREATOR_COLORS, enabled: this.enabled(), minMatches: MIN_MATCHES, cap: this.cap(),
      creator: { ...this.publicInfo(u), created: c.created, disabled: !!c.disabled, earned: c.earned || 0, sales: c.sales || 0, spent: c.spent || 0,
        today: c.daily?.[day()] || 0, week: days.slice(-7).reduce((t, d) => t + d[1], 0), days, recent: (c.recent || []).slice(-25).reverse(),
        supporters: this.supporters(u), canChangeAt: Date.now() < nextChange ? nextChange : 0, rawLinks: c.links || {} } };
  }
  supportInfo(u) {
    const s = u.support; const cu = s?.key ? this.A.get(s.key) : null;
    return { type: 'creatorSupport', support: cu?.creator && !cu.creator.disabled ? { ...this.publicInfo(cu), since: s.at } : null, share: CREATOR_SHARE * 100, enabled: this.enabled() };
  }

  // appelé après chaque achat payé en Éclats (skin, boutique du jour, pack)
  payout(buyer, amount, what) {
    if (!this.enabled() || !buyer?.support?.key || !(amount > 0)) return 0;
    const cu = this.A.get(buyer.support.key);
    if (!cu?.creator || cu.creator.disabled || cu === buyer) return 0;
    if ((buyer.stats?.matches || 0) < MIN_MATCHES || this.sameOwner(buyer, cu)) return 0;
    const c = cu.creator, d = day();
    c.daily ||= {};
    const room = Math.max(0, this.cap() - (c.daily[d] || 0));
    const gain = Math.min(room, Math.floor(amount * CREATOR_SHARE));
    c.sales = (c.sales || 0) + 1; c.spent = (c.spent || 0) + amount;
    if (gain > 0) {
      cu.eclats = (cu.eclats || 0) + gain;
      c.earned = (c.earned || 0) + gain;
      c.daily[d] = (c.daily[d] || 0) + gain;
    }
    for (const k of Object.keys(c.daily)) if (k < day(Date.now() - 40 * 86400e3)) delete c.daily[k];
    (c.recent ||= []).push({ t: Date.now(), item: str(what, 40), amount, gain });
    if (c.recent.length > 40) c.recent.splice(0, c.recent.length - 40);
    this.A.save();
    this.ctx.admin?.economy?.('earn', gain);
    this.ctx.admin?.log?.('economie', `Code créateur ${c.code} : ${buyer.name} dépense ${amount} Éclats → +${gain} pour ${cu.name}`);
    const cc = this.clientOf(this.A.key(cu.name));
    if (cc && gain > 0) {
      this.ctx.send(cc.id, { type: 'profile', profile: this.A.publicProfile(cu) });
      this.ctx.send(cc.id, { type: 'creatorSale', gain, code: c.code });
    }
    return gain;
  }
  clientOf(key) { for (const c of this.ctx.clients.values()) if (c.account === key && c.name) return c; return null; }

  // ---------- messages ----------
  handle(c, msg) {
    const fn = this['m_' + msg.type];
    if (!fn) return false;
    const key = c.account || c.creatorKey;
    const u = key ? this.A.get(key) : null;
    if (!u) { this.ctx.send(c.id, { type: 'creatorError', text: 'Connecte-toi avec un compte pour utiliser les codes créateur.' }); return true; }
    fn.call(this, c, msg, u);
    return true;
  }
  err(c, text) { this.ctx.send(c.id, { type: 'creatorError', text }); }

  m_creatorGet(c, msg, u) { this.ctx.send(c.id, this.dashboard(u)); }
  // création ou modification du code et de la page
  m_creatorSave(c, msg, u) {
    if (!this.enabled()) return this.err(c, 'Les codes créateur sont désactivés pour le moment.');
    const isNew = !u.creator;
    if (isNew && msg.code == null) return this.err(c, 'Choisis un code.');
    const cr = u.creator || { created: Date.now(), earned: 0, sales: 0, spent: 0, daily: {}, recent: [], color: CREATOR_COLORS[0], slogan: '', links: {} };
    if (cr.disabled) return this.err(c, 'Ton code créateur a été désactivé par l\'équipe ECLIPSE.');
    if (msg.code != null) {
      const code = String(msg.code).trim().toUpperCase();
      if (code !== cr.code) {
        const bad = this.checkCode(code, u); if (bad) return this.err(c, bad);
        if (!isNew && Date.now() < (cr.codeChangedAt || 0) + CODE_CHANGE_DAYS * 86400e3) return this.err(c, `Tu pourras changer de code le ${new Date((cr.codeChangedAt || 0) + CODE_CHANGE_DAYS * 86400e3).toLocaleDateString('fr-FR')}.`);
        if (cr.code) this.index().delete(cr.code);
        cr.codeChangedAt = Date.now();
        cr.code = code; this.index().set(code, this.A.key(u.name));
      }
    }
    if (msg.color != null) { if (!CREATOR_COLORS.includes(msg.color)) return this.err(c, 'Couleur inconnue.'); cr.color = msg.color; }
    if (msg.slogan != null) {
      const s = str(msg.slogan, 90);
      const low = s.toLowerCase();
      if ((this.A.bannedNameWords || []).some(w => w && low.includes(w))) return this.err(c, 'Ton message contient un mot interdit.');
      if (/https?:|www\.|discord\.gg/i.test(s)) return this.err(c, 'Pas de lien dans le message : utilise les champs YouTube, Twitch et TikTok.');
      cr.slogan = s;
    }
    if (msg.links && typeof msg.links === 'object') {
      const links = {};
      for (const k of Object.keys(LINKS)) {
        const h = str(msg.links[k], 31).replace(/^https?:\/\/\S*\//, '');
        if (!h) continue;
        if (!LINKS[k].re.test(h)) return this.err(c, `Nom de chaîne ${k} invalide.`);
        links[k] = h;
      }
      cr.links = links;
    }
    u.creator = cr; this.A.save();
    if (isNew) this.ctx.admin?.log?.('economie', `Nouveau code créateur : ${cr.code} (${u.name})`);
    this.ctx.send(c.id, this.dashboard(u));
    this.ctx.send(c.id, { type: 'creatorSaved', created: isNew });
  }
  // aperçu d'un code avant de le soutenir
  m_creatorLookup(c, msg, u) {
    const cu = this.byCode(msg.code);
    this.ctx.send(c.id, { type: 'creatorLookup', code: String(msg.code || '').toUpperCase().slice(0, 16), creator: cu ? this.publicInfo(cu) : null });
  }
  m_creatorSupportGet(c, msg, u) { this.ctx.send(c.id, this.supportInfo(u)); }
  m_creatorSupport(c, msg, u) {
    if (msg.code === null || msg.code === '') {
      if (u.support) { delete u.support; this.A.save(); }
      this.ctx.send(c.id, this.supportInfo(u)); return;
    }
    if (!this.enabled()) return this.err(c, 'Les codes créateur sont désactivés pour le moment.');
    const cu = this.byCode(msg.code);
    if (!cu) return this.err(c, 'Code créateur introuvable.');
    if (cu === u) return this.err(c, 'Tu ne peux pas utiliser ton propre code créateur.');
    if (this.sameOwner(u, cu)) return this.err(c, 'Ce code appartient à un compte qui joue depuis ta connexion : impossible de le soutenir.');
    u.support = { key: this.A.key(cu.name), at: Date.now() }; this.A.save();
    this.ctx.send(c.id, this.supportInfo(u));
  }

  // ---------- administration ----------
  list() {
    return Object.values(this.A.data.users).filter(u => u?.creator?.code).map(u => ({ code: u.creator.code, name: u.name, earned: u.creator.earned || 0, sales: u.creator.sales || 0,
      today: u.creator.daily?.[day()] || 0, supporters: this.supporters(u), disabled: !!u.creator.disabled, created: u.creator.created })).sort((a, b) => b.earned - a.earned);
  }
  setDisabled(code, off) {
    const k = this.index().get(String(code || '').toUpperCase()); const u = k && this.A.get(k);
    if (!u?.creator) return null;
    u.creator.disabled = !!off; this.A.save();
    return u;
  }
}
