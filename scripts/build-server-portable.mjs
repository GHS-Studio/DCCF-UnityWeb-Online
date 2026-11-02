// 服务端便携包：官方 Node 16 运行时 + 服务端 + 客户端资源 + config.ini + 一键启动脚本
// 输出 dist/TransportShip-Server-Portable.zip（解压即用，无需安装 Node / VC 运行库）
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { buildClient } from './build-client.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PKG_DIR = path.join(DIST, 'server-portable', 'TransportShip-Server');
const ZIP_OUT = path.join(DIST, 'TransportShip-Server-Portable.zip');
const NODE_TAG = 'node-v14.21.3-win-x64'; // Node 14 是最后支持 Windows 7 SP1 的版本
const NODE_ZIP = path.join(ROOT, '.node-cache', `${NODE_TAG}.zip`);

async function main() {
  await buildClient({ minify: true });

  await fs.rm(path.join(DIST, 'server-portable'), { recursive: true, force: true });
  await fs.mkdir(PKG_DIR, { recursive: true });

  // 1. 服务端 → 单文件 CJS（含 ws）
  await esbuild.build({
    entryPoints: [path.join(ROOT, 'server', 'index.js')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: ['node14'],
    outfile: path.join(PKG_DIR, 'server.bundle.cjs'),
    logLevel: 'warning',
    legalComments: 'none',
    define: { 'import.meta.url': '__filename' },
  });

  // 2. 客户端静态资源
  await fs.cp(path.join(DIST, 'client'), path.join(PKG_DIR, 'client'), { recursive: true });

  // 3. 官方 Node 14 运行时（Win7 SP1+ 可用）
  await fs.access(NODE_ZIP).catch(() => {
    throw new Error(`未找到 Node 运行时: ${NODE_ZIP}\n请下载 ${NODE_TAG}.zip 到 .node-cache/`);
  });
  const tmp = path.join(DIST, 'server-portable', '_node');
  await fs.mkdir(tmp, { recursive: true });
  execSync(`unzip -q -o "${NODE_ZIP}" "${NODE_TAG}/node.exe" "${NODE_TAG}/LICENSE" -d "${tmp}"`, { stdio: 'inherit' });
  const nodeDir = path.join(tmp, NODE_TAG);
  await fs.copyFile(path.join(nodeDir, 'node.exe'), path.join(PKG_DIR, 'node.exe'));
  await fs.copyFile(path.join(nodeDir, 'LICENSE'), path.join(PKG_DIR, 'NODE-LICENSE.txt'));
  await fs.rm(tmp, { recursive: true, force: true });

  // 4. config.ini（端口可自定义）
  await fs.writeFile(path.join(PKG_DIR, 'config.ini'), [
    '; ==========================================',
    '; 运输船服务端配置文件',
    '; 修改端口后保存，重新双击启动服务端即可生效',
    '; 端口范围 1-65535，建议 1024-65535',
    '; ==========================================',
    '[server]',
    'port = 8080',
    '',
  ].join('\r\n'), 'utf8');

  // 5. 一键启动脚本（纯 ASCII，避免旧系统 cmd 编码问题）
  await fs.writeFile(path.join(PKG_DIR, '启动服务端.bat'), [
    '@echo off',
    'chcp 65001 >nul',
    'cd /d "%~dp0"',
    'title Transport Ship Server',
    'set NODE_SKIP_PLATFORM_CHECK=1',
    'echo ==========================================',
    'echo   Transport Ship Server - Starting...',
    'echo   Config file: config.ini  (port setting)',
    'echo ==========================================',
    'echo.',
    'if not exist node.exe (',
    '  echo [ERROR] node.exe not found. Please unzip the whole folder.',
    '  pause',
    '  exit /b 1',
    ')',
    'if not exist server.bundle.cjs (',
    '  echo [ERROR] server.bundle.cjs not found. Please unzip the whole folder.',
    '  pause',
    '  exit /b 1',
    ')',
    'node.exe server.bundle.cjs',
    'echo.',
    'echo Server stopped. Press any key to exit.',
    'pause >nul',
    '',
  ].join('\r\n'), 'utf8');

  // 6. 使用说明
  await fs.writeFile(path.join(PKG_DIR, '使用说明.txt'), [
    '运输船服务端 · 使用说明',
    '==========================================',
    '',
    '【系统要求】',
    'Windows 7 SP1 / 8 / 8.1 / 10 / 11（64 位），无需安装 Node 或 VC++ 运行库。',
    '包内 node.exe 为 Node 14.21.3，是最后一个官方支持 Windows 7 SP1 的版本。',
    '',
    '【一键启动】',
    '双击「启动服务端.bat」，窗口出现 "运输船服务端已启动" 即成功。',
    '',
    '【修改端口】',
    '用记事本打开 config.ini，修改 port = 8080 中的数字后保存，',
    '重新双击「启动服务端.bat」即可。',
    '',
    '【玩家进入】',
    '1. 本机：浏览器打开 http://127.0.0.1:<端口>',
    '2. 局域网其他电脑/手机：浏览器或客户端填写 http://<本机IP>:<端口>',
    '   窗口启动时会打印局域网地址，例如 http://192.168.1.100:8080',
    '',
    '【联机客户端】',
    '- PC：运行客户端 TransportShip.exe 后，在地址栏填写 <本机IP>:<端口>',
    '- 安卓：安装 TransportShip-Android.apk 后填写同样地址',
    '',
    '【常见问题】',
    '- 提示端口被占用：把 config.ini 的端口改成 9090 等空闲端口',
    '- 局域网无法连接：确认防火墙允许 node.exe，且设备在同一网段',
    '- 请勿只拷贝 node.exe 或 bat，必须整个文件夹一起使用',
    '',
  ].join('\r\n'), 'utf8');

  // 7. 打包 zip（保留 TransportShip-Server 目录结构）
  await fs.rm(ZIP_OUT, { force: true });
  execSync(`zip -qr "${ZIP_OUT}" TransportShip-Server`, { cwd: path.join(DIST, 'server-portable'), stdio: 'inherit' });

  const stat = await fs.stat(ZIP_OUT);
  console.log(`\n[build] 服务端便携包 → ${ZIP_OUT}  (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log('[build] 解压后双击「启动服务端.bat」，端口在 config.ini 中修改');
}

main().catch((e) => { console.error(e); process.exit(1); });
