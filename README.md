# 运输船 · 网络联机 FPS (DCCF-UnityWeb-Online)

基于原版《穿越火线：运输船》UnityWeb 游戏改造的多人联机 FPS。客户端使用 Three.js 渲染，服务端为 Node.js 权威服务器，支持 Windows 7 SP1+ 与 Android 10+。

## 系统要求

| 平台 | 最低要求 |
|------|----------|
| Windows 客户端 / 服务端 | Windows 7 SP1（64 位），Win8 / 8.1 / 10 / 11 均可 |
| Android 客户端 | Android 10（API 29）及以上 |

> 打包采用 Electron 22 + Node 14.17.6（便携包）/ Node 12（服务端 EXE），可直接运行，无需安装任何运行库或服务。两者均可在 Windows 7 SP1 上运行。

## 功能特性

- 全部画面、音效与 UI 均来自原版 `.unity3d` 包（无占位资源）
- 原版运输船地图网格与贴图
- 原版完整骨骼角色（36 骨骼、双队模型）与持枪姿态
- 原版武器模型 / 第一人称武器：步枪、狙击枪、手枪
- 原版大厅 UI：个人仓库 / 商城 / 选枪 / 角色面板 / 加入战场 / 帮助 / 加载画面
- 157 个原版音效（枪声、换弹、脚步、命中、死亡、UI、主界面 BGM）
- 完整的射击、换弹、开镜、爆头、击杀、复活、比分系统
- 服务端权威物理与命中判定
- Windows / Android 双平台客户端
- 移动端触屏控制

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动服务端

```bash
# 默认端口 8080
npm start

# 自定义端口（方式一：命令行参数）
node server/index.js --port 9090
node server/index.js -p 9090
node server/index.js --port=9090

# 自定义端口（方式二：环境变量）
PORT=9090 npm start
```

服务端启动时会打印局域网地址，例如：
```
[server] 运输船服务端已启动: http://127.0.0.1:9090
[server] 局域网地址: http://192.168.1.100:9090  (ws://192.168.1.100:9090/ws)
```

### 客户端连接

1. **网页客户端**：浏览器打开 `http://<服务端IP>:<端口>`，点击「加入战斗」进入
2. **Windows 客户端**：运行 `dist/win/TransportShip-win32-x64/TransportShip.exe`（内置本地服务端）
3. **Android 客户端**：安装 `dist/android/TransportShip-Android.apk`，在服务端地址栏填写 `IP:端口`（例如 `192.168.1.100:9090`）

服务端地址支持以下格式：
| 输入 | 实际连接 |
|------|----------|
| `192.168.1.100` | `ws://192.168.1.100:8080/ws` |
| `192.168.1.100:9090` | `ws://192.168.1.100:9090/ws` |
| `example.com:8080` | `ws://example.com:8080/ws` |
| `http://host:port` | `ws://host:port/ws` |
| `ws://host:port/ws` | 原样使用 |
| （留空） | 自动使用当前页面地址或 `127.0.0.1:8080` |

## 构建

```bash
# 构建网页客户端
npm run build:client

# 构建服务端独立 EXE（内置网页客户端资源，Node 12，兼容 Win7+）
npm run build:server

# 构建服务端便携压缩包（官方 Node 14.17.6 + 客户端资源 + config.ini + 一键启动脚本）
npm run build:server:portable

# 构建 Windows 便携版客户端（Electron 22，内置本地服务端）
npm run build:win

# 构建 Android APK（需要 Android SDK）
npm run build:android

# 网络联机自检
npm run test:net
```

## 操作说明

| 按键 | 功能 |
|------|------|
| WASD | 移动 |
| 鼠标 | 视角 |
| 左键 | 射击 |
| 右键 | 开镜（狙击枪） |
| R | 换弹 |
| 空格 | 跳跃 |
| 1 / 2 / 3 | 切换武器 |
| Tab | 计分板 |
| Shift | 冲刺 |

## 原始资源

游戏运行所需的全部资源均已从原版 `.unity3d` 包解出并随客户端打包，无需额外准备：

- 地图：`client/assets/unity/map/`
- 角色 / 武器：`client/assets/unity/actors/`、`client/assets/unity/weapons/`
- 音效：`client/assets/unity/audio/`（157 个 WAV + `index.json`）
- 大厅 UI：`client/assets/unity/ui/`（`level1.json` / `level3.json` + 186 张精灵）

如需重新解包，使用 `tools/` 下的脚本（依赖 UnityPy）：

```bash
/tmp/upvenv/bin/python tools/extract_ui.py
/tmp/upvenv/bin/python tools/extract_audio.py
```

## 项目结构

```
├── client/          # 客户端（Three.js）
│   ├── src/         # 源码
│   ├── assets/      # 原始资源（可选）
│   ├── index.html
│   └── style.css
├── server/          # 服务端（Node.js + ws）
├── shared/          # 共享代码（常量、地图、物理）
├── scripts/         # 构建脚本
├── electron/        # Electron 主进程
└── android/         # Android WebView 壳
```
