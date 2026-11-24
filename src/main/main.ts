import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, net, protocol, session, shell } from 'electron';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Servico } from './servico';
import { caminhoNoCofre } from '../core/docs';
import { existe } from '../core/armazem';

protocol.registerSchemesAsPrivileged([{ scheme: 'vault', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const desenvolvimento = !!process.env.VITE_DEV_SERVER_URL;
let janela: BrowserWindow | null = null;
let servico: Servico;

function criarJanela(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#EFEEEC',
    title: 'Developer SecondBrain',
    icon: path.join(__dirname, '..', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });
  w.once('ready-to-show', () => w.show());
  // links externos abrem no navegador; a janela nunca navega para fora da app
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (e, url) => {
    if (desenvolvimento && url.startsWith(process.env.VITE_DEV_SERVER_URL!)) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });
  if (desenvolvimento) void w.loadURL(process.env.VITE_DEV_SERVER_URL!);
  else void w.loadFile(path.join(__dirname, '../renderer/index.html'));
  w.on('closed', () => (janela = null));
  return w;
}

function mostrar(): void {
  if (!janela) janela = criarJanela();
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.focus();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', mostrar);

  app.whenReady().then(async () => {
    if (process.platform === 'darwin') app.dock?.setIcon(path.join(__dirname, '..', 'icon-mac.png'));
    if (!desenvolvimento) {
      Menu.setApplicationMenu(null);
      session.defaultSession.webRequest.onHeadersReceived((det, cb) => {
        cb({
          responseHeaders: {
            ...det.responseHeaders,
            'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: vault:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"]
          }
        });
      });
    }

    servico = new Servico(path.join(app.getPath('userData'), 'definicoes.json'), {
      escolherPasta: async (titulo) => {
        const r = await dialog.showOpenDialog(janela ?? undefined!, { title: titulo, properties: ['openDirectory', 'createDirectory'] });
        return r.canceled || !r.filePaths[0] ? null : r.filePaths[0];
      },
      mostrarNoExplorador: (abs) => {
        void existe(abs).then((ok) => (ok ? shell.showItemInFolder(abs) : undefined));
      },
      aoMudar: (m) => janela?.webContents.send('mudanca', m)
    });
    await servico.iniciar();

    ipcMain.handle('api', (_e, nome: unknown, args: unknown) => servico.chamar(String(nome), Array.isArray(args) ? args : []));

    // vault://<idDoCofre>/<caminho relativo> serve imagens dos anexos (e só de dentro do cofre)
    protocol.handle('vault', async (req) => {
      try {
        const u = new URL(req.url);
        const raiz = await servico.caminhoDe(u.hostname);
        const abs = caminhoNoCofre(raiz, decodeURIComponent(u.pathname));
        if (!/\.(png|jpe?g|gif|webp)$/i.test(abs)) return new Response('proibido', { status: 403 });
        return net.fetch(pathToFileURL(abs).toString());
      } catch {
        return new Response('nao encontrado', { status: 404 });
      }
    });

    janela = criarJanela();

    // captura rápida: Ctrl+Shift+N, mesmo com a app minimizada
    globalShortcut.register('CommandOrControl+Shift+N', () => {
      mostrar();
      janela?.webContents.send('captura');
    });

    app.on('activate', () => {
      if (!janela) janela = criarJanela();
    });
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    void servico?.parar();
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
