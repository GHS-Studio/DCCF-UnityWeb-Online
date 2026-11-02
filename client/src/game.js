// 游戏主循环：本地预测 + 服务端快照对齐、输入、渲染、HUD
import * as THREE from 'three';
import {
  PROTOCOL_VERSION, PLAYER, WEAPONS, WEAPON_ORDER, INPUT_RATE, RESPAWN_SECONDS, TEAM_INFO,
} from '../../shared/constants.js';
import { getColliders, MAP } from '../../shared/map.js';
import { createState, simulate, dirFromAngles, raycastMap } from '../../shared/physics.js';
import { buildWorld } from './world.js';
import { Soldier, ViewModel, Effects } from './entities.js';
import { HUD } from './hud.js';
import {
  initAudio, sfxShot, sfxHit, sfxDeath, sfxReload, sfxEmpty, sfxSpawn, sfxStep,
} from './audio.js';
import { TouchControls } from './touch.js';

const MOUSE_SENS = 0.0022;
const TOUCH_SENS = 0.0032;

export class Game {
  constructor(opts) {
    this.net = opts.net;
    this.onExit = opts.onExit || (() => {});
    this.sensitivity = opts.sensitivity ?? 1;
    this.quality = opts.quality || 'high';
    this.isTouch = !!opts.touch;
    this.destroying = false;

    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality === 'high',
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.25));
    this.renderer.shadowMap.enabled = this.quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    this.world = buildWorld(this.renderer, this.quality);
    this.scene = this.world.scene;

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 480);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    this.baseFov = 75;
    this.viewModel = new ViewModel(this.camera);
    this.effects = new Effects(this.scene);
    this.hud = new HUD();

    this.colliders = getColliders();

    const welcome = opts.welcome;
    this.myId = welcome.id;
    this.team = welcome.team;
    this.teamInfo = welcome.teamInfo || TEAM_INFO;

    this.state = createState(welcome.spawn);
    this.yaw = welcome.spawn.yaw || 0;
    this.pitch = 0;
    this.alive = true;
    this.health = PLAYER.maxHealth;
    this.kills = 0;
    this.deaths = 0;

    this.weapon = 'rifle';
    this.ammo = {};
    this.reserve = {};
    for (const k of Object.keys(WEAPONS)) {
      this.ammo[k] = WEAPONS[k].mag;
      this.reserve[k] = WEAPONS[k].reserve;
    }
    this.reloading = false;
    this.reloadEnd = 0;
    this.serverReloading = false;
    this.nextShot = 0;
    this.lastLocalShot = 0;
    this.scoped = false;
    this.triggerDown = false;
    this.firePressUntil = 0;
    this.jumpUntil = 0;
    this.nextEmpty = 0;

    this.soldiers = new Map();
    this.names = new Map();
    this.playersSnap = [];
    this.snap = null;
    this.paused = false;
    this.scoreboardVisible = false;
    this.inputSeq = 0;
    this.lastInputSent = 0;
    this.fps = 0;
    this._frames = 0;
    this._fpsAt = performance.now();
    this._lastTs = 0;
    this._statAt = 0;
    this.keys = Object.create(null);
    this.touchMove = { fwd: 0, strafe: 0 };
    this.raf = 0;

    for (const p of welcome.players || []) {
      this.names.set(p.i, p.n);
      if (p.i === this.myId) {
        this.team = p.tm;
        this.weapon = p.wp || 'rifle';
        this.ammo[this.weapon] = p.am ?? this.ammo[this.weapon];
        this.reserve[this.weapon] = p.rs ?? this.reserve[this.weapon];
        this.health = p.hp ?? 100;
        this.kills = p.k || 0;
        this.deaths = p.d || 0;
        this.alive = p.al === 1;
      } else if (p.al !== undefined) {
        this.soldiers.set(p.i, new Soldier(this.scene, p));
      }
    }

    if (this.hud) {
      this.hud.show();
      if (this.isTouch) this.hud.enableTouch();
      this.hud.setScores(welcome.scores?.[0] ?? 0, welcome.scores?.[1] ?? 0);
      this.hud.setTime(welcome.time ?? 0);
      this.hud.setHealth(this.health);
      this.hud.setWeapon(this.weapon, this.ammo[this.weapon], this.reserve[this.weapon], this.reloading);
      this.hud.setScope(false);
      this.hud.setScoreboardVisible(false);
      this.hud.setPause(false);
      if (!this.alive) this.showDeath('', RESPAWN_SECONDS);
    }

    this.viewModel.setWeapon(this.weapon);
    this.bindEvents();
    if (this.isTouch) this.setupTouch();
    this.resize();
    this.net.handlers.onSnapshot = (snap) => this.onSnapshot(snap);
    this.net.handlers.onClose = () => {
      if (!this.destroying) this.exit('closed');
    };

    this.canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    this.loop = (ts) => this.frame(ts);
    this.raf = requestAnimationFrame(this.loop);
  }

  bindEvents() {
    this._onKeyDown = (e) => {
      if (this.destroying) return;
      this.keys[e.code] = true;
      if (e.code === 'Tab') {
        e.preventDefault();
        this.showScoreboard(true);
        return;
      }
      if (e.code === 'KeyR') { e.preventDefault(); this.reload(); }
      else if (e.code === 'Space') { e.preventDefault(); this.jump(); }
      else if (e.code === 'Digit1') this.switchWeapon('rifle');
      else if (e.code === 'Digit2') this.switchWeapon('sniper');
      else if (e.code === 'Digit3') this.switchWeapon('pistol');
    };
    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
      if (e.code === 'Tab') this.showScoreboard(false);
    };
    this._onMouseDown = (e) => {
      if (this.destroying || this.isTouch) return;
      if (e.button === 0) {
        if (this.paused) return;
        if (document.pointerLockElement !== this.canvas) return;
        this.triggerDown = true;
        this.firePressUntil = performance.now() + 150;
        this.pullTrigger();
      } else if (e.button === 2) {
        e.preventDefault();
        this.toggleScope();
      }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.triggerDown = false;
    };
    this._onMouseMove = (e) => {
      if (this.isTouch || this.paused) return;
      if (document.pointerLockElement !== this.canvas) return;
      this.look(e.movementX || 0, e.movementY || 0, MOUSE_SENS);
    };
    this._onLockChange = () => {
      if (this.destroying || this.isTouch) return;
      const locked = document.pointerLockElement === this.canvas;
      if (locked) {
        if (this.paused) { this.paused = false; this.hud.setPause(false); }
      } else if (!this.paused) {
        this.pause();
      }
    };
    this._onResize = () => this.resize();
    this._onContext = (e) => e.preventDefault();
    this._onCanvasClick = () => {
      if (this.destroying || this.isTouch || this.paused) return;
      if (document.pointerLockElement !== this.canvas) this.requestLock();
    };
    this._onPauseClick = (e) => {
      if (e.target && e.target.id === 'leave-btn') return;
      this.resume();
    };
    this._onResumeClick = (e) => { e.stopPropagation(); this.resume(); };
    this._onLeaveClick = (e) => { e.stopPropagation(); this.exit('leave'); };

    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('click', this._onCanvasClick);
    this.canvas.addEventListener('contextmenu', this._onContext);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    document.getElementById('pause')?.addEventListener('click', this._onPauseClick);
    document.getElementById('resume-btn')?.addEventListener('click', this._onResumeClick);
    document.getElementById('leave-btn')?.addEventListener('click', this._onLeaveClick);
  }

  setupTouch() {
    this.touch = new TouchControls({
      onMove: (fwd, strafe) => { this.touchMove.fwd = fwd; this.touchMove.strafe = strafe; },
      onLook: (dx, dy) => this.look(dx, dy, TOUCH_SENS),
      onFire: (down) => {
        if (down) { this.triggerDown = true; this.firePressUntil = performance.now() + 150; this.pullTrigger(); }
        else this.triggerDown = false;
      },
      onJump: () => this.jump(),
      onReload: () => this.reload(),
      onSwitch: () => this.cycleWeapon(),
      onScope: () => this.toggleScope(),
    });
  }

  look(dx, dy, sens) {
    const s = sens * this.sensitivity;
    this.yaw -= dx * s;
    this.pitch -= dy * s;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }

  requestLock() {
    if (this.isTouch || this.destroying) return;
    const p = this.canvas.requestPointerLock?.();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  }

  pause() {
    if (this.paused || this.destroying) return;
    this.paused = true;
    this.triggerDown = false;
    this.scoped = false;
    this.hud.setScope(false);
    this.hud.setPause(true);
    this.sendInput(0, true);
  }

  resume() {
    if (this.isTouch) return;
    if (document.pointerLockElement !== this.canvas) this.requestLock();
  }

  showScoreboard(v) {
    this.scoreboardVisible = v;
    if (v) this.hud.showScoreboard(this.playersSnap, this.myId);
    this.hud.setScoreboardVisible(v);
  }

  pullTrigger() {
    const now = performance.now();
    if (!this.alive || this.paused) return;
    const w = WEAPONS[this.weapon];
    if (w.auto) return;
    this.tryFire(now);
  }

  tryFire(now) {
    if (!this.alive || this.paused) return false;
    const w = WEAPONS[this.weapon];
    if (this.reloading || now < this.nextShot) return false;
    if (this.ammo[this.weapon] <= 0) {
      if (now > this.nextEmpty) { sfxEmpty(); this.nextEmpty = now + 300; }
      this.nextShot = now + 250;
      return false;
    }
    this.nextShot = now + 1000 / w.rpm;
    this.ammo[this.weapon] -= 1;
    this.lastLocalShot = now;

    this.viewModel.triggerFlash();
    sfxShot(this.weapon, true);
    this.localTracer(w);

    this.hud.setWeapon(this.weapon, this.ammo[this.weapon], this.reserve[this.weapon], this.reloading);
    return true;
  }

  localTracer(w) {
    const eyeY = this.state.y + PLAYER.eye;
    const dir = dirFromAngles(this.yaw, this.pitch);
    const hit = raycastMap(this.state.x, eyeY, this.state.z, dir.x, dir.y, dir.z, this.colliders, w.range);
    const end = hit
      ? { x: hit.x, y: hit.y, z: hit.z }
      : { x: this.state.x + dir.x * w.range, y: eyeY + dir.y * w.range, z: this.state.z + dir.z * w.range };
    this.effects.tracer(this.state.x, eyeY, this.state.z, end.x, end.y, end.z, w.tracer, true);
    if (hit) this.effects.impact(end.x, end.y, end.z, 0xffd08a);
  }

  reload() {
    if (!this.alive || this.paused) return;
    const w = WEAPONS[this.weapon];
    if (this.reloading || this.ammo[this.weapon] >= w.mag || this.reserve[this.weapon] <= 0) {
      if (!this.reloading && this.ammo[this.weapon] === 0) sfxEmpty();
      return;
    }
    this.reloading = true;
    this.reloadEnd = performance.now() + w.reload * 1000;
    this._reloadSendUntil = performance.now() + 300;
    this.scoped = false;
    this.hud.setScope(false);
    this.viewModel.setAds(false);
    sfxReload(this.weapon);
    this.hud.setWeapon(this.weapon, this.ammo[this.weapon], this.reserve[this.weapon], true);
  }

  switchWeapon(w) {
    if (!WEAPONS[w] || w === this.weapon || !this.alive) return;
    this.weapon = w;
    this.reloading = false;
    this.scoped = false;
    this.hud.setScope(false);
    this.viewModel.setWeapon(w);
    this.viewModel.setAds(false);
    this.nextShot = performance.now() + 350;
    this.hud.setWeapon(this.weapon, this.ammo[this.weapon], this.reserve[this.weapon], false);
  }

  cycleWeapon() {
    const idx = WEAPON_ORDER.indexOf(this.weapon);
    this.switchWeapon(WEAPON_ORDER[(idx + 1) % WEAPON_ORDER.length]);
  }

  toggleScope() {
    if (!this.alive || this.paused) return;
    const w = WEAPONS[this.weapon];
    if (!w.zoom) { this.hud.toast(`${w.name} 不支持开镜`); return; }
    this.scoped = !this.scoped;
    this.viewModel.setAds(this.scoped);
    this.hud.setScope(this.scoped);
  }

  jump() {
    if (!this.alive || this.paused) return;
    const now = performance.now();
    if (now < this.jumpUntil) return;
    this.jumpUntil = now + 160;
  }

  showDeath(killerName, seconds) {
    this.hud.showDeath(killerName, seconds);
  }

  handleLocalDeath(killerName) {
    this.alive = false;
    this.triggerDown = false;
    this.reloading = false;
    this.scoped = false;
    this.hud.setScope(false);
    this.viewModel.setAds(false);
    this.hud.showDeath(killerName, RESPAWN_SECONDS);
  }

  handleRespawn(me) {
    this.alive = true;
    this.health = me?.hp ?? PLAYER.maxHealth;
    this.hud.hideDeath();
    this.hud.setHealth(this.health);
    this.weapon = 'rifle';
    this.viewModel.setWeapon('rifle');
    this.reloading = false;
    this.scoped = false;
    this.hud.setScope(false);
    this.viewModel.setAds(false);
    this.nextShot = performance.now() + 300;
    if (me) {
      this.state.x = me.x; this.state.y = me.y; this.state.z = me.z;
      this.state.vx = this.state.vy = this.state.vz = 0;
      this.state.onGround = false;
      this.yaw = me.yw;
      this.pitch = 0;
    }
    sfxSpawn();
  }

  sprinting() {
    if (this.keys.ShiftLeft || this.keys.ShiftRight) return true;
    if (this.touch) {
      return Math.hypot(this.touchMove.fwd, this.touchMove.strafe) > 0.85 && this.touchMove.fwd > 0.2;
    }
    return false;
  }

  sendInput(dt, forceZero = false) {
    if (!this.net) return;
    const now = performance.now();
    if (!forceZero && now - this.lastInputSent < 1000 / INPUT_RATE) return;
    let fwd = 0, strafe = 0;
    if (!forceZero && this.alive && !this.paused) {
      const k = this.keys;
      fwd = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
      strafe = (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0);
      if (this.touch && (this.touchMove.fwd || this.touchMove.strafe)) {
        fwd = this.touchMove.fwd;
        strafe = this.touchMove.strafe;
      }
      const press = this.triggerDown;
      const fire = press || now < this.firePressUntil;
      this.net.send({
        t: 'input', seq: ++this.inputSeq,
        fwd: round(fwd), strafe: round(strafe),
        yaw: round3(this.yaw), pitch: round3(this.pitch),
        jump: now < this.jumpUntil,
        sprint: this.sprinting(),
        fire,
        reload: this.reloading || now < (this._reloadSendUntil || 0),
        scope: this.scoped,
        wep: this.weapon,
      });
    } else {
      this.net.send({ t: 'input', seq: ++this.inputSeq, fwd: 0, strafe: 0, yaw: round3(this.yaw), pitch: round3(this.pitch), jump: false, sprint: false, fire: false, reload: false, scope: false, wep: this.weapon });
    }
    this.lastInputSent = now;
  }

  onSnapshot(snap) {
    if (this.destroying) return;
    this.snap = snap;
    this.timeLeft = snap.time;
    this.hud.setScores(snap.scores?.[0] ?? 0, snap.scores?.[1] ?? 0);
    this.hud.setTime(snap.time ?? 0);

    const seen = new Set();
    this.playersSnap = snap.players || [];
    for (const p of this.playersSnap) {
      this.names.set(p.i, p.n);
      if (p.i === this.myId) continue;
      seen.add(p.i);
      let s = this.soldiers.get(p.i);
      if (!s) {
        s = new Soldier(this.scene, p);
        this.soldiers.set(p.i, s);
      } else {
        s.setData(p);
      }
    }
    for (const [id, s] of this.soldiers) {
      if (!seen.has(id)) { s.dispose(this.scene); this.soldiers.delete(id); }
    }

    for (const ev of snap.ev || []) this.handleEvent(ev);

    const me = this.playersSnap.find((p) => p.i === this.myId);
    if (me) this.applyLocal(me);

    if (this.scoreboardVisible) this.hud.showScoreboard(this.playersSnap, this.myId);
  }

  applyLocal(me) {
    this.team = me.tm;
    this.health = me.hp;
    this.hud.setHealth(me.hp);
    this.kills = me.k;
    this.deaths = me.d;

    if (me.al === 0) {
      if (this.alive) this.handleLocalDeath(this.names.get(this.killedBy) || '');
      this.alive = false;
      const left = Math.max(0, Math.round(me.ra ?? 0));
      this.hud.updateDeathCount(left);
    } else if (!this.alive) {
      this.handleRespawn(me);
    }

    const w = this.weapon;
    const sameWeapon = me.wp === w;
    const am = me.am ?? this.ammo[w];
    const rs = me.rs ?? this.reserve[w];
    const rl = me.rl === 1 && sameWeapon;

    if (rl) {
      this.serverReloading = true;
      this.reloading = true;
    } else {
      if (this.serverReloading) {
        this.serverReloading = false;
        this.reloading = false;
        if (sameWeapon) { this.ammo[w] = am; this.reserve[w] = rs; }
      }
      if (sameWeapon) {
        const now = performance.now();
        if (now - this.lastLocalShot > 250) this.ammo[w] = am;
        else this.ammo[w] = Math.min(this.ammo[w], am);
        this.reserve[w] = rs;
      }
    }
    if (this.reloading && this.reloadEnd && performance.now() >= this.reloadEnd + 300) {
      this.reloading = false;
      this.reloadEnd = 0;
    }

    const changed = this._hudWeapon !== w || this._hudMag !== this.ammo[w] || this._hudRes !== this.reserve[w] || this._hudReload !== this.reloading;
    if (changed) {
      this._hudWeapon = w;
      this._hudMag = this.ammo[w];
      this._hudRes = this.reserve[w];
      this._hudReload = this.reloading;
      this.hud.setWeapon(w, this.ammo[w], this.reserve[w], this.reloading);
    }

    if (me.al === 1) {
      const dx = me.x - this.state.x;
      const dy = me.y - this.state.y;
      const dz = me.z - this.state.z;
      if (Math.hypot(dx, dz) > 2.0 || Math.abs(dy) > 1.3) {
        this.state.x = me.x; this.state.y = me.y; this.state.z = me.z;
        this.state.vx = this.state.vy = this.state.vz = 0;
      }
    }
  }

  handleEvent(ev) {
    switch (ev.t) {
      case 'shot': this.onShotEvent(ev); break;
      case 'hit':
        if (ev.by === this.myId) { this.hud.hitmarker(ev.head); sfxHit(ev.head); }
        this.effects.impact(ev.x, ev.y, ev.z, ev.head ? 0xff5b5b : 0xffd08a);
        if (ev.v === this.myId) this.hud.damage();
        break;
      case 'kill': {
        const killer = ev.k ? (this.names.get(ev.k) || '') : '';
        const victim = this.names.get(ev.v) || '';
        const weapon = ev.w || '';
        this.hud.addKill(killer || '海面', victim, weapon, ev.head, ev.k === this.myId, ev.v === this.myId);
        if (ev.v === this.myId) {
          this.killedBy = ev.k;
          sfxDeath();
          this.handleLocalDeath(killer || '坠海');
        } else if (ev.k === this.myId) {
          this.hud.toast(`击杀 ${victim}${ev.head ? '（爆头）' : ''}`);
        }
        break;
      }
      case 'spawn':
        if (ev.id === this.myId) this.hud.hideDeath();
        else sfxSpawn();
        break;
      case 'join':
        if (ev.id !== this.myId) this.hud.toast(`${ev.name || '玩家'} 加入了战场`);
        break;
      case 'leave':
        if (ev.id !== this.myId) this.hud.toast(`${ev.name || '玩家'} 离开了战场`);
        break;
      case 'matchReset':
        this.hud.toast('新一局开始');
        break;
      default: break;
    }
  }

  onShotEvent(ev) {
    const w = WEAPONS[ev.w] || WEAPONS.rifle;
    if (ev.by !== this.myId) sfxShot(ev.w, false);
    if (ev.by === this.myId) return;
    const o = ev.o || [0, 0, 0];
    const e = ev.e || [0, 0, 0];
    this.effects.tracer(o[0], o[1], o[2], e[0], e[1], e[2], w.tracer, false);
    if (!ev.h) this.effects.impact(e[0], e[1], e[2], 0xffc070);
  }

  frame(ts) {
    if (this.destroying) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this._lastTs) this._lastTs = ts;
    const dt = Math.min(0.05, Math.max(0, (ts - this._lastTs) / 1000)) || 0.016;
    this._lastTs = ts;
    const now = performance.now();

    if (!this.paused && this.alive && this.triggerDown) {
      const w = WEAPONS[this.weapon];
      if (w.auto) this.tryFire(now);
    } else if (!this.alive) {
      this.triggerDown = false;
    }

    if (!this.paused && this.alive) {
      let fwd = 0, strafe = 0;
      if (!this.isTouch) {
        const k = this.keys;
        fwd = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
        strafe = (k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0);
      }
      if (this.touchMove.fwd || this.touchMove.strafe) {
        fwd = this.touchMove.fwd;
        strafe = this.touchMove.strafe;
      }
      this.state.yaw = this.yaw;
      simulate(this.state, { fwd, strafe, jump: now < this.jumpUntil, sprint: this.sprinting(), yaw: this.yaw }, dt, this.colliders);
    }

    // 原版金属脚步音效：按移动距离触发
    if (!this.paused && this.alive && this.state.onGround) {
      const spd = Math.hypot(this.state.vx, this.state.vz);
      if (spd > 1.5) {
        this._stepDist = (this._stepDist || 0) + spd * dt;
        if (this._stepDist >= 2.0) {
          this._stepDist = 0;
          sfxStep(this.sprinting());
        }
      } else {
        this._stepDist = 0;
      }
    }

    this.sendInput(dt, this.paused);

    const eyeY = this.state.y + PLAYER.eye;
    this.camera.position.set(this.state.x, Math.max(MAP.seaLevel + 0.4, eyeY), this.state.z);
    this.camera.rotation.y = this.yaw + Math.PI;
    this.camera.rotation.x = this.pitch;

    const targetFov = this.scoped ? 26 : this.baseFov;
    const k = 1 - Math.exp(-14 * dt);
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * k;
      this.camera.updateProjectionMatrix();
    }

    const speed = Math.hypot(this.state.vx, this.state.vz);
    this.viewModel.visible = this.alive;
    this.viewModel.update(dt, {
      moving: Math.min(1, speed / PLAYER.speed),
      sprint: speed > PLAYER.speed * 1.15,
      scoped: this.scoped,
    });

    for (const s of this.soldiers.values()) s.update(dt);
    this.effects.update(dt);
    this.world.update(dt, this.camera);

    try {
      this.renderer.render(this.scene, this.camera);
    } catch (e) {
      console.error('RENDER ERROR:', e.message);
    }

    this._frames++;
    if (now - this._fpsAt >= 1000) {
      this.fps = Math.round(this._frames * 1000 / (now - this._fpsAt));
      this._frames = 0;
      this._fpsAt = now;
    }
    if (now - this._statAt > 500) {
      this._statAt = now;
      this.hud.setStats(this.fps, this.net?.ping ?? 0);
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  exit(reason) {
    if (this.destroying) return;
    this.destroying = true;
    if (document.pointerLockElement === this.canvas) {
      try { document.exitPointerLock(); } catch {}
    }
    this.onExit(reason);
  }

  destroy() {
    this.destroying = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    document.getElementById('pause')?.removeEventListener('click', this._onPauseClick);
    document.getElementById('resume-btn')?.removeEventListener('click', this._onResumeClick);
    document.getElementById('leave-btn')?.removeEventListener('click', this._onLeaveClick);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this._onMouseDown);
      this.canvas.removeEventListener('click', this._onCanvasClick);
      this.canvas.removeEventListener('contextmenu', this._onContext);
    }
    this.touch?.dispose();

    for (const s of this.soldiers.values()) s.dispose(this.scene);
    this.soldiers.clear();

    if (this.scene) {
      this.scene.traverse((obj) => {
        if (obj.isMesh || obj.isLine || obj.isSprite) {
          obj.geometry?.dispose?.();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
          else obj.material?.dispose?.();
        }
      });
    }
    this.renderer?.dispose?.();
    try { this.renderer?.forceContextLoss?.(); } catch {}

    if (this.canvas && this.canvas.parentNode) {
      const nc = document.createElement('canvas');
      nc.id = 'game-canvas';
      this.canvas.parentNode.replaceChild(nc, this.canvas);
    }
    document.getElementById('hud')?.classList.add('hidden');
    document.getElementById('menu')?.classList.remove('hidden');
    this.hud.setPause(false);
    this.hud.setScope(false);
    this.hud.hideDeath();
    this.hud.setScoreboardVisible(false);
    this.hud.el.touch.classList.add('hidden');
    this.hud.el.toast.classList.add('hidden');
    this.hud.el.killfeed.innerHTML = '';
    if (this.net) {
      this.net.handlers.onSnapshot = null;
      this.net.handlers.onClose = null;
    }
  }
}

function round(v) { return Math.round(v * 100) / 100; }
function round3(v) { return Math.round(v * 1000) / 1000; }
