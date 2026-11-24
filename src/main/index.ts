// Main process entry: app lifecycle, single instance, global shortcut. Logic lives in services/.
import { app, BrowserWindow, dialog, globalShortcut, Menu, shell } from 'electron';
import * as path from 'node:path';
import { IpcChannel } from '../shared/ipc';
import { pathExists } from '../core/fs/file-store';
import { AppService } from './services/app-service';
import { UpdateService } from './services/update-service';
import { createMainWindow, devServerUrl } from './window';
import { applyContentSecurityPolicy } from './security';
import { handleVaultProtocol, registerVaultScheme } from './vault-protocol';
import { registerIpcHandlers } from './ipc';

const QUICK_CAPTURE_SHORTCUT = 'CommandOrControl+Shift+N';

registerVaultScheme();

let mainWindow: BrowserWindow | null = null;
let service: AppService | undefined;
let updates: UpdateService | undefined;

function openWindow(): BrowserWindow {
  const win = createMainWindow();
  win.on('closed', () => (mainWindow = null));
  return win;
}

function focusWindow(): void {
  mainWindow ??= openWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function onReady(): Promise<void> {
  if (process.platform === 'darwin') app.dock?.setIcon(path.join(__dirname, '..', 'icon-mac.png'));
  if (!devServerUrl) {
    Menu.setApplicationMenu(null);
    applyContentSecurityPolicy();
  }

  const updateService = new UpdateService((status) => mainWindow?.webContents.send(IpcChannel.updateStatus, status));
  updates = updateService;
  service = new AppService(path.join(app.getPath('userData'), 'settings.json'), {
    pickFolder: async (title) => {
      const r = await dialog.showOpenDialog(mainWindow ?? undefined!, { title, properties: ['openDirectory', 'createDirectory'] });
      return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
    },
    revealInFolder: (file) => void pathExists(file).then((ok) => ok && shell.showItemInFolder(file)),
    notifyVaultChanged: (change) => mainWindow?.webContents.send(IpcChannel.vaultChanged, change),
    updates: { status: () => updateService.current(), check: () => updateService.check(), install: () => updateService.install() }
  });
  await service.start();

  registerIpcHandlers(service);
  handleVaultProtocol((id) => service!.vaultRoot(id));
  mainWindow = openWindow();
  updateService.start();

  // quick capture works even while the app is minimized
  globalShortcut.register(QUICK_CAPTURE_SHORTCUT, () => {
    focusWindow();
    mainWindow?.webContents.send(IpcChannel.quickCapture);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', focusWindow);
  app.on('activate', () => void (mainWindow ??= openWindow()));
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    updates?.stop();
    void service?.stop();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  void app.whenReady().then(onReady);
}
