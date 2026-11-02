// Windows 打包：Electron 22 便携版（兼容 Win7 SP1 / 8 / 8.1 / 10 / 11）
// 服务端通过 esbuild 打包为 server.bundle.cjs，随应用内置；双击 exe 即启动本地服务端
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { buildClient } from './build-client.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'win');
const STAGE = path.join(ROOT, 'dist', 'win-stage');
const ELECTRON_VERSION = '22.3.24'; // 最后一个支持 Windows 7 / 8 / 8.1 的版本
const ELECTRON_ZIP = path.join(ROOT, '.electron-cache', `electron-v${ELECTRON_VERSION}-win32-x64.zip`);

async function main() {
  await buildClient({ minify: true });

  await fs.rm(STAGE, { recursive: true, force: true });
  await fs.mkdir(STAGE, { recursive: true });

  // 1. 服务端 → 单文件 CJS（含 ws / shared），供主进程 require
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'server', 'index.js')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: ['node16'],
    outfile: path.join(STAGE, 'server.bundle.cjs'),
    logLevel: 'warning',
    legalComments: 'none',
    define: { 'import.meta.url': '__filename' },
  });

  // 2. 主进程（CommonJS）与客户端资源
  await fs.copyFile(path.join(ROOT, 'electron', 'main.cjs'), path.join(STAGE, 'main.cjs'));
  await fs.cp(path.join(ROOT, 'dist', 'client'), path.join(STAGE, 'client'), { recursive: true });

  // 3. 运行时 package.json（Electron 22 主进程为 CommonJS）
  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf-8'));
  await fs.writeFile(
    path.join(STAGE, 'package.json'),
    JSON.stringify({ name: pkg.name, version: pkg.version, main: 'main.cjs' }, null, 2)
  );

  // 4. 解压 Electron 22 并注入应用代码
  const hasElectron = await fs.access(ELECTRON_ZIP).then(() => true).catch(() => false);
  if (!hasElectron) {
    throw new Error(`未找到 Electron 缓存: ${ELECTRON_ZIP}\n请先下载 electron-v${ELECTRON_VERSION}-win32-x64.zip`);
  }

  await fs.mkdir(OUT, { recursive: true });
  const appOut = path.join(OUT, 'TransportShip-win32-x64');
  await fs.rm(appOut, { recursive: true, force: true });
  await fs.mkdir(appOut, { recursive: true });

  execSync(`unzip -q "${ELECTRON_ZIP}" -d "${appOut}"`, { stdio: 'inherit' });
  await fs.rename(path.join(appOut, 'electron.exe'), path.join(appOut, 'TransportShip.exe'));

  const appDir = path.join(appOut, 'resources', 'app');
  await fs.mkdir(appDir, { recursive: true });
  await fs.cp(STAGE, appDir, { recursive: true });

  console.log('[build] Windows 客户端 →', appOut);
  console.log('[build] 运行 TransportShip.exe 即可启动（内置本地服务端，默认 6 个机器人）');
}

main().catch((e) => { console.error(e); process.exit(1); });
