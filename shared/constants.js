// 共享常量：协议版本、玩家属性、武器参数、队伍信息
export const PROTOCOL_VERSION = 1;

export const PLAYER = {
  maxHealth: 100,
  speed: 5.6,
  sprintMul: 1.5,
  eye: 1.62,
  height: 1.8,
  radius: 0.32,
  jumpSpeed: 6.8,
  gravity: 20,
  spawnProtect: 3.0,
};

export const WEAPONS = {
  rifle: {
    name: 'M4A1', damage: 24, headMul: 3.2, rpm: 650, mag: 30, reserve: 90,
    reload: 2.1, range: 120, spread: 0.012, auto: true, zoom: false, tracer: 0xffe08a,
  },
  sniper: {
    name: 'AWM', damage: 110, headMul: 1.5, rpm: 42, mag: 5, reserve: 25,
    reload: 3.0, range: 300, spread: 0.001, auto: false, zoom: true, tracer: 0xffc040,
  },
  pistol: {
    name: '沙漠之鹰', damage: 38, headMul: 2.6, rpm: 260, mag: 7, reserve: 35,
    reload: 1.9, range: 80, spread: 0.018, auto: false, zoom: false, tracer: 0xffd060,
  },
};

export const WEAPON_ORDER = ['rifle', 'sniper', 'pistol'];

export const COLORS = {
  teamA: 0xb46f13,
  teamB: 0x1f4f78,
};

export const INPUT_RATE = 20;
export const RESPAWN_SECONDS = 5;
export const MATCH_DURATION = 600;

export const TEAM_INFO = [
  { id: 0, name: '潜伏者', color: 0xffb03a },
  { id: 1, name: '保卫者', color: 0x4aa8ff },
];
