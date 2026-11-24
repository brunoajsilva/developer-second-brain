import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { ConfirmDialog, DialogActions, Modal } from '../../components/Modal';
import { useWorkspace } from '../../app/workspace';
import { joinPath, parentOptions, toFileName } from './doc-paths';

export function NewCollectionDialog({ onClose }: { onClose: () => void }) {
  const { vault, reload, go } = useWorkspace();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const create = async () => {
    const clean = name.trim().replace(/[\\/]+/g, ' ').trim();
    if (!clean) return;
    const path = `${toFileName(clean)}/Overview.md`;
    try {
      await api.createDoc(vault.id, path, `# ${clean}\n\nWhat this collection is about. Add pages with the + button in the page list.\n`);
      reload();
      onClose();
      go({ kind: 'docs', collection: toFileName(clean), path });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal title="New collection" description="A collection groups related pages, such as Architecture, Runbooks or Onboarding. It is a folder inside Docs." onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <input className="input" autoFocus placeholder="Collection name" value={name} onChange={(e) => setName(e.target.value)} />
        {error && <p className="error-text">{error}</p>}
        <DialogActions>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>Create collection</button>
        </DialogActions>
      </form>
    </Modal>
  );
}

/** Rename or delete a collection; for loose pages ('' collection), move them all into a new collection. */
export function EditCollectionDialog({ collection, onClose }: { collection: string; onClose: () => void }) {
  const { vault, data, reload, go } = useWorkspace();
  const [name, setName] = useState(collection || 'General');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pageCount = (data?.docs ?? []).filter((d) => d.path.startsWith(collection + '/')).length;

  const save = async () => {
    const target = toFileName(name.replace(/[\\/]+/g, ' '));
    if (!target || target === collection) return onClose();
    try {
      if (collection) {
        await api.renameDocFolder(vault.id, collection, target);
        go({ kind: 'docs', collection: target, path: null }, true);
      } else {
        for (const d of (data?.docs ?? []).filter((x) => !x.path.includes('/'))) {
          const key = d.path.replace(/\.md$/i, '');
          await api.moveDoc(vault.id, d.path, `${target}/${d.path}`);
          if ((data?.docFolders ?? []).includes(key)) await api.renameDocFolder(vault.id, key, `${target}/${key}`);
        }
        go({ kind: 'docs', collection: target, path: null });
      }
      reload();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (confirmDelete) {
    return (
      <ConfirmDialog title={`Delete “${collection}”?`} danger confirmLabel="Delete collection"
        message={`Its ${pageCount} page${pageCount === 1 ? '' : 's'} move to the vault's .trash folder, where you can recover them.`}
        onConfirm={() => void api.deleteDocFolder(vault.id, collection).then(() => { reload(); go({ kind: 'today' }, true); }).catch((e) => setError(errorMessage(e)))}
        onClose={onClose} />
    );
  }
  return (
    <Modal title={collection ? 'Rename collection' : 'Move loose pages into a collection'}
      description={collection ? 'Renames the folder in Docs. The pages inside stay as they are.' : 'Pages that are not in any collection move into a collection with this name.'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        {error && <p className="error-text">{error}</p>}
        <DialogActions>
          {collection && <button type="button" className="btn ghost danger push-left" onClick={() => setConfirmDelete(true)}>Delete collection…</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>{collection ? 'Rename' : 'Move pages'}</button>
        </DialogActions>
      </form>
    </Modal>
  );
}

/** Offered when a [[link]] points to a page that does not exist yet. */
export function CreateLinkedPageDialog({ title, parent: initialParent, onClose }: { title: string; parent: string; onClose: () => void }) {
  const { vault, data, reload, openDoc } = useWorkspace();
  const [parent, setParent] = useState(initialParent);
  const [error, setError] = useState('');
  const options = parentOptions(data?.docs ?? [], data?.docFolders ?? [], '');
  const create = async () => {
    const path = joinPath(parent, toFileName(title)) + '.md';
    try {
      await api.createDoc(vault.id, path, `# ${title}\n\n`);
      reload();
      onClose();
      openDoc(path);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal title={`Create “${title}”?`} description="No page has this title yet. Create it now and the link starts working." onClose={onClose}>
      <label className="field">
        <span>Inside</span>
        <select className="input" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Top level (no collection)</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      {error && <p className="error-text">{error}</p>}
      <DialogActions>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" autoFocus onClick={() => void create()}>Create page</button>
      </DialogActions>
    </Modal>
  );
}
