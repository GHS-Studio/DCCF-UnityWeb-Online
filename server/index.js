// 运输船服务端：HTTP 静态资源 + WebSocket 游戏协议
// 端口可通过以下方式自定义（优先级从高到低）：
//   1. 命令行参数：node server/index.js --port 9090
//   2. 环境变量：PORT=9090 node server/index.js
//   3. 默认端口：8080
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { PROTOCOL_VERSION } from '../shared/constants.js';
import { MAP } from '../shared/map.js';

// 兼容 ESM（import.meta.url）与 CJS bundle（__filename）两种环境
const _url = import.meta.url;
const __filename = _url && _url.startsWith('file:') ? fileURLToPath(_url) : _url;
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// 兼容 pkg 打包 / Electron / 源码运行：依次尝试多个客户端目录
let DIST;
{
  const candidates = [
    path.join(ROOT, 'dist', 'client'),
    path.join(ROOT, 'client'),
    path.join(__dirname, 'client'), // Electron：server.bundle.cjs 与 client/ 同级
    path.join(path.dirname(process.execPath), 'client'),
  ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) { DIST = c; break; } } catch {}
  }
  DIST = DIST || candidates[0];
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.obj': 'text/plain',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// 读取 config.ini 中的端口配置（与脚本/EXE 同目录）
function readConfigPort() {
  const dirs = [__dirname];
  try { dirs.push(path.dirname(process.execPath)); } catch {}
  for (const dir of dirs) {
    try {
      const txt = fs.readFileSync(path.join(dir, 'config.ini'), 'utf8').replace(/^\uFEFF/, '');
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*(?:port|端口)\s*[=:：]\s*(\d{1,5})\s*(?:[;#].*)?$/i);
        if (m) {
          const p = parseInt(m[1], 10);
          if (p > 0 && p < 65536) return p;
        }
      }
    } catch { /* 无配置文件则跳过 */ }
  }
  return null;
}

function parsePort() {
  // 1. 命令行 --port
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '--port' || argv[i] === '-p') && argv[i + 1]) {
      const p = parseInt(argv[i + 1], 10);
      if (p > 0 && p < 65536) return p;
    }
    const m = argv[i].match(/^--port=(\d+)$/);
    if (m) {
      const p = parseInt(m[1], 10);
      if (p > 0 && p < 65536) return p;
    }
  }
  // 2. 环境变量 PORT
  if (process.env.PORT) {
    const p = parseInt(process.env.PORT, 10);
    if (p > 0 && p < 65536) return p;
  }
  // 3. config.ini
  const fromIni = readConfigPort();
  if (fromIni) return fromIni;
  // 4. 默认
  return 8080;
}

function getLocalIPs() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

export function startServer({ port, bots = 6, maxTotal = 10 } = {}) {
  const listenPort = port || parsePort();
  const room = new Room({ bots, maxTotal });

  const server = http.createServer((req, res) => {
    let url = req.url.split('?')[0];
    try { url = decodeURIComponent(url); } catch { /* 保留原样 */ }
    if (url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, map: MAP.name, players: room.humanCount }));
      return;
    }
    if (url === '/api/info') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ protocol: PROTOCOL_VERSION, map: MAP.name, bots, maxTotal }));
      return;
    }
    let filePath = path.join(DIST, url === '/' ? 'index.html' : url);
    if (!filePath.startsWith(DIST)) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404); res.end('Not Found'); return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      });
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let playerId = null;
    let alive = true;

    const sendWelcome = (info) => {
      ws.send(JSON.stringify({
        t: 'welcome',
        id: info.id, team: info.team,
        map: MAP.name, spawn: info.spawn,
        protocol: PROTOCOL_VERSION,
        teamInfo: MAP.spawns ? undefined : undefined,
        scores: [...room.scores], time: room.timeLeft,
        players: room.snapshot().players,
      }));
    };

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      switch (msg.t) {
        case 'join': {
          if (playerId) return;
          if (msg.protocol !== PROTOCOL_VERSION) {
            ws.send(JSON.stringify({ t: 'error', msg: '协议版本不匹配' }));
            return;
          }
          const info = room.join(msg.name || '玩家', msg.team ?? -1);
          if (!info) {
            ws.send(JSON.stringify({ t: 'error', msg: '房间已满' }));
            return;
          }
          playerId = info.id;
          sendWelcome(info);
          break;
        }
        case 'input':
          if (playerId) room.handleInput(playerId, msg);
          break;
        case 'ping':
          ws.send(JSON.stringify({ t: 'pong', ts: msg.ts }));
          break;
      }
    });

    ws.on('close', () => {
      alive = false;
      if (playerId) room.leave(playerId);
    });

    // 快照推送 20Hz
    const snapTimer = setInterval(() => {
      if (!alive) return;
      ws.send(JSON.stringify(room.snapshot()));
    }, 1000 / 20);

    ws.on('close', () => clearInterval(snapTimer));
  });

  server.listen(listenPort, () => {
    const ips = getLocalIPs();
    console.log(`[server] 运输船服务端已启动: http://127.0.0.1:${listenPort}`);
    if (ips.length) console.log(`[server] 局域网地址: http://${ips[0]}:${listenPort}  (ws://${ips[0]}:${listenPort}/ws)`);
    console.log(`[server] 端口可通过 --port <端口> 或 PORT 环境变量自定义`);
  });

  return {
    server, room,
    close() {
      return new Promise((res) => {
        wss.close();
        server.close(() => res());
      });
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const bots = parseInt(process.env.BOTS || '6', 10);
  startServer({ bots });
}
