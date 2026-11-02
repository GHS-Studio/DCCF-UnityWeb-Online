// 原版音效：直接播放 Unity 包内解出的 WAV（assets/unity/audio）
// 使用 HTMLAudio 元素池，兼容 file://（Electron/APK）与 http://（浏览器）
const ASSET_BASE = (typeof location !== 'undefined' && location.protocol === 'file:')
  ? (location.href.replace(/[^/]*$/, '') + 'assets/unity/audio/')
  : 'assets/unity/audio/';

// 逻辑分类 -> 原始 AudioClip 文件名
const CATS = {
  shot_rifle: ['M4A1_SHOOT_1', 'M4A1-S-Beast_SHOOT_2'],
  shot_sniper: ['G_SHOOT_AWM', 'G_SHOOT_BARRET'],
  shot_pistol: ['G_SHOOT_DEAGLE_1', 'G_SHOOT_GLOCK_1'],
  reload_rifle: ['M4A1-S-Beast_Reload', 'M4A1-S-Beast_ClipOut', 'M4A1-S-Beast_ClipIn'],
  reload_sniper: ['G_RELOAD_AWM', 'G_MZC_AWM_CLIPOUT', 'G_MZC_AWM_CLIPIN'],
  reload_pistol: ['G_RELOAD_DEAGLE', 'G_MZC_DEAGLE_CLIPOUT', 'G_MZC_DEAGLE_CLIPIN'],
  empty: ['G_MZC_DEAGLE_BCBACK', 'G_MZC_GLOCK_BCBACK'],
  step: ['C_RUN_RIGHT_METAL1', 'C_RUN_RIGHT_METAL2', 'C_RUN_RIGHT_METAL3', 'C_RUN_RIGHT_METAL4', 'C_RUN_RIGHT_METAL5', 'C_RUN_RIGHT_METAL6'],
  hit_metal: ['G_HIT_METAL1', 'G_HIT_METAL2', 'G_HIT_METAL3'],
  hit_soft: ['G_HIT_DIRT2', 'G_HIT_Carpet1', 'G_HIT_PAPER1'],
  hit_hard: ['G_HIT_STONE3', 'G_HIT_TREE1', 'G_HIT_TREE2', 'G_HIT_TREE3'],
  headshot: ['UI_SPECIALKILL2'],
  death: ['ManDie_HighDamage_BL', 'ManDie_HighDamage_GR', 'WomanDie_HighDamage_BL', 'WomanDie_HighDamage_GR'],
  spawn: ['WeaponUpgrade_LevelUp'],
  ui: ['BARRET_SELECT', 'Kucri_Select', 'SHOVEL_SELECT', 'UI_NOTIFY'],
  bgm_menu: ['Wave_Maintheme'],
};

const POOL_SIZE = 6;
const pools = new Map(); // 分类 -> Audio 元素数组
const failed = new Set();
let inited = false;
let menuAudio = null;

function makeUrl(name) {
  return ASSET_BASE + name + '.wav';
}

function buildPool(cat) {
  if (pools.has(cat)) return pools.get(cat);
  const files = CATS[cat] || [];
  const list = [];
  for (const name of files) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const a = new Audio();
      a.preload = 'auto';
      a.src = makeUrl(name);
      a.addEventListener('error', () => failed.add(name), { once: true });
      try { a.load(); } catch { /* 忽略 */ }
      list.push({ el: a, name });
    }
  }
  pools.set(cat, list);
  return list;
}

function preload(cats) {
  for (const cat of cats) buildPool(cat);
}

function play(cat, volume = 0.6, rate = 1) {
  if (!inited) return false;
  const list = buildPool(cat);
  if (!list.length) return false;
  let pickIdx = Math.floor(Math.random() * list.length);
  for (let i = 0; i < list.length; i++) {
    const item = list[(pickIdx + i) % list.length];
    if (failed.has(item.name)) continue;
    const el = item.el;
    try {
      el.volume = Math.max(0, Math.min(1, volume));
      el.playbackRate = rate;
      el.currentTime = 0;
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
      return true;
    } catch { /* 尝试下一个 */ }
  }
  return false;
}

export function initAudio() {
  if (inited) return;
  inited = true;
  // 只预载游戏高频音效，BGM 在需要时再加载
  preload(['shot_rifle', 'shot_sniper', 'shot_pistol', 'reload_rifle', 'reload_sniper', 'reload_pistol',
    'empty', 'step', 'hit_metal', 'hit_soft', 'hit_hard', 'headshot', 'death', 'spawn', 'ui']);
}

export function sfxShot(weapon = 'rifle', own = false) {
  const cat = weapon === 'sniper' ? 'shot_sniper' : weapon === 'pistol' ? 'shot_pistol' : 'shot_rifle';
  const rate = 1 + (Math.random() * 0.06 - 0.03);
  play(cat, own ? 0.85 : 0.42, rate);
}

export function sfxHit(head = false) {
  if (head) play('headshot', 0.5);
  else play(['hit_soft', 'hit_metal', 'hit_hard'][Math.floor(Math.random() * 3)], 0.42, 1 + Math.random() * 0.1);
}

export function sfxDeath() {
  play('death', 0.55, 1 + Math.random() * 0.05);
}

export function sfxReload(weapon = 'rifle') {
  const cat = weapon === 'sniper' ? 'reload_sniper' : weapon === 'pistol' ? 'reload_pistol' : 'reload_rifle';
  play(cat, 0.65);
}

export function sfxEmpty() {
  play('empty', 0.4);
}

export function sfxSpawn() {
  play('spawn', 0.5);
}

export function sfxStep(sprint = false) {
  play('step', sprint ? 0.34 : 0.24, 1 + (Math.random() * 0.08 - 0.04));
}

export function sfxUiClick() {
  play('ui', 0.4, 1 + (Math.random() * 0.04 - 0.02));
}

export function startMenuMusic() {
  if (!inited || menuAudio) return;
  const a = new Audio(makeUrl(CATS.bgm_menu[0]));
  a.loop = true;
  a.volume = 0.32;
  a.preload = 'auto';
  const p = a.play();
  if (p && p.catch) p.catch(() => {});
  menuAudio = a;
}

export function stopMenuMusic() {
  if (!menuAudio) return;
  try { menuAudio.pause(); menuAudio.currentTime = 0; } catch { /* 忽略 */ }
  menuAudio = null;
}
