import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../../lib/api';
import { plainText } from '../../lib/format';
import { Modal } from '../../components/Modal';
import { spring } from '../../components/motion';
import { BoardIcon, CollectionIcon, PageIcon, SearchIcon, SparkIcon, InProgressIcon } from '../../components/Icons';
import { useWorkspace } from '../../app/workspace';
import type { SearchResult } from '../../../shared/types';

export type PaletteTarget =
  | { kind: 'board'; id: string; name: string }
  | { kind: 'collection'; name: string }
  | { kind: 'doc'; path: string; title: string; context: string }
  | { kind: 'result'; result: SearchResult }
  | { kind: 'action'; label: string; run: () => void };

interface Row { target: PaletteTarget; group: string; title: string; context: string; excerpt?: string; icon: ReactNode }

/** ⌘K: jump to boards, collections and pages by name, full-text search, and quick actions. */
export interface PaletteAction { label: string; keywords?: string[]; run: () => void }

export function CommandPalette({ open, actions, onClose, onSelect }: { open: boolean; actions: PaletteAction[]; onClose: () => void; onSelect: (t: PaletteTarget) => void }) {
  return <AnimatePresence>{open && <Palette key="palette" actions={actions} onClose={onClose} onSelect={onSelect} />}</AnimatePresence>;
}

function Palette({ actions, onClose, onSelect }: { actions: PaletteAction[]; onClose: () => void; onSelect: (t: PaletteTarget) => void }) {
  const { vault, vaults, data } = useWorkspace();
  const [query, setQuery] = useState('');
  const [allVaults, setAllVaults] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const term = query.trim().toLowerCase();

  useEffect(() => {
    if (!term) { setResults([]); return; }
    const t = setTimeout(() => {
      const ids = allVaults ? vaults.filter((v) => v.available).map((v) => v.id) : [vault.id];
      api.search(query, ids).then(setResults).catch(() => setResults([]));
    }, 120);
    return () => clearTimeout(t);
  }, [query, term, allVaults, vault.id, vaults]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    if (!data) return out;
    const matches = (s: string) => !term || s.toLowerCase().includes(term);
    for (const b of data.boards.filter((b) => matches(b.name))) out.push({ target: { kind: 'board', id: b.id, name: b.name }, group: 'Jump to', title: b.name, context: 'Board', icon: <BoardIcon size={16} /> });
    const collections = [...new Set(data.docs.filter((d) => d.path.includes('/')).map((d) => d.path.split('/')[0]))].sort();
    for (const c of collections.filter(matches)) out.push({ target: { kind: 'collection', name: c }, group: 'Jump to', title: c, context: 'Collection', icon: <CollectionIcon size={16} /> });
    const seen = new Set<string>();
    if (term) {
      for (const d of data.docs.filter((d) => matches(d.title)).slice(0, 8)) {
        seen.add(d.path);
        const context = d.path.includes('/') ? d.path.slice(0, d.path.lastIndexOf('/')) : 'Page';
        out.push({ target: { kind: 'doc', path: d.path, title: d.title, context }, group: 'Pages', title: d.title, context, icon: <PageIcon size={16} /> });
      }
    }
    for (const r of results) {
      if (r.kind === 'doc' && r.vaultId === vault.id && seen.has(r.ref)) continue;
      out.push({
        target: { kind: 'result', result: r }, group: 'Matches in text', title: r.title,
        context: `${r.kind === 'doc' ? 'Page' : 'Card'} in ${r.context}${allVaults ? ` (${r.vaultName})` : ''}`,
        excerpt: plainText(r.excerpt), icon: r.kind === 'doc' ? <PageIcon size={16} /> : <InProgressIcon size={16} />
      });
    }
    for (const a of actions.filter((a) => matches(a.label) || (!!term && (a.keywords ?? []).some((k) => k.includes(term))))) out.push({ target: { kind: 'action', label: a.label, run: a.run }, group: 'Actions', title: a.label, context: '', icon: <SparkIcon size={16} /> });
    return term ? out : out.slice(0, 6).concat(out.filter((r) => r.group === 'Actions'));
  }, [data, term, results, actions, vault.id, allVaults]);

  useEffect(() => setActive(0), [term, allVaults]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup = '';
  return (
    <Modal onClose={onClose} size="lg" className="palette">
      <div className="palette-input">
        <SearchIcon size={18} />
        <input autoFocus placeholder="Search pages and cards, jump to a board, or run an action" value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, rows.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter' && rows[active]) { e.preventDefault(); onSelect(rows[active].target); }
          }} />
        <label className="toggle-chip">
          <input type="checkbox" checked={allVaults} onChange={(e) => setAllVaults(e.target.checked)} />All vaults
        </label>
      </div>
      <div className="palette-list" ref={list} role="listbox">
        {rows.map((row, i) => {
          const header = row.group !== lastGroup ? <div className="palette-group" key={'g' + i}>{row.group}</div> : null;
          lastGroup = row.group;
          return [
            header,
            <button key={i} data-index={i} role="option" aria-selected={i === active} className={'palette-row' + (i === active ? ' active' : '')}
              onMouseMove={() => setActive(i)} onClick={() => onSelect(row.target)}>
              {i === active && <motion.span layoutId="palette-highlight" className="palette-highlight" transition={spring} />}
              <span className="palette-icon">{row.icon}</span>
              <span className="palette-text">
                <span className="palette-title">{row.title}{row.context && <span className="palette-context">{row.context}</span>}</span>
                {row.excerpt && <span className="palette-excerpt">{row.excerpt}</span>}
              </span>
            </button>
          ];
        })}
        {term && rows.length === 0 && <div className="empty-state small">Nothing matches “{query.trim()}”. Try fewer words, or search all vaults.</div>}
      </div>
      <div className="palette-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span>
      </div>
    </Modal>
  );
}
