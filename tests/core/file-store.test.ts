import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConflictError, readTextFile, writeTextFile } from '../../src/core/fs/file-store';
import { tempDir } from './helpers';

describe('file store', () => {
  it('writes atomically and leaves no temporary files', async () => {
    const dir = await tempDir();
    const file = path.join(dir, 'a.md');
    await writeTextFile(file, 'hello\r\nworld');
    expect((await readTextFile(file)).text).toBe('hello\nworld');
    expect((await fs.readdir(dir)).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });

  it('detects a conflict when the file changed since it was read', async () => {
    const file = path.join(await tempDir(), 'a.md');
    await writeTextFile(file, 'v1');
    const read = await readTextFile(file);
    await writeTextFile(file, 'v2 from Ana'); // another computer writes meanwhile
    const attempt = writeTextFile(file, 'v2 from Bruno', read.hash);
    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await attempt.catch((e: ConflictError) => expect(e.current.text).toBe('v2 from Ana'));
    expect((await readTextFile(file)).text).toBe('v2 from Ana');
  });

  it('writes with the right hash, and create requires the file to be missing', async () => {
    const file = path.join(await tempDir(), 'a.md');
    await writeTextFile(file, 'v1', null);
    await writeTextFile(file, 'v2', (await readTextFile(file)).hash);
    await expect(writeTextFile(file, 'other', null)).rejects.toBeInstanceOf(ConflictError);
  });

  it('writing what is already on disk is not a conflict', async () => {
    const file = path.join(await tempDir(), 'a.md');
    await writeTextFile(file, 'v1');
    const read = await readTextFile(file);
    await writeTextFile(file, 'same');
    await expect(writeTextFile(file, 'same', read.hash)).resolves.toBeTruthy();
  });
});
