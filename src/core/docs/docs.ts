// Pages are Markdown files under Docs/. A page "A.md" is titled "A" and keeps its sub-pages in the folder "A/".
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { listMarkdownFiles, moveToTrash, pathExists, readTextFile, writeTextFile } from '../fs/file-store';
import { ValidationError, resolveInside, toRelative } from '../fs/paths';
import { ATTACHMENTS_DIR, DOCS_DIR } from '../vault/layout';
import type { DocFile, DocSummary } from '../../shared/types';

const MAX_PAGE_BYTES = 1_000_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

const docsDir = (vault: string) => path.join(vault, DOCS_DIR);

/** A page's title is its file name, so renaming the file renames the page everywhere. */
export const pageTitle = (file: string) => path.basename(file).replace(/\.md$/i, '');

function assertPagePath(relativePath: string): void {
  if (!/\.md$/i.test(relativePath)) throw new ValidationError('page file names must end in .md');
  if (relativePath.split('/').some((s) => s.startsWith('_'))) throw new ValidationError('names starting with _ are reserved');
}

export function docAbsolutePath(vault: string, relativePath: string): string {
  assertPagePath(relativePath);
  return resolveInside(vault, DOCS_DIR, relativePath);
}

export async function listDocs(vault: string): Promise<DocSummary[]> {
  const base = docsDir(vault);
  const out: DocSummary[] = [];
  for (const file of await listMarkdownFiles(base, (n) => !n.startsWith('_'))) {
    if (path.basename(file).startsWith('_')) continue;
    const { modified } = await readTextFile(file);
    out.push({ path: toRelative(base, file), title: pageTitle(file), modified });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readDoc(vault: string, relativePath: string): Promise<DocFile> {
  const file = docAbsolutePath(vault, relativePath);
  if (!(await pathExists(file))) throw new ValidationError('page not found');
  const { text, hash, modified } = await readTextFile(file);
  return { path: relativePath, text, hash, modified };
}

export async function writeDoc(vault: string, relativePath: string, text: string, expectedHash: string | null): Promise<{ hash: string; modified: number }> {
  if (text.length > MAX_PAGE_BYTES) throw new ValidationError('page is too large (max 1 MB)');
  const { hash, modified } = await writeTextFile(docAbsolutePath(vault, relativePath), text, expectedHash);
  return { hash, modified };
}

export async function createDoc(vault: string, relativePath: string, text: string): Promise<DocFile> {
  const written = await writeTextFile(docAbsolutePath(vault, relativePath), text, null);
  return { path: relativePath, text: written.text, hash: written.hash, modified: written.modified };
}

/** Removes empty folders from `dir` upwards (never the Docs root itself). */
async function removeEmptyFolders(vault: string, dir: string): Promise<void> {
  const root = docsDir(vault);
  while (dir.length > root.length && dir.startsWith(root + path.sep)) {
    let rest: string[];
    try {
      rest = (await fs.readdir(dir)).filter((n) => !n.startsWith('.'));
    } catch {
      return;
    }
    if (rest.length) break;
    await fs.rm(dir, { recursive: true, force: true });
    dir = path.dirname(dir);
  }
}

export async function deleteDoc(vault: string, relativePath: string): Promise<void> {
  const file = docAbsolutePath(vault, relativePath);
  if (!(await pathExists(file))) throw new ValidationError('page not found');
  await moveToTrash(vault, file);
  await removeEmptyFolders(vault, path.dirname(file));
}

export async function moveDoc(vault: string, from: string, to: string): Promise<void> {
  const source = docAbsolutePath(vault, from);
  const target = docAbsolutePath(vault, to);
  if (!(await pathExists(source))) throw new ValidationError('page not found');
  const sameFile = source.toLowerCase() === target.toLowerCase();
  if (!sameFile && (await pathExists(target))) throw new ValidationError('a page with that name already exists');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(source, target);
  await removeEmptyFolders(vault, path.dirname(source));
  // bring the attachments along when the page changes folder
  const fromAttachments = path.join(path.dirname(source), ATTACHMENTS_DIR);
  const toAttachments = path.join(path.dirname(target), ATTACHMENTS_DIR);
  if (path.dirname(source) !== path.dirname(target) && (await pathExists(fromAttachments))) {
    await fs.mkdir(toAttachments, { recursive: true });
    for (const n of await fs.readdir(fromAttachments)) {
      if (!(await pathExists(path.join(toAttachments, n)))) await fs.copyFile(path.join(fromAttachments, n), path.join(toAttachments, n));
    }
  }
}

function cleanFolderPath(relativePath: string): string {
  const clean = relativePath.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!clean) throw new ValidationError('enter a name');
  if (clean.split('/').some((s) => !s.trim() || s.startsWith('_') || s.startsWith('.'))) throw new ValidationError('names cannot start with _ or .');
  return clean;
}

/** Every folder inside Docs (including empty ones), as relative paths. */
export async function listDocFolders(vault: string): Promise<string[]> {
  const base = docsDir(vault);
  const out: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('_') || e.name.startsWith('.')) continue;
      const abs = path.join(dir, e.name);
      out.push(toRelative(base, abs));
      await walk(abs);
    }
  }
  await walk(base);
  return out.sort((a, b) => a.localeCompare(b));
}

export async function createDocFolder(vault: string, relativePath: string): Promise<void> {
  const dir = resolveInside(vault, DOCS_DIR, cleanFolderPath(relativePath));
  if (await pathExists(dir)) throw new ValidationError('that name is already taken');
  await fs.mkdir(dir, { recursive: true });
}

export async function renameDocFolder(vault: string, from: string, to: string): Promise<void> {
  const source = resolveInside(vault, DOCS_DIR, cleanFolderPath(from));
  const target = resolveInside(vault, DOCS_DIR, cleanFolderPath(to));
  if (!(await pathExists(source))) throw new ValidationError('folder not found');
  if (source === target) return;
  if (target.toLowerCase().startsWith(source.toLowerCase() + path.sep)) throw new ValidationError('you cannot move a page inside itself');
  if (source.toLowerCase() !== target.toLowerCase() && (await pathExists(target))) throw new ValidationError('that name is already taken');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.rename(source, target);
  await removeEmptyFolders(vault, path.dirname(source));
}

export async function deleteDocFolder(vault: string, relativePath: string): Promise<void> {
  const dir = resolveInside(vault, DOCS_DIR, cleanFolderPath(relativePath));
  if (!(await pathExists(dir))) throw new ValidationError('folder not found');
  await moveToTrash(vault, dir);
  await removeEmptyFolders(vault, path.dirname(dir));
}

/** Saves a pasted image in _attachments/ next to the page. Returns the path relative to the page. */
export async function saveAttachment(vault: string, docPath: string, extension: string, bytes: Uint8Array): Promise<string> {
  const ext = extension.toLowerCase().replace(/^\./, '');
  if (!IMAGE_EXTENSIONS.has(ext)) throw new ValidationError('only png, jpg, gif or webp images are accepted');
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ValidationError('image is too large (max 10 MB)');
  const dir = path.join(path.dirname(docAbsolutePath(vault, docPath)), ATTACHMENTS_DIR);
  await fs.mkdir(dir, { recursive: true });
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = `image-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  let name = `${base}.${ext}`;
  for (let k = 2; await pathExists(path.join(dir, name)); k++) name = `${base}-${k}.${ext}`;
  await fs.writeFile(path.join(dir, name), bytes);
  return `${ATTACHMENTS_DIR}/${name}`;
}

/** Absolute path of a vault-relative file, only if it stays inside the vault (used by the vault:// protocol). */
export function vaultFilePath(vault: string, relativePath: string): string {
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.some((s) => s === '..' || s.startsWith('.'))) throw new ValidationError('invalid path');
  const root = path.resolve(vault);
  const full = path.resolve(root, ...segments);
  if (full !== root && !full.startsWith(root + path.sep)) throw new ValidationError('path is outside the vault');
  return full;
}
