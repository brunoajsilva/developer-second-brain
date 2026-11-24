#!/usr/bin/env node
// Opens Developer SecondBrain from the terminal: `secondbrain`
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
if (!fs.existsSync(path.join(root, 'dist', 'main', 'index.cjs'))) {
  console.error(`The app has not been built yet. Run "npm run build" in the project folder (${root}).`);
  process.exit(1);
}
let electron;
try {
  electron = require('electron');
} catch {
  console.error(`Electron is not installed. Run "npm install" in the project folder (${root}).`);
  process.exit(1);
}
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE; // otherwise Electron starts as plain Node
const child = spawn(electron, [root, ...process.argv.slice(2)], { detached: true, stdio: 'ignore', env, windowsHide: false });
child.on('error', (e) => {
  console.error('Could not open the app:', e.message);
  process.exit(1);
});
child.unref(); // keep the terminal free
