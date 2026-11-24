// A vault is a folder with a _vault.md at its root, plus Docs/ and Boards/.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathExists, readTextFile, writeTextFile } from '../fs/file-store';
import { asText, parseFrontmatter, stringifyFrontmatter } from '../fs/frontmatter';
import { ValidationError, isInside, isSamePath } from '../fs/paths';
import { saveBoard, saveCard } from '../boards/boards';
import { BOARDS_DIR, DOCS_DIR, LEGACY, VAULT_FILE } from './layout';
import { SAMPLE_CARD, USER_GUIDE, USER_GUIDE_FOLDER } from './sample-content';
import type { VaultRecord } from '../../shared/types';

export interface VaultMeta {
  id: string;
  name: string;
  description: string;
}

export const newVaultId = () => randomBytes(4).toString('hex');

/** Reads _vault.md (or the legacy _cofre.md of vaults not migrated yet). Null if the folder is not a vault. */
export async function readVaultMeta(dir: string): Promise<VaultMeta | null> {
  for (const [file, nameKey] of [[VAULT_FILE, 'name'], [LEGACY.vaultFile, 'nome']] as const) {
    const abs = path.join(dir, file);
    if (!(await pathExists(abs))) continue;
    const { data, body } = parseFrontmatter((await readTextFile(abs)).text);
    const id = asText(data.id).trim();
    if (!id) return null;
    return { id, name: asText(data[nameKey]).trim() || path.basename(dir), description: body.trim() };
  }
  return null;
}

async function assertWritableFolder(dir: string): Promise<void> {
  if (!path.isAbsolute(dir)) throw new ValidationError('use an absolute path');
  const resolved = path.resolve(dir);
  if (resolved === path.parse(resolved).root) throw new ValidationError('choose a folder, not the root of a drive');
  await fs.mkdir(dir, { recursive: true });
  const probe = path.join(dir, `.write-test-${randomBytes(4).toString('hex')}.tmp`);
  try {
    await fs.writeFile(probe, 'x');
    await fs.rm(probe);
  } catch {
    throw new ValidationError('no write permission in that folder');
  }
}

/** Rejects vaults inside vaults, duplicates, and copies of a vault (same id elsewhere). */
export function assertCanRegister(dir: string, id: string | null, registered: VaultRecord[]): void {
  for (const v of registered) {
    if (isSamePath(v.path, dir)) throw new ValidationError('This vault is already in the list.');
    if (isInside(v.path, dir)) throw new ValidationError(`The folder is inside the vault "${v.name}". A vault cannot live inside another vault.`);
    if (isInside(dir, v.path)) throw new ValidationError(`The folder contains the vault "${v.name}". A vault cannot contain another vault.`);
    if (id && v.id === id) throw new ValidationError(`You already have a vault with this identifier ("${v.name}"). If you copied the folder, create a new vault instead of opening the copy.`);
  }
}

/** Turns an existing folder into a vault. Files already there are left untouched. */
export async function initializeVault(dir: string, meta: VaultMeta): Promise<void> {
  await writeTextFile(path.join(dir, VAULT_FILE), stringifyFrontmatter({ id: meta.id, name: meta.name }, meta.description || 'Team vault. Every page and every card is a Markdown file.'));
  for (const sub of [DOCS_DIR, BOARDS_DIR]) await fs.mkdir(path.join(dir, sub), { recursive: true });
}

export async function createVault(dir: string, name: string, withSample: boolean, registered: VaultRecord[]): Promise<VaultMeta> {
  const clean = name.trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, 60);
  if (!clean) throw new ValidationError('The vault needs a name.');
  await assertWritableFolder(dir);
  const existing = await readVaultMeta(dir);
  if (existing) throw new ValidationError(`This folder is already a vault ("${existing.name}"). Use "Open folder as vault".`);
  assertCanRegister(dir, null, registered);
  const meta: VaultMeta = { id: newVaultId(), name: clean, description: '' };
  await initializeVault(dir, meta);
  if (withSample) await writeSampleContent(dir);
  return meta;
}

/** Checks a folder chosen with "Open folder". meta === null means it still has to be converted. */
export async function inspectFolder(dir: string, registered: VaultRecord[]): Promise<{ meta: VaultMeta | null }> {
  await assertWritableFolder(dir);
  const meta = await readVaultMeta(dir);
  assertCanRegister(dir, meta?.id ?? null, registered);
  return { meta };
}

async function writeSampleContent(dir: string): Promise<void> {
  const board = await saveBoard(dir, {
    name: 'Team board',
    description: '',
    columns: [
      { id: 'todo', name: 'To do' },
      { id: 'in-progress', name: 'In progress' },
      { id: 'blocked', name: 'Blocked' },
      { id: 'done', name: 'Done', done: true }
    ]
  });
  await saveCard(dir, { board: board.id, title: 'Open me: how cards work', status: 'todo', assignee: '', due: '', priority: '', tags: ['getting started'], body: SAMPLE_CARD }, null, '');
  for (const [name, text] of Object.entries(USER_GUIDE)) await writeTextFile(path.join(dir, DOCS_DIR, USER_GUIDE_FOLDER, name + '.md'), text);
}
