// 运输船地图：碰撞体与出生点
export const MAP = {
  name: 'transport-ship-1',
  seaLevel: -2.5,
  deckY: 0,
  halfWidth: 10.2,
  halfLength: 32.2,
  spawns: [
    // 潜伏者（A队）出生点 - 船首
    { x: 0, y: 0, z: 28, yaw: Math.PI },
    { x: -3, y: 0, z: 28, yaw: Math.PI },
    { x: 3, y: 0, z: 28, yaw: Math.PI },
    { x: -6, y: 0, z: 26, yaw: Math.PI },
    { x: 6, y: 0, z: 26, yaw: Math.PI },
    // 保卫者（B队）出生点 - 船尾
    { x: 0, y: 0, z: -28, yaw: 0 },
    { x: -3, y: 0, z: -28, yaw: 0 },
    { x: 3, y: 0, z: -28, yaw: 0 },
    { x: -6, y: 0, z: -26, yaw: 0 },
    { x: 6, y: 0, z: -26, yaw: 0 },
  ],
  // 可碰撞箱子（用于服务端物理 + 客户端装饰）
  boxes: [
    // 中部集装箱群
    { t: 'container', x: 0, y: 1.25, z: 0, sx: 2.5, sy: 2.5, sz: 6, color: 0x2a6b3a },
    { t: 'container', x: -4, y: 1.25, z: -2, sx: 2.5, sy: 2.5, sz: 6, color: 0x8a4a2a },
    { t: 'container', x: 4, y: 1.25, z: 2, sx: 2.5, sy: 2.5, sz: 6, color: 0x2a4a8a },
    { t: 'container', x: 0, y: 3.75, z: 0, sx: 2.5, sy: 2.5, sz: 6, color: 0x6a2a2a },
    // 木箱掩体
    { t: 'crate', x: -7, y: 0.5, z: 8, sx: 1.2, sy: 1.0, sz: 1.2 },
    { t: 'crate', x: 7, y: 0.5, z: -8, sx: 1.2, sy: 1.0, sz: 1.2 },
    { t: 'crate', x: -7, y: 0.5, z: -8, sx: 1.2, sy: 1.0, sz: 1.2 },
    { t: 'crate', x: 7, y: 0.5, z: 8, sx: 1.2, sy: 1.0, sz: 1.2 },
    // 油桶
    { t: 'barrel', x: -2, y: 0.5, z: 12, sx: 0.5, sy: 1.0, sz: 0.5 },
    { t: 'barrel', x: 2, y: 0.5, z: 12, sx: 0.5, sy: 1.0, sz: 0.5 },
    { t: 'barrel', x: -2, y: 0.5, z: -12, sx: 0.5, sy: 1.0, sz: 0.5 },
    { t: 'barrel', x: 2, y: 0.5, z: -12, sx: 0.5, sy: 1.0, sz: 0.5 },
    // 船首/船尾掩体
    { t: 'container', x: 0, y: 1.25, z: 20, sx: 3, sy: 2.5, sz: 3, color: 0x4a6a2a },
    { t: 'container', x: 0, y: 1.25, z: -20, sx: 3, sy: 2.5, sz: 3, color: 0x6a4a2a },
    // 甲板边缘台阶
    { t: 'step', x: 0, y: 0.15, z: 0, sx: 20, sy: 0.3, sz: 64 },
  ],
};

export function getColliders() {
  return MAP.boxes
    .filter((b) => b.t !== 'deck' && b.t !== 'deckDark' && b.t !== 'hull' && b.t !== 'bulwark' && b.t !== 'step')
    .map((b) => ({
      minX: b.x - b.sx / 2, maxX: b.x + b.sx / 2,
      minY: b.y - b.sy / 2, maxY: b.y + b.sy / 2,
      minZ: b.z - b.sz / 2, maxZ: b.z + b.sz / 2,
    }));
}
