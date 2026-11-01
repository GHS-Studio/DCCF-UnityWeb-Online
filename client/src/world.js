// 运输船 3D 场景（优先加载原始 .unity3d 提取的网格与贴图，否则使用程序化几何）
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MAP } from '../../shared/map.js';
import { metalTexture, containerTexture, woodTexture, barrelTexture, skyTexture } from './textures.js';

const ASSET_BASE = (typeof location !== 'undefined' && location.protocol === 'file:')
  ? (location.href.replace(/[^/]*$/, '') + 'assets/')
  : 'assets/';

function repeatTexture(tex, rx, ry) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(1, Math.round(rx)), Math.max(1, Math.round(ry)));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 尝试加载原始运输船网格 + 贴图（若 assets 中存在）
function loadOriginalShip(scene, high) {
  const loader = new OBJLoader();
  const texLoader = new THREE.TextureLoader();

  const meshNames = ['polySurface528', 'polySurface588', 'polySurface620', 'polySurface621'];

  Promise.all([
    new Promise((resolve) => {
      texLoader.load(ASSET_BASE + 'yunshuchuan.png', (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = high ? 8 : 4;
        resolve(tex);
      }, undefined, () => resolve(null));
    }),
    Promise.all(meshNames.map((name) => new Promise((resolve) => {
      loader.load(ASSET_BASE + name + '.obj', (g) => resolve(g), undefined, () => resolve(null));
    }))),
    fetch(ASSET_BASE + 'map_entities.json').then((r) => r.json()).catch(() => []),
  ]).then(([tex, meshes, entities]) => {
    if (!tex || !meshes.some(Boolean)) return; // 资源不全则跳过
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.72, metalness: 0.18,
      emissive: new THREE.Color(0x1a1a1a), emissiveMap: tex, emissiveIntensity: 0.35,
    });
    const shipGroup = new THREE.Group();
    shipGroup.rotation.y = Math.PI / 2;
    shipGroup.scale.setScalar(0.39);
    shipGroup.position.y = -2.5;
    const byName = {};
    meshes.forEach((g, i) => { if (g) byName[meshNames[i]] = g; });
    const entByName = {};
    for (const e of entities) entByName[e.mesh_name] = e;
    for (const name of meshNames) {
      const g = byName[name];
      if (!g) continue;
      g.traverse((c) => { if (c.isMesh) { c.material = mat; c.castShadow = high; c.receiveShadow = high; } });
      const ent = entByName[name];
      if (ent) {
        g.position.set(ent.position[0], ent.position[1], ent.position[2]);
        g.scale.set(ent.scale[0], ent.scale[1], ent.scale[2]);
      }
      shipGroup.add(g);
    }
    scene.add(shipGroup);
  }).catch(() => {});
}

export function buildWorld(renderer, quality = 'high') {
  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(0x9db8c6);
  scene.fog = new THREE.Fog(fogColor, 55, 300);
  scene.background = skyTexture();

  const hemi = new THREE.HemisphereLight(0xcfe4ef, 0x2b363b, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffe9c9, 2.1);
  sun.position.set(52, 78, 34);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  const high = quality === 'high';
  if (high) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0008;
  }

  // 尝试加载原始运输船网格
  loadOriginalShip(scene, high);

  // 甲板主体（程序化，作为原始资源的补充/兜底）
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 0.85, metalness: 0.1 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.3, 64.4), deckMat);
  deck.position.y = -0.15;
  deck.receiveShadow = true;
  scene.add(deck);

  // 船体侧面
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x4a4238, roughness: 0.8, metalness: 0.2 });
  for (const sx of [-1, 1]) {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 64), hullMat);
    hull.position.set(sx * 10.2, -1.6, 0);
    scene.add(hull);
  }

  // 地图道具
  const metal = metalTexture();
  const wood = woodTexture();
  const barrel = barrelTexture();
  const matCache = new Map();
  function materialFor(b) {
    const key = `${b.t}|${Math.round(b.sx)}x${Math.round(b.sy)}x${Math.round(b.sz)}|${b.color}`;
    if (matCache.has(key)) return matCache.get(key);
    let m;
    switch (b.t) {
      case 'container': {
        const tex = repeatTexture(containerTexture(b.color), Math.max(1, b.sz / 2.5), 1);
        m = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.72, metalness: 0.35 });
        break;
      }
      case 'crate':
        m = new THREE.MeshStandardMaterial({ map: repeatTexture(wood, 1, 1), color: 0xffffff, roughness: 0.94, metalness: 0.02 });
        break;
      case 'barrel':
        m = new THREE.MeshStandardMaterial({ map: repeatTexture(barrel, 1, 1), color: 0xffffff, roughness: 0.8, metalness: 0.3 });
        break;
      default:
        m = new THREE.MeshStandardMaterial({ map: repeatTexture(metal, 1, 1), color: b.color, roughness: 0.7, metalness: 0.55 });
    }
    matCache.set(key, m);
    return m;
  }

  for (const b of MAP.boxes) {
    if (b.t === 'deck' || b.t === 'deckDark' || b.t === 'hull' || b.t === 'bulwark' || b.t === 'step') continue;
    let geo;
    if (b.t === 'barrel') geo = new THREE.CylinderGeometry(0.5, 0.5, b.sy, 14, 1);
    else if (b.t === 'pole') geo = new THREE.CylinderGeometry(0.16, 0.2, b.sy, 10, 1);
    else geo = new THREE.BoxGeometry(b.sx, b.sy, b.sz);
    const mesh = new THREE.Mesh(geo, materialFor(b));
    mesh.position.set(b.x, b.y, b.z);
    mesh.castShadow = high && b.t !== 'rail';
    mesh.receiveShadow = high;
    scene.add(mesh);
  }

  // 舷侧栏杆
  const railMat = new THREE.MeshStandardMaterial({ color: 0x8a949c, roughness: 0.55, metalness: 0.75 });
  const postGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.0, 6);
  const railGroups = new THREE.Group();
  for (const side of [-1, 1]) {
    for (let z = -30; z <= 30; z += 3.2) {
      const post = new THREE.Mesh(postGeo, railMat);
      post.position.set(side * 10.0, 1.72, z);
      railGroups.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 62, 6), railMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(side * 10.0, 2.2, 0);
    railGroups.add(bar);
  }
  for (const z of [-32, 32]) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 20.4, 6), railMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 2.2, z);
    railGroups.add(bar);
  }
  scene.add(railGroups);

  // 船首吊机
  const craneMat = new THREE.MeshStandardMaterial({ color: 0x9a6a2a, roughness: 0.65, metalness: 0.5 });
  const crane = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(0.5, 7.2, 0.5);
  for (const dx of [-3.2, 3.2]) {
    const leg = new THREE.Mesh(legGeo, craneMat);
    leg.position.set(dx, 3.6, 29.2);
    crane.add(leg);
  }
  const arm = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.55, 0.6), craneMat);
  arm.position.set(0, 7.15, 29.2);
  arm.rotation.z = 0.18;
  crane.add(arm);
  scene.add(crane);

  // 救生圈
  const buoyMat = new THREE.MeshStandardMaterial({ color: 0xe06a20, roughness: 0.7 });
  for (const [x, z] of [[-9.85, -18], [9.85, 18], [-9.85, 18]]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.15, 8, 16), buoyMat);
    t.position.set(x, 1.05, z);
    t.rotation.y = Math.PI / 2;
    scene.add(t);
  }

  // 海面
  const oceanGeo = new THREE.PlaneGeometry(800, 800, 8, 8);
  const oceanMat = new THREE.MeshStandardMaterial({ color: 0x1a4a5a, roughness: 0.35, metalness: 0.1 });
  const ocean = new THREE.Mesh(oceanGeo, oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = MAP.seaLevel;
  scene.add(ocean);

  const foam = new THREE.Mesh(
    new THREE.RingGeometry(13, 22, 64, 1, 0, Math.PI * 2),
    new THREE.MeshBasicMaterial({ color: 0xb9d2da, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = MAP.seaLevel + 0.06;
  foam.scale.set(1, 1.9, 1);
  scene.add(foam);

  let time = 0;
  return {
    scene, sun, quality,
    update(dt) {
      time += dt;
      foam.material.opacity = 0.13 + Math.sin(time * 1.4) * 0.04;
      foam.rotation.z = Math.sin(time * 0.25) * 0.02;
    },
  };
}
