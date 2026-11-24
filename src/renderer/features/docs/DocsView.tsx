import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, errorMessage } from '../../lib/api';
import { plural } from '../../lib/format';
import { ConfirmDialog, DialogActions, Modal } from '../../components/Modal';
import { Menu, type MenuEntry } from '../../components/Menu';
import { useToast } from '../../components/Toast';
import { ease } from '../../components/motion';
import { CollectionIcon, EditIcon, InboxIcon, MoreIcon, PlusIcon, TrashIcon } from '../../components/Icons';
import { useWorkspace } from '../../app/workspace';
import { baseName, joinPath, parentOf, toFileName, withoutMd } from './doc-paths';
import { PageTree, buildTree, type TreeActions } from './PageTree';
import { PageView } from './PageView';

type Dialog = { kind: 'rename'; key: string; name: string } | { kind: 'delete'; key: string; count: number };
const OVERVIEW_PAGE = /\/(overview|welcome|readme|index|vis[aã]o geral)\.md$/i;

export function DocsView({ collection, path, onNewPage }: { collection: string; path: string | null; onNewPage: (parent: string) => void }) {
  const { vault, data, reload, go } = useWorkspace();
  const toast = useToast();
  const allDocs = useMemo(() => data?.docs ?? [], [data]);
  const allFolders = useMemo(() => data?.docFolders ?? [], [data]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; key: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');

  // pages of this collection; loose pages are root pages and the sub-pages of root pages
  const rootPages = useMemo(() => new Set(allDocs.filter((d) => !d.path.includes('/')).map((d) => withoutMd(d.path))), [allDocs]);
  const isLoose = (p: string) => { const i = p.indexOf('/'); return i < 0 || rootPages.has(p.slice(0, i)); };
  const docs = collection ? allDocs.filter((d) => d.path.startsWith(collection + '/')) : allDocs.filter((d) => isLoose(d.path));
  const folders = collection ? allFolders.filter((f) => f === collection || f.startsWith(collection + '/')) : allFolders.filter((f) => rootPages.has(f.split('/')[0]));
  const tree = useMemo(() => buildTree(docs, collection, folders), [docs, collection, folders]); // eslint-disable-line react-hooks/exhaustive-deps

  // open the collection's overview (or its first page) automatically
  useEffect(() => {
    if (path || !docs.length) return;
    const ordered = [...docs].sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
    go({ kind: 'docs', collection, path: (ordered.find((d) => OVERVIEW_PAGE.test(d.path)) ?? ordered[0]).path });
  }, [path, docs.length, collection]); // eslint-disable-line react-hooks/exhaustive-deps

  const openPage = (p: string | null) => go({ kind: 'docs', collection, path: p });
  const hasPage = (key: string) => allDocs.some((d) => d.path === key + '.md');
  const hasFolder = (key: string) => allFolders.includes(key);
  const fail = (e: unknown) => setError(errorMessage(e));

  /** Moves a page together with its sub-pages, and keeps the selection pointing at it. */
  const moveNode = async (from: string, to: string) => {
    if (from === to) return;
    if (hasPage(from)) await api.moveDoc(vault.id, from + '.md', to + '.md');
    if (hasFolder(from)) await api.renameDocFolder(vault.id, from, to);
    const remap = (x: string) => (x === from + '.md' ? to + '.md' : x.startsWith(from + '/') ? to + x.slice(from.length) : x);
    const nextCollection = collection === from ? to : collection.startsWith(from + '/') ? to + collection.slice(from.length) : collection;
    go({ kind: 'docs', collection: nextCollection, path: path ? remap(path) : null }, true);
  };
  const rename = async () => {
    if (dialog?.kind !== 'rename') return;
    const name = toFileName(dialog.name);
    if (!name) return;
    try {
      await moveNode(dialog.key, joinPath(parentOf(dialog.key), name));
      setDialog(null);
      reload();
    } catch (e) { fail(e); }
  };
  const remove = async (key: string) => {
    try {
      if (hasPage(key)) await api.deleteDoc(vault.id, key + '.md');
      if (hasFolder(key)) await api.deleteDocFolder(vault.id, key);
      reload();
      toast(`Moved “${baseName(key)}” to the trash`);
      if (collection === key || collection.startsWith(key + '/')) go({ kind: 'today' }, true);
      else if (path && (path === key + '.md' || path.startsWith(key + '/'))) openPage(null);
    } catch (e) { fail(e); }
  };
  const dropOn = (target: string, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    const source = e.dataTransfer.getData('text/x-page');
    if (!source || source === target || target.startsWith(source + '/') || parentOf(source) === target) return;
    void moveNode(source, joinPath(target, baseName(source))).then(reload).catch(fail);
  };
  const pagesUnder = (key: string) => allDocs.filter((d) => d.path === key + '.md' || d.path.startsWith(key + '/')).length;

  const actions: TreeActions = {
    toggle: (k) => setCollapsed((c) => { const n = new Set(c); if (n.has(k)) n.delete(k); else n.add(k); return n; }),
    open: openPage,
    dropTarget,
    setDropTarget,
    drop: dropOn,
    newSubPage: onNewPage,
    menu: (x, y, key) => setMenu({ x, y, key })
  };
  const isCollectionMenu = !!menu && menu.key === collection;
  const menuEntries: MenuEntry[] = menu ? [
    { label: isCollectionMenu ? 'New page' : 'New sub-page', icon: <PlusIcon size={15} />, onSelect: () => onNewPage(menu.key) },
    { label: isCollectionMenu ? 'Rename collection' : 'Rename', icon: <EditIcon size={15} />, onSelect: () => setDialog({ kind: 'rename', key: menu.key, name: baseName(menu.key) }) },
    { separator: true },
    { label: isCollectionMenu ? 'Delete collection…' : 'Delete…', icon: <TrashIcon size={15} />, danger: true, onSelect: () => setDialog({ kind: 'delete', key: menu.key, count: pagesUnder(menu.key) }) }
  ] : [];

  return (
    <div className="docs-screen">
      <nav className="pages-panel" aria-label="Pages">
        <div className={'pages-head' + (dropTarget === '#root' ? ' drop-over' : '')}
          onDragOver={(e) => { e.preventDefault(); setDropTarget('#root'); }} onDragLeave={() => setDropTarget(null)} onDrop={(e) => dropOn(collection, e)}>
          <span className="pages-icon">{collection ? <CollectionIcon size={16} /> : <InboxIcon size={16} />}</span>
          <div className="grow ellipsis">
            <b>{collection ? baseName(collection) : 'Loose pages'}</b>
            <span className="muted small">{plural(docs.length, 'page')}</span>
          </div>
          {collection && <button className="icon-btn tiny" aria-label="Collection actions" title="Collection actions" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4, key: collection }); }}><MoreIcon size={15} /></button>}
          <button className="icon-btn tiny" aria-label="New page" title="New page" onClick={() => onNewPage(collection)}><PlusIcon size={15} /></button>
        </div>
        <div className="pages-scroll">
          {docs.length === 0 && <p className="empty-state small">No pages yet. Create the first one with +.</p>}
          <PageTree node={tree} depth={0} activePath={path} collapsed={collapsed} actions={actions} />
        </div>
        <p className="pages-hint">Drag a page onto another to nest it.</p>
      </nav>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={path ?? '#none'} className="page-stage" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={ease}>
          {path
            ? <PageView path={path} onNewSubPage={(k) => onNewPage(k)} onDeleted={() => { reload(); openPage(null); }} onMoved={(p) => { reload(); go({ kind: 'docs', collection, path: p }, true); }} />
            : <div className="empty-state">
                <p>{docs.length ? 'Pick a page on the left.' : 'This collection is empty.'}</p>
                <button className="btn primary" onClick={() => onNewPage(collection)}><PlusIcon size={15} />New page</button>
              </div>}
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {error && !dialog && <motion.button className="floating-error" onClick={() => setError('')} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{error}</motion.button>}
      </AnimatePresence>
      <AnimatePresence>{menu && <Menu anchor={{ x: menu.x, y: menu.y }} entries={menuEntries} onClose={() => setMenu(null)} />}</AnimatePresence>
      <AnimatePresence>
        {dialog?.kind === 'rename' && (
          <Modal key="rename" title={dialog.key === collection ? 'Rename collection' : 'Rename page'}
            description={dialog.key === collection ? undefined : 'The page title is its file name, so this renames the file and its sub-pages folder. [[Links]] that use the old name need updating.'} onClose={() => setDialog(null)}>
            <form className="stack" onSubmit={(e) => { e.preventDefault(); void rename(); }}>
              <input className="input" autoFocus value={dialog.name} onChange={(e) => setDialog({ ...dialog, name: e.target.value })} />
              {error && <p className="error-text">{error}</p>}
              <DialogActions>
                <button type="button" className="btn" onClick={() => setDialog(null)}>Cancel</button>
                <button type="submit" className="btn primary" disabled={!dialog.name.trim()}>Rename</button>
              </DialogActions>
            </form>
          </Modal>
        )}
        {dialog?.kind === 'delete' && (
          <ConfirmDialog key="delete" title={`Delete “${baseName(dialog.key)}”?`} danger confirmLabel="Delete"
            message={`${dialog.count > 1 ? `Includes ${plural(dialog.count - 1, 'sub-page')}. ` : ''}It moves to the vault's .trash folder, where you can recover it.`}
            onConfirm={() => void remove(dialog.key)} onClose={() => setDialog(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
