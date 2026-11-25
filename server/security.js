// Outils de sécurité : limiteurs de débit, blocage après échecs, en-têtes HTTP, contrôle d'origine.
import crypto from 'node:crypto';

// Seau à jetons : `rate` jetons par seconde, réserve maximale `burst`.
export class Bucket {
  constructor(rate, burst) {
    this.rate = rate; this.burst = burst; this.map = new Map();
    setInterval(() => this.sweep(), 60000).unref();
  }
  take(key, n = 1) {
    const now = Date.now();
    let b = this.map.get(key);
    if (!b) { b = { t: this.burst, at: now }; this.map.set(key, b); }
    b.t = Math.min(this.burst, b.t + (now - b.at) / 1000 * this.rate);
    b.at = now;
    if (b.t < n) return false;
    b.t -= n;
    return true;
  }
  // vérifie qu'un jeton est disponible sans le consommer
  peek(key, n = 1) {
    const b = this.map.get(key); if (!b) return true;
    return Math.min(this.burst, b.t + (Date.now() - b.at) / 1000 * this.rate) >= n;
  }
  sweep() { const now = Date.now(); for (const [k, b] of this.map) if (now - b.at > 15 * 60000) this.map.delete(k); }
}

// Compteur d'échecs : au-delà de `max` échecs en `windowMs`, la clé est bloquée `blockMs`.
export class Strikes {
  constructor(max, windowMs, blockMs) {
    this.max = max; this.windowMs = windowMs; this.blockMs = blockMs; this.map = new Map();
    setInterval(() => { const now = Date.now(); for (const [k, v] of this.map) if (v.until < now && now - v.first > this.windowMs) this.map.delete(k); }, 60000).unref();
  }
  blocked(key) { const v = this.map.get(key); return v && v.until > Date.now() ? v.until - Date.now() : 0; }
  fail(key) {
    const now = Date.now();
    let v = this.map.get(key);
    if (!v || now - v.first > this.windowMs) { v = { n: 0, first: now, until: 0 }; this.map.set(key, v); }
    if (++v.n >= this.max) v.until = now + this.blockMs;
    return v.n;
  }
  reset(key) { this.map.delete(key); }
}

export const sha256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');

export function isHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https' || String(req.headers['cf-visitor'] || '').includes('https');
}

// En-têtes communs à toutes les réponses
export function baseHeaders(req, extra = {}) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Permitted-Cross-Domain-Policies': 'none',
    ...extra,
  };
  if (isHttps(req)) h['Strict-Transport-Security'] = 'max-age=31536000';
  return h;
}

// Politique de sécurité du contenu de la page du jeu (le hash autorise uniquement l'importmap intégrée)
export function gameCsp(importmapHash) {
  return [
    "default-src 'self'",
    `script-src 'self'${importmapHash ? ` 'sha256-${importmapHash}'` : ''} https://static.cloudflareinsights.com`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://cloudflareinsights.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// Une connexion WebSocket venant d'un navigateur doit provenir du même site (ou d'une origine autorisée)
export function originAllowed(req, allowed = []) {
  const origin = req.headers.origin;
  if (!origin) return true; // clients non navigateurs : contrôlés par les autres limites
  try {
    const o = new URL(origin);
    const host = String(req.headers.host || '').toLowerCase();
    if (o.host.toLowerCase() === host) return true;
    return allowed.some(a => a && (a === origin || a === o.host));
  } catch { return false; }
}

// Mots de passe trop courants refusés à l'inscription
export const COMMON_PASSWORDS = new Set([
  '12345678', '123456789', '1234567890', 'azertyuiop', 'azertyui', 'qwertyuiop', 'qwerty123', 'password', 'password1', 'motdepasse',
  'motdepasse1', '00000000', '11111111', '87654321', 'abcdefgh', 'iloveyou', 'soleil123', 'football', 'eclipse1', 'eclipse123',
  'valorant', 'minecraft', 'fortnite', 'jetaime1', 'doudou123', 'chocolat', 'bonjour1', 'admin123', 'administrateur',
]);
