export class Net {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.queue = [];
    this.joinMsg = null;
    this.retry = 0;
    this.closedByUs = false;
  }

  on(type, fn) { this.handlers.set(type, fn); return this; }

  connect(joinMsg) {
    this.joinMsg = joinMsg;
    this.closedByUs = false;
    const host = window.CHURCH_SERVER || location.host;
    const secure = window.CHURCH_SERVER ? !/^localhost|^127\./.test(host) : location.protocol === 'https:';
    const ws = new WebSocket(`${secure ? 'wss' : 'ws'}://${host}`);
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      ws.send(JSON.stringify(this.joinMsg));
      for (const m of this.queue) ws.send(m);
      this.queue.length = 0;
      this.handlers.get('_open')?.();
    };

    ws.onmessage = (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      const h = this.handlers.get(m.t);
      if (h) h(m);
    };

    ws.onclose = () => {
      if (this.closedByUs) return;
      this.handlers.get('_close')?.();
      this.retry = Math.min(this.retry + 1, 6);
      setTimeout(() => this.connect(this.joinMsg), 400 * this.retry);
    };

    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  send(obj) {
    const s = JSON.stringify(obj);
    if (this.ws && this.ws.readyState === 1) this.ws.send(s);
    else if (this.queue.length < 20) this.queue.push(s);
  }

  close() {
    this.closedByUs = true;
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}
