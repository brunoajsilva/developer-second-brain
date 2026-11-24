import { BrowserWindow, shell } from 'electron';
import * as path from 'node:path';

export const devServerUrl = process.env.VITE_DEV_SERVER_URL;

const isExternal = (url: string) => /^https?:\/\//i.test(url);

/** The single app window. Context isolation + sandbox: the page has no Node access, only the preload bridge. */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#F6F6F4',
    title: 'Developer SecondBrain',
    icon: path.join(__dirname, '..', 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 18, y: 18 },
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  win.once('ready-to-show', () => win.show());

  // external links open in the browser; the window never navigates away from the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternal(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (devServerUrl && url.startsWith(devServerUrl)) return;
    e.preventDefault();
    if (isExternal(url)) void shell.openExternal(url);
  });

  if (devServerUrl) void win.loadURL(devServerUrl);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  return win;
}
