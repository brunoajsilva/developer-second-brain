import { useMemo } from 'react';
import { api } from '../lib/api';
import { useLoader } from '../lib/hooks';
import type { Board, Card, ConflictCopy, DocSummary, TimeOffPerson } from '../../shared/types';

export interface VaultData {
  boards: Board[];
  cards: Card[];
  docs: DocSummary[];
  people: string[];
  conflicts: ConflictCopy[];
  docFolders: string[];
  timeOff: TimeOffPerson[];
  /** Parts that could not be loaded, with the reason. Everything else still shows. */
  failures: string[];
}

export const isDoneCard = (boards: Board[], c: Card) => !!boards.find((b) => b.id === c.board)?.columns.find((col) => col.id === c.status)?.done;
export const boardName = (boards: Board[], id: string) => boards.find((b) => b.id === id)?.name ?? '';
export const columnOf = (boards: Board[], c: Card) => boards.find((b) => b.id === c.board)?.columns.find((col) => col.id === c.status);

/** Everything the shell needs about the open vault, reloaded whenever `tick` changes. */
export function useVaultData(vaultId: string | null, tick: number) {
  const loader = useLoader(async (): Promise<VaultData | null> => {
    if (!vaultId) return null;
    // each part loads on its own, so one failing call never empties the whole screen
    const failures: string[] = [];
    const safe = <T,>(what: string, p: Promise<T>, fallback: T) => p.catch((e: unknown) => { failures.push(`${what}: ${e instanceof Error ? e.message : String(e)}`); return fallback; });
    const [boards, cards, docs, people, conflicts, docFolders, timeOff] = await Promise.all([
      safe('boards', api.listBoards(vaultId), []), safe('cards', api.listAllCards(vaultId), []), safe('pages', api.listDocs(vaultId), []),
      safe('team', api.listPeople(vaultId), []), safe('sync conflicts', api.listConflicts(vaultId), []), safe('folders', api.listDocFolders(vaultId), []),
      safe('time off', api.listTimeOff(vaultId), [])
    ]);
    return { boards, cards, docs, people, conflicts, docFolders, timeOff, failures };
  }, [vaultId, tick]);
  const data = loader.data;

  /** Open (not done) cards per board. */
  const openCountByBoard = useMemo(() => {
    const m = new Map<string, number>();
    if (!data) return m;
    for (const c of data.cards) if (!isDoneCard(data.boards, c)) m.set(c.board, (m.get(c.board) ?? 0) + 1);
    return m;
  }, [data]);

  /** Collection (top-level Docs folder) a page belongs to; '' for loose pages and sub-pages of root pages. */
  const collectionOf = useMemo(() => {
    const rootPages = new Set((data?.docs ?? []).filter((d) => !d.path.includes('/')).map((d) => d.path.replace(/\.md$/i, '')));
    return (p: string) => {
      const i = p.indexOf('/');
      return i < 0 || rootPages.has(p.slice(0, i)) ? '' : p.slice(0, i);
    };
  }, [data]);

  /** [collection, page count] sorted by name, loose pages last. */
  const collections = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data?.docs ?? []) {
      const k = collectionOf(d.path);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    for (const f of data?.docFolders ?? []) if (!f.includes('/') && !m.has(f) && collectionOf(f + '/x') === f) m.set(f, 0);
    return [...m.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])));
  }, [data, collectionOf]);

  return { data, reload: loader.reload, openCountByBoard, collectionOf, collections };
}
