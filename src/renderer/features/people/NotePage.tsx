import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, errorMessage, isConflict } from '../../lib/api';
import { useDebounced, useWindowKey } from '../../lib/hooks';
import { timeAgo } from '../../lib/format';
import { shortcut } from '../../lib/platform';
import { ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { BackIcon, EditIcon, ReadIcon, TrashIcon } from '../../components/Icons';
import { MarkdownEditor } from '../../components/markdown/MarkdownEditor';
import { MarkdownView, toggleTaskOnLine } from '../../components/markdown/MarkdownView';
import { useWorkspace } from '../../app/workspace';
import type { ConflictData, DocFile } from '../../../shared/types';

export type PersonNote = { type: 'meeting'; id: string } | { type: 'review'; id: string };

/** Reads, writes and deletes one kind of private note about a person. */
function noteIo(storeId: string, person: string, note: PersonNote) {
  return note.type === 'meeting'
    ? {
        read: () => api.readOneOnOne(storeId, person, note.id),
        write: (text: string, hash: string) => api.writeOneOnOne(storeId, person, note.id, text, hash),
        remove: () => api.deleteOneOnOne(storeId, person, note.id)
      }
    : {
        read: () => api.readReview(storeId, person, note.id),
        write: (text: string, hash: string) => api.writeReview(storeId, person, note.id, text, hash),
        remove: () => api.deleteReview(storeId, person, note.id)
      };
}

/**
 * One private note about a person: a 1:1 or a free document such as a performance review.
 * Opens in edit mode when it was just created; saves on its own.
 */
export function NotePage({ storeId, person, note, onChanged }: { storeId: string; person: string; note: PersonNote; onChanged: () => void }) {
  const { go } = useWorkspace();
  const toast = useToast();
  const io = noteIo(storeId, person, note);
  const backTab = note.type === 'meeting' ? 'one-on-ones' : 'reviews';
  const firstName = person.split(' ')[0];
  const [doc, setDoc] = useState<DocFile | null>(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [status, setStatus] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const hash = useRef('');
  const dirty = useRef(false);
  const textRef = useRef('');
  textRef.current = text;

  useEffect(() => {
    io.read()
      .then((d) => {
        setDoc(d); setText(d.text); hash.current = d.hash;
        // a note created in the last minute (or still empty) was just started: go straight to writing
        if (Date.now() - d.modified < 60_000 || !d.text.trim()) setMode('edit');
      })
      .catch((e) => toast(errorMessage(e), 'error'));
  }, [storeId, person, note.type, note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!dirty.current) return;
    try {
      const r = await io.write(textRef.current, hash.current);
      hash.current = r.hash;
      dirty.current = false;
      setStatus('Saved');
      onChanged();
    } catch (e) {
      if (isConflict(e)) {
        const current = (e.data as ConflictData).current;
        setStatus('Changed elsewhere; reloaded');
        dirty.current = false;
        hash.current = current.hash;
        setText(current.text);
        toast('This note was changed on another computer. Showing that version.', 'error');
      } else setStatus(errorMessage(e));
    }
  };
  const debounced = useDebounced(() => void save(), 800);
  useEffect(() => () => { if (dirty.current) void save(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (t: string) => { setText(t); textRef.current = t; dirty.current = true; setStatus('Saving…'); debounced.schedule(); };
  const toggleMode = () => { if (mode === 'edit') { debounced.cancel(); void save(); setMode('read'); } else setMode('edit'); };
  useWindowKey((e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && !document.querySelector('[role="dialog"]')) { e.preventDefault(); toggleMode(); } });

  const rename = async (title: string) => {
    if (note.type !== 'review' || !title.trim() || title.trim() === note.id) return;
    try {
      debounced.flush();
      const id = await api.renameReview(storeId, person, note.id, title);
      onChanged();
      go({ kind: 'people', person, review: id }, true);
    } catch (e) { toast(errorMessage(e), 'error'); }
  };

  if (!doc) return <div className="page-loading" />;
  const hint = note.type === 'meeting'
    ? <>“- [ ] …” lines become action items that stay on {firstName}’s page until done · <b>{shortcut('mod+E')}</b> to finish</>
    : <>Write whatever you need in Markdown · <b>{shortcut('mod+E')}</b> to finish</>;
  return (
    <div className="meeting-page">
      <div className="page-toolbar">
        <button className="btn ghost small" onClick={() => { debounced.flush(); go({ kind: 'people', person, tab: backTab }); }}><BackIcon size={14} />{person}</button>
        <div className="segmented small" role="tablist" aria-label="Mode">
          <button role="tab" aria-selected={mode === 'read'} className={mode === 'read' ? 'on' : ''} onClick={() => mode === 'edit' && toggleMode()}><ReadIcon size={14} />Read</button>
          <button role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'on' : ''} onClick={() => mode === 'read' && toggleMode()} title={shortcut('mod+E')}><EditIcon size={14} />Edit</button>
        </div>
        <span className="grow" />
        <AnimatePresence mode="wait">
          <motion.span key={status || 'edited'} className="save-state" initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{status || `Edited ${timeAgo(doc.modified)}`}</motion.span>
        </AnimatePresence>
        <button className="icon-btn" aria-label={note.type === 'meeting' ? 'Delete this 1:1 note' : 'Delete this document'} title="Delete" onClick={() => setConfirmDelete(true)}><TrashIcon size={16} /></button>
      </div>
      <div className="page-content">
        {note.type === 'review' && (
          <input key={note.id} className="title-input note-title" defaultValue={note.id} aria-label="Document name" spellCheck={false}
            onBlur={(e) => void rename(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = note.id; e.currentTarget.blur(); } }} />
        )}
        {mode === 'edit'
          ? <div className="editor-frame"><p className="editor-hint">{hint}</p><MarkdownEditor text={text} onChange={change} docs={[]} /></div>
          : <div onDoubleClick={() => setMode('edit')}>
              <MarkdownView text={text} vaultId={storeId} baseDir="" onToggleTask={(line) => { const next = toggleTaskOnLine(textRef.current, line); if (next !== null) { change(next); debounced.flush(); } }}
                empty={<button className="empty-cta" onClick={() => setMode('edit')}>This document is empty. Start writing.</button>} />
            </div>}
      </div>
      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDialog title={note.type === 'meeting' ? 'Delete this 1:1 note?' : `Delete “${note.id}”?`} message="It moves to the vault's .trash folder, where you can recover it." confirmLabel="Delete" danger onClose={() => setConfirmDelete(false)}
            onConfirm={() => { debounced.cancel(); dirty.current = false; void io.remove().then(() => { onChanged(); go({ kind: 'people', person, tab: backTab }, true); }); }} />
        )}
      </AnimatePresence>
    </div>
  );
}
