import { ipcMain } from 'electron';
import { IpcChannel } from '../shared/ipc';
import type { AppService } from './services/app-service';

/** One invoke channel; the service validates the method name against the Api it implements. */
export function registerIpcHandlers(service: AppService): void {
  ipcMain.handle(IpcChannel.invoke, (_event, method: unknown, args: unknown) => service.invoke(String(method), Array.isArray(args) ? args : []));
}
