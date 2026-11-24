// Types shared by the main process, the preload script and the renderer.

export interface VaultRecord {
  id: string;
  name: string;
  path: string;
  /** Local flag: a vault only for me (shows a lock). */
  personal?: boolean;
}

export interface VaultInfo extends VaultRecord {
  available: boolean;
  /** Why the vault is unavailable. */
  reason?: string;
}

export interface Settings {
  userName: string;
  openLastVault: boolean;
  activeVaultId: string;
  vaults: VaultRecord[];
}

export interface Column {
  id: string;
  name: string;
  /** Cards in this column count as finished. */
  done?: boolean;
}

export interface Board {
  id: string;
  name: string;
  description: string;
  columns: Column[];
}

export type Priority = '' | 'low' | 'medium' | 'high';

export interface Card {
  id: string;
  board: string;
  title: string;
  /** Id of the column the card is in. */
  status: string;
  assignee: string;
  /** YYYY-MM-DD or ''. */
  due: string;
  priority: Priority;
  tags: string[];
  order: string;
  created: string;
  updated: string;
  updatedBy: string;
  body: string;
  hash: string;
}

export interface CardInput {
  id?: string;
  board: string;
  title: string;
  status: string;
  assignee: string;
  due: string;
  priority: Priority;
  tags: string[];
  body: string;
}

export interface DocSummary {
  /** Relative to Docs/, including .md */
  path: string;
  title: string;
  modified: number;
}

export interface DocFile {
  path: string;
  text: string;
  hash: string;
  modified: number;
}

export type ItemKind = 'doc' | 'card';

export interface SearchResult {
  vaultId: string;
  vaultName: string;
  kind: ItemKind;
  title: string;
  /** Folder of the doc or name of the board. */
  context: string;
  /** Doc path or "boardId/cardId". */
  ref: string;
  excerpt: string;
}

export interface Backlink {
  kind: ItemKind;
  title: string;
  ref: string;
}

export interface ConflictCopy {
  /** Paths relative to the vault root. */
  copy: string;
  original: string;
  copyModified: number;
  originalModified: number;
}

export interface FileVersion {
  text: string;
  hash: string;
  modified: number;
}

/** Payload of a "conflict" error: what is on disk right now. */
export interface ConflictData {
  current: FileVersion;
}

export interface VaultChange {
  vaultId: string;
  event: string;
  path: string;
}

export type OpenFolderResult = { status: 'opened'; vault: VaultInfo } | { status: 'convert'; path: string; name: string };

export type ErrorCode = 'conflict' | 'invalid' | 'missing' | 'permission' | 'error';

export type IpcResult<T = unknown> = { ok: true; value: T } | { ok: false; error: { code: ErrorCode; message: string; data?: unknown } };

export class ApiError extends Error {
  code: ErrorCode;
  data?: unknown;
  constructor(code: ErrorCode, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
