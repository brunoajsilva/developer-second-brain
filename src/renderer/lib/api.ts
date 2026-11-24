import type { Api } from '../../shared/api';
import type { Bridge } from '../../shared/ipc';
import { ApiError } from '../../shared/types';

declare global {
  interface Window {
    bridge: Bridge;
  }
}

/** Typed client for the main process: `api.listBoards(id)` becomes one IPC call. */
export const api: Api = new Proxy({} as Api, {
  get: (_target, method) => {
    if (typeof method !== 'string') return undefined;
    return async (...args: unknown[]) => {
      const result = await window.bridge.invoke(method, args);
      if (result.ok) return result.value;
      throw new ApiError(result.error.code, result.error.message, result.error.data);
    };
  }
});

export const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));
export const isConflict = (e: unknown): e is ApiError => e instanceof ApiError && e.code === 'conflict';
