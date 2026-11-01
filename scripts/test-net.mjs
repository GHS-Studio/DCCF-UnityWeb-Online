// 网络自检：启动服务端 + 两个无头客户端，验证加入、快照、射击事件、静态资源
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { buildClient } from './build-client.mjs';

const results = [];
function check(name, ok, extra = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function connectPlayer(port, name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const client = { ws, name, welcome: null, snaps: [], shots: 0, hits: 0, kills: 0 };
    const timer = setTimeout(() => reject(new Error('welcome timeout: ' + name)), 8000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'join', name, team: -1, protocol: 1 }));
    });
    ws.on('message', (raw) => {
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.t === 'welcome') {
        client.welcome = m;
        clearTimeout(timer);
        resolve(client);
      } else if (m.t === 'snap') {
        client.snaps.push(m);
        if (m.ev) {
          for (const ev of m.ev) {
            if (ev.t === 'shot') client.shots++;
            else if (ev.t === 'hit') client.hits++;
            else if (ev.t === 'kill') client.kills++;
          }
        }
      } else if (m.t === 'error') {
        clearTimeout(timer);
        reject(new Error(m.msg));
      }
    });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
    client.close = () => ws.close();
  });
}

async function main() {
  await buildClient({ minify: false });

  const srv = startServer({ port: 0, bots: 6, maxTotal: 10 });
  await new Promise((r) => srv.server.once('listening', r));
  const port = srv.server.address().port;
  console.log(`\n[test] 服务端端口 ${port}\n`);

  const base = `http://127.0.0.1:${port}`;
  for (const p of ['/healthz', '/api/info', '/', '/bundle.js', '/style.css']) {
    const res = await fetch(base + p);
    check(`HTTP ${p}`, res.status === 200, `status=${res.status}`);
  }
  const info = await (await fetch(base + '/api/info')).json();
  check('协议与地图信息', info.protocol === 1 && info.map === 'transport-ship-1');

  const a = await connectPlayer(port, 'TestA');
  const b = await connectPlayer(port, 'TestB');
  check('玩家加入收到 welcome', !!a.welcome && !!b.welcome, `id=${a.welcome?.id}/${b.welcome?.id}`);
  check('欢迎包包含地图与出生点', a.welcome.map === 'transport-ship-1' && Number.isFinite(a.welcome.spawn?.x));

  const playersSeen = new Set();
  const botsSeen = new Set();
  const start = Date.now();
  let lastInput = 0;
  let seq = 0;
  let pingOk = false;
  a.ws.on('message', (raw) => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.t === 'pong') pingOk = true;
    } catch { /* ignore */ }
  });

  while (Date.now() - start < 4500) {
    const snap = a.snaps[a.snaps.length - 1];
    if (snap) {
      for (const p of snap.players) {
        if (p.bt) botsSeen.add(p.i); else playersSeen.add(p.i);
      }
    }
    if (Date.now() - lastInput > 50) {
      lastInput = Date.now();
      const me = snap?.players.find((p) => p.i === a.welcome.id);
      const target = snap?.players.find((p) => p.al === 1 && p.tm !== me?.tm);
      let yaw = 0, pitch = 0;
      if (me && target) {
        yaw = Math.atan2(target.x - me.x, target.z - me.z);
        pitch = Math.atan2(target.y + 1.2 - (me.y + 1.62), Math.hypot(target.x - me.x, target.z - me.z));
      }
      a.ws.send(JSON.stringify({
        t: 'input', seq: ++seq,
        fwd: 0, strafe: 0, yaw, pitch: Math.max(-1.2, Math.min(1.2, pitch)),
        jump: false, sprint: false, fire: true,
        reload: !me || me.am <= 2, scope: false, wep: 'rifle',
      }));
      if (Math.random() < 0.2) a.ws.send(JSON.stringify({ t: 'ping', ts: performance.now() }));
    }
    await sleep(25);
  }

  check('收到服务端快照', a.snaps.length >= 40, `snaps=${a.snaps.length}`);
  check('快照包含两名真人玩家', playersSeen.size >= 2, `humans=${[...playersSeen].join(',')}`);
  check('机器人已加入', botsSeen.size >= 4, `bots=${botsSeen.size}`);
  check('玩家产生射击事件', a.shots >= 5, `shots=${a.shots}`);
  check('命中/击杀判定生效', a.hits + a.kills >= 1, `hits=${a.hits} kills=${a.kills}`);
  check('ping/pong 正常', pingOk);

  const lastSnap = a.snaps[a.snaps.length - 1];
  check('比分与倒计时有效', Array.isArray(lastSnap.scores) && lastSnap.time > 0, `scores=${lastSnap.scores} time=${lastSnap.time}`);
  const aSelf = lastSnap.players.find((p) => p.i === a.welcome.id);
  check('本地玩家血量/弹药同步', !!aSelf && aSelf.hp >= 0 && aSelf.am >= 0, `hp=${aSelf?.hp} am=${aSelf?.am}`);

  a.close();
  b.close();
  await sleep(600);
  check('玩家退出后房间清理', srv.room.humanCount === 0, `humans=${srv.room.humanCount}`);

  await srv.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n[test] ${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length ? 1 : 0);
}

main().catch(async (err) => {
  console.error('[test] 失败：', err);
  process.exit(1);
});
