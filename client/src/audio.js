// WebAudio 音效：优先加载原始 WAV 采样，不存在时使用合成音效
const ASSET_BASE = (typeof location !== 'undefined' && location.protocol === 'file:')
  ? (location.href.replace(/[^/]*$/, '') + 'assets/')
  : 'assets/';

let ctx = null;
let noiseBuf = null;
let master = null;
const shotBuffers = {};
let shotsReady = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  const len = ctx.sampleRate * 1;
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  // 异步加载原始武器射击音效（若 assets 中存在）
  const shots = {
    rifle: 'shot_rifle.wav',
    sniper: 'shot_sniper.wav',
    pistol: 'shot_pistol.wav',
  };
  let loaded = 0;
  const total = Object.keys(shots).length;
  for (const [key, file] of Object.entries(shots)) {
    fetch(ASSET_BASE + file)
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        shotBuffers[key] = buf;
        loaded++;
        if (loaded === total) shotsReady = true;
      })
      .catch(() => { loaded++; if (loaded === total) shotsReady = true; });
  }
}

function env(node, gain, attack, decay) {
  const g = ctx.createGain();
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  node.connect(g);
  g.connect(master);
  return g;
}

function noiseShot(gain, decay, filterFreq, type = 'lowpass') {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 1;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  src.connect(f);
  env(f, gain, 0.004, decay);
  src.start();
  src.stop(ctx.currentTime + decay + 0.1);
}

function tone(freq, gain, decay, type = 'sine') {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  env(osc, gain, 0.005, decay);
  osc.start();
  osc.stop(ctx.currentTime + decay + 0.1);
}

export function sfxShot(weapon = 'rifle', own = false) {
  if (!ctx) return;
  // 优先播放原始采样
  if (shotsReady && shotBuffers[weapon]) {
    const src = ctx.createBufferSource();
    src.buffer = shotBuffers[weapon];
    const g = ctx.createGain();
    const vol = own ? 0.85 : 0.45;
    g.gain.value = vol;
    src.connect(g);
    g.connect(master);
    src.start();
    return;
  }
  // 回退到合成音效
  const g = own ? 0.5 : 0.32;
  if (weapon === 'sniper') {
    noiseShot(g * 1.2, 0.14, 2400, 'lowpass');
    tone(70, 0.25, 0.2, 'square');
  } else if (weapon === 'pistol') {
    noiseShot(g * 0.9, 0.09, 4200, 'bandpass');
  } else {
    noiseShot(g, 0.075, 3200, 'lowpass');
    tone(110, 0.08, 0.05, 'triangle');
  }
}

export function sfxHit(head = false) {
  if (!ctx) return;
  tone(head ? 1250 : 820, 0.16, 0.05, 'square');
}

export function sfxDeath() {
  if (!ctx) return;
  tone(220, 0.2, 0.3, 'sawtooth');
  tone(140, 0.12, 0.45, 'sine');
}

export function sfxReload() {
  if (!ctx) return;
  tone(520, 0.08, 0.03, 'square');
  setTimeout(() => tone(320, 0.06, 0.03, 'square'), 220);
}

export function sfxEmpty() {
  if (!ctx) return;
  tone(180, 0.05, 0.03, 'square');
}

export function sfxSpawn() {
  if (!ctx) return;
  tone(660, 0.1, 0.12, 'sine');
  setTimeout(() => tone(880, 0.12, 0.15, 'sine'), 120);
}
