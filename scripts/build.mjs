// Production build: main + preload with esbuild (CommonJS for Electron), renderer with Vite,
// then THIRD_PARTY_NOTICES.txt from the modules that were actually bundled.
import { build as esbuild } from 'esbuild';
import { build as vite } from 'vite';
import { cpSync, rmSync } from 'node:fs';
import { writeThirdPartyNotices } from './third-party-notices.mjs';

rmSync('dist', { recursive: true, force: true });
const node = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'fsevents'], sourcemap: false, logLevel: 'info', metafile: true };
const main = await esbuild({ ...node, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs' });
const preload = await esbuild({ ...node, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs' });
const renderer = await vite({ configFile: 'vite.config.mjs', logLevel: 'info' });
cpSync('build/icon.png', 'dist/icon.png');
cpSync('build/icon-mac.png', 'dist/icon-mac.png');
cpSync('LICENSE', 'dist/LICENSE');

const bundled = [
  ...Object.keys(main.metafile.inputs),
  ...Object.keys(preload.metafile.inputs),
  ...[renderer].flat().flatMap((r) => r.output.flatMap((o) => (o.type === 'chunk' ? o.moduleIds : [])))
];
const notices = writeThirdPartyNotices(bundled, 'dist/THIRD_PARTY_NOTICES.txt');
console.log(`THIRD_PARTY_NOTICES.txt: ${notices.count} packages` + (notices.withoutText.length ? ` (no licence file: ${notices.withoutText.join(', ')})` : ''));
