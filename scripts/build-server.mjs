// 服务端打包：esbuild bundle → CJS → pkg → 独立 EXE（内置客户端资源）
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { buildClient } from './build-client.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const BUNDLE = path.join(DIST, 'server.bundle.cjs');
const OUT_DIR = path.join(DIST, 'server');
const EXE = path.join(OUT_DIR, 'TransportShip-Server.exe');

async function main() {
  // 1. 构建客户端（确保 dist/client 最新）
  await buildClient({ minify: true });

  // 2. esbuild 打包服务端为单文件 CJS（包含 ws + shared + room）
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'server', 'index.js')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: ['node16'],
    outfile: BUNDLE,
    logLevel: 'warning',
    legalComments: 'none',
    // 不标记 ws 为 external，全部打入单文件
    external: [],
    // CJS 模式下 import.meta.url 不可用，替换为 __filename（路径字符串）
    define: { 'import.meta.url': '__filename' },
  });
  console.log('[build] 服务端 bundle →', BUNDLE);

  // 3. pkg 打包为独立 EXE，内置 dist/client 资源
  await fs.mkdir(OUT_DIR, { recursive: true });
  const pkgBin = path.join(ROOT, 'node_modules', '.bin', 'pkg');
  const cmd = [
    `"${pkgBin}"`,
    `"${BUNDLE}"`,
    '--targets node16-win-x64',
    `--output "${EXE}"`,
  ].join(' ');
  console.log('[build]', cmd);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT });

  const stat = await fs.stat(EXE).catch(() => null);
  if (stat) {
    console.log(`\n[build] 服务端 EXE → ${EXE}  (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    console.log('[build] 双击运行，浏览器打开 http://127.0.0.1:8080 即可游玩');
    console.log('[build] 端口自定义：TransportShip-Server.exe --port 9090');
  } else {
    console.error('[build] EXE 生成失败');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
