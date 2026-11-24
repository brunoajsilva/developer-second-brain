// Upgrades vaults created before v0.2, whose files used Portuguese names and keys.
// Every step is idempotent: running it on an already migrated vault changes nothing.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { listMarkdownFiles, pathExists, readTextFile, writeTextFile } from '../fs/file-store';
import { parseFrontmatter, stringifyFrontmatter } from '../fs/frontmatter';
import { ATTACHMENTS_DIR, BOARDS_DIR, BOARD_FILE, DOCS_DIR, LEGACY, TEAM_FILE, TRASH_DIR, VAULT_FILE } from './layout';

/** Legacy card frontmatter key → current key. */
const CARD_KEYS: Record<string, string> = {
  titulo: 'title',
  estado: 'status',
  responsavel: 'assignee',
  prazo: 'due',
  prioridade: 'priority',
  etiquetas: 'tags',
  ordem: 'order',
  criado: 'created',
  atualizado: 'updated',
  atualizado_por: 'updated_by'
};
const PRIORITY_VALUES: Record<string, string> = { baixa: 'low', media: 'medium', média: 'medium', alta: 'high' };

export interface MigrationReport {
  /** Vault-relative paths of every file or folder that was changed. */
  changed: string[];
}

export async function migrateVault(vault: string): Promise<MigrationReport> {
  const changed: string[] = [];
  const note = (abs: string) => changed.push(path.relative(vault, abs).split(path.sep).join('/'));

  await renameFile(path.join(vault, LEGACY.vaultFile), path.join(vault, VAULT_FILE), (text) => {
    const { data, body } = parseFrontmatter(text);
    return stringifyFrontmatter({ id: data.id, name: data.nome ?? data.name }, body);
  }, note);
  await renameFile(path.join(vault, LEGACY.teamFile), path.join(vault, TEAM_FILE), (text) => text.replace(/^#\s+Equipa\s*$/m, '# Team'), note);
  await mergeFolder(path.join(vault, LEGACY.trashDir), path.join(vault, TRASH_DIR), note);
  await migrateBoards(vault, note);
  await migrateDocs(vault, note);
  return { changed };
}

/** Moves `from` to `to` (rewriting its text) unless `to` already exists. */
async function renameFile(from: string, to: string, rewrite: (text: string) => string, note: (abs: string) => void): Promise<void> {
  if (!(await pathExists(from))) return;
  if (!(await pathExists(to))) {
    await writeTextFile(to, rewrite((await readTextFile(from)).text));
    note(to);
  }
  await fs.rm(from, { force: true });
  note(from);
}

/** Moves every entry of folder `from` into `to` (renaming on clashes) and removes `from`. */
async function mergeFolder(from: string, to: string, note: (abs: string) => void): Promise<void> {
  if (!(await pathExists(from))) return;
  if (!(await pathExists(to))) {
    await fs.rename(from, to);
    note(to);
    return;
  }
  for (const name of await fs.readdir(from)) {
    let target = path.join(to, name);
    for (let k = 2; await pathExists(target); k++) target = path.join(to, `${name}-${k}`);
    await fs.rename(path.join(from, name), target);
  }
  await fs.rm(from, { recursive: true, force: true });
  note(to);
}

async function migrateBoards(vault: string, note: (abs: string) => void): Promise<void> {
  let boards;
  try {
    boards = await fs.readdir(path.join(vault, BOARDS_DIR), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of boards) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = path.join(vault, BOARDS_DIR, entry.name);
    const boardFile = path.join(dir, BOARD_FILE);
    if (await pathExists(boardFile)) {
      const { data, body } = parseFrontmatter((await readTextFile(boardFile)).text);
      if ('nome' in data || 'estados' in data) {
        const { nome, estados, ...rest } = data;
        const columns = Array.isArray(estados)
          ? estados.map((raw) => {
              const c = (raw ?? {}) as Record<string, unknown>;
              return { id: c.id, name: c.nome ?? c.name, ...(c.fim === true || c.done === true ? { done: true } : {}) };
            })
          : rest.columns;
        await writeTextFile(boardFile, stringifyFrontmatter({ name: nome ?? rest.name, columns, ...omit(rest, ['name', 'columns']) }, body));
        note(boardFile);
      }
    }
    for (const name of await fs.readdir(dir)) {
      if (!name.toLowerCase().endsWith('.md') || name.startsWith('_') || name.startsWith('.')) continue;
      const file = path.join(dir, name);
      const { data, body, valid } = parseFrontmatter((await readTextFile(file)).text);
      if (!valid || !Object.keys(data).some((k) => k in CARD_KEYS)) continue;
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data)) {
        const key = CARD_KEYS[k] ?? k;
        if (key in next && !(k in CARD_KEYS)) continue; // an English key already set wins over a stray duplicate
        next[key] = key === 'priority' && typeof v === 'string' ? (PRIORITY_VALUES[v.toLowerCase()] ?? v) : v;
      }
      await writeTextFile(file, stringifyFrontmatter(next, body));
      note(file);
    }
  }
}

async function migrateDocs(vault: string, note: (abs: string) => void): Promise<void> {
  const docs = path.join(vault, DOCS_DIR);
  if (!(await pathExists(docs))) return;
  // attachment folders: _anexos → _attachments
  for (const dir of await findFolders(docs, LEGACY.attachmentsDir)) await mergeFolder(dir, path.join(path.dirname(dir), ATTACHMENTS_DIR), note);
  // links to attachments and the legacy "titulo:" key
  const legacyLink = new RegExp(`(^|[/(\\s"'])${LEGACY.attachmentsDir}/`, 'g');
  for (const file of await listMarkdownFiles(docs, (n) => !n.startsWith('_'))) {
    const { text } = await readTextFile(file);
    let next = text.replace(legacyLink, `$1${ATTACHMENTS_DIR}/`);
    if (next.startsWith('---')) {
      const { data, body, valid } = parseFrontmatter(next);
      if (valid && 'titulo' in data) {
        const { titulo, ...rest } = data;
        next = stringifyFrontmatter({ title: titulo, ...rest }, body);
      }
    }
    if (next !== text) {
      await writeTextFile(file, next);
      note(file);
    }
  }
}

async function findFolders(root: string, name: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      if (e.name === name) out.push(abs);
      else await walk(abs);
    }
  }
  await walk(root);
  return out;
}

function omit(o: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
}
