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
  /** Vault that holds this person's private 1:1 notes ('' = not chosen yet). */
  oneOnOneVaultId: string;
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

/** leave = statutory leave such as parental, marriage or bereavement; never deducted from vacation days. */
export type TimeOffType = 'vacation' | 'sick' | 'training' | 'leave' | 'other';

export interface TimeOffEntry {
  id: string;
  type: TimeOffType;
  /** YYYY-MM-DD, inclusive. */
  start: string;
  end: string;
  /** Half day (only when start === end). */
  half?: 'am' | 'pm';
  note: string;
}

export interface TimeOffPerson {
  person: string;
  /** Vacation working days per year. */
  allowance: number;
  /** Per-year overrides, e.g. { "2026": 25 } for carried-over days. */
  allowanceByYear: Record<string, number>;
  entries: TimeOffEntry[];
}

export interface OneOnOneAction {
  /** Meeting date (file) the action item lives in, and its 0-based line. */
  meeting: string;
  line: number;
  text: string;
}

export interface OneOnOneMeeting {
  /** YYYY-MM-DD, or YYYY-MM-DD-2 for a second meeting on the same day. */
  id: string;
  date: string;
  excerpt: string;
  openActions: number;
}

export type FeedbackKind = 'praise' | 'improve' | 'note';

export interface FeedbackEntry {
  /** "YYYY-MM-DD#n": the n-th entry written on that date. */
  id: string;
  date: string;
  kind: FeedbackKind;
  text: string;
}

export interface OneOnOnePerson {
  person: string;
  /** Days between 1:1s (7, 14, 30…); 0 = no regular cadence. */
  cadenceDays: number;
  /** Topics collected for the next 1:1. */
  agenda: string[];
  /** Newest first. */
  meetings: OneOnOneMeeting[];
  openActions: OneOnOneAction[];
  /** General feedback about the person, newest first. */
  feedback: FeedbackEntry[];
  /** Free Markdown documents (performance reviews…), last edited first. */
  reviews: ReviewSummary[];
}

export interface ReviewSummary {
  /** File name without ".md"; also the title. */
  id: string;
  modified: number;
  excerpt: string;
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

/** How this copy of the app gets new versions: installs them itself, only tells, or not at all (development). */
export type UpdateMode = 'auto' | 'notify' | 'off';

export interface UpdateStatus {
  mode: UpdateMode;
  /** Installed version. */
  current: string;
  state: 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error';
  /** Newest published version, when one was found. */
  latest?: string;
  /** Download progress, 0–100. */
  progress?: number;
  checkedAt?: number;
  message?: string;
}
