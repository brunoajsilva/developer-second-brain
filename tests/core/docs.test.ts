import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createDoc, createDocFolder, deleteDoc, deleteDocFolder, listDocFolders, listDocs, moveDoc, readDoc, renameDocFolder, saveAttachment, vaultFilePath, writeDoc
} from '../../src/core/docs/docs';
import { createVault } from '../../src/core/vault/vault';
import { ConflictError } from '../../src/core/fs/file-store';
import { tempDir } from './helpers';

async function vault() {
  const dir = await tempDir();
  await createVault(dir, 'T', false, []);
  return dir;
}

describe('docs', () => {
  it('creates, lists (title from the first #), reads and writes with a hash', async () => {
    const v = await vault();
    await createDoc(v, 'Architecture/ADR-001 Messaging.md', '# Messaging between Cards and MDK\n\ntext');
    const docs = await listDocs(v);
    expect(docs).toHaveLength(1);
    expect(docs[0].title).toBe('Messaging between Cards and MDK');
    const doc = await readDoc(v, docs[0].path);
    const written = await writeDoc(v, docs[0].path, doc.text + '\nmore', doc.hash);
    expect(written.hash).not.toBe(doc.hash);
    await expect(writeDoc(v, docs[0].path, 'other', doc.hash)).rejects.toBeInstanceOf(ConflictError);
    await expect(createDoc(v, docs[0].path, 'x')).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects paths outside Docs and reserved names', async () => {
    const v = await vault();
    await expect(createDoc(v, '../Boards/x.md', 'x')).rejects.toThrow();
    await expect(createDoc(v, '_templates/x.md', 'x')).rejects.toThrow();
    await expect(createDoc(v, 'no-extension', 'x')).rejects.toThrow();
    await expect(readDoc(v, 'missing.md')).rejects.toThrow(/not found/);
  });

  it('moves and deletes (to .trash, removing empty folders)', async () => {
    const v = await vault();
    await createDoc(v, 'A/B/page.md', '# P');
    await moveDoc(v, 'A/B/page.md', 'C/page.md');
    expect((await listDocs(v)).map((d) => d.path)).toEqual(['C/page.md']);
    await expect(moveDoc(v, 'C/page.md', 'C/page.md')).resolves.toBeUndefined();
    await deleteDoc(v, 'C/page.md');
    expect(await listDocs(v)).toEqual([]);
    await expect(fs.stat(path.join(v, 'Docs', 'C'))).rejects.toThrow();
    expect(await fs.readdir(path.join(v, '.trash'))).toHaveLength(1);
  });

  it('manages folders: create empty, list, rename with content, delete', async () => {
    const v = await vault();
    await createDocFolder(v, 'Empty/Sub');
    await createDoc(v, 'Arch/X.md', '# X');
    expect(await listDocFolders(v)).toEqual(expect.arrayContaining(['Empty', 'Empty/Sub', 'Arch']));
    await expect(createDocFolder(v, 'Arch')).rejects.toThrow();
    await expect(createDocFolder(v, '_x')).rejects.toThrow();
    await renameDocFolder(v, 'Arch', 'Architecture');
    expect((await listDocs(v)).map((d) => d.path)).toContain('Architecture/X.md');
    await expect(renameDocFolder(v, 'Architecture', 'Architecture/Inside')).rejects.toThrow();
    await deleteDocFolder(v, 'Architecture');
    expect(await listDocFolders(v)).not.toContain('Architecture');
  });

  it('stores pasted images in _attachments and does not list them as pages', async () => {
    const v = await vault();
    await createDoc(v, 'Runbooks/Deploy.md', '# Deploy');
    const rel = await saveAttachment(v, 'Runbooks/Deploy.md', 'png', new Uint8Array([137, 80, 78, 71]));
    expect(rel).toMatch(/^_attachments\/image-\d{8}-\d{6}\.png$/);
    expect((await fs.readFile(path.join(v, 'Docs', 'Runbooks', rel))).length).toBe(4);
    expect(await saveAttachment(v, 'Runbooks/Deploy.md', 'png', new Uint8Array([1]))).not.toBe(rel);
    await expect(saveAttachment(v, 'Runbooks/Deploy.md', 'exe', new Uint8Array([1]))).rejects.toThrow();
    expect((await listDocs(v)).map((d) => d.path)).toEqual(['Runbooks/Deploy.md']);
  });

  it('vaultFilePath never leaves the vault nor reads hidden folders', async () => {
    const v = await vault();
    expect(vaultFilePath(v, 'Docs/x/_attachments/a.png')).toBe(path.join(v, 'Docs', 'x', '_attachments', 'a.png'));
    expect(() => vaultFilePath(v, '../x')).toThrow();
    expect(() => vaultFilePath(v, '.trash/x')).toThrow();
  });
});
