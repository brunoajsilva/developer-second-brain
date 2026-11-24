import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { api, errorMessage, isConflict } from '../../lib/api';
import { useDebounced, useLoader } from '../../lib/hooks';
import { daysUntil, describeDue, timeAgo } from '../../lib/format';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog, DialogActions, Modal } from '../../components/Modal';
import { dialog as dialogMotion, ease, fade, spring } from '../../components/motion';
import { CloseIcon, EditIcon, LinkIcon, PageIcon, ReadIcon, TrashIcon } from '../../components/Icons';
import { MarkdownEditor } from '../../components/markdown/MarkdownEditor';
import { MarkdownView, toggleTaskOnLine } from '../../components/markdown/MarkdownView';
import { useWorkspace } from '../../app/workspace';
import { TagInput } from './TagInput';
import type { Board, Card, CardInput, ConflictData, FileVersion, Priority } from '../../../shared/types';

export const PRIORITIES: [Priority, string][] = [['', 'None'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']];

const toInput = (c: Card): CardInput => ({ id: c.id, board: c.board, title: c.title, status: c.status, assignee: c.assignee, due: c.due, priority: c.priority, tags: c.tags, body: c.body });

/** Full card editor. Every change saves on its own (debounced); conflicts with other computers are surfaced. */
export function CardDialog({ card, board, tags, onClose, onSaved }: { card: Card; board: Board; tags: string[]; onClose: () => void; onSaved: () => void }) {
  const { vault, data, settings, openLink, openCard, dialogs } = useWorkspace();
  const [form, setForm] = useState<CardInput>(toInput(card));
  const formRef = useRef(form);
  formRef.current = form;
  const hash = useRef(card.hash);
  const dirty = useRef(false);
  const [status, setStatus] = useState('');
  const [conflict, setConflict] = useState<FileVersion | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(!card.body.trim() && !card.title.trim());
  const backlinks = useLoader(() => api.backlinks(vault.id, { kind: 'card', title: card.title, ref: `${card.board}/${card.id}` }), [vault.id, card.id]);

  const save = async (force?: string) => {
    if (!dirty.current && !force) return;
    try {
      const saved = await api.saveCard(vault.id, formRef.current, force ?? hash.current);
      hash.current = saved.hash;
      dirty.current = false;
      setStatus('Saved');
      setConflict(null);
      onSaved();
    } catch (e) {
      if (isConflict(e)) { setConflict((e.data as ConflictData).current); setStatus('Conflict'); }
      else setStatus(errorMessage(e));
    }
  };
  const debounced = useDebounced(() => void save(), 700);
  useEffect(() => () => { if (dirty.current) void save(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // someone else changed the card while it is open and we have no pending edits: take theirs
  useEffect(() => {
    if (!dirty.current && card.hash !== hash.current) { setForm(toInput(card)); hash.current = card.hash; }
  }, [card]);

  const change = (patch: Partial<CardInput>) => {
    const next = { ...formRef.current, ...patch };
    formRef.current = next;
    setForm(next);
    dirty.current = true;
    setStatus('Saving…');
    debounced.schedule();
  };
  const close = () => { debounced.cancel(); void save().then(onClose); };
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.dialog') || document.querySelector('.cm-tooltip-autocomplete')) return;
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const d = form.due ? daysUntil(form.due) : null;
  const people = [...new Set([...(data?.people ?? []), settings.userName, form.assignee].filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const currentColumn = board.columns.find((c) => c.id === form.status);

  return createPortal(
    <motion.div className="scrim card-scrim" variants={fade} initial="hidden" animate="shown" exit="hidden" transition={ease} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <motion.div className="card-dialog" role="dialog" aria-modal="true" aria-label={`Card: ${form.title}`} variants={dialogMotion} initial="hidden" animate="shown" exit="hidden" transition={spring}>
        <header className="card-dialog-top">
          <span className="muted small">{board.name}</span>
          <span className="mono faint small">#{card.id}</span>
          <span className="grow" />
          <AnimatePresence mode="wait">
            {status && <motion.span key={status} className={'save-state' + (status === 'Conflict' ? ' bad' : '')} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{status}</motion.span>}
          </AnimatePresence>
          <button className="icon-btn" aria-label="Close card" title="Close (Esc)" onClick={close}><CloseIcon size={16} /></button>
        </header>
        <div className="card-dialog-body">
          <main className="card-main">
            <textarea className="title-input" rows={1} value={form.title} placeholder="Card title" aria-label="Title" onChange={(e) => change({ title: e.target.value.replace(/\n/g, ' ') })} />
            <section className="notes">
              <div className="notes-bar">
                <h3>Notes</h3>
                <div className="segmented small">
                  <button className={!editing ? 'on' : ''} onClick={() => { setEditing(false); debounced.cancel(); void save(); }}><ReadIcon size={14} />Read</button>
                  <button className={editing ? 'on' : ''} onClick={() => setEditing(true)}><EditIcon size={14} />Edit</button>
                </div>
              </div>
              {editing
                ? <div className="editor-frame grow-fill"><MarkdownEditor text={form.body} onChange={(t) => change({ body: t })} docs={data?.docs ?? []} hint="Notes in Markdown. Use - [ ] for checklists and [[Page]] to link docs." autoFocus={!!card.title.trim()} /></div>
                : <div className="notes-read" onDoubleClick={() => setEditing(true)}>
                    <MarkdownView text={form.body} vaultId={vault.id} baseDir=""
                      onOpenLink={(t) => { close(); openLink(t); }}
                      onToggleTask={(line) => { const next = toggleTaskOnLine(formRef.current.body, line); if (next !== null) change({ body: next }); }}
                      empty={<button className="empty-cta" onClick={() => setEditing(true)}>No notes yet. Add details, a checklist or links.</button>} />
                  </div>}
            </section>
            {(backlinks.data ?? []).length > 0 && (
              <section className="backlinks">
                <h3><LinkIcon size={14} />Linked from</h3>
                <div className="row wrap">
                  {(backlinks.data ?? []).map((b) => (
                    <button key={b.ref} className="ref-chip" onClick={() => { close(); if (b.kind === 'doc') openLink(b.title); else { const [bb, id] = b.ref.split('/'); openCard(bb, id); } }}>
                      <PageIcon size={14} />{b.title}
                    </button>
                  ))}
                </div>
              </section>
            )}
          </main>
          <aside className="card-props">
            <div className="prop">
              <span className="prop-label">Status</span>
              <div className="status-list" role="radiogroup" aria-label="Status">
                {board.columns.map((c) => (
                  <button key={c.id} role="radio" aria-checked={form.status === c.id} className={form.status === c.id ? 'on' : ''} onClick={() => change({ status: c.id })}>
                    {form.status === c.id && <motion.span layoutId="status-pill" className="status-pill" transition={spring} />}
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <label className="prop">
              <span className="prop-label">Assignee</span>
              <span className="row">
                <Avatar name={form.assignee} size={26} />
                <select className="input" value={form.assignee} onChange={(e) => (e.target.value === '__team' ? dialogs.team() : change({ assignee: e.target.value }))}>
                  <option value="">Unassigned</option>
                  {people.map((p) => <option key={p} value={p}>{p}{p === settings.userName ? ' (me)' : ''}</option>)}
                  <option value="__team">Manage team…</option>
                </select>
              </span>
            </label>
            <label className="prop">
              <span className="prop-label">Due date</span>
              <span className="row">
                <input type="date" className="input mono" value={form.due} onChange={(e) => change({ due: e.target.value })} />
                {form.due && <button className="icon-btn" aria-label="Clear due date" title="Clear" onClick={() => change({ due: '' })}><CloseIcon size={15} /></button>}
              </span>
              {form.due && <span className={'small ' + (!currentColumn?.done && d !== null && d <= 2 ? 'tone-danger' : 'muted')}>{describeDue(form.due)}</span>}
            </label>
            <div className="prop">
              <span className="prop-label">Priority</span>
              <div className="segmented full" role="radiogroup" aria-label="Priority">
                {PRIORITIES.map(([value, label]) => (
                  <button key={value || 'none'} role="radio" aria-checked={form.priority === value} className={(form.priority === value ? 'on' : '') + (value === 'high' ? ' high' : '')} onClick={() => change({ priority: value })}>{label}</button>
                ))}
              </div>
            </div>
            <div className="prop">
              <span className="prop-label">Tags</span>
              <TagInput value={form.tags} onChange={(v) => change({ tags: v })} suggestions={tags} />
            </div>
            <div className="prop-meta">
              {card.updated && <span>Updated {timeAgo(Date.parse(card.updated))}{card.updatedBy ? ` by ${card.updatedBy}` : ''}</span>}
              {card.created && <span>Created {card.created.slice(0, 10)}</span>}
              <span>Link it from a page with <code>[[#{card.id}]]</code></span>
            </div>
            <span className="grow" />
            <button className="btn ghost danger self-start" onClick={() => setConfirmDelete(true)}><TrashIcon size={15} />Delete card</button>
          </aside>
        </div>
      </motion.div>

      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDialog title="Delete this card?" message="It moves to the vault's .trash folder, where you can recover it." confirmLabel="Delete card" danger
            onConfirm={() => { debounced.cancel(); dirty.current = false; void api.deleteCard(vault.id, card.board, card.id).then(() => { onSaved(); onClose(); }); }}
            onClose={() => setConfirmDelete(false)} />
        )}
        {conflict && (
          <Modal title="Someone else changed this card" description="The file changed on another computer while you were editing. Which version do you want to keep?" size="sm" placement="center" onClose={() => setConflict(null)}>
            <DialogActions>
              <button className="btn" onClick={() => { dirty.current = false; setConflict(null); hash.current = conflict.hash; onSaved(); setStatus(''); }}>Keep theirs</button>
              <button className="btn primary" onClick={() => void save(conflict.hash)}>Keep mine</button>
            </DialogActions>
          </Modal>
        )}
      </AnimatePresence>
    </motion.div>,
    document.body
  );
}
