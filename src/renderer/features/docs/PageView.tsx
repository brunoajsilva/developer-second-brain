import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, errorMessage, isConflict } from '../../lib/api';
import { useDebounced, useLoader, useWindowKey } from '../../lib/hooks';
import { extractHeadings } from '../../lib/markdown';
import { timeAgo } from '../../lib/format';
import { shortcut } from '../../lib/platform';
import { ConfirmDialog, DialogActions, Modal } from '../../components/Modal';
import { Menu, anchorFrom, type MenuEntry } from '../../components/Menu';
import { useToast } from '../../components/Toast';
import { MarkdownEditor } from '../../components/markdown/MarkdownEditor';
import { MarkdownView, toggleTaskOnLine } from '../../components/markdown/MarkdownView';
import { spring } from '../../components/motion';
import { EditIcon, FolderOpenIcon, InProgressIcon, LinkIcon, MoreIcon, PageIcon, PlusIcon, ReadIcon, TrashIcon } from '../../components/Icons';
import { useWorkspace } from '../../app/workspace';
import { baseName, joinPath, parentOf, parentOptions, toFileName, withoutMd } from './doc-paths';
import type { ConflictData, DocFile, FileVersion } from '../../../shared/types';

/** One page: read mode with outline and backlinks, or the Markdown editor. Saves on its own while editing. */
export function PageView({ path, onNewSubPage, onDeleted, onMoved }: { path: string; onNewSubPage: (key: string) => void; onDeleted: () => void; onMoved: (path: string) => void }) {
  const { vault, data, tick, openLink, openCard, openDoc, reload } = useWorkspace();
  const toast = useToast();
  const docs = useMemo(() => data?.docs ?? [], [data]);
  const folders = useMemo(() => data?.docFolders ?? [], [data]);
  const [doc, setDoc] = useState<DocFile | null>(null);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [status, setStatus] = useState('');
  const [conflict, setConflict] = useState<FileVersion | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [move, setMove] = useState<{ parent: string; name: string } | null>(null);
  const [menu, setMenu] = useState<ReturnType<typeof anchorFrom> | null>(null);
  const [error, setError] = useState('');
  const [activeHeading, setActiveHeading] = useState(0);
  const hash = useRef('');
  const dirty = useRef(false);
  const textRef = useRef('');
  textRef.current = text;
  const article = useRef<HTMLDivElement>(null);

  const load = () => api.readDoc(vault.id, path).then((d) => { setDoc(d); setText(d.text); hash.current = d.hash; dirty.current = false; setStatus(''); }).catch((e) => setError(errorMessage(e)));
  useEffect(() => { void load(); }, [vault.id, path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!dirty.current) void load(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (force?: string) => {
    if (!dirty.current && !force) return;
    try {
      const r = await api.writeDoc(vault.id, path, textRef.current, force ?? hash.current);
      hash.current = r.hash;
      dirty.current = false;
      setStatus('Saved');
      setConflict(null);
      reload();
    } catch (e) {
      if (isConflict(e)) { setConflict((e.data as ConflictData).current); setStatus('Conflict'); }
      else setStatus(errorMessage(e));
    }
  };
  const debounced = useDebounced(() => void save(), 900);
  useEffect(() => () => { if (dirty.current) void save(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const change = (t: string) => { setText(t); textRef.current = t; dirty.current = true; setStatus('Saving…'); debounced.schedule(); };
  const toggleMode = () => {
    if (mode === 'edit') { debounced.cancel(); void save(); setMode('read'); } else setMode('edit');
  };
  useWindowKey((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && !document.querySelector('[role="dialog"]')) { e.preventDefault(); toggleMode(); }
  });

  const headings = useMemo(() => extractHeadings(text), [text]);
  const title = docs.find((d) => d.path === path)?.title || baseName(withoutMd(path));
  const backlinks = useLoader(() => api.backlinks(vault.id, { kind: 'doc', title, ref: path }), [vault.id, path, tick, title]);
  const subPages = docs.filter((d) => parentOf(d.path) === withoutMd(path));
  const dir = parentOf(path);

  // outline follows the reading position
  useEffect(() => {
    const root = article.current;
    if (!root || mode !== 'read') return;
    const observer = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActiveHeading(Number((top.target as HTMLElement).dataset.h));
    }, { root, rootMargin: '0px 0px -70% 0px' });
    root.querySelectorAll('[data-h]').forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [text, mode, doc]);

  if (!doc) return <div className="page-loading">{error}</div>;

  const jumpTo = (i: number) => article.current?.querySelector(`[data-h="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const copyLink = () => void navigator.clipboard.writeText(`[[${title}]]`).then(() => toast('Link copied. Paste it in any page or card.'));
  const menuEntries: MenuEntry[] = [
    { label: 'Move or rename…', icon: <EditIcon size={15} />, onSelect: () => { setError(''); setMove({ parent: parentOf(path), name: baseName(withoutMd(path)) }); } },
    { label: 'Copy link', icon: <LinkIcon size={15} />, hint: '[[…]]', onSelect: copyLink },
    { label: 'Show file in folder', icon: <FolderOpenIcon size={15} />, onSelect: () => void api.revealInFolder(vault.id, 'Docs/' + path) },
    { separator: true },
    { label: 'Delete page…', icon: <TrashIcon size={15} />, danger: true, onSelect: () => setConfirmDelete(true) }
  ];

  return (
    <div className="page-layout">
      <article className="page-article" ref={article}>
        <div className="page-toolbar">
          <div className="segmented small" role="tablist" aria-label="Mode">
            <button role="tab" aria-selected={mode === 'read'} className={mode === 'read' ? 'on' : ''} onClick={() => mode === 'edit' && toggleMode()}><ReadIcon size={14} />Read</button>
            <button role="tab" aria-selected={mode === 'edit'} className={mode === 'edit' ? 'on' : ''} onClick={() => mode === 'read' && toggleMode()} title={shortcut('mod+E')}><EditIcon size={14} />Edit</button>
          </div>
          <button className="btn ghost small" onClick={() => onNewSubPage(withoutMd(path))}><PlusIcon size={14} />Sub-page</button>
          <span className="grow" />
          <AnimatePresence mode="wait">
            <motion.span key={status || 'edited'} className={'save-state' + (status === 'Conflict' ? ' bad' : '')} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {status || `Edited ${timeAgo(doc.modified)}`}
            </motion.span>
          </AnimatePresence>
          <button className="icon-btn" aria-label="More page actions" title="More" onClick={(e) => setMenu(anchorFrom(e.currentTarget, 'end'))}><MoreIcon size={16} /></button>
        </div>
        {error && <p className="banner error" onClick={() => setError('')}>{error}</p>}

        <div className="page-content">
          {mode === 'edit'
            ? (
              <div className="editor-frame">
                <p className="editor-hint"><b>[[</b> links a page · paste images with {shortcut('mod+V')} · <b>{shortcut('mod+E')}</b> to finish</p>
                <MarkdownEditor text={text} onChange={change} docs={docs}
                  onPasteImage={async (f) => api.saveAttachment(vault.id, path, f.name.split('.').pop() || f.type.split('/')[1] || 'png', new Uint8Array(await f.arrayBuffer()))} />
              </div>
            )
            : (
              <div onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('a,input,button,summary')) setMode('edit'); }}>
                <MarkdownView text={text} vaultId={vault.id} baseDir={dir} onOpenLink={(t) => openLink(t, dir)}
                  onToggleTask={(line) => { const next = toggleTaskOnLine(textRef.current, line); if (next !== null) change(next); }}
                  empty={<button className="empty-cta" onClick={() => setMode('edit')}>This page is empty. Start writing.</button>} />
              </div>
            )}

          {mode === 'read' && subPages.length > 0 && (
            <section className="subpages">
              <h3>Sub-pages</h3>
              <div className="subpage-grid">
                {subPages.map((d) => (
                  <button key={d.path} className="subpage" onClick={() => openDoc(d.path)}>
                    <PageIcon size={16} className="faint" />
                    <span className="grow"><b>{d.title}</b><span className="muted small">Edited {timeAgo(d.modified)}</span></span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="backlinks">
            <h3><LinkIcon size={14} />Linked from</h3>
            {(backlinks.data ?? []).length === 0
              ? <p className="muted small">Nothing links here yet. Use <code>[[{title}]]</code> in another page or card.</p>
              : (
                <div className="row wrap">
                  {(backlinks.data ?? []).map((b) => (
                    <button key={b.ref} className="ref-chip" onClick={() => { if (b.kind === 'doc') openDoc(b.ref); else { const [board, id] = b.ref.split('/'); openCard(board, id); } }}>
                      {b.kind === 'card' ? <InProgressIcon size={14} className="tone-accent" /> : <PageIcon size={14} />}{b.title}
                    </button>
                  ))}
                </div>
              )}
          </section>
        </div>
      </article>

      <aside className="outline" aria-label="On this page">
        <h3>On this page</h3>
        {headings.length === 0 && <p className="muted small">No headings yet.</p>}
        <ul>
          {headings.map((h, i) => (
            <li key={i} style={{ paddingLeft: (h.level - 1) * 12 }}>
              <button className={i === activeHeading && mode === 'read' ? 'on' : ''} onClick={() => mode === 'read' && jumpTo(i)}>
                {i === activeHeading && mode === 'read' && <motion.span layoutId="outline-mark" className="outline-mark" transition={spring} />}
                {h.text}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <AnimatePresence>{menu && <Menu anchor={menu} entries={menuEntries} onClose={() => setMenu(null)} />}</AnimatePresence>
      <AnimatePresence>
        {move && (
          <Modal key="move" title="Move or rename page" description="Sub-pages move with it. The file name is the page title, so [[links]] that use the old name need updating." onClose={() => setMove(null)}>
            <label className="field"><span>Name</span><input className="input" autoFocus value={move.name} onChange={(e) => setMove({ ...move, name: e.target.value })} /></label>
            <label className="field">
              <span>Inside</span>
              <select className="input" value={move.parent} onChange={(e) => setMove({ ...move, parent: e.target.value })}>
                <option value="">Top level (no collection)</option>
                {parentOptions(docs, folders, '', withoutMd(path)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            {error && <p className="error-text">{error}</p>}
            <DialogActions>
              <button className="btn" onClick={() => setMove(null)}>Cancel</button>
              <button className="btn primary" disabled={!toFileName(move.name)} onClick={() => {
                const from = withoutMd(path);
                const to = joinPath(move.parent, toFileName(move.name));
                if (to === from) { setMove(null); return; }
                void save()
                  .then(async () => {
                    await api.moveDoc(vault.id, path, to + '.md');
                    if (folders.includes(from)) await api.renameDocFolder(vault.id, from, to);
                  })
                  .then(() => { setMove(null); onMoved(to + '.md'); })
                  .catch((e) => setError(errorMessage(e)));
              }}>Move page</button>
            </DialogActions>
          </Modal>
        )}
        {confirmDelete && (
          <ConfirmDialog key="delete" title="Delete this page?" danger confirmLabel="Delete page"
            message={`${folders.includes(withoutMd(path)) ? 'Its sub-pages are deleted too. ' : ''}It moves to the vault's .trash folder, where you can recover it.`}
            onConfirm={() => {
              debounced.cancel();
              dirty.current = false;
              void api.deleteDoc(vault.id, path).then(() => (folders.includes(withoutMd(path)) ? api.deleteDocFolder(vault.id, withoutMd(path)) : undefined)).then(onDeleted);
            }}
            onClose={() => setConfirmDelete(false)} />
        )}
        {conflict && (
          <Modal key="conflict" title="Someone else changed this page" description="The file changed on another computer while you were editing." size="sm" placement="center" onClose={() => setConflict(null)}>
            <DialogActions>
              <button className="btn" onClick={() => { dirty.current = false; setConflict(null); setText(conflict.text); hash.current = conflict.hash; setStatus(''); }}>Keep theirs</button>
              <button className="btn" onClick={() => {
                const merged = `<<<<<<< mine\n${textRef.current}\n=======\n${conflict.text}\n>>>>>>> theirs\n`;
                setText(merged); textRef.current = merged; dirty.current = true; void save(conflict.hash); setMode('edit');
              }}>Merge with markers</button>
              <button className="btn primary" onClick={() => void save(conflict.hash)}>Keep mine</button>
            </DialogActions>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
