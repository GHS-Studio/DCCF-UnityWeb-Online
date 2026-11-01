// WebSocket 网络层：支持自定义服务端 IP 与端口
import { PROTOCOL_VERSION } from '../../shared/constants.js';

// 解析服务端地址，支持以下格式：
//   192.168.1.100        → ws://192.168.1.100:8080/ws
//   192.168.1.100:9090   → ws://192.168.1.100:9090/ws
//   example.com:8080     → ws://example.com:8080/ws
//   http://host:port     → ws://host:port/ws
//   ws://host:port/ws    → 原样使用
//   （空）                → 自动使用当前页面 host 或 127.0.0.1:8080
export function resolveServerUrl(input) {
  const raw = (input || '').trim();
  if (!raw) {
    if (typeof location !== 'undefined' && location.protocol.startsWith('http')) {
      const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
      return proto + location.host + '/ws';
    }
    return 'ws://127.0.0.1:8080/ws';
  }
  let s = raw.replace(/^http(s)?:\/\//i, '').replace(/^ws(s)?:\/\//i, '');
  if (s.endsWith('/')) s = s.slice(0, -1);
  if (s.includes('/ws')) return 'ws://' + s;
  // 如果没有端口，补默认 8080
  if (!s.includes(':')) s = s + ':8080';
  return 'ws://' + s + '/ws';
}

export class Net {
  constructor() {
    this.ws = null;
    this.ping = 0;
    this.handlers = {};
    this.lastPingTs = 0;
    this.pingTimer = null;
  }

  connect({ server, name, team }, handlers) {
    this.handlers = handlers || {};
    const url = resolveServerUrl(server);
    const ws = new WebSocket(url);
    this.ws = ws;
    this.url = url;

    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'join', name, team, protocol: PROTOCOL_VERSION }));
      this.pingTimer = setInterval(() => {
        if (ws.readyState !== 1) return;
        this.lastPingTs = performance.now();
        ws.send(JSON.stringify({ t: 'ping', ts: this.lastPingTs }));
      }, 2000);
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      switch (msg.t) {
        case 'welcome': this.handlers.onWelcome?.(msg); break;
        case 'snap': this.handlers.onSnapshot?.(msg); break;
        case 'error':
          this.handlers.onError?.(msg.msg || '连接错误');
          break;
        case 'pong':
          if (Number.isFinite(msg.ts)) this.ping = Math.round(performance.now() - msg.ts);
          break;
        default: break;
      }
    };

    ws.onerror = () => {
      this.handlers.onError?.('无法连接服务器，请检查地址与网络');
    };

    ws.onclose = () => {
      clearInterval(this.pingTimer);
      this.handlers.onClose?.();
    };
    return url;
  }

  send(msg) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  close() {
    clearInterval(this.pingTimer);
    if (this.ws) {
      try { this.ws.onclose = null; this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }
}
