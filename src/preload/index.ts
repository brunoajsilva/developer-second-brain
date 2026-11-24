// The page talks to the main process only through this bridge (context isolation on, no Node in the page).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannel, type Bridge } from '../shared/ipc';
import type { IpcResult, VaultChange } from '../shared/types';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const bridge: Bridge = {
  invoke: (method, args) => ipcRenderer.invoke(IpcChannel.invoke, method, args) as Promise<IpcResult>,
  onVaultChanged: (listener) => subscribe<VaultChange>(IpcChannel.vaultChanged, listener),
  onQuickCapture: (listener) => subscribe<void>(IpcChannel.quickCapture, () => listener())
};

contextBridge.exposeInMainWorld('bridge', bridge);
