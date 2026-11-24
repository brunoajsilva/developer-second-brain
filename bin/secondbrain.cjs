#!/usr/bin/env node
// Abre o Developer SecondBrain a partir do terminal: `secondbrain`
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(raiz, 'dist', 'main', 'main.cjs'))) {
  console.error('A aplicação ainda não foi compilada. Corre "npm run build" na pasta do projeto (' + raiz + ').');
  process.exit(1);
}
let electron;
try {
  electron = require('electron');
} catch {
  console.error('Electron não está instalado. Corre "npm install" na pasta do projeto (' + raiz + ').');
  process.exit(1);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // senão o Electron arranca como Node simples
const filho = spawn(electron, [raiz, ...process.argv.slice(2)], { detached: true, stdio: 'ignore', env, windowsHide: false });
filho.on('error', (e) => { console.error('Não consegui abrir a aplicação:', e.message); process.exit(1); });
filho.unref(); // o terminal fica livre
