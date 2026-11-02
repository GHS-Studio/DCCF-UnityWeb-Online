// Electron 22 主进程（CommonJS，兼容 Windows 7 SP1 / 8 / 8.1 / 10 / 11）
// 创建窗口 + 启动内置服务端（服务端已由 esbuild 打包为 server.bundle.cjs）
const { app, BrowserWindow, Menu } = require('electron');
const path = require('node:path');

const PORT = parseInt(process.env.PORT || '8080', 10);
let server = null;

function startBuiltinServer() {
  try {
    const { startServer } = require('./server.bundle.cjs');
    server = startServer({ port: PORT, bots: 6 });
  } catch (e) {
    console.error('内置服务端启动失败:', e);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    title: '运输船 · 网络联机 FPS',
    backgroundColor: '#0b0e13',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'client', 'index.html'));
  Menu.setApplicationMenu(null);
  return win;
}

app.whenReady().then(() => {
  startBuiltinServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { server && server.close && server.close(); } catch { /* 忽略 */ }
});
