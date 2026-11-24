import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, errorMessage } from '../../lib/api';
import { useLoader } from '../../lib/hooks';
import { checklistProgress, daysUntil, describeDue, firstName, formatDay, isBlockedColumn } from '../../lib/format';
import { Avatar } from '../../components/Avatar';
import { spring } from '../../components/motion';
import { BlockedIcon, ChecklistIcon, DoneIcon, FlagIcon, InProgressIcon, PlusIcon, SearchIcon, SettingsIcon, TeamIcon, TodoIcon } from '../../components/Icons';
import { useWorkspace } from '../../app/workspace';
import { CardDialog } from './CardDialog';
import type { Card, Column } from '../../../shared/types';

export function BoardView({ boardId, cardId, onOpenSettings }: { boardId: string; cardId?: string; onOpenSettings: () => void }) {
  const ws = useWorkspace();
  const { vault, tick, settings, data, go, dialogs } = ws;
  const cards = useLoader(() => api.listCards(vault.id, boardId), [vault.id, boardId, tick]);
  const board = data?.boards.find((b) => b.id === boardId);
  const me = settings.userName;

  const [selectedId, setSelectedId] = useState<string | null>(cardId ?? null);
  const [person, setPerson] = useState('');
  const [highOnly, setHighOnly] = useState(false);
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const [dropTarget, setDropTarget] = useState<{ column: string; before: string | null } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState('');
  const dragged = useRef<string | null>(null);

  useEffect(() => setSelectedId(cardId ?? null), [cardId]);

  const all = cards.data ?? [];
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => all.filter((c) =>
    (!person || c.assignee === person) && (!highOnly || c.priority === 'high') && (!tag || c.tags.includes(tag)) &&
    (!q || c.title.toLowerCase().includes(q) || c.body.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)))
  ), [all, person, highOnly, tag, q]);
  const others = useMemo(() => [...new Set(all.map((c) => c.assignee).filter((n) => n && n !== me))].sort(), [all, me]);
  const allTags = useMemo(() => [...new Set(all.flatMap((c) => c.tags))].sort((a, b) => a.localeCompare(b)), [all]);

  if (cards.error) return <div className="page-scroll"><p className="banner error">{cards.error}</p></div>;
  if (!board) return <div className="page-scroll"><p className="empty-state">{data ? 'This board no longer exists.' : ''}</p></div>;

  const doneIds = new Set(board.columns.filter((c) => c.done).map((c) => c.id));
  const doneCount = all.filter((c) => doneIds.has(c.status)).length;
  const filtered = !!(person || highOnly || tag || q);
  const run = async (f: () => Promise<unknown>) => {
    setError('');
    try { await f(); } catch (e) { setError(errorMessage(e)); cards.reload(); }
  };

  const drop = (status: string, before: string | null) => {
    const id = dragged.current;
    dragged.current = null;
    setDropTarget(null);
    if (!id || id === before) return;
    // optimistic: move it locally, then persist
    const moving = all.find((c) => c.id === id);
    if (moving) {
      const rest = all.filter((c) => c.id !== id);
      const at = before ? rest.findIndex((c) => c.id === before) : -1;
      const moved = { ...moving, status };
      cards.setData(at < 0 ? [...rest, moved] : [...rest.slice(0, at), moved, ...rest.slice(at)]);
    }
    void run(async () => { await api.moveCard(vault.id, boardId, id, status, before); cards.reload(); ws.reload(); });
  };

  const create = (status: string, title: string) => run(async () => {
    await api.saveCard(vault.id, { board: boardId, title, status, assignee: me, due: '', priority: '', tags: tag ? [tag] : [], body: '' }, null);
    cards.reload();
    ws.reload();
  });

  const closeCard = () => {
    setSelectedId(null);
    if (cardId) go({ kind: 'board', boardId }, true);
  };
  const selected = selectedId ? all.find((c) => c.id === selectedId) : undefined;
  const mineCount = all.filter((c) => c.assignee === me).length;

  return (
    <div className="board-screen">
      <header className="board-head">
        <div className="stack-xs grow">
          <h1>{board.name}</h1>
          {board.description && <p className="muted">{board.description}</p>}
        </div>
        <div className="board-progress" title={`${doneCount} of ${all.length} cards done`}>
          <span><b>{doneCount}</b> of {all.length} done</span>
          <span className="progress-track"><motion.span className="progress-fill" initial={false} animate={{ width: all.length ? `${(doneCount / all.length) * 100}%` : '0%' }} transition={spring} /></span>
        </div>
        <button className="btn" onClick={dialogs.team}><TeamIcon size={15} />Team</button>
        <button className="icon-btn bordered" onClick={onOpenSettings} aria-label="Board settings" title="Board settings"><SettingsIcon size={16} /></button>
      </header>

      <div className="toolbar" role="group" aria-label="Filters">
        <label className="search-field">
          <SearchIcon size={15} />
          <input placeholder="Filter cards" aria-label="Filter cards" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="segmented">
          <button className={!person ? 'on' : ''} onClick={() => setPerson('')}>Everyone<span className="n">{all.length}</span></button>
          {me && <button className={person === me ? 'on' : ''} onClick={() => setPerson(person === me ? '' : me)}><Avatar name={me} size={18} />Mine<span className="n">{mineCount}</span></button>}
          {others.map((n) => (
            <button key={n} className={person === n ? 'on' : ''} onClick={() => setPerson(person === n ? '' : n)} title={n}>
              <Avatar name={n} size={18} />{firstName(n)}<span className="n">{all.filter((c) => c.assignee === n).length}</span>
            </button>
          ))}
        </div>
        <button className={'chip-toggle' + (highOnly ? ' on' : '')} onClick={() => setHighOnly(!highOnly)}><FlagIcon size={14} />High priority</button>
        {allTags.length > 0 && (
          <select className={'chip-toggle' + (tag ? ' on' : '')} aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Any tag</option>
            {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
        )}
        <AnimatePresence>
          {filtered && (
            <motion.span className="muted small" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Showing {visible.length} of {all.length} · <button className="link" onClick={() => { setPerson(''); setHighOnly(false); setTag(''); setQuery(''); }}>Clear</button>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {error && <p className="banner error">{error}</p>}

      <div className="columns">
        {board.columns.map((column, i) => {
          const list = visible.filter((c) => c.status === column.id);
          const over = dropTarget?.column === column.id;
          return (
            <section key={column.id} className={'column' + (over ? ' drop-over' : '')}
              onDragOver={(e) => { e.preventDefault(); if (!over || dropTarget?.before !== null) setDropTarget({ column: column.id, before: null }); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null); }}
              onDrop={(e) => { e.preventDefault(); drop(column.id, null); }}>
              <header className="column-head">
                <ColumnIcon column={column} index={i} />
                <h2>{column.name}</h2>
                <span className="count">{list.length}</span>
                <button className="icon-btn tiny" aria-label={`Add card to ${column.name}`} title="Add card" onClick={() => setAdding(column.id)}><PlusIcon size={14} /></button>
              </header>
              <div className="column-body">
                <AnimatePresence initial={false}>
                  {list.map((c) => (
                    <CardTile key={c.id} card={c} done={!!column.done} selected={c.id === selectedId} activeTag={tag}
                      dropBefore={over && dropTarget?.before === c.id}
                      onOpen={() => setSelectedId(c.id)} onTag={(t) => setTag(tag === t ? '' : t)}
                      onDragStart={() => { dragged.current = c.id; }} onDragEnd={() => { dragged.current = null; setDropTarget(null); }}
                      onDragOver={() => setDropTarget({ column: column.id, before: c.id })} onDrop={() => drop(column.id, c.id)} />
                  ))}
                </AnimatePresence>
                {over && dropTarget?.before === null && <motion.div layout className="drop-line" />}
                {list.length === 0 && !over && <p className="column-empty">{filtered ? 'No matching cards' : 'Drop cards here'}</p>}
                {adding === column.id
                  ? <InlineAdd onAdd={(t) => void create(column.id, t)} onClose={() => setAdding(null)} />
                  : <button className="add-card" onClick={() => setAdding(column.id)}><PlusIcon size={14} />Add card</button>}
              </div>
            </section>
          );
        })}
      </div>

      <AnimatePresence>
        {selected && (
          <CardDialog key={selected.id} card={selected} board={board} tags={allTags}
            onClose={closeCard} onSaved={() => { cards.reload(); ws.reload(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function ColumnIcon({ column, index }: { column: Column; index: number }) {
  if (column.done) return <DoneIcon size={16} className="tone-ok" />;
  if (isBlockedColumn(column.name)) return <BlockedIcon size={16} className="tone-warn" />;
  if (index === 0) return <TodoIcon size={16} className="faint" />;
  return <InProgressIcon size={16} className="tone-accent" />;
}

function CardTile({ card, done, selected, activeTag, dropBefore, onOpen, onTag, onDragStart, onDragEnd, onDragOver, onDrop }: {
  card: Card; done: boolean; selected: boolean; activeTag: string; dropBefore: boolean;
  onOpen: () => void; onTag: (t: string) => void; onDragStart: () => void; onDragEnd: () => void; onDragOver: () => void; onDrop: () => void;
}) {
  const progress = checklistProgress(card.body);
  const d = card.due ? daysUntil(card.due) : null;
  return (
    <motion.div layout="position" transition={spring} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
      {dropBefore && <motion.div layout className="drop-line" />}
      <article className={'card-tile' + (selected ? ' selected' : '') + (done ? ' done' : '')} draggable tabIndex={0}
        onClick={onOpen} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(); }}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }} onDragEnd={onDragEnd}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onDragOver(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}>
        <p className="card-title">{card.priority === 'high' && !done && <FlagIcon size={13} className="tone-danger flag" aria-label="High priority" />}{card.title || 'Untitled card'}</p>
        {card.tags.length > 0 && (
          <div className="card-tags">
            {card.tags.map((t) => <button key={t} className={t === activeTag ? 'on' : ''} title={`Filter by ${t}`} onClick={(e) => { e.stopPropagation(); onTag(t); }}>{t}</button>)}
          </div>
        )}
        <footer className="card-foot">
          <Avatar name={card.assignee} size={20} />
          {progress.total > 0 && <span className={'checks' + (progress.done === progress.total ? ' complete' : '')}><ChecklistIcon size={13} />{progress.done}/{progress.total}</span>}
          <span className="grow" />
          {card.due && <span className={'due' + (!done && d !== null && d < 0 ? ' overdue' : !done && d !== null && d <= 2 ? ' soon' : '')} title={describeDue(card.due)}>{formatDay(card.due)}</span>}
        </footer>
      </article>
    </motion.div>
  );
}

function InlineAdd({ onAdd, onClose }: { onAdd: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('');
  return (
    <motion.form className="inline-add" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={spring}
      onSubmit={(e) => { e.preventDefault(); if (title.trim()) { onAdd(title.trim()); setTitle(''); } }}>
      <textarea autoFocus rows={2} placeholder="Card title, then Enter" value={title} onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (title.trim()) { onAdd(title.trim()); setTitle(''); } }
          if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
        }}
        onBlur={() => !title.trim() && onClose()} />
      <div className="row end">
        <button type="button" className="btn ghost small" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn primary small" disabled={!title.trim()}>Add card</button>
      </div>
    </motion.form>
  );
}

