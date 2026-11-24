import type {
  Backlink, Board, Card, CardInput, Column, ConflictCopy, DocFile, DocSummary, ItemKind, OpenFolderResult, SearchResult, Settings, VaultInfo
} from './types';

/**
 * Everything the renderer can ask the main process for.
 * Each method becomes one call over the single invoke channel (see ipc.ts).
 */
export interface Api {
  // settings
  getSettings(): Promise<Settings>;
  setUserName(name: string): Promise<void>;
  setOpenLastVault(value: boolean): Promise<void>;
  setActiveVault(vaultId: string): Promise<void>;

  // vaults
  listVaults(): Promise<VaultInfo[]>;
  pickFolder(title: string): Promise<string | null>;
  createVault(name: string, parentFolder: string, personal: boolean): Promise<VaultInfo>;
  openFolder(folder: string): Promise<OpenFolderResult>;
  convertFolder(folder: string, name: string, personal: boolean): Promise<VaultInfo>;
  setVaultPersonal(vaultId: string, personal: boolean): Promise<void>;
  removeVault(vaultId: string): Promise<void>;
  locateVault(vaultId: string, folder: string): Promise<VaultInfo>;
  revealInFolder(vaultId: string, relativePath: string): Promise<void>;

  // boards and cards
  listBoards(vaultId: string): Promise<Board[]>;
  saveBoard(vaultId: string, board: { id?: string; name: string; description?: string; columns: Column[] }): Promise<Board>;
  deleteBoard(vaultId: string, boardId: string): Promise<void>;
  listCards(vaultId: string, boardId: string): Promise<Card[]>;
  listAllCards(vaultId: string): Promise<Card[]>;
  saveCard(vaultId: string, card: CardInput, expectedHash: string | null): Promise<Card>;
  moveCard(vaultId: string, boardId: string, cardId: string, status: string, beforeId: string | null): Promise<void>;
  deleteCard(vaultId: string, boardId: string, cardId: string): Promise<void>;

  // docs
  listDocs(vaultId: string): Promise<DocSummary[]>;
  readDoc(vaultId: string, path: string): Promise<DocFile>;
  writeDoc(vaultId: string, path: string, text: string, expectedHash: string | null): Promise<{ hash: string; modified: number }>;
  createDoc(vaultId: string, path: string, text: string): Promise<DocFile>;
  deleteDoc(vaultId: string, path: string): Promise<void>;
  moveDoc(vaultId: string, from: string, to: string): Promise<void>;
  listDocFolders(vaultId: string): Promise<string[]>;
  createDocFolder(vaultId: string, path: string): Promise<void>;
  renameDocFolder(vaultId: string, from: string, to: string): Promise<void>;
  deleteDocFolder(vaultId: string, path: string): Promise<void>;
  saveAttachment(vaultId: string, docPath: string, extension: string, bytes: Uint8Array): Promise<string>;

  // search and links
  search(query: string, vaultIds: string[]): Promise<SearchResult[]>;
  backlinks(vaultId: string, target: { kind: ItemKind; title: string; ref: string }): Promise<Backlink[]>;

  // sync conflicts
  listConflicts(vaultId: string): Promise<ConflictCopy[]>;
  readVaultFile(vaultId: string, path: string): Promise<string>;
  resolveConflict(vaultId: string, copy: string, keep: 'original' | 'copy'): Promise<void>;

  // team
  listPeople(vaultId: string): Promise<string[]>;
  listTeam(vaultId: string): Promise<string[]>;
  addTeamMember(vaultId: string, name: string): Promise<void>;
  removeTeamMember(vaultId: string, name: string): Promise<void>;
}

export type ApiMethod = keyof Api;
