// 程序化生成纹理（无需外部图片资源）
import * as THREE from 'three';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function noise(ctx, w, h, alpha = 0.15) {
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * alpha;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

export function metalTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 128, 128);
  g.addColorStop(0, '#5a6268');
  g.addColorStop(1, '#3a4046');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  noise(ctx, 128, 128, 0.2);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function containerTexture(color = 0x2a6b3a) {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  const hex = '#' + color.toString(16).padStart(6, '0');
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, 256, 256);
  // 波纹金属板
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let y = 0; y < 256; y += 16) {
    ctx.fillRect(0, y, 256, 3);
  }
  // 边框
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 252, 252);
  noise(ctx, 256, 256, 0.12);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function woodTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#8a6a3a';
  ctx.fillRect(0, 0, 128, 128);
  // 木纹
  ctx.strokeStyle = 'rgba(60,40,20,0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * 128);
    ctx.bezierCurveTo(40, Math.random() * 128, 80, Math.random() * 128, 128, Math.random() * 128);
    ctx.stroke();
  }
  // 木条分隔
  ctx.strokeStyle = 'rgba(40,25,10,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(64, 0); ctx.lineTo(64, 128);
  ctx.stroke();
  noise(ctx, 128, 128, 0.1);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function barrelTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, '#8a3a2a');
  g.addColorStop(0.5, '#b44a3a');
  g.addColorStop(1, '#8a3a2a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // 铁环
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 20, 128, 6);
  ctx.fillRect(0, 102, 128, 6);
  noise(ctx, 128, 128, 0.15);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function skyTexture() {
  const c = makeCanvas(512, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#7ba8c8');
  g.addColorStop(0.6, '#a8c8d8');
  g.addColorStop(1, '#d0dce0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);
  return new THREE.CanvasTexture(c);
}

export function nameTagTexture(name, color, team) {
  const c = makeCanvas(256, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 16, 256, 32);
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function flashTexture() {
  const c = makeCanvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,220,1)');
  g.addColorStop(0.3, 'rgba(255,200,80,0.9)');
  g.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function impactTexture() {
  const c = makeCanvas(32, 32);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(0.4, 'rgba(200,160,80,0.7)');
  g.addColorStop(1, 'rgba(100,70,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
