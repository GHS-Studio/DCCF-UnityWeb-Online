// 原版 Unity 角色/武器资源加载器（骨骼 + 蒙皮）
import * as THREE from 'three';

const ASSET_BASE = (typeof location !== 'undefined' && location.protocol === 'file:')
  ? (location.href.replace(/[^/]*$/, '') + 'assets/')
  : 'assets/';

let cachedPromise = null;
const texCache = new Map();
const matCache = new Map();

function texture(dir, name) {
  const key = dir + '/' + name;
  if (texCache.has(key)) return texCache.get(key);
  const tex = new THREE.TextureLoader().load(ASSET_BASE + dir + '/' + encodeURIComponent(name));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // Unity 导出时已翻转 V
  texCache.set(key, tex);
  return tex;
}

function json(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error('加载失败: ' + url);
    return r.json();
  });
}

export function loadUnityModels() {
  if (!cachedPromise) {
    cachedPromise = Promise.all([
      json(ASSET_BASE + 'unity/actors/actors.json'),
      json(ASSET_BASE + 'unity/weapons/weapons.json'),
    ]).then(([a, w]) => ({ characters: a.characters, weapons: w.weapons }))
      .catch((err) => {
        console.error('[actors] 原始角色/武器资源加载失败', err);
        return { characters: {}, weapons: {} };
      });
  }
  return cachedPromise;
}

function makeMaterial(spec, dir) {
  const key = dir + '|' + JSON.stringify(spec);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(1, 1, 1),
    roughness: spec.rough ?? 0.7,
    metalness: spec.metallic ?? 0.0,
    transparent: !!spec.transparent,
    alphaTest: spec.alphaTest || 0,
    side: THREE.FrontSide,
  });
  const c = spec.color || [1, 1, 1, 1];
  m.color.setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace);
  if (spec.map) {
    const tex = texture(dir, spec.map);
    if (spec.tiling) tex.repeat.set(spec.tiling[0], spec.tiling[1]);
    if (spec.offset) tex.offset.set(spec.offset[0], -spec.offset[1]);
    m.map = tex;
  }
  matCache.set(key, m);
  return m;
}

function buildGeometry(geo) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(geo.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(geo.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(geo.uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(geo.bi.flat ? geo.bi.flat() : [].concat(...geo.bi), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(geo.bw.flat ? geo.bw.flat() : [].concat(...geo.bw), 4));
  const idx = new Uint32Array(geo.idx);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  for (const grp of geo.groups) {
    g.addGroup(grp[1], grp[2], grp[0]);
  }
  g.computeBoundingSphere();
  return g;
}

/**
 * 构建原版模型。
 * opts.scale: 缩放；opts.rotationX: 绕 X 轴旋转（Unity Z-up → Three Y-up 用 -PI/2）
 */
export function buildModel(model, dir, opts = {}) {
  const root = new THREE.Group();
  const bones = [];
  const byName = new Map();

  for (const b of model.bones) {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.set(b.pos[0], b.pos[1], b.pos[2]);
    bone.quaternion.set(b.quat[0], b.quat[1], b.quat[2], b.quat[3]);
    bone.scale.set(b.scale[0], b.scale[1], b.scale[2]);
    bones.push(bone);
    if (!byName.has(b.name)) byName.set(b.name, bone);
    if (b.parent >= 0) bones[b.parent].add(bone);
    else root.add(bone);
  }

  const materials = model.materials.map((spec) => makeMaterial(spec, dir));
  const meshes = [];

  for (const part of model.parts) {
    const geo = buildGeometry(part.geom);
    const mats = part.mats.map((i) => materials[i]);
    let mesh;
    if (part.skinned && part.bind) {
      const binds = part.bind.map((arr) => new THREE.Matrix4().fromArray(arr));
      mesh = new THREE.SkinnedMesh(geo, mats);
      mesh.bind(new THREE.Skeleton(bones, binds));
      mesh.frustumCulled = false;
      root.add(mesh);
      meshes.push(mesh);
    } else {
      mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
      mesh.frustumCulled = false;
      root.add(mesh);
    }
    mesh.castShadow = opts.shadow !== false;
    mesh.receiveShadow = false;
  }

  if (opts.rotationX) root.rotation.x = opts.rotationX;
  if (opts.scale) root.scale.setScalar(opts.scale);

  return {
    root,
    bones,
    byName,
    meshes,
    materials,
    bbox: model.bbox,
    muzzle: model.muzzle || null,
    dispose() {
      for (const m of materials) { m.map?.dispose(); m.dispose(); }
      root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    },
  };
}

/**
 * 第三人称枪身：几何已烘焙在右手骨骼局部空间，直接挂到角色右手骨骼即可。
 */
export function buildHeldGun(model, dir) {
  const h = model.held;
  if (!h) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(h.pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(h.uv, 2));
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(h.idx), 1));
  for (const grp of h.groups) geo.addGroup(grp[1], grp[2], grp[0]);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mats = h.mats.map((i) => makeMaterial(model.materials[i], dir));
  const mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
  mesh.scale.setScalar(h.scale);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

// 角色模型统一参数：原始网格约 5.24 单位高（3ds Max Z-up），缩放到 1.8m
export const CHAR_SCALE = 0.345;
export const CHAR_ROTATION_X = -Math.PI / 2;
// 武器模型：Z-up，旋转后枪口指向 -Z（相机前方）
export const WEAPON_ROTATION_X = -Math.PI / 2;
