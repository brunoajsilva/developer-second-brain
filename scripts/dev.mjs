// Development: builds main + preload once, serves the renderer with Vite (hot reload) and starts Electron.
import { build as esbuild } from 'esbuild';
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { cpSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electron = require('electron');
const node = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'fsevents'], logLevel: 'warning' };
await esbuild({ ...node, entryPoints: ['src/main/index.ts'], outfile: 'dist/main/index.cjs' });
await esbuild({ ...node, entryPoints: ['src/preload/index.ts'], outfile: 'dist/preload/index.cjs' });
cpSync('build/icon.png', 'dist/icon.png');
cpSync('build/icon-mac.png', 'dist/icon-mac.png');

const server = await createServer({ configFile: 'vite.config.mjs' });
await server.listen();
const { port } = server.httpServer.address();
const url = `http://127.0.0.1:${port}/`;
console.log('Dev server:', url);
const app = spawn(electron, ['.'], { stdio: 'inherit', env: { ...process.env, VITE_DEV_SERVER_URL: url } });
app.on('exit', async () => {
  await server.close();
  process.exit(0);
});
