// Conflict copies created by sync drives (OneDrive: "name-PCNAME.md"; Dropbox/Drive: "(conflicted copy)").
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { listMarkdownFiles, moveToTrash, pathExists, readTextFile, writeTextFile } from '../fs/file-store';
import { ValidationError, toRelative, validateRelativePath } from '../fs/paths';
import type { ConflictCopy } from '../../shared/types';

const ONEDRIVE_COPY = /^(.+?)-([A-Z0-9][A-Z0-9]*(?:-[A-Z0-9]+)+|[A-Z0-9]{6,})$/;
// the Portuguese variant is what localized sync clients write
const DROPBOX_COPY = /^(.+?)(?: \(.*(?:conflicted copy|c[óo]pia em conflito).*\))$/i;

/** Original file name (without extension) of a conflict copy, or null if it is not one. */
export function originalNameOf(stem: string): string | null {
  const dropbox = stem.match(DROPBOX_COPY);
  if (dropbox) return dropbox[1];
  const onedrive = stem.match(ONEDRIVE_COPY);
  return onedrive ? onedrive[1] : null;
}

export async function listConflicts(vault: string): Promise<ConflictCopy[]> {
  const out: ConflictCopy[] = [];
  for (const file of await listMarkdownFiles(vault)) {
    const base = originalNameOf(path.basename(file, '.md'));
    if (!base) continue;
    const original = path.join(path.dirname(file), base + '.md');
    if (!(await pathExists(original))) continue;
    const [a, b] = await Promise.all([fs.stat(file), fs.stat(original)]);
    out.push({ copy: toRelative(vault, file), original: toRelative(vault, original), copyModified: a.mtimeMs, originalModified: b.mtimeMs });
  }
  return out;
}

/** Keeps one version; the other goes to the trash. */
export async function resolveConflict(vault: string, copy: string, keep: 'original' | 'copy'): Promise<void> {
  const file = path.resolve(vault, ...validateRelativePath(copy));
  const base = originalNameOf(path.basename(file, '.md'));
  if (!base) throw new ValidationError('not a conflict copy');
  const original = path.join(path.dirname(file), base + '.md');
  if (!(await pathExists(file)) || !(await pathExists(original))) throw new ValidationError('file not found');
  if (keep === 'copy') {
    const { text } = await readTextFile(file);
    await moveToTrash(vault, original).catch(() => undefined);
    await writeTextFile(original, text);
  }
  await moveToTrash(vault, file);
}
