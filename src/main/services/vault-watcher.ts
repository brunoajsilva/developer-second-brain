import * as path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { VaultChange } from '../../shared/types';

const WATCHED_FILE = /\.(md|png|jpe?g|gif|webp)$/i;

/** Watches the folders of open vaults and reports Markdown/image changes (hidden folders such as .trash are ignored). */
export class VaultWatcher {
  private readonly watchers = new Map<string, FSWatcher>();

  constructor(private readonly onChange: (change: VaultChange) => void) {}

  watch(vaultId: string, root: string): void {
    if (this.watchers.has(vaultId)) return;
    const watcher = chokidar.watch(root, {
      ignoreInitial: true,
      ignored: (p: string) => {
        const rel = path.relative(root, p);
        return rel !== '' && rel.split(path.sep).some((s) => s.startsWith('.'));
      },
      awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 }
    });
    watcher.on('all', (event, p) => {
      if (!WATCHED_FILE.test(p)) return;
      this.onChange({ vaultId, event, path: path.relative(root, p).split(path.sep).join('/') });
    });
    watcher.on('error', () => undefined);
    this.watchers.set(vaultId, watcher);
  }

  async unwatch(vaultId: string): Promise<void> {
    await this.watchers.get(vaultId)?.close();
    this.watchers.delete(vaultId);
  }

  async closeAll(): Promise<void> {
    await Promise.all([...this.watchers.values()].map((w) => w.close()));
    this.watchers.clear();
  }
}
