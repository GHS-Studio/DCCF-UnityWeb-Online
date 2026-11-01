// 共享物理：玩家运动、碰撞检测、射线投射（服务端权威）
import { PLAYER } from './constants.js';

export function createState(spawn) {
  return {
    x: spawn.x, y: spawn.y, z: spawn.z,
    vx: 0, vy: 0, vz: 0,
    yaw: spawn.yaw || 0,
    onGround: false,
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
  // 返回是否与任意碰撞体相交
  for (const c of colliders) {
    if (x + r > c.minX && x - r < c.maxX &&
        y + PLAYER.height > c.minY && y < c.maxY &&
        z + r > c.minZ && z - r < c.maxZ) {
      return c;
    }
  }
  return null;
}

export function simulate(state, input, dt, colliders) {
  const { fwd = 0, strafe = 0, jump = false, sprint = false, yaw = state.yaw } = input;
  const speed = PLAYER.speed * (sprint ? PLAYER.sprintMul : 1);

  // 朝向方向（俯视平面）
  const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
  let dx = (fwd * sinY + strafe * cosY);
  let dz = (fwd * cosY - strafe * sinY);
  const len = Math.hypot(dx, dz);
  if (len > 0) { dx /= len; dz /= len; }

  state.vx = dx * speed;
  state.vz = dz * speed;

  // 跳跃
  if (jump && state.onGround) {
    state.vy = PLAYER.jumpSpeed;
    state.onGround = false;
  }

  // 重力
  state.vy -= PLAYER.gravity * dt;

  // 移动 + 碰撞（分轴）
  const r = PLAYER.radius;
  // X
  let nx = state.x + state.vx * dt;
  if (!aabbCollide(nx, state.y, state.z, r, colliders)) state.x = nx;
  else state.vx = 0;
  // Z
  let nz = state.z + state.vz * dt;
  if (!aabbCollide(state.x, state.y, nz, r, colliders)) state.z = nz;
  else state.vz = 0;
  // Y
  let ny = state.y + state.vy * dt;
  const hit = aabbCollide(state.x, ny, state.z, r, colliders);
  if (hit) {
    if (state.vy < 0) {
      state.y = hit.maxY;
      state.onGround = true;
    } else {
      state.y = hit.minY - PLAYER.height;
    }
    state.vy = 0;
  } else {
    state.y = ny;
    state.onGround = false;
  }

  // 地面
  if (state.y < 0) {
    state.y = 0;
    state.vy = 0;
    state.onGround = true;
  }

  // 地图边界
  state.x = Math.max(-MAP.halfWidth, Math.min(MAP.halfWidth, state.x));
  state.z = Math.max(-MAP.halfLength, Math.min(MAP.halfLength, state.z));

  state.yaw = yaw;
}

import { MAP } from './map.js';

export function raycastMap(ox, oy, oz, dx, dy, dz, colliders, range) {
  // 简化的 AABB 射线检测，返回最近命中点
  const invDx = dx !== 0 ? 1 / dx : Infinity;
  const invDy = dy !== 0 ? 1 / dy : Infinity;
  const invDz = dz !== 0 ? 1 / dz : Infinity;
  let bestT = range;
  let hit = null;
  for (const c of colliders) {
    const tx1 = (c.minX - ox) * invDx;
    const tx2 = (c.maxX - ox) * invDx;
    const tminX = Math.min(tx1, tx2);
    const tmaxX = Math.max(tx1, tx2);
    const ty1 = (c.minY - oy) * invDy;
    const ty2 = (c.maxY - oy) * invDy;
    const tminY = Math.min(ty1, ty2);
    const tmaxY = Math.max(ty1, ty2);
    const tz1 = (c.minZ - oz) * invDz;
    const tz2 = (c.maxZ - oz) * invDz;
    const tminZ = Math.min(tz1, tz2);
    const tmaxZ = Math.max(tz1, tz2);
    const tmin = Math.max(tminX, tminY, tminZ);
    const tmax = Math.min(tmaxX, tmaxY, tmaxZ);
    if (tmax >= Math.max(0, tmin) && tmin < bestT && tmin >= 0) {
      bestT = tmin;
      hit = { x: ox + dx * tmin, y: oy + dy * tmin, z: oz + dz * tmin };
    }
  }
  return hit;
}
