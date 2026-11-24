import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export function tempDir(name = 'vault'): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `secondbrain-${name}-`));
}
