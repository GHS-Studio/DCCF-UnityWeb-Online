// Android 打包：WebView 客户端 APK
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { buildClient } from './build-client.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID_HOME = process.env.ANDROID_HOME || path.join(ROOT, '.android-sdk');
const BUILD_TOOLS = path.join(ANDROID_HOME, 'build-tools', '35.0.0');
const PLATFORM = path.join(ANDROID_HOME, 'platforms', 'android-34');
const OUT = path.join(ROOT, 'dist', 'android');
const STAGE = path.join(ROOT, 'dist', 'android-build');

function run(cmd, opts = {}) {
  console.log('[android]', cmd);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

async function main() {
  await buildClient({ minify: true });

  await fs.mkdir(STAGE, { recursive: true });
  await fs.mkdir(OUT, { recursive: true });

  // 检查 SDK
  for (const p of [BUILD_TOOLS, PLATFORM]) {
    await fs.access(p).catch(() => {
      throw new Error(`Android SDK 未找到: ${p}\n请安装 Android SDK 并设置 ANDROID_HOME`);
    });
  }

  // 准备 assets（dist/client → android-build/assets）
  const assetsDir = path.join(STAGE, 'assets');
  await fs.rm(assetsDir, { recursive: true, force: true });
  await fs.cp(path.join(ROOT, 'dist', 'client'), assetsDir, { recursive: true });

  // 编译 Java → classes.jar
  const javaSrc = path.join(ROOT, 'android', 'java');
  const classesDir = path.join(STAGE, 'classes');
  await fs.rm(classesDir, { recursive: true, force: true });
  await fs.mkdir(classesDir, { recursive: true });

  const androidJar = path.join(PLATFORM, 'android.jar');
  const javaFiles = [];
  for await (const f of walk(javaSrc)) if (f.endsWith('.java')) javaFiles.push(f);
  run(`javac --release 8 -classpath "${androidJar}" -d "${classesDir}" ${javaFiles.map((f) => `"${f}"`).join(' ')}`);

  // classes → dex
  const classesJar = path.join(STAGE, 'classes.jar');
  run(`jar cf "${classesJar}" -C "${classesDir}" .`);
  const dexDir = path.join(STAGE, 'dex');
  await fs.mkdir(dexDir, { recursive: true });
  run(`"${path.join(BUILD_TOOLS, 'd8')}" --output "${dexDir}" --lib "${androidJar}" "${classesJar}"`);

  // 打包资源
  const resDir = path.join(ROOT, 'android', 'res');
  const resZip = path.join(STAGE, 'res.zip');
  run(`"${path.join(BUILD_TOOLS, 'aapt2')}" compile --dir "${resDir}" -o "${resZip}"`);
  const baseApk = path.join(STAGE, 'base.apk');
  const manifest = path.join(ROOT, 'android', 'AndroidManifest.xml');
  run(`"${path.join(BUILD_TOOLS, 'aapt2')}" link -o "${baseApk}" -I "${androidJar}" --manifest "${manifest}" -R "${resZip}" --auto-add-overlay --min-sdk-version 29 --target-sdk-version 34 --version-code 2 --version-name "1.0.1"`);

  // 添加 assets + dex
  run(`cd "${STAGE}" && zip -j "${baseApk}" dex/classes.dex`);
  run(`cd "${path.dirname(assetsDir)}" && zip -r "${baseApk}" assets`);

  // 对齐 + 签名
  const alignedApk = path.join(STAGE, 'aligned.apk');
  run(`"${path.join(BUILD_TOOLS, 'zipalign')}" -f 4 "${baseApk}" "${alignedApk}"`);

  const keystore = path.join(STAGE, 'debug.keystore');
  try {
    await fs.access(keystore);
  } catch {
    run(`keytool -genkey -v -keystore "${keystore}" -alias androiddebug -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US"`, { stdio: 'pipe' });
  }

  const finalApk = path.join(OUT, 'TransportShip-Android.apk');
  await fs.rm(finalApk, { force: true });
  run(`"${path.join(BUILD_TOOLS, 'apksigner')}" sign --ks "${keystore}" --ks-pass pass:android --key-pass pass:android --out "${finalApk}" "${alignedApk}"`);

  const stat = await fs.stat(finalApk);
  console.log(`\n[android] APK 已生成 → ${finalApk}  (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log('[android] 手机安装后打开，填写服务端地址（例如 192.168.1.100:8080）即可联机');
}

async function* walk(dir) {
  for await (const d of await fs.opendir(dir)) {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) yield* walk(full);
    else yield full;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
