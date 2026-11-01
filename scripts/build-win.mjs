// Windows 打包：Electron 便携版（内置本地服务端）
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildClient } from './build-client.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'win');
const STAGE = path.join(ROOT, 'dist', 'win-stage');

async function main() {
  await buildClient({ minify: true });

  await fs.mkdir(STAGE, { recursive: true });
  // 拷贝 Electron 主进程
  await fs.copyFile(path.join(ROOT, 'electron', 'main.js'), path.join(STAGE, 'main.js'));
  // 拷贝服务端 + shared
  await fs.cp(path.join(ROOT, 'server'), path.join(STAGE, 'server'), { recursive: true });
  await fs.cp(path.join(ROOT, 'shared'), path.join(STAGE, 'shared'), { recursive: true });
  // 拷贝 package.json（仅运行时依赖）
  const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf-8'));
  const runtimePkg = { name: pkg.name, version: pkg.version, main: 'main.js', dependencies: pkg.dependencies };
  await fs.writeFile(path.join(STAGE, 'package.json'), JSON.stringify(runtimePkg, null, 2));

  // 用已下载的 Electron 打包
  const electronZip = path.join(ROOT, '.electron-cache', 'electron-v33.2.1-win32-x64.zip');
  const hasElectron = await fs.access(electronZip).then(() => true).catch(() => false);

  await fs.mkdir(OUT, { recursive: true });
  const appOut = path.join(OUT, 'TransportShip-win32-x64');
  await fs.rm(appOut, { recursive: true, force: true });
  await fs.mkdir(appOut, { recursive: true });

  if (hasElectron) {
    const { execSync } = await import('node:child_process');
    execSync(`unzip -q "${electronZip}" -d "${appOut}"`, { stdio: 'inherit' });
    // 重命名 electron.exe
    await fs.rename(path.join(appOut, 'electron.exe'), path.join(appOut, 'TransportShip.exe'));
    // 注入应用代码到 resources/app
    const appDir = path.join(appOut, 'resources', 'app');
    await fs.mkdir(appDir, { recursive: true });
    await fs.cp(STAGE, appDir, { recursive: true });
    await fs.cp(path.join(ROOT, 'dist', 'client'), path.join(appDir, 'client'), { recursive: true });
    // 安装 ws 依赖
    try {
      execSync('npm install --omit=dev --no-audit --no-fund', { cwd: appDir, stdio: 'inherit' });
    } catch { /* 离线时忽略 */ }
    console.log('[build] Windows 客户端 →', appOut);
    console.log('[build] 运行 TransportShip.exe 即可启动（内置本地服务端，默认 6 个机器人）');
  } else {
    console.warn('[build] 未找到 Electron 缓存，仅生成应用代码到', STAGE);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
