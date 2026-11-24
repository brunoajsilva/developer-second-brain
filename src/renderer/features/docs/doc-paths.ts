import type { DocSummary } from '../../../shared/types';

// A page "A/B.md" has the key "A/B"; its sub-pages live in the folder "A/B/".
export const baseName = (p: string) => p.replace(/^.*\//, '');
export const parentOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
export const joinPath = (a: string, b: string) => (a ? a + '/' + b : b);
export const withoutMd = (p: string) => p.replace(/\.md$/i, '');

/** A safe file name from a title (no characters Windows forbids, no .md, no leading/trailing dots). */
export const toFileName = (title: string) => title.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\.md$/i, '').replace(/^[. ]+|[. ]+$/g, '');

/** Pages a new or moved page can hang from, indented by depth. `exclude` removes a page and its subtree. */
export function parentOptions(docs: DocSummary[], folders: string[], base: string, exclude?: string): { value: string; label: string }[] {
  const m = new Map<string, string>();
  for (const f of folders) m.set(f, baseName(f));
  for (const d of docs) m.set(withoutMd(d.path), d.title || baseName(withoutMd(d.path)));
  return [...m.entries()]
    .filter(([k]) => (!base || k.startsWith(base + '/')) && (!exclude || (k !== exclude && !k.startsWith(exclude + '/'))))
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([k, label]) => {
      const depth = (base ? k.slice(base.length + 1) : k).split('/').length - 1;
      return { value: k, label: ' '.repeat(depth) + label };
    });
}
