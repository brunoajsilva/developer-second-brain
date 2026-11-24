// Atomic reads and writes with conflict detection (hash of what was read).
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { TRASH_DIR } from '../vault/layout';
import type { FileVersion } from '../../shared/types';

export class ConflictError extends Error {
  readonly code = 'conflict';
  readonly current: FileVersion;
  constructor(current: FileVersion) {
    super('The file was changed by someone else or on another computer.');
    this.current = current;
  }
}

export const hashText = (text: string) => createHash('sha1').update(text, 'utf8').digest('hex');

export async function pathExists(absolutePath: string): Promise<boolean> {
  try {
    await fs.access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

export async function readTextFile(absolutePath: string): Promise<FileVersion> {
  const [raw, stat] = await Promise.all([fs.readFile(absolutePath, 'utf8'), fs.stat(absolutePath)]);
  const text = raw.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  return { text, hash: hashText(text), modified: stat.mtimeMs };
}

/**
 * Writes atomically (temporary file + rename), so a sync drive never uploads half a file.
 * expectedHash === undefined: no check. null: the file must not exist.
 * string: the current content must have that hash, otherwise ConflictError.
 */
export async function writeTextFile(absolutePath: string, text: string, expectedHash?: string | null): Promise<FileVersion> {
  const content = text.replace(/\r\n/g, '\n');
  if (expectedHash !== undefined && (await pathExists(absolutePath))) {
    const current = await readTextFile(absolutePath);
    const stale = expectedHash === null || current.hash !== expectedHash;
    // writing exactly what is already there is never a conflict
    if (stale && current.hash !== hashText(content)) throw new ConflictError(current);
  }
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  const tmp = path.join(path.dirname(absolutePath), `.${path.basename(absolutePath)}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    await fs.writeFile(tmp, content, 'utf8');
    await fs.rename(tmp, absolutePath);
  } catch (e) {
    await fs.rm(tmp, { force: true });
    throw e;
  }
  const stat = await fs.stat(absolutePath);
  return { text: content, hash: hashText(content), modified: stat.mtimeMs };
}

/** Moves a file or folder to <vault>/.trash/<timestamp>/<path>. Nothing is ever deleted for good. */
export async function moveToTrash(vaultRoot: string, absolutePath: string): Promise<void> {
  const relative = path.relative(vaultRoot, absolutePath);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let target = path.join(vaultRoot, TRASH_DIR, stamp, relative);
  for (let i = 2; await pathExists(target); i++) target = path.join(vaultRoot, TRASH_DIR, `${stamp}-${i}`, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(absolutePath, target);
}

/** All .md files under a folder, skipping hidden entries and folders rejected by `acceptFolder`. */
export async function listMarkdownFiles(dir: string, acceptFolder: (name: string) => boolean = () => true): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string) {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (acceptFolder(e.name)) await walk(p);
      } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(p);
    }
  }
  await walk(dir);
  return out;
}
