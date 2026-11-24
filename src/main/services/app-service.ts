import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Api } from '../../shared/api';
import type { IpcResult, VaultChange, VaultInfo, VaultRecord } from '../../shared/types';
import { SettingsStore, getVaultStatuses } from '../../core/settings/settings-store';
import { assertCanRegister, createVault, initializeVault, inspectFolder, newVaultId, readVaultMeta } from '../../core/vault/vault';
import { migrateVault } from '../../core/vault/migration';
import { addTeamMember, listPeople, listTeam, removeTeamMember } from '../../core/vault/team';
import { VAULT_FILE } from '../../core/vault/layout';
import { deleteBoard, deleteCard, listAllCards, listBoards, listCards, moveCard, saveBoard, saveCard } from '../../core/boards/boards';
import {
  createDoc, createDocFolder, deleteDoc, deleteDocFolder, listDocFolders, listDocs, moveDoc, readDoc, renameDocFolder, saveAttachment, writeDoc
} from '../../core/docs/docs';
import { buildSearchIndex, findBacklinks, searchIndex, type SearchIndex } from '../../core/search/search-index';
import { listConflicts, resolveConflict } from '../../core/conflicts/conflicts';
import { deleteTimeOff, listTimeOff, saveTimeOff, setTimeOffAllowance } from '../../core/time-off/time-off';
import { createReview, deleteFeedback, deleteOneOnOne, deleteReview, readReview, renameReview, writeReview, listOneOnOnes, saveFeedback, readOneOnOne, setOneOnOneAgenda, setOneOnOneCadence, startOneOnOne, writeOneOnOne } from '../../core/one-on-ones/one-on-ones';
import { pathExists, readTextFile } from '../../core/fs/file-store';
import { ValidationError, resolveInside } from '../../core/fs/paths';
import { VaultWatcher } from './vault-watcher';
import { errorToIpcResult } from './to-ipc-result';

/** What the service needs from Electron. Injected so the service can be tested without a window. */
export interface Host {
  pickFolder(title: string): Promise<string | null>;
  revealInFolder(absolutePath: string): void;
  notifyVaultChanged(change: VaultChange): void;
}

const MAX_SEARCH_RESULTS = 40;

/** All app logic outside the window: vaults, files, search and folder watching. */
export class AppService {
  private readonly settings: SettingsStore;
  private readonly watcher: VaultWatcher;
  private readonly indexes = new Map<string, SearchIndex>();
  /** Vaults already checked for the legacy layout in this session. */
  private readonly migrated = new Set<string>();

  constructor(settingsFile: string, private readonly host: Host) {
    this.settings = new SettingsStore(settingsFile);
    this.watcher = new VaultWatcher((change) => {
      this.indexes.delete(change.vaultId);
      this.host.notifyVaultChanged(change);
    });
  }

  async start(): Promise<void> {
    for (const v of await getVaultStatuses(await this.settings.read())) if (v.available) this.watcher.watch(v.id, v.path);
  }

  stop(): Promise<void> {
    return this.watcher.closeAll();
  }

  /** Root folder of a registered vault. Migrates legacy vaults the first time they are used. */
  async vaultRoot(vaultId: string): Promise<string> {
    const vault = (await this.settings.read()).vaults.find((v) => v.id === vaultId);
    if (!vault) throw new ValidationError('unknown vault');
    if (!(await pathExists(vault.path))) throw new ValidationError('This vault folder is not reachable.');
    if (!this.migrated.has(vaultId)) {
      this.migrated.add(vaultId);
      await migrateVault(vault.path);
    }
    return vault.path;
  }

  private async searchIndexFor(vaultId: string): Promise<SearchIndex> {
    let index = this.indexes.get(vaultId);
    if (!index) {
      index = await buildSearchIndex(await this.vaultRoot(vaultId));
      this.indexes.set(vaultId, index);
    }
    return index;
  }

  private async register(meta: { id: string; name: string }, folder: string, personal?: boolean): Promise<VaultInfo> {
    const previous = (await this.settings.read()).vaults.find((v) => v.id === meta.id);
    const record: VaultRecord = { id: meta.id, name: meta.name, path: folder, personal: personal ?? previous?.personal ?? false };
    await this.settings.update((s) => {
      s.vaults = s.vaults.filter((v) => v.id !== record.id).concat(record);
      s.activeVaultId = record.id;
    });
    this.migrated.delete(record.id);
    await this.vaultRoot(record.id);
    this.watcher.watch(record.id, folder);
    return { ...record, available: true };
  }

  private async forget(vaultId: string): Promise<void> {
    await this.watcher.unwatch(vaultId);
    this.indexes.delete(vaultId);
    this.migrated.delete(vaultId);
  }

  private async currentUser(): Promise<string> {
    return (await this.settings.read()).userName;
  }

  /** The Api implementation. Each method name is also the name of the IPC call. */
  readonly api: Api = {
    getSettings: () => this.settings.read(),
    setUserName: async (name) => void (await this.settings.update((s) => void (s.userName = name.trim().slice(0, 60)))),
    setOpenLastVault: async (value) => void (await this.settings.update((s) => void (s.openLastVault = !!value))),
    setActiveVault: async (id) => void (await this.settings.update((s) => void (s.activeVaultId = id))),
    setOneOnOneVault: async (id) => void (await this.settings.update((s) => void (s.oneOnOneVaultId = id))),

    listVaults: async () => getVaultStatuses(await this.settings.read()),
    pickFolder: (title) => this.host.pickFolder(title),

    createVault: async (name, parentFolder, personal) => {
      const settings = await this.settings.read();
      // the chosen folder is the parent: every vault gets its own subfolder
      const base = name.trim().replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 60) || 'Vault';
      let folder = path.join(parentFolder, base);
      for (let i = 2; (await pathExists(folder)) && (await fs.readdir(folder)).length > 0; i++) folder = path.join(parentFolder, `${base} ${i}`);
      const meta = await createVault(folder, name, true, settings.vaults);
      return this.register(meta, folder, personal);
    },
    openFolder: async (folder) => {
      const { meta } = await inspectFolder(folder, (await this.settings.read()).vaults);
      if (meta) return { status: 'opened', vault: await this.register(meta, folder) };
      return { status: 'convert', path: folder, name: path.basename(folder) };
    },
    convertFolder: async (folder, name, personal) => {
      assertCanRegister(folder, null, (await this.settings.read()).vaults);
      const meta = { id: newVaultId(), name: name.trim().slice(0, 60) || path.basename(folder), description: '' };
      await initializeVault(folder, meta);
      return this.register(meta, folder, personal);
    },
    setVaultPersonal: async (id, personal) =>
      void (await this.settings.update((s) => s.vaults.forEach((v) => { if (v.id === id) v.personal = !!personal; }))),
    removeVault: async (id) => {
      await this.settings.update((s) => {
        s.vaults = s.vaults.filter((v) => v.id !== id);
        if (s.activeVaultId === id) s.activeVaultId = '';
        if (s.oneOnOneVaultId === id) s.oneOnOneVaultId = '';
      });
      await this.forget(id);
    },
    locateVault: async (id, folder) => {
      const meta = await readVaultMeta(folder);
      if (!meta) throw new ValidationError(`That folder is not a vault (it has no ${VAULT_FILE}).`);
      if (meta.id !== id) throw new ValidationError(`That folder is a different vault ("${meta.name}").`);
      await this.forget(id);
      return this.register(meta, folder);
    },
    revealInFolder: async (id, relativePath) => {
      const root = await this.vaultRoot(id);
      const segments = relativePath.split('/').filter((s) => s && s !== '..');
      this.host.revealInFolder(segments.length ? path.resolve(root, ...segments) : root);
    },

    listBoards: async (id) => listBoards(await this.vaultRoot(id)),
    saveBoard: async (id, board) => saveBoard(await this.vaultRoot(id), board),
    deleteBoard: async (id, boardId) => deleteBoard(await this.vaultRoot(id), boardId),
    listCards: async (id, boardId) => listCards(await this.vaultRoot(id), boardId),
    listAllCards: async (id) => listAllCards(await this.vaultRoot(id)),
    saveCard: async (id, card, hash) => saveCard(await this.vaultRoot(id), card, hash, (await this.currentUser()) || 'Unnamed'),
    moveCard: async (id, boardId, cardId, status, beforeId) => moveCard(await this.vaultRoot(id), boardId, cardId, status, beforeId),
    deleteCard: async (id, boardId, cardId) => deleteCard(await this.vaultRoot(id), boardId, cardId),

    listDocs: async (id) => listDocs(await this.vaultRoot(id)),
    readDoc: async (id, p) => readDoc(await this.vaultRoot(id), p),
    writeDoc: async (id, p, text, hash) => writeDoc(await this.vaultRoot(id), p, text, hash),
    createDoc: async (id, p, text) => createDoc(await this.vaultRoot(id), p, text),
    deleteDoc: async (id, p) => deleteDoc(await this.vaultRoot(id), p),
    moveDoc: async (id, from, to) => moveDoc(await this.vaultRoot(id), from, to),
    listDocFolders: async (id) => listDocFolders(await this.vaultRoot(id)),
    createDocFolder: async (id, p) => createDocFolder(await this.vaultRoot(id), p),
    renameDocFolder: async (id, from, to) => renameDocFolder(await this.vaultRoot(id), from, to),
    deleteDocFolder: async (id, p) => deleteDocFolder(await this.vaultRoot(id), p),
    saveAttachment: async (id, docPath, ext, bytes) => saveAttachment(await this.vaultRoot(id), docPath, ext, bytes),

    listTimeOff: async (id) => listTimeOff(await this.vaultRoot(id)),
    saveTimeOff: async (id, person, entry) => saveTimeOff(await this.vaultRoot(id), person, entry),
    deleteTimeOff: async (id, person, entryId) => deleteTimeOff(await this.vaultRoot(id), person, entryId),
    setTimeOffAllowance: async (id, person, allowance, year) => setTimeOffAllowance(await this.vaultRoot(id), person, allowance, year),

    listOneOnOnes: async (id) => listOneOnOnes(await this.vaultRoot(id)),
    readOneOnOne: async (id, person, meeting) => readOneOnOne(await this.vaultRoot(id), person, meeting),
    writeOneOnOne: async (id, person, meeting, text, hash) => writeOneOnOne(await this.vaultRoot(id), person, meeting, text, hash),
    startOneOnOne: async (id, person, date) => startOneOnOne(await this.vaultRoot(id), person, date),
    deleteOneOnOne: async (id, person, meeting) => deleteOneOnOne(await this.vaultRoot(id), person, meeting),
    setOneOnOneAgenda: async (id, person, topics) => setOneOnOneAgenda(await this.vaultRoot(id), person, topics),
    setOneOnOneCadence: async (id, person, days) => setOneOnOneCadence(await this.vaultRoot(id), person, days),
    saveFeedback: async (id, person, entry) => saveFeedback(await this.vaultRoot(id), person, entry),
    deleteFeedback: async (id, person, entryId) => deleteFeedback(await this.vaultRoot(id), person, entryId),
    createReview: async (id, person, title) => createReview(await this.vaultRoot(id), person, title),
    readReview: async (id, person, review) => readReview(await this.vaultRoot(id), person, review),
    writeReview: async (id, person, review, text, hash) => writeReview(await this.vaultRoot(id), person, review, text, hash),
    renameReview: async (id, person, review, title) => renameReview(await this.vaultRoot(id), person, review, title),
    deleteReview: async (id, person, review) => deleteReview(await this.vaultRoot(id), person, review),

    search: async (query, vaultIds) => {
      const out = [];
      for (const v of await getVaultStatuses(await this.settings.read())) {
        if (v.available && vaultIds.includes(v.id)) out.push(...searchIndex(await this.searchIndexFor(v.id), v.id, v.name, query));
      }
      return out.slice(0, MAX_SEARCH_RESULTS);
    },
    backlinks: async (id, target) => findBacklinks(await this.searchIndexFor(id), target),

    listConflicts: async (id) => listConflicts(await this.vaultRoot(id)),
    readVaultFile: async (id, p) => (await readTextFile(resolveInside(await this.vaultRoot(id), '.', p))).text,
    resolveConflict: async (id, copy, keep) => resolveConflict(await this.vaultRoot(id), copy, keep),

    listPeople: async (id) => listPeople(await this.vaultRoot(id), await this.currentUser()),
    listTeam: async (id) => listTeam(await this.vaultRoot(id)),
    addTeamMember: async (id, name) => addTeamMember(await this.vaultRoot(id), name),
    removeTeamMember: async (id, name) => removeTeamMember(await this.vaultRoot(id), name)
  };

  /** Entry point for IPC: runs one Api method and never throws across the bridge. */
  async invoke(method: string, args: unknown[]): Promise<IpcResult> {
    const fn = Object.prototype.hasOwnProperty.call(this.api, method)
      ? (this.api as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[method]
      : undefined;
    if (typeof fn !== 'function') return { ok: false, error: { code: 'error', message: `unknown call: ${method}` } };
    try {
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      return errorToIpcResult(e);
    }
  }
}
