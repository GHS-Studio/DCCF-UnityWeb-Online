// 运输船 3D 场景：加载原版 .unity3d 提取的真实网格、贴图与光照参数
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MAP } from '../../shared/map.js';
import { skyTexture } from './textures.js';

const ASSET_BASE = (typeof location !== 'undefined' && location.protocol === 'file:')
  ? (location.href.replace(/[^/]*$/, '') + 'assets/')
  : 'assets/';

const MAP_BASE = ASSET_BASE + 'unity/map/';

function buildMaterial(spec, tex) {
  const c = spec.color || [1, 1, 1, 1];
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(c[0], c[1], c[2]),
    map: tex || null,
    roughness: Math.min(1, Math.max(0.05, 1 - (spec.glossiness ?? 0.5))),
    metalness: Math.min(1, Math.max(0, spec.metallic ?? 0)),
    side: THREE.FrontSide,
  });
  if (spec.transparent) {
    mat.transparent = true;
    mat.alphaTest = 0.35;
    mat.depthWrite = false;
  }
  if (tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  }
  return mat;
}

function loadRealMap(scene, high) {
  const objLoader = new OBJLoader();
  const texLoader = new THREE.TextureLoader();

  const texCache = new Map();
  const loadTex = (name) => {
    if (!name) return Promise.resolve(null);
    if (texCache.has(name)) return texCache.get(name);
    const p = new Promise((res) => {
      texLoader.load(MAP_BASE + encodeURIComponent(name), (t) => res(t), undefined, () => res(null));
    });
    texCache.set(name, p);
    return p;
  };

  const loadObj = (name) => new Promise((res) => {
    objLoader.load(MAP_BASE + encodeURIComponent(name), (g) => res(g), undefined, () => res(null));
  });

  fetch(MAP_BASE + 'map.json').then((r) => r.json()).then(async (meta) => {
    const matCache = new Map();
    const group = new THREE.Group();
    group.name = 'transport-ship';
    scene.add(group);

    let loaded = 0;
    for (const ren of meta.renderers) {
      for (const part of ren.parts) {
        const key = part.material.name + '|' + (part.texture || '');
        let matP = matCache.get(key);
        if (!matP) {
          matP = loadTex(part.texture).then((t) => buildMaterial(part.material, t));
          matCache.set(key, matP);
        }
        const [g, mat] = await Promise.all([loadObj(part.obj), matP]);
        if (!g) continue;
        g.traverse((child) => {
          if (child.isMesh) {
            child.material = mat;
            child.castShadow = high && ren.castShadows;
            child.receiveShadow = high;
            child.frustumCulled = true;
          }
        });
        group.add(g);
        loaded++;
      }
    }
    console.log('[world] 原始运输船资源已加载：' + loaded + ' 个网格分片');
    window.__shipLoaded = true;
  }).catch((e) => console.warn('[world] 原始地图加载失败', e));
}

export function buildWorld(renderer, quality = 'high') {
  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(0xa8bfcc);
  scene.fog = new THREE.Fog(fogColor, 120, 420);
  scene.background = skyTexture();

  const hemi = new THREE.HemisphereLight(0xd3e2ee, 0x33302a, 1.25);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1db, 2.25);
  sun.position.set(60, 90, 45);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);

  const high = quality === 'high';
  if (high) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55;
    sc.near = 10; sc.far = 260;
    sun.shadow.bias = -0.0007;
    sun.shadow.normalBias = 0.03;
  }

  loadRealMap(scene, high);

  // 海面
  const oceanMat = new THREE.MeshStandardMaterial({
    color: 0x1d4d5e, roughness: 0.34, metalness: 0.15,
  });
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 12, 12), oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = MAP.seaLevel;
  ocean.receiveShadow = true;
  scene.add(ocean);

  // 船体周围浪花
  const foam = new THREE.Mesh(
    new THREE.RingGeometry(50, 88, 96, 1, 0, Math.PI * 2),
    new THREE.MeshBasicMaterial({
      color: 0xcfe3ea, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = MAP.seaLevel + 0.05;
  foam.scale.set(1.45, 0.62, 1);
  scene.add(foam);

  let time = 0;
  let lastFocusX = 1e9, lastFocusZ = 1e9;

  return {
    scene, sun, quality,
    update(dt, camera) {
      time += dt;
      foam.material.opacity = 0.1 + Math.sin(time * 1.1) * 0.03;
      foam.rotation.z = Math.sin(time * 0.22) * 0.02;
      if (high && camera) {
        const px = camera.position.x, pz = camera.position.z;
        if (Math.abs(px - lastFocusX) > 12 || Math.abs(pz - lastFocusZ) > 12) {
          lastFocusX = px; lastFocusZ = pz;
          sun.target.position.set(px, 0, pz);
          sun.position.set(px + 60, 90, pz + 45);
          sun.target.updateMatrixWorld();
        }
      }
    },
  };
}
