// Writes dist/THIRD_PARTY_NOTICES.txt: the licence of every npm package bundled into the app.
// The list comes from the build itself (esbuild metafiles + Vite module ids), so build-only tools never appear.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const LICENSE_FILE = /^(licen[cs]e|copying|notice)([-.][\w.-]*)?$/i;

/** "…/node_modules/@scope/name/…" or "…/node_modules/name/…" → package directory. */
function packageDirOf(file) {
  const normalized = file.split(path.sep).join('/').replace(/^\0+/, '').replace(/\?.*$/, '');
  const i = normalized.lastIndexOf('/node_modules/');
  if (i < 0) return null;
  const rest = normalized.slice(i + '/node_modules/'.length).split('/');
  const name = rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
  return path.resolve(normalized.slice(0, i), 'node_modules', name);
}

function licenseOf(dir) {
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const declared = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? (pkg.licenses ?? []).map((l) => l.type).join(' OR ') ?? '';
  const files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort();
  const text = files.map((f) => readFileSync(path.join(dir, f), 'utf8').trim()).join('\n\n');
  const inferred = /\bMIT License\b/i.test(text) ? 'MIT' : /Apache License/i.test(text) ? 'Apache-2.0' : /\bISC License\b/i.test(text) ? 'ISC' : '';
  return { name: pkg.name, version: pkg.version, license: declared || (inferred ? `${inferred} (from the licence file)` : 'UNKNOWN'), homepage: pkg.homepage ?? pkg.repository?.url ?? pkg.repository ?? '', text };
}

/**
 * @param {string[]} files absolute or cwd-relative paths of every bundled module
 * @param {string} outFile where to write the notices
 */
export function writeThirdPartyNotices(files, outFile) {
  const dirs = new Set();
  for (const f of files) {
    const dir = packageDirOf(path.resolve(f.replace(/^\0+/, '')));
    if (dir && existsSync(path.join(dir, 'package.json'))) dirs.add(dir);
  }
  const packages = [...dirs].map(licenseOf).sort((a, b) => a.name.localeCompare(b.name));
  const unknown = packages.filter((p) => !p.text);
  const out = [
    'Developer SecondBrain includes the following third-party software.',
    'Electron and Chromium ship their own licence files next to the executable (LICENSE and LICENSES.chromium.html).',
    '',
    ...packages.flatMap((p) => [
      '='.repeat(78),
      `${p.name} ${p.version}`,
      `License: ${p.license}${p.homepage ? `\nSource: ${String(p.homepage).replace(/^git\+/, '')}` : ''}`,
      '-'.repeat(78),
      p.text || `(No licence file in the package; it declares ${p.license}.)`,
      ''
    ])
  ].join('\n');
  writeFileSync(outFile, out);
  return { count: packages.length, withoutText: unknown.map((p) => p.name) };
}
