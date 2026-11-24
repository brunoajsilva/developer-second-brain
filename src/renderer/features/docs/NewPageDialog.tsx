import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { DialogActions, Modal } from '../../components/Modal';
import { useWorkspace } from '../../app/workspace';
import { joinPath, parentOptions, toFileName } from './doc-paths';

/** Creates a page (or a sub-page, when `parent` is a page key) and opens it. */
export function NewPageDialog({ parent: initialParent, onClose }: { parent: string; onClose: () => void }) {
  const { vault, data, reload, openDoc } = useWorkspace();
  const [title, setTitle] = useState('');
  const [parent, setParent] = useState(initialParent);
  const [error, setError] = useState('');
  const options = parentOptions(data?.docs ?? [], data?.docFolders ?? [], '');
  const isSubPage = (data?.docs ?? []).some((d) => d.path === initialParent + '.md');

  const create = async () => {
    const name = toFileName(title);
    if (!name) return;
    try {
      const doc = await api.createDoc(vault.id, joinPath(parent, name) + '.md', `# ${title.trim()}\n\n`);
      reload();
      onClose();
      openDoc(doc.path);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal title={isSubPage ? 'New sub-page' : 'New page'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label className="field"><span>Title</span><input className="input" autoFocus value={title} placeholder="e.g. Queue decision" onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field">
          <span>Inside</span>
          <select className="input" value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">Top level (no collection)</option>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {error && <p className="error-text">{error}</p>}
        <DialogActions>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!title.trim()}>Create page</button>
        </DialogActions>
      </form>
    </Modal>
  );
}
