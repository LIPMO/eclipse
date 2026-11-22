export class Net {
  constructor() { this.handlers = new Map(); this.ws = null; this.queue = []; this.rtt = 0; }
  // mesure du ping (aller-retour) toutes les 2 secondes ; le serveur le redistribue pour le tableau des scores
  startPing() {
    if (this.pingTimer) return;
    this.on('pong', m => { if (typeof m.t === 'number') { const r = performance.now() - m.t; this.rtt = this.rtt ? this.rtt * 0.7 + r * 0.3 : r; } });
    this.pingTimer = setInterval(() => { if (this.open) this.send('ping', { t: performance.now(), rtt: Math.round(this.rtt) }); }, 2000);
  }
  connect() {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      this.ws = new WebSocket(`${proto}://${location.host}/ws`);
      this.ws.onopen = () => { for (const m of this.queue) this.ws.send(m); this.queue = []; this.emit('open', {}); resolve(); };
      this.ws.onerror = e => reject(e);
      this.ws.onclose = () => this.emit('close', {});
      this.ws.onmessage = ev => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        this.emit(msg.type, msg);
      };
    });
  }
  get open() { return this.ws && this.ws.readyState === 1; }
  send(type, data = {}) {
    const s = JSON.stringify({ type, ...data });
    if (this.open) this.ws.send(s); else this.queue.push(s);
  }
  on(type, fn) { if (!this.handlers.has(type)) this.handlers.set(type, new Set()); this.handlers.get(type).add(fn); return () => this.handlers.get(type).delete(fn); }
  emit(type, msg) { const hs = this.handlers.get(type); if (hs) for (const fn of hs) fn(msg); const all = this.handlers.get('*'); if (all) for (const fn of all) fn(msg); }
}
