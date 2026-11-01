// 游戏房间：权威服务端逻辑（玩家状态、射击、命中、比分）
import { PLAYER, WEAPONS, WEAPON_ORDER, RESPAWN_SECONDS, MATCH_DURATION, TEAM_INFO } from '../shared/constants.js';
import { MAP, getColliders } from '../shared/map.js';
import { createState, simulate, dirFromAngles, raycastMap } from '../shared/physics.js';

const BOT_NAMES = ['Blade', 'Tiger', 'Ghost', 'Viper', 'Falcon', 'Wolf', 'Eagle', 'Hawk'];

export class Room {
  constructor({ bots = 6, maxTotal = 10 } = {}) {
    this.players = new Map(); // id -> player state
    this.humanCount = 0;
    this.nextId = 1;
    this.bots = bots;
    this.maxTotal = maxTotal;
    this.scores = [0, 0];
    this.timeLeft = MATCH_DURATION;
    this.events = []; // 当前快照的事件队列
    this.colliders = null;
    this._initColliders();
    this._spawnBots();
    this._lastTick = Date.now();
    setInterval(() => this._tick(), 1000 / 30);
    setInterval(() => this._matchTick(), 1000);
  }

  _initColliders() {
    this.colliders = getColliders();
  }

  _spawnBots() {
    for (let i = 0; i < this.bots; i++) {
      this._addPlayer(BOT_NAMES[i % BOT_NAMES.length], i % 2, true);
    }
  }

  _addPlayer(name, team, bot) {
    if (this.players.size >= this.maxTotal) return null;
    const id = 'p' + (this.nextId++);
    const spawn = MAP.spawns[team * 5 + Math.floor(Math.random() * 5)];
    const p = {
      i: id, n: name, tm: team, bt: bot ? 1 : 0,
      x: spawn.x, y: spawn.y, z: spawn.z, yw: spawn.yaw, pt: 0,
      hp: PLAYER.maxHealth, al: 1, sp: 1,
      wp: 'rifle', am: WEAPONS.rifle.mag, rs: WEAPONS.rifle.reserve,
      rl: 0, k: 0, d: 0,
      state: createState(spawn),
      input: { fwd: 0, strafe: 0, yaw: spawn.yaw, pitch: 0, jump: false, sprint: false, fire: false, reload: false, scope: false, wep: 'rifle' },
      nextShot: 0, reloadEnd: 0, spawnAt: Date.now(),
      aimYaw: spawn.yaw, aimPitch: 0,
    };
    this.players.set(id, p);
    return p;
  }

  join(name, team) {
    const tm = team >= 0 ? team : (this.humanCount % 2);
    const p = this._addPlayer(name, tm, false);
    if (!p) return null;
    this.humanCount++;
    this._pushEvent({ t: 'join', id: p.i, name });
    return { id: p.i, team: p.tm, spawn: { x: p.x, y: p.y, z: p.z, yaw: p.yw } };
  }

  leave(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (!p.bt) this.humanCount--;
    this.players.delete(id);
    this._pushEvent({ t: 'leave', id, name: p.n });
  }

  handleInput(id, input) {
    const p = this.players.get(id);
    if (!p || !p.al) return;
    p.input.fwd = input.fwd || 0;
    p.input.strafe = input.strafe || 0;
    p.input.yaw = input.yaw ?? p.input.yaw;
    p.input.pitch = input.pitch ?? p.input.pitch;
    p.input.jump = !!input.jump;
    p.input.sprint = !!input.sprint;
    p.input.fire = !!input.fire;
    p.input.reload = !!input.reload;
    p.input.scope = !!input.scope;
    if (input.wep && WEAPONS[input.wep] && input.wep !== p.wp) {
      p.wp = input.wep;
      p.am = WEAPONS[input.wep].mag;
      p.rs = WEAPONS[input.wep].reserve;
      p.rl = 0;
    }
    p.aimYaw = p.input.yaw;
    p.aimPitch = p.input.pitch;
  }

  _pushEvent(ev) {
    this.events.push(ev);
    if (this.events.length > 40) this.events.shift();
  }

  _tick() {
    const now = Date.now();
    const dt = Math.min(0.05, (now - this._lastTick) / 1000);
    this._lastTick = now;

    for (const p of this.players.values()) {
      if (!p.al) {
        if (now - p.deathAt >= RESPAWN_SECONDS * 1000) this._respawn(p);
        continue;
      }

      // 出生保护
      if (p.sp && now - p.spawnAt > PLAYER.spawnProtect * 1000) p.sp = 0;

      // 换弹
      if (p.rl && now >= p.reloadEnd) {
        const w = WEAPONS[p.wp];
        const need = w.mag - p.am;
        const take = Math.min(need, p.rs);
        p.am += take;
        p.rs -= take;
        p.rl = 0;
      }
      if (p.input.reload && !p.rl && p.am < WEAPONS[p.wp].mag && p.rs > 0) {
        p.rl = 1;
        p.reloadEnd = now + WEAPONS[p.wp].reload * 1000;
      }

      // 移动
      simulate(p.state, { ...p.input, yaw: p.aimYaw }, dt, this.colliders);
      p.x = p.state.x; p.y = p.state.y; p.z = p.state.z;
      p.yw = p.aimYaw; p.pt = p.aimPitch;

      // 射击
      if (p.input.fire && !p.rl && now >= p.nextShot && p.am > 0) {
        this._fire(p, now);
      }

      // 机器人 AI
      if (p.bt) this._botAI(p, now);
    }
  }

  _fire(p, now) {
    const w = WEAPONS[p.wp];
    p.nextShot = now + 60000 / w.rpm;
    p.am--;
    const eyeY = p.y + PLAYER.eye;
    const dir = dirFromAngles(p.aimYaw, p.aimPitch);
    const spread = w.spread * (p.input.sprint ? 2.5 : 1);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir.x /= len; dir.y /= len; dir.z /= len;

    const origin = [p.x, eyeY, p.z];
    let end = [p.x + dir.x * w.range, eyeY + dir.y * w.range, p.z + dir.z * w.range];
    const hit = raycastMap(p.x, eyeY, p.z, dir.x, dir.y, dir.z, this.colliders, w.range);
    let hitPlayer = null;
    if (hit) end = [hit.x, hit.y, hit.z];

    // 检测命中玩家
    for (const other of this.players.values()) {
      if (other.i === p.i || !other.al || other.sp) continue;
      if (other.tm === p.tm) continue;
      const ox = other.x, oy = other.y + PLAYER.eye * 0.6, oz = other.z;
      const dx = ox - origin[0], dy = oy - origin[1], dz = oz - origin[2];
      const t = dx * dir.x + dy * dir.y + dz * dir.z;
      if (t < 0 || t > w.range) continue;
      const cx = origin[0] + dir.x * t, cy = origin[1] + dir.y * t, cz = origin[2] + dir.z * t;
      const dist = Math.hypot(cx - ox, cy - oy, cz - oz);
      const head = Math.abs(cy - (other.y + PLAYER.eye)) < 0.25;
      const radius = head ? 0.18 : 0.45;
      if (dist < radius) {
        if (!hitPlayer || t < hitPlayer.t) {
          hitPlayer = { player: other, t, head, point: [cx, cy, cz] };
        }
      }
    }

    this._pushEvent({ t: 'shot', by: p.i, w: p.wp, o: origin, e: end, h: !!hitPlayer });

    if (hitPlayer) {
      const target = hitPlayer.player;
      let dmg = w.damage;
      if (hitPlayer.head) dmg *= w.headMul;
      dmg = Math.round(dmg);
      target.hp -= dmg;
      this._pushEvent({ t: 'hit', by: p.i, v: target.i, x: hitPlayer.point[0], y: hitPlayer.point[1], z: hitPlayer.point[2], head: hitPlayer.head });
      if (target.hp <= 0) {
        target.hp = 0;
        target.al = 0;
        target.deathAt = now;
        target.k++;
        target.d = (target.d || 0) + 1;
        p.k = (p.k || 0) + 1;
        this.scores[p.tm]++;
        this._pushEvent({ t: 'kill', k: p.i, v: target.i, w: p.wp, head: hitPlayer.head });
      }
    }
  }

  _botAI(p, now) {
    // 简单机器人：寻找最近敌人并射击
    let nearest = null, ndist = Infinity;
    for (const other of this.players.values()) {
      if (other.i === p.i || !other.al || other.tm === p.tm) continue;
      const d = Math.hypot(other.x - p.x, other.z - p.z);
      if (d < ndist) { ndist = d; nearest = other; }
    }
    if (nearest) {
      const yaw = Math.atan2(nearest.x - p.x, nearest.z - p.z);
      let dyaw = yaw - p.aimYaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      p.aimYaw += dyaw * 0.1;
      p.aimPitch = Math.max(-0.3, Math.min(0.3, (nearest.y + 1.5 - (p.y + PLAYER.eye)) / Math.max(1, ndist)));
      p.input.fire = ndist < 40 && Math.abs(dyaw) < 0.3;
      p.input.fwd = ndist > 15 ? 1 : 0;
      p.input.sprint = ndist > 20;
    } else {
      p.input.fire = false;
      p.input.fwd = 0;
    }
  }

  _respawn(p) {
    const spawn = MAP.spawns[p.tm * 5 + Math.floor(Math.random() * 5)];
    p.x = spawn.x; p.y = spawn.y; p.z = spawn.z;
    p.yw = spawn.yaw; p.pt = 0;
    p.hp = PLAYER.maxHealth; p.al = 1; p.sp = 1;
    p.wp = 'rifle'; p.am = WEAPONS.rifle.mag; p.rs = WEAPONS.rifle.reserve; p.rl = 0;
    p.state = createState(spawn);
    p.spawnAt = Date.now();
    p.aimYaw = spawn.yaw; p.aimPitch = 0;
    this._pushEvent({ t: 'spawn', id: p.i });
  }

  _matchTick() {
    if (this.timeLeft > 0) this.timeLeft--;
    else {
      this.timeLeft = MATCH_DURATION;
      this.scores = [0, 0];
      this._pushEvent({ t: 'matchReset' });
    }
  }

  snapshot() {
    const players = [];
    for (const p of this.players.values()) {
      players.push({
        i: p.i, n: p.n, tm: p.tm, bt: p.bt,
        x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
        yw: +p.yw.toFixed(3), pt: +p.pt.toFixed(3),
        hp: p.hp, al: p.al, sp: p.sp,
        wp: p.wp, am: p.am, rs: p.rs, rl: p.rl,
        k: p.k, d: p.d, ra: p.al ? 0 : Math.max(0, RESPAWN_SECONDS - (Date.now() - p.deathAt) / 1000),
      });
    }
    const snap = { t: 'snap', time: this.timeLeft, scores: [...this.scores], players, ev: this.events };
    this.events = [];
    return snap;
  }
}
