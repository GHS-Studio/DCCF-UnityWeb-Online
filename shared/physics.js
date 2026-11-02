// 共享物理：玩家运动、多层高度场碰撞、射线投射（服务端权威）
import { PLAYER } from './constants.js';
import { MAP, levelsAt, groundBelow, cellBlocked } from './map.js';

const STEP = 1.1;

export function createState(spawn) {
  return {
    x: spawn.x, y: spawn.y, z: spawn.z,
    vx: 0, vy: 0, vz: 0,
    yaw: spawn.yaw || 0,
    onGround: true,
  };
}

export function dirFromAngles(yaw, pitch) {
  const cp = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * cp,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * cp,
  };
}

function aabbCollide(x, y, z, r, colliders) {
  for (const c of colliders) {
    if (x + r > c.minX && x - r < c.maxX &&
        y + PLAYER.height > c.minY && y < c.maxY &&
        z + r > c.minZ && z - r < c.maxZ) {
      return c;
    }
  }
  return null;
}

function inBounds(x, z) {
  const b = MAP.bounds;
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

export function simulate(state, input, dt, colliders) {
  const { fwd = 0, strafe = 0, jump = false, sprint = false, yaw = state.yaw } = input;
  const speed = PLAYER.speed * (sprint ? PLAYER.sprintMul : 1);

  const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
  let dx = (fwd * sinY + strafe * cosY);
  let dz = (fwd * cosY - strafe * sinY);
  const len = Math.hypot(dx, dz);
  if (len > 0) { dx /= len; dz /= len; }

  state.vx = dx * speed;
  state.vz = dz * speed;

  if (jump && state.onGround) {
    state.vy = PLAYER.jumpSpeed;
    state.onGround = false;
  }

  state.vy -= PLAYER.gravity * dt;

  const r = PLAYER.radius;
  const canStand = (x, z, y) => inBounds(x, z) && !cellBlocked(x, z, y) &&
    groundBelow(x, z, y) !== null && !aabbCollide(x, y, z, r, colliders);

  // 分轴水平移动（带台阶与实体阻挡）
  const nx = state.x + state.vx * dt;
  if (canStand(nx, state.z, state.y)) state.x = nx;
  else state.vx = 0;
  const nz = state.z + state.vz * dt;
  if (canStand(state.x, nz, state.y)) state.z = nz;
  else state.vz = 0;

  // 垂直：高度场落地
  const ny = state.y + state.vy * dt;
  const gh = groundBelow(state.x, state.z, state.y);
  if (gh !== null && ny <= gh) {
    state.y = gh;
    state.vy = 0;
    state.onGround = true;
  } else {
    state.y = ny;
    state.onGround = false;
  }

  state.yaw = yaw;
}

// 射线检测：先查实心盒，再沿射线采样多层高度场顶面
export function raycastMap(ox, oy, oz, dx, dy, dz, colliders, range) {
  const invDx = dx !== 0 ? 1 / dx : Infinity;
  const invDy = dy !== 0 ? 1 / dy : Infinity;
  const invDz = dz !== 0 ? 1 / dz : Infinity;
  let bestT = range;
  let hit = null;
  for (const c of colliders) {
    const tx1 = (c.minX - ox) * invDx, tx2 = (c.maxX - ox) * invDx;
    const tminX = Math.min(tx1, tx2), tmaxX = Math.max(tx1, tx2);
    const ty1 = (c.minY - oy) * invDy, ty2 = (c.maxY - oy) * invDy;
    const tminY = Math.min(ty1, ty2), tmaxY = Math.max(ty1, ty2);
    const tz1 = (c.minZ - oz) * invDz, tz2 = (c.maxZ - oz) * invDz;
    const tminZ = Math.min(tz1, tz2), tmaxZ = Math.max(tz1, tz2);
    const tmin = Math.max(tminX, tminY, tminZ);
    const tmax = Math.min(tmaxX, tmaxY, tmaxZ);
    if (tmax >= Math.max(0, tmin) && tmin < bestT && tmin >= 0) {
      bestT = tmin;
      hit = { x: ox + dx * tmin, y: oy + dy * tmin, z: oz + dz * tmin };
    }
  }

  // 高度场：检测从上向下穿过某个表面
  const step = 0.8;
  let prevY = oy;
  for (let t = step; t <= bestT; t += step) {
    const px = ox + dx * t, py = oy + dy * t, pz = oz + dz * t;
    if (!inBounds(px, pz)) break;
    const lv = levelsAt(px, pz);
    if (lv) {
      const top = lv[lv.length - 1];
      if (prevY >= top && py < top) {
        const k = (prevY - top) / (prevY - py || 1);
        const tt = t - step + k * step;
        bestT = Math.max(0, tt);
        hit = { x: ox + dx * bestT, y: top, z: oz + dz * bestT };
        break;
      }
    }
    prevY = py;
  }
  return hit;
}
