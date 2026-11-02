// 客户端 3D 实体：原版角色模型、第一人称原版武器、射击特效
import * as THREE from 'three';
import { PLAYER, WEAPONS, COLORS } from '../../shared/constants.js';
import { nameTagTexture, flashTexture, impactTexture } from './textures.js';
import {
  loadUnityModels, buildModel, buildHeldGun,
  CHAR_SCALE, CHAR_ROTATION_X, WEAPON_ROTATION_X,
} from './actors.js';

const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

// 双手持枪姿态：由原版骨架实测的局部轴角度（local Y 前后摆、local Z 收展）
const AIM_POSE = [
  ['M-bone R UpperArm', [[AXIS_Y, 0.8], [AXIS_Z, -0.6]]],
  ['M-bone R Forearm', [[AXIS_Y, 0.2], [AXIS_Z, 0.2]]],
  ['M-bone L UpperArm', [[AXIS_Y, 1.46], [AXIS_Z, 0.2]]],
  ['M-bone L Forearm', [[AXIS_Y, -0.6]]],
];
const AIM_QUATS = AIM_POSE.map(([name, list]) => [
  name,
  list.map(([axis, ang]) => new THREE.Quaternion().setFromAxisAngle(axis, ang)),
]);

const RING_GEO = new THREE.RingGeometry(0.42, 0.55, 20);

export class Soldier {
  constructor(scene, data) {
    this.id = data.i;
    this.name = data.n;
    this.team = data.tm;
    this.bot = data.bt === 1;
    this.scene = scene;

    const g = new THREE.Group();
    this.group = g;
    this.body = new THREE.Group();
    g.add(this.body);

    const ring = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({
      color: this.team === 0 ? COLORS.teamA : COLORS.teamB,
      transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    g.add(ring);

    const tag = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nameTagTexture(this.name, this.team === 0 ? 0xffb03a : 0x4aa8ff, this.team),
      transparent: true, depthWrite: false, depthTest: false,
    }));
    tag.position.y = 2.02;
    tag.scale.set(1.25, 0.31, 1);
    g.add(tag);
    this.tag = tag;

    g.position.set(data.x, data.y, data.z);
    g.rotation.y = data.yw;
    this.target = { x: data.x, y: data.y, z: data.z, yaw: data.yw, pitch: data.pt || 0 };
    this.alive = data.al === 1;
    this.health = data.hp;
    this.weapon = data.wp || 'rifle';
    this.kills = data.k || 0;
    this.deaths = data.d || 0;
    this.spawnProtected = data.sp === 1;
    g.visible = this.alive;
    this.walk = 0;
    this.speedNow = 0;

    this.model = null;
    this.rest = new Map();
    this.guns = {};
    this.loaded = false;
    this._q = new THREE.Quaternion();

    scene.add(g);
    this._load();
  }

  _load() {
    loadUnityModels().then(({ characters, weapons }) => {
      if (this.disposed) return;
      const raw = characters[String(this.team)] || characters['0'];
      if (!raw) return;
      const model = buildModel(raw, 'unity/actors', {
        scale: CHAR_SCALE, rotationX: CHAR_ROTATION_X,
      });
      // 蒙皮静止姿态以脚底为原点：z 最低点 -2.81 旋转后成为 y，需抬高
      model.root.position.y = 0.968;
      this.body.add(model.root);
      this.model = model;

      for (const b of model.bones) this.rest.set(b.name, b.quaternion.clone());

      const hand = model.byName.get('M-bone R Hand');
      if (hand) {
        for (const key of ['rifle', 'sniper', 'pistol']) {
          if (!weapons[key]) continue;
          const gun = buildHeldGun(weapons[key], 'unity/weapons');
          if (!gun) continue;
          hand.add(gun);
          this.guns[key] = gun;
        }
      }
      this.loaded = true;
      this._applyWeapon();
      this._pose(0, 0);
    }).catch((err) => console.error('[soldier] 模型加载失败', err));
  }

  _applyWeapon() {
    for (const k of Object.keys(this.guns)) this.guns[k].visible = k === this.weapon;
  }

  _pose(walk, moving) {
    if (!this.loaded) return;
    const m = this.model;
    const rest = this.rest;
    const qa = this._q;

    for (const [name, qs] of AIM_QUATS) {
      const bone = m.byName.get(name);
      const r = rest.get(name);
      if (!bone || !r) continue;
      bone.quaternion.copy(r);
      for (const q of qs) bone.quaternion.multiply(q);
    }

    const sw = Math.sin(walk) * 0.62 * moving;
    const bendL = Math.max(0, -Math.sin(walk)) * 0.85 * moving;
    const bendR = Math.max(0, Math.sin(walk)) * 0.85 * moving;

    const thighL = m.byName.get('M-bone L Thigh');
    if (thighL && rest.has('M-bone L Thigh')) {
      qa.setFromAxisAngle(AXIS_Y, sw);
      thighL.quaternion.copy(rest.get('M-bone L Thigh')).multiply(qa);
    }
    const thighR = m.byName.get('M-bone R Thigh');
    if (thighR && rest.has('M-bone R Thigh')) {
      qa.setFromAxisAngle(AXIS_Y, -sw);
      thighR.quaternion.copy(rest.get('M-bone R Thigh')).multiply(qa);
    }
    const calfL = m.byName.get('M-bone L Calf');
    if (calfL && rest.has('M-bone L Calf')) {
      qa.setFromAxisAngle(AXIS_Y, bendL);
      calfL.quaternion.copy(rest.get('M-bone L Calf')).multiply(qa);
    }
    const calfR = m.byName.get('M-bone R Calf');
    if (calfR && rest.has('M-bone R Calf')) {
      qa.setFromAxisAngle(AXIS_Y, bendR);
      calfR.quaternion.copy(rest.get('M-bone R Calf')).multiply(qa);
    }

    this.body.position.y = moving > 0.15 ? Math.abs(Math.sin(walk)) * 0.035 : 0;
  }

  setData(p) {
    this.target.x = p.x; this.target.y = p.y; this.target.z = p.z;
    this.target.yaw = p.yw; this.target.pitch = p.pt || 0;
    this.health = p.hp;
    this.alive = p.al === 1;
    this.team = p.tm;
    this.kills = p.k;
    this.deaths = p.d;
    this.weapon = p.wp || 'rifle';
    this.spawnProtected = p.sp === 1;
    this.group.visible = this.alive;
    this._applyWeapon();
    if (p.n !== this.name) {
      this.name = p.n;
      this.tag.material.map = nameTagTexture(this.name, this.team === 0 ? 0xffb03a : 0x4aa8ff, this.team);
      this.tag.material.map.needsUpdate = true;
    }
  }

  update(dt) {
    if (!this.alive) return;
    const k = 1 - Math.exp(-12 * dt);
    const dx = this.target.x - this.group.position.x;
    const dy = this.target.y - this.group.position.y;
    const dz = this.target.z - this.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 3) this.group.position.set(this.target.x, this.target.y, this.target.z);
    else {
      this.group.position.x += dx * k;
      this.group.position.y += dy * k;
      this.group.position.z += dz * k;
    }
    this.speedNow = dt > 0 ? dist / dt : 0;

    let dyaw = this.target.yaw - this.group.rotation.y;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.group.rotation.y += dyaw * k;

    this.body.rotation.x = -this.target.pitch * 0.35;

    const moving = Math.min(1, this.speedNow / 5);
    this.walk += dt * (5 + moving * 6);
    this._pose(this.walk, moving);

    this.tag.material.opacity = 1;
  }

  dispose(scene) {
    this.disposed = true;
    if (scene) scene.remove(this.group);
    else this.scene?.remove(this.group);
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
  }
}

// ---------------- 第一人称武器（原版模型 + 手臂） ----------------
export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.position.set(0.20, 0.03, 0.02);
    camera.add(this.root);

    this.models = {};
    this.flashes = {};
    this.current = 'rifle';
    this.recoil = 0;
    this.bob = 0;
    this.ads = 0;
    this.flashTime = 0;
    this.visible = true;

    this._load();
  }

  _load() {
    loadUnityModels().then(({ weapons }) => {
      for (const key of ['rifle', 'sniper', 'pistol']) {
        const raw = weapons[key];
        if (!raw) continue;
        const model = buildModel(raw, 'unity/weapons', {
          rotationX: WEAPON_ROTATION_X, shadow: false,
        });
        model.root.visible = false;
        this.root.add(model.root);
        this.models[key] = model;

        const flash = new THREE.Sprite(new THREE.SpriteMaterial({
          map: flashTexture(), color: 0xffd28a, blending: THREE.AdditiveBlending,
          transparent: true, depthWrite: false, depthTest: false,
        }));
        if (raw.muzzle) flash.position.set(raw.muzzle[0], raw.muzzle[1], raw.muzzle[2]);
        flash.scale.set(0.22, 0.22, 1);
        flash.visible = false;
        model.root.add(flash);
        this.flashes[key] = flash;
      }
      this.setWeapon(this.current);
      this.setAds(this.ads > 0.5);
    }).catch((err) => console.error('[viewmodel] 武器加载失败', err));
  }

  setWeapon(w) {
    if (!WEAPONS[w]) return;
    this.current = w;
    for (const key of Object.keys(this.models)) this.models[key].root.visible = key === w;
    for (const key of Object.keys(this.flashes)) this.flashes[key].visible = false;
  }

  triggerFlash() {
    const flash = this.flashes[this.current];
    if (flash) {
      flash.visible = true;
      flash.material.rotation = Math.random() * Math.PI;
      const s = 0.2 + Math.random() * 0.14;
      flash.scale.set(s, s, 1);
    }
    this.flashTime = 0.06;
    this.recoil = Math.min(1, this.recoil + (this.current === 'sniper' ? 0.6 : 0.35));
  }

  setAds(on) { this.ads = on ? 1 : 0; }

  update(dt, opts = {}) {
    const { moving = 0, sprint = false, scoped = false } = opts;
    const showVM = this.visible && !scoped && this.ads < 0.6;
    this.root.visible = showVM;
    this.bob += dt * (6 + moving * 8);
    const bobAmt = moving * 0.010;
    const hipPos = new THREE.Vector3(0.20, 0.03, 0.02);
    const adsPos = new THREE.Vector3(0.10, 0.14, -0.05);
    const pos = hipPos.clone().lerp(adsPos, this.ads);
    pos.x += Math.sin(this.bob) * bobAmt;
    pos.y += Math.cos(this.bob * 2) * bobAmt * 0.7;
    if (sprint) { pos.y -= 0.05; pos.x += 0.03; }
    pos.z += this.recoil * 0.05;
    this.recoil = Math.max(0, this.recoil - dt * 5.5);
    this.root.position.copy(pos);
    this.root.rotation.x = this.recoil * 0.10 - this.ads * 0.01;

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) {
        for (const k of Object.keys(this.flashes)) this.flashes[k].visible = false;
      }
    }
  }
}

// ---------------- 特效 ----------------
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.impactTex = impactTexture();
  }

  tracer(ox, oy, oz, ex, ey, ez, color = 0xffd27a, own = false) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ox, oy, oz),
      new THREE.Vector3(ex, ey, ez),
    ]);
    const mat = new THREE.LineBasicMaterial({
      color, transparent: true, opacity: own ? 0.85 : 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.items.push({ obj: line, life: 0.18, max: 0.18, type: 'tracer' });
    this.cap();
  }

  impact(x, y, z, color = 0xffc070) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.impactTex, color, blending: THREE.AdditiveBlending, transparent: true,
      depthWrite: false, depthTest: true,
    }));
    spr.position.set(x, y, z);
    spr.scale.set(0.35, 0.35, 1);
    this.scene.add(spr);
    this.items.push({ obj: spr, life: 0.3, max: 0.3, type: 'impact' });
    this.cap();
  }

  flashLight(x, y, z) {
    this.impact(x, y, z);
  }

  cap() {
    while (this.items.length > 60) {
      const it = this.items.shift();
      this.scene.remove(it.obj);
      it.obj.geometry?.dispose?.();
      it.obj.material?.dispose?.();
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.life -= dt;
      const k = Math.max(0, it.life / it.max);
      if (it.type === 'tracer') {
        it.obj.material.opacity = 0.85 * k;
      } else {
        const s = 0.35 + (1 - k) * 0.2;
        it.obj.scale.set(s, s, 1);
        it.obj.material.opacity = Math.min(1, k * 1.6);
      }
      if (it.life <= 0) {
        this.scene.remove(it.obj);
        it.obj.geometry?.dispose?.();
        it.obj.material?.dispose?.();
        this.items.splice(i, 1);
      }
    }
  }
}
