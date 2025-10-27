import { app, BrowserWindow, ipcMain, Menu, shell, session } from 'electron';
import path from 'path';
import fs from 'fs';
import Store from 'electron-store';
import keytar from 'keytar';

const TRAIL_URL = 'https://web.trailapp.com/trail#/';
const ATTENSI_URL = 'https://admin.attensi.com/yo/dashboard';

const store = new Store<{ bounds: Record<string, Electron.Rectangle> }>();

type WinKey = 'trail-allerton' | 'trail-sefton' | 'trail-oldswan' | 'attensi';

const services: Record<WinKey, string> = {
  'trail-allerton': 'sushimetrics-trail-allerton',
  'trail-sefton': 'sushimetrics-trail-sefton',
  'trail-oldswan': 'sushimetrics-trail-oldswan',
  'attensi': 'sushimetrics-attensi'
};

const partitions: Record<WinKey, string> = {
  'trail-allerton': 'persist:trail-allerton',
  'trail-sefton': 'persist:trail-sefton',
  'trail-oldswan': 'persist:trail-oldswan',
  'attensi': 'persist:attensi'
};

const urls: Record<WinKey, string> = {
  'trail-allerton': TRAIL_URL,
  'trail-sefton': TRAIL_URL,
  'trail-oldswan': TRAIL_URL,
  'attensi': ATTENSI_URL
};

const titles: Record<WinKey, string> = {
  'trail-allerton': 'Trail – Allerton Road',
  'trail-sefton': 'Trail – Sefton Park',
  'trail-oldswan': 'Trail – Old Swan',
  'attensi': 'Attensi Dashboard'
};

const windows = new Map<WinKey, BrowserWindow>();
const wcToService = new Map<number, string>();

function createControlWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true
    }
  });
  const candidates = [
    path.join(__dirname, 'renderer', 'control.html'),
    path.join(__dirname, '..', 'src', 'renderer', 'control.html')
  ];
  const controlPath = candidates.find(p => fs.existsSync(p));
  if (controlPath) {
    win.loadFile(controlPath);
  } else {
    win.loadURL('data:text/html,<h1>Sushi Metrics Desktop</h1><p>control.html not found</p>');
  }
}

function createIsolatedWindow(key: WinKey) {
  const bounds = store.get('bounds', {})[key];
  const win = new BrowserWindow({
    width: bounds?.width || 1200,
    height: bounds?.height || 800,
    x: bounds?.x,
    y: bounds?.y,
    title: titles[key],
    webPreferences: {
      partition: partitions[key],
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true
    }
  });
  wcToService.set(win.webContents.id, services[key]);
  win.on('close', () => {
    const b = win.getBounds();
    const cur = store.get('bounds', {});
    cur[key] = b;
    store.set('bounds', cur);
    windows.delete(key);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(urls[key]);
  windows.set(key, win);
  return win;
}

ipcMain.handle('open-window', (_e, key: WinKey) => {
  const w = windows.get(key);
  if (w && !w.isDestroyed()) { w.show(); w.focus(); return true; }
  createIsolatedWindow(key);
  return true;
});

ipcMain.handle('refresh-window', (_e, key: WinKey) => {
  const w = windows.get(key);
  if (w && !w.isDestroyed()) { w.loadURL(urls[key]); return true; }
  return false;
});

ipcMain.handle('close-window', (_e, key: WinKey) => {
  const w = windows.get(key);
  if (w && !w.isDestroyed()) { w.close(); return true; }
  return false;
});

ipcMain.handle('focus-window', (_e, key: WinKey) => {
  const w = windows.get(key);
  if (w && !w.isDestroyed()) { w.show(); w.focus(); return true; }
  return false;
});

ipcMain.handle('logout-window', async (_e, key: WinKey) => {
  const part = partitions[key];
  const sess = session.fromPartition(part);
  await sess.clearStorageData();
  await sess.clearCache();
  const w = windows.get(key);
  if (w && !w.isDestroyed()) { w.loadURL(urls[key]); }
  return true;
});

ipcMain.handle('get-service', (e) => {
  const id = e.sender.id;
  return wcToService.get(id) || null;
});

ipcMain.handle('get-credential', async (_e, service: string) => {
  try {
    const secret = await keytar.getPassword(service, 'primary');
    if (!secret) return null;
    return JSON.parse(secret);
  } catch { return null; }
});

ipcMain.handle('set-credential', async (_e, service: string, email: string, password: string) => {
  try {
    await keytar.setPassword(service, 'primary', JSON.stringify({ email, password }));
    return true;
  } catch { return false; }
});

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Windows',
      submenu: [
        { label: 'Open Trail – Allerton', click: () => createIsolatedWindow('trail-allerton') },
        { label: 'Open Trail – Sefton', click: () => createIsolatedWindow('trail-sefton') },
        { label: 'Open Trail – Old Swan', click: () => createIsolatedWindow('trail-oldswan') },
        { type: 'separator' },
        { label: 'Open Attensi', click: () => createIsolatedWindow('attensi') },
        { type: 'separator' },
        { label: 'Control Panel', click: () => createControlWindow() }
      ]
    },
    { role: 'reload' },
    { role: 'toggleDevTools' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createControlWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
