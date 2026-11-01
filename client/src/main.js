// 客户端入口：菜单 → 连接 → 游戏
import { Net } from './net.js';
import { Game } from './game.js';
import { initAudio } from './audio.js';

const $ = (id) => document.getElementById(id);

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

const state = {
  net: null,
  game: null,
  joining: false,
  settings: {
    name: load('ts_name', '') || `玩家${String(Math.floor(Math.random() * 9000) + 1000)}`,
    server: load('ts_server', ''),
    sens: Number(load('ts_sens', '1')) || 1,
    quality: load('ts_quality', 'high') === 'low' ? 'low' : 'high',
  },
};

const joinBtn = $('join-btn');
const statusEl = $('menu-status');
const nameInput = $('name-input');
const serverInput = $('server-input');
const serverHint = $('server-hint');
const sensInput = $('sens');
const sensVal = $('sens-val');
const qualitySeg = $('quality-seg');

nameInput.value = state.settings.name;
serverInput.value = state.settings.server;
sensInput.value = String(state.settings.sens);
sensVal.textContent = state.settings.sens.toFixed(2);

for (const btn of qualitySeg.children) {
  btn.classList.toggle('on', btn.dataset.q === state.settings.quality);
}

if (isFileApp) {
  serverInput.placeholder = '192.168.1.100:8080';
  serverHint.textContent = '请输入运行服务端的电脑局域网地址（服务端启动时会打印）';
  const q = new URLSearchParams(location.search).get('server');
  if (q && !serverInput.value) serverInput.value = q;
  $('net-badge').textContent = '手机客户端 · 请连接服务端';
}

if (isTouch) {
  document.body.classList.add('is-touch');
  serverInput.setAttribute('inputmode', 'url');
  serverInput.setAttribute('autocapitalize', 'off');
  serverInput.setAttribute('autocorrect', 'off');
}

function setStatus(msg, kind = '') {
  statusEl.textContent = msg || '';
  statusEl.className = 'menu-status' + (kind ? ' ' + kind : '');
}

function resetJoinUI() {
  state.joining = false;
  joinBtn.disabled = false;
  joinBtn.textContent = '进入战场';
}

function saveSettings() {
  state.settings.name = nameInput.value.trim() || state.settings.name;
  state.settings.server = serverInput.value.trim();
  state.settings.sens = Number(sensInput.value) || 1;
  store('ts_name', state.settings.name);
  store('ts_server', state.settings.server);
  store('ts_sens', String(state.settings.sens));
  store('ts_quality', state.settings.quality);
}

function join() {
  if (state.joining || state.game) return;
  saveSettings();
  const name = nameInput.value.trim().slice(0, 14);
  if (!name) {
    setStatus('请输入昵称', 'bad');
    nameInput.focus();
    return;
  }
  const server = serverInput.value.trim();
  if (isFileApp && !server) {
    setStatus('请填写服务端地址，例如 192.168.1.100:8080', 'bad');
    serverInput.focus();
    return;
  }

  initAudio();
  state.joining = true;
  joinBtn.disabled = true;
  joinBtn.textContent = '连接中…';
  setStatus('正在连接服务器…');

  const net = new Net();
  state.net = net;
  let welcomed = false;

  net.connect({ server, name, team: -1 }, {
    onWelcome: (welcome) => {
      if (welcomed) return;
      welcomed = true;
      state.joining = false;
      setStatus('');
      try {
        state.game = new Game({
          welcome,
          net,
          quality: state.settings.quality,
          sensitivity: state.settings.sens,
          touch: isTouch,
          onExit: (reason) => handleExit(reason),
        });
      } catch (err) {
        console.error(err);
        handleExit('error');
        setStatus('无法初始化 3D 画面：' + (err?.message || err), 'bad');
        return;
      }
      joinBtn.textContent = '进入战场';
      joinBtn.disabled = false;
    },
    onError: (msg) => {
      if (state.game) return;
      state.joining = false;
      resetJoinUI();
      setStatus(msg || '连接错误', 'bad');
    },
    onClose: () => {
      if (state.game) {
        handleExit('closed');
        return;
      }
      if (welcomed) return;
      state.joining = false;
      resetJoinUI();
      setStatus('无法连接服务器，请检查地址与服务端是否启动', 'bad');
    },
  });
}

function handleExit(reason) {
  if (state.game) {
    state.game.destroy();
    state.game = null;
  }
  if (state.net) {
    state.net.close();
    state.net = null;
  }
  resetJoinUI();
  if (reason === 'closed') setStatus('与服务器断开连接', 'bad');
  else if (reason === 'leave') setStatus('');
  document.getElementById('menu')?.classList.remove('hidden');
  document.getElementById('hud')?.classList.add('hidden');
  if (document.pointerLockElement) {
    try { document.exitPointerLock(); } catch {}
  }
}

joinBtn.addEventListener('click', join);

for (const el of [nameInput, serverInput]) {
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); join(); }
  });
}

sensInput.addEventListener('input', () => {
  state.settings.sens = Number(sensInput.value) || 1;
  sensVal.textContent = state.settings.sens.toFixed(2);
  if (state.game) state.game.sensitivity = state.settings.sens;
  store('ts_sens', String(state.settings.sens));
});

qualitySeg.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-q]');
  if (!btn) return;
  state.settings.quality = btn.dataset.q;
  for (const b of qualitySeg.children) b.classList.toggle('on', b === btn);
  store('ts_quality', state.settings.quality);
});

window.addEventListener('beforeunload', () => state.net?.close());
