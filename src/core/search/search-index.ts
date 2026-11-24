// Full-text index of a vault (pages + cards) and [[link]] backlinks.
import * as path from 'node:path';
import MiniSearch from 'minisearch';
import { listMarkdownFiles, readTextFile } from '../fs/file-store';
import { parseFrontmatter } from '../fs/frontmatter';
import { toRelative } from '../fs/paths';
import { listBoards, readCards } from '../boards/boards';
import { DOCS_DIR } from '../vault/layout';
import { pageTitle } from '../docs/docs';
import type { Backlink, ItemKind, SearchResult } from '../../shared/types';

interface IndexedItem {
  id: string;
  kind: ItemKind;
  title: string;
  context: string;
  ref: string;
  text: string;
}

export interface SearchIndex {
  engine: MiniSearch<IndexedItem>;
  items: Map<string, IndexedItem>;
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Reads the whole vault. For hundreds of files this takes well under a second. */
export async function buildSearchIndex(vault: string): Promise<SearchIndex> {
  const items: IndexedItem[] = [];
  const base = path.join(vault, DOCS_DIR);
  for (const file of await listMarkdownFiles(base, (n) => !n.startsWith('_'))) {
    if (path.basename(file).startsWith('_')) continue;
    const { text } = await readTextFile(file);
    const ref = toRelative(base, file);
    const folder = path.posix.dirname(ref);
    items.push({ id: 'd:' + ref, kind: 'doc', title: pageTitle(file), context: folder === '.' ? 'Docs' : folder, ref, text: parseFrontmatter(text).body });
  }
  for (const board of await listBoards(vault)) {
    for (const card of await readCards(vault, board.id, board.columns)) {
      items.push({ id: `c:${board.id}/${card.id}`, kind: 'card', title: card.title, context: board.name, ref: `${board.id}/${card.id}`, text: [card.body, card.tags.join(' '), card.assignee].join('\n') });
    }
  }
  const engine = new MiniSearch<IndexedItem>({
    fields: ['title', 'text'],
    storeFields: [],
    searchOptions: { prefix: true, fuzzy: 0.15, boost: { title: 3 }, combineWith: 'AND' },
    processTerm: fold
  });
  engine.addAll(items);
  return { engine, items: new Map(items.map((i) => [i.id, i])) };
}

function excerptAround(text: string, terms: string[]): string {
  const flat = text.replace(/\s+/g, ' ');
  const folded = fold(flat);
  for (const t of terms) {
    const i = folded.indexOf(fold(t));
    if (i >= 0) {
      const start = Math.max(0, i - 40);
      return (start > 0 ? '…' : '') + flat.slice(start, i + 90) + (i + 90 < flat.length ? '…' : '');
    }
  }
  return flat.slice(0, 110);
}

export function searchIndex(index: SearchIndex, vaultId: string, vaultName: string, query: string, limit = 20): SearchResult[] {
  const q = query.trim();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  return index.engine
    .search(q)
    .slice(0, limit)
    .map((hit) => {
      const item = index.items.get(String(hit.id))!;
      return { vaultId, vaultName, kind: item.kind, title: item.title, context: item.context, ref: item.ref, excerpt: excerptAround(item.text, terms) };
    });
}

const WIKI_LINK = /\[\[([^\]\n]+)\]\]/g;

/** Items that link to a page (by title or file name) or to a card (by [[#id]]). */
export function findBacklinks(index: SearchIndex, target: { kind: ItemKind; title: string; ref: string }): Backlink[] {
  const keys = target.kind === 'doc' ? [target.title.toLowerCase(), path.posix.basename(target.ref, '.md').toLowerCase()] : ['#' + target.ref.split('/')[1]];
  const out: Backlink[] = [];
  for (const item of index.items.values()) {
    if (item.kind === target.kind && item.ref === target.ref) continue;
    for (const m of item.text.matchAll(WIKI_LINK)) {
      if (keys.includes(m[1].split('|')[0].trim().toLowerCase())) {
        out.push({ kind: item.kind, title: item.title, ref: item.ref });
        break;
      }
    }
  }
  return out;
}
