// 打包客户端：esbuild → dist/client
import * as esbuild from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist', 'client');

const COMMON = {
  entryPoints: [path.join(ROOT, 'client', 'src', 'main.js')],
  bundle: true,
  outfile: path.join(OUT, 'bundle.js'),
  format: 'iife',
  platform: 'browser',
  target: ['es2018'],
  legalComments: 'none',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"' },
};

async function copyAssets() {
  await fs.mkdir(OUT, { recursive: true });
  const srcAssets = path.join(ROOT, 'client', 'assets');
  const dstAssets = path.join(OUT, 'assets');
  await fs.mkdir(dstAssets, { recursive: true });
  try {
    const entries = await fs.readdir(srcAssets, { withFileTypes: true });
    await Promise.all(entries.map((e) => {
      if (e.isFile()) return fs.copyFile(path.join(srcAssets, e.name), path.join(dstAssets, e.name));
    }));
  } catch { /* assets 目录可能尚未生成 */ }
  await Promise.all([
    fs.copyFile(path.join(ROOT, 'client', 'index.html'), path.join(OUT, 'index.html')),
    fs.copyFile(path.join(ROOT, 'client', 'style.css'), path.join(OUT, 'style.css')),
  ]);
}

export async function buildClient({ minify = true, sourcemap = false } = {}) {
  await fs.mkdir(OUT, { recursive: true });
  await esbuild.build({ ...COMMON, minify, sourcemap });
  await copyAssets();
  console.log('[build] 客户端已生成 → dist/client');
  return OUT;
}

export async function watchClient() {
  await fs.mkdir(OUT, { recursive: true });
  const ctx = await esbuild.context({
    ...COMMON,
    minify: false,
    sourcemap: true,
    plugins: [{
      name: 'copy-assets',
      setup(build) {
        build.onEnd(async (result) => {
          if (result.errors.length) return;
          await copyAssets();
          console.log('[dev] 客户端已重新构建');
        });
      },
    }],
  });
  await ctx.watch();
  console.log('[dev] 正在监听客户端源码变化…');
  return ctx;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildClient().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
