// 客户端 3D 实体：远端玩家、第一人称武器、射击特效
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { PLAYER, WEAPONS, COLORS } from '../../shared/constants.js';
import { nameTagTexture, flashTexture, impactTexture } from './textures.js';

const ASSET_BASE = (typeof location !== 'undefined' && location.protocol === 'file:')
  ? (location.href.replace(/[^/]*$/, '') + 'assets/')
  : 'assets/';

const G = {
  torso: new THREE.BoxGeometry(0.56, 0.66, 0.32),
  head: new THREE.SphereGeometry(0.19, 10, 8),
  helmet: new THREE.SphereGeometry(0.215, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2),
  leg: new THREE.BoxGeometry(0.17, 0.78, 0.22),
  arm: new THREE.BoxGeometry(0.14, 0.62, 0.16),
  gun: new THREE.BoxGeometry(0.09, 0.12, 0.62),
  ring: new THREE.RingGeometry(0.42, 0.55, 20),
};

const M = {
  skin: new THREE.MeshStandardMaterial({ color: 0xc9a17a, roughness: 0.85 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1b2328, roughness: 0.8, metalness: 0.2 }),
  gun: new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.55, metalness: 0.6 }),
  teamA: new THREE.MeshStandardMaterial({ color: COLORS.teamA, roughness: 0.75 }),
  teamB: new THREE.MeshStandardMaterial({ color: COLORS.teamB, roughness: 0.75 }),
};

export class Soldier {
  constructor(scene, data) {
    this.id = data.i;
    this.name = data.n;
    this.team = data.tm;
    this.bot = data.bt === 1;

    const g = new THREE.Group();
    this.group = g;
    this.body = new THREE.Group();
    g.add(this.body);

    const teamMat = this.team === 0 ? M.teamA : M.teamB;

    const torso = new THREE.Mesh(G.torso, teamMat);
    torso.position.y = 1.05;
    torso.castShadow = true;
    this.body.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.42, 0.36), M.dark);
    vest.position.y = 1.16;
    vest.castShadow = true;
    this.body.add(vest);

    const head = new THREE.Mesh(G.head, M.skin);
    head.position.y = 1.56;
    head.castShadow = true;
    this.body.add(head);

    const helmet = new THREE.Mesh(G.helmet, M.dark);
    helmet.position.y = 1.60;
    this.body.add(helmet);

    this.legL = new THREE.Mesh(G.leg, M.dark);
    this.legL.position.set(-0.15, 0.39, 0);
    this.legL.castShadow = true;
    this.body.add(this.legL);

    this.legR = new THREE.Mesh(G.leg, M.dark);
    this.legR.position.set(0.15, 0.39, 0);
    this.legR.castShadow = true;
    this.body.add(this.legR);

    this.armL = new THREE.Mesh(G.arm, teamMat);
    this.armL.position.set(-0.36, 1.10, 0.04);
    this.body.add(this.armL);

    this.armR = new THREE.Mesh(G.arm, teamMat);
    this.armR.position.set(0.36, 1.10, 0.04);
    this.body.add(this.armR);

    const gun = new THREE.Mesh(G.gun, M.gun);
    gun.position.set(0.30, 1.18, 0.30);
    this.body.add(gun);

    const ring = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({
      color: this.team === 0 ? 0xffb03a : 0x4aa8ff,
      transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false,
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
    g.rotation.y = data.yw + Math.PI;
    this.target = { x: data.x, y: data.y, z: data.z, yaw: data.yw, pitch: data.pt || 0 };
    this.alive = data.al === 1;
    this.health = data.hp;
    this.weapon = data.wp || 'rifle';
    this.kills = data.k || 0;
    this.deaths = data.d || 0;
    this.spawnProtected = data.sp === 1;
    g.visible = this.alive;
    this.phase = Math.random() * Math.PI * 2;
    this.walk = 0;
    this.speedNow = 0;

    scene.add(g);
  }

  setData(p) {
    this.target.x = p.x; this.target.y = p.y; this.target.z = p.z;
    this.target.yaw = p.yw; this.target.pitch = p.pt || 0;
    this.health = p.hp;
    this.alive = p.al === 1;
    this.team = p.tm;
    this.kills = p.k;
    this.deaths = p.d;
    this.weapon = p.wp;
    this.spawnProtected = p.sp === 1;
    this.group.visible = this.alive;
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

    let dyaw = this.target.yaw + Math.PI - this.group.rotation.y;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.group.rotation.y += dyaw * k;

    this.body.rotation.x = -this.target.pitch * 0.45;

    const moving = Math.min(1, this.speedNow / 6);
    this.walk += dt * (6 + moving * 7);
    const sw = Math.sin(this.walk) * 0.65 * moving;
    this.legL.rotation.x = sw;
    this.legR.rotation.x = -sw;
    this.armL.rotation.x = -sw * 0.5;
    this.armR.rotation.x = -0.25 + Math.sin(this.walk) * 0.12 * moving;
    this.body.position.y = moving > 0.2 ? Math.abs(Math.sin(this.walk)) * 0.04 : 0;

    this.tag.material.opacity = 1;
  }

  dispose(scene) {
    scene.remove(this.group);
    this.tag.material.map?.dispose();
    this.tag.material.dispose();
  }
}

// ---------------- 第一人称武器 ----------------
function boxMesh(size, pos, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), mat);
  m.position.set(pos[0], pos[1], pos[2]);
  m.castShadow = false;
  return m;
}

export class ViewModel {
  constructor(camera) {
    this.camera = camera;
    this.scene = camera.parent;
    this.root = new THREE.Group();
    this.root.position.set(0.22, -0.20, -0.5);
    this.root.scale.setScalar(0.72);
    camera.add(this.root);

    this.models = {};
    this.realModels = {};
    this.flashes = [];
    this.flashMap = {};

    const dark = new THREE.MeshStandardMaterial({ color: 0x3b434a, roughness: 0.5, metalness: 0.55 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x555f68, roughness: 0.45, metalness: 0.55 });

    // M4A1 占位
    {
      const g = new THREE.Group();
      g.add(boxMesh([0.09, 0.11, 0.52], [0, 0, -0.1], dark));
      g.add(boxMesh([0.075, 0.075, 0.30], [0, 0.01, -0.5], mid));
      g.add(boxMesh([0.065, 0.20, 0.10], [0, -0.13, 0.02], mid));
      g.add(boxMesh([0.08, 0.13, 0.30], [0, -0.02, 0.28], dark));
      g.add(boxMesh([0.05, 0.05, 0.22], [0, 0.06, -0.30], dark));
      this.addFlash(g, [0, 0.01, -0.78]);
      this.models.rifle = g;
    }
    // AWM 占位
    {
      const g = new THREE.Group();
      g.add(boxMesh([0.09, 0.1, 0.95], [0, 0, -0.2], dark));
      g.add(boxMesh([0.07, 0.07, 0.42], [0, 0.02, -0.78], mid));
      g.add(boxMesh([0.12, 0.12, 0.34], [0, 0.02, 0.32], dark));
      g.add(boxMesh([0.05, 0.06, 0.16], [0, -0.12, 0.05], mid));
      this.addFlash(g, [0, 0.02, -1.0]);
      this.models.sniper = g;
    }
    // 沙鹰占位
    {
      const g = new THREE.Group();
      g.add(boxMesh([0.075, 0.12, 0.36], [0, 0.02, -0.05], mid));
      g.add(boxMesh([0.07, 0.20, 0.09], [0, -0.13, 0.06], dark));
      g.add(boxMesh([0.045, 0.045, 0.14], [0, 0.02, -0.25], dark));
      this.addFlash(g, [0, 0.02, -0.34]);
      this.models.pistol = g;
    }

    for (const key of Object.keys(this.models)) {
      this.models[key].visible = false;
      this.root.add(this.models[key]);
    }
    this.current = 'rifle';
    this.models.rifle.visible = true;
    this.recoil = 0;
    this.bob = 0;
    this.ads = 0;
    this.flashTime = 0;
    this.visible = true;

    this._loadRealWeapons();
  }

  _loadRealWeapons() {
    const loader = new OBJLoader();
    const texLoader = new THREE.TextureLoader();
    const specs = [
      { key: 'rifle', obj: 'm4a1.obj', tex: 'm4a1_tex.png', scale: 0.8, pos: [0.22, -0.20, -0.5], rot: [0, -Math.PI / 2, 0], muzzle: [-0.22, 0, 0] },
      { key: 'sniper', obj: 'awm.obj', tex: 'awm_tex.png', scale: 0.5, pos: [0.22, -0.20, -0.5], rot: [0, Math.PI, 0], muzzle: [0, 0, 0.39] },
      { key: 'pistol', obj: 'deagle.obj', tex: 'deagle_tex.png', scale: 1.0, pos: [0.22, -0.20, -0.5], rot: [0, -Math.PI / 2, 0], muzzle: [-0.077, 0, 0] },
    ];
    for (const s of specs) {
      const tex = new Promise((res) => {
        texLoader.load(ASSET_BASE + s.tex, (t) => { t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null));
      });
      const meshP = new Promise((res) => {
        loader.load(ASSET_BASE + s.obj, (g) => res(g), undefined, () => res(null));
      });
      Promise.all([tex, meshP]).then(([t, g]) => {
        if (!g) return;
        const mat = new THREE.MeshStandardMaterial({ map: t || null, roughness: 0.7, metalness: 0.3 });
        g.traverse((c) => { if (c.isMesh) { c.material = mat; c.castShadow = false; } });
        g.scale.setScalar(s.scale);
        g.userData._basePos = new THREE.Vector3(s.pos[0], s.pos[1], s.pos[2]);
        g.userData._baseRot = new THREE.Euler(s.rot[0], s.rot[1], s.rot[2]);
        g.visible = false;
        // 放在 scene 中而非 camera 子节点，避免 SwiftShader 渲染 camera 子网格时崩溃
        this.scene.add(g);
        this.realModels[s.key] = g;

        const flash = new THREE.Sprite(new THREE.SpriteMaterial({
          map: flashTexture(), color: 0xffd28a, blending: THREE.AdditiveBlending,
          transparent: true, depthWrite: false, depthTest: false,
        }));
        flash.position.set(s.muzzle[0], s.muzzle[1], s.muzzle[2]);
        flash.scale.set(0.28, 0.28, 1);
        flash.visible = false;
        g.add(flash);
        this.flashMap[s.key] = flash;

        this.models[s.key].visible = false;
        if (s.key === this.current) g.visible = true;
      }).catch(() => {});
    }
  }

  addFlash(parent, pos) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTexture(), color: 0xffd28a, blending: THREE.AdditiveBlending,
      transparent: true, depthWrite: false, depthTest: false,
    }));
    sprite.position.set(pos[0], pos[1], pos[2]);
    sprite.scale.set(0.28, 0.28, 1);
    sprite.visible = false;
    parent.add(sprite);
    this.flashes.push(sprite);
  }

  setWeapon(w) {
    if (!this.models[w]) return;
    this.current = w;
    for (const k of Object.keys(this.models)) this.models[k].visible = k === w;
    for (const k of Object.keys(this.realModels)) this.realModels[k].visible = k === w;
    this.flashes.forEach((f) => { f.visible = false; });
    for (const k of Object.keys(this.flashMap)) this.flashMap[k].visible = false;
  }

  triggerFlash() {
    const realFlash = this.flashMap[this.current];
    if (realFlash) {
      realFlash.visible = true;
      realFlash.material.rotation = Math.random() * Math.PI;
      const s = 0.24 + Math.random() * 0.16;
      realFlash.scale.set(s, s, 1);
    } else {
      const g = this.models[this.current];
      if (!g) return;
      const flash = this.flashes[Object.keys(this.models).indexOf(this.current)];
      if (flash) {
        flash.visible = true;
        flash.material.rotation = Math.random() * Math.PI;
        const s = 0.24 + Math.random() * 0.16;
        flash.scale.set(s, s, 1);
      }
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
    const bobAmt = moving * 0.012;
    const adsPos = new THREE.Vector3(0.0, -0.115, -0.34);
    const hipPos = new THREE.Vector3(0.22, -0.20, -0.42);
    const pos = hipPos.clone().lerp(adsPos, this.ads);
    pos.x += Math.sin(this.bob) * bobAmt;
    pos.y += Math.cos(this.bob * 2) * bobAmt * 0.7;
    if (sprint) { pos.y -= 0.05; pos.x += 0.03; }
    pos.z += this.recoil * 0.05;
    this.recoil = Math.max(0, this.recoil - dt * 5.5);
    this.root.position.copy(pos);
    this.root.rotation.z = this.ads * 0.0;
    this.root.rotation.x = -this.recoil * 0.12 - this.ads * 0.02;

    // 同步真实武器模型到相机
    const cam = this.camera;
    const rootQuat = new THREE.Quaternion().setFromEuler(this.root.rotation);
    for (const key of Object.keys(this.realModels)) {
      const g = this.realModels[key];
      const active = key === this.current;
      g.visible = active && showVM;
      if (!active) continue;
      const offset = pos.clone();
      offset.applyQuaternion(cam.quaternion);
      g.position.copy(cam.position).add(offset);
      const baseQuat = new THREE.Quaternion().setFromEuler(g.userData._baseRot);
      g.quaternion.copy(cam.quaternion).multiply(rootQuat).multiply(baseQuat);
    }

    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) {
        this.flashes.forEach((f) => { f.visible = false; });
        for (const k of Object.keys(this.flashMap)) this.flashMap[k].visible = false;
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
