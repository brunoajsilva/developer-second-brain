import { createContext, useContext } from 'react';
import type { Settings, VaultInfo } from '../../shared/types';
import type { VaultData } from './useVaultData';
import type { View } from './navigation';

/** What every screen of an open vault can reach without prop drilling. */
export interface Workspace {
  vault: VaultInfo;
  vaults: VaultInfo[];
  settings: Settings;
  data: VaultData | null;
  /** Bumped when files change on disk. */
  tick: number;
  reload: () => void;
  /** Re-reads the local settings (after changing the name or the 1:1 vault). */
  refreshSettings: () => void;
  go: (view: View, replace?: boolean) => void;
  openCard: (boardId: string, cardId: string) => void;
  openDoc: (path: string) => void;
  /** Resolves a [[link]]: "#id" opens a card, otherwise a page by title or file name (offering to create it). */
  openLink: (target: string, folderHint?: string) => void;
  collectionOf: (path: string) => string;
  /** Global dialogs any screen can open. */
  dialogs: {
    newBoard: () => void;
    newCollection: () => void;
    setName: () => void;
    team: () => void;
  };
}

export const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error('useWorkspace outside an open vault');
  return ws;
}
