import type { IpcResult, VaultChange } from './types';

/** IPC channel names. Kept in one place so main and preload never drift apart. */
export const IpcChannel = {
  /** renderer → main: call one Api method. */
  invoke: 'api:invoke',
  /** main → renderer: a file in an open vault changed on disk. */
  vaultChanged: 'vault:changed',
  /** main → renderer: the global quick-capture shortcut was pressed. */
  quickCapture: 'app:quick-capture'
} as const;

/** What the preload script exposes on `window.bridge`. */
export interface Bridge {
  invoke(method: string, args: unknown[]): Promise<IpcResult>;
  onVaultChanged(listener: (change: VaultChange) => void): () => void;
  onQuickCapture(listener: () => void): () => void;
}
