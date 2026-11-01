// Electron 主进程：创建窗口 + 启动内置服务端
import { app, BrowserWindow, Menu } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let server;
const PORT = parseInt(process.env.PORT || '8080', 10);

async function startBuiltinServer() {
  try {
    const { startServer } = await import(path.join(__dirname, 'server', 'index.js'));
    server = startServer({ port: PORT, bots: 6 });
  } catch (e) {
    console.error('内置服务端启动失败:', e);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 720,
    title: '运输船 · 网络联机 FPS',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.loadFile(path.join(__dirname, 'client', 'index.html'));
  Menu.setApplicationMenu(null);
}

app.whenReady().then(async () => {
  await startBuiltinServer();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  server?.close?.();
});
