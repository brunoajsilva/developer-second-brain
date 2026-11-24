// Production build: main + preload with esbuild (CommonJS for Electron), renderer with Vite.
import { build as esbuild } from 'esbuild';
import { build as vite } from 'vite';
import { cpSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
const node = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'fsevents'], sourcemap: false, logLevel: 'info' };
await esbuild({ ...node, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs' });
await esbuild({ ...node, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs' });
await vite({ configFile: 'vite.config.mjs', logLevel: 'info' });
cpSync('build/icon.png', 'dist/icon.png');
cpSync('build/icon-mac.png', 'dist/icon-mac.png');
