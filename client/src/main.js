// 客户端入口：原版大厅 → 连接 → 游戏
import { Net } from './net.js';
import { Game } from './game.js';
import { initAudio, startMenuMusic, stopMenuMusic } from './audio.js';
import { createLobby } from './lobby.js';

const bridge = typeof window !== 'undefined' ? window.AndroidBridge : null;

function store(key, value) {
  if (bridge) {
    try { bridge.setPref(key, String(value)); } catch { /* ignore */ }
  }
  try { localStorage.setItem(key, value); } catch { /* file:// 或隐私模式 */ }
}
function load(key, fallback) {
  if (bridge) {
    try {
      const v = bridge.getPref(key);
      if (v) return v;
    } catch { /* ignore */ }
  }
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v;
  } catch {
    return fallback;
  }
}

const isElectron = /Electron/i.test(navigator.userAgent);
const isTouch = !isElectron && (
  (navigator.maxTouchPoints || 0) > 0 ||
  'ontouchstart' in window ||
  /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)
);
const isFileApp = location.protocol === 'file:';

const settings = {
  name: load('ts_name', '') || `玩家${String(Math.floor(Math.random() * 9000) + 1000)}`,
  server: load('ts_server', ''),
  sens: Number(load('ts_sens', '1')) || 1,
  quality: load('ts_quality', 'high') === 'low' ? 'low' : 'high',
};

const queryServer = new URLSearchParams(location.search).get('server');
if (queryServer && !settings.server) settings.server = queryServer;

let net = null;
let game = null;
let joining = false;

const lobby = createLobby({
  settings,
  isFileApp,
  isTouch,
  onSettings: (patch) => {
    Object.assign(settings, patch);
    if ('name' in patch) store('ts_name', settings.name);
    if ('server' in patch) store('ts_server', settings.server);
    if ('sens' in patch) {
      store('ts_sens', String(settings.sens));
      if (game) game.sensitivity = settings.sens;
    }
    if ('quality' in patch) store('ts_quality', settings.quality);
  },
  onJoin: ({ name, server, sens, quality }) => connect(name, server, sens, quality),
});

function connect(name, server, sens, quality) {
  if (joining || game) return;
  joining = true;
  stopMenuMusic();
  initAudio();

  const n = new Net();
  net = n;
  let welcomed = false;

  n.connect({ server, name, team: -1 }, {
    onWelcome: (welcome) => {
      if (welcomed) return;
      welcomed = true;
      joining = false;
      lobby.stopLoading();
      lobby.setStatus('');
      try {
        game = new Game({
          welcome,
          net: n,
          quality,
          sensitivity: sens,
          touch: isTouch,
          onExit: (reason) => exitGame(reason),
        });
        lobby.hide();
      } catch (err) {
        console.error(err);
        exitGame('error');
        lobby.setStatus('无法初始化 3D 画面：' + (err?.message || err), 'bad');
      }
    },
    onError: (msg) => {
      if (game) return;
      joining = false;
      lobby.stopLoading();
      lobby.setStatus(msg || '连接错误', 'bad');
    },
    onClose: () => {
      if (game) {
        exitGame('closed');
        return;
      }
      if (welcomed) return;
      joining = false;
      lobby.stopLoading();
      lobby.setStatus('无法连接服务器，请检查地址与服务端是否启动', 'bad');
    },
  });
}

function exitGame(reason) {
  if (game) {
    game.destroy();
    game = null;
  }
  if (net) {
    net.close();
    net = null;
  }
  joining = false;
  lobby.show();
  lobby.stopLoading();
  if (reason === 'closed') lobby.setStatus('与服务器断开连接', 'bad');
  else if (reason === 'error') lobby.setStatus('画面初始化失败', 'bad');
  else lobby.setStatus('');
  if (document.pointerLockElement) {
    try { document.exitPointerLock(); } catch { /* ignore */ }
  }
  if (reason !== 'error') startMenuMusic();
}

// 首次交互后播放原版大厅 BGM（浏览器禁止无手势自动播放）
document.addEventListener('pointerdown', () => {
  initAudio();
  if (game || joining) return;
  startMenuMusic();
}, true);

window.addEventListener('beforeunload', () => net?.close());

lobby.show();

// 便于调试
window.__lobby = lobby;
