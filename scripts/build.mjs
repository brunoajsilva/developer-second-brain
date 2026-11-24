import { build as esbuild } from 'esbuild';
import { build as vite } from 'vite';
import { cpSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
const comum = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'fsevents'], sourcemap: false, logLevel: 'info' };
await esbuild({ ...comum, entryPoints: ['src/main/main.ts'], outfile: 'dist/main/main.cjs' });
await esbuild({ ...comum, entryPoints: ['src/preload/preload.ts'], outfile: 'dist/preload/preload.cjs' });
await vite({ configFile: 'vite.config.mjs', logLevel: 'info' });
cpSync('build/icon.png', 'dist/icon.png');
cpSync('build/icon-mac.png', 'dist/icon-mac.png');
