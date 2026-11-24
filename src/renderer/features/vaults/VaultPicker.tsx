import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, errorMessage } from '../../lib/api';
import { useWindowKey } from '../../lib/hooks';
import { initials } from '../../lib/format';
import { ConfirmDialog, DialogActions, Modal } from '../../components/Modal';
import { Menu, anchorFrom } from '../../components/Menu';
import { Logo } from '../../components/Logo';
import { spring } from '../../components/motion';
import { EnterIcon, FolderOpenIcon, LockIcon, MoreIcon, PlusIcon, SearchIcon, TeamIcon, TrashIcon } from '../../components/Icons';
import type { Settings, VaultInfo } from '../../../shared/types';

export function VaultPicker({ settings, vaults, onOpen, onChanged }: { settings: Settings; vaults: VaultInfo[]; onOpen: (id: string) => void; onChanged: () => void }) {
  const [error, setError] = useState('');
  const [create, setCreate] = useState<{ name: string; parent: string; personal: boolean } | null>(null);
  const [convert, setConvert] = useState<{ path: string; name: string; personal: boolean } | null>(null);
  const [remove, setRemove] = useState<VaultInfo | null>(null);
  const [menu, setMenu] = useState<{ anchor: ReturnType<typeof anchorFrom>; vault: VaultInfo } | null>(null);
  const [name, setName] = useState(settings.userName);
  const [editingName, setEditingName] = useState(!settings.userName);
  const [query, setQuery] = useState('');
  const last = vaults.find((v) => v.id === settings.activeVaultId && v.available);

  const attempt = async (f: () => Promise<void>) => {
    setError('');
    try { await f(); } catch (e) { setError(errorMessage(e)); }
  };
  const saveName = () => attempt(async () => { if (name.trim() !== settings.userName) { await api.setUserName(name.trim()); onChanged(); } });
  const openFolder = () => attempt(async () => {
    const folder = await api.pickFolder('Open folder as vault');
    if (!folder) return;
    const r = await api.openFolder(folder);
    if (r.status === 'opened') { onChanged(); onOpen(r.vault.id); }
    else setConvert({ path: r.path, name: r.name, personal: false });
  });
  const locate = (v: VaultInfo) => attempt(async () => {
    const folder = await api.pickFolder(`Locate the folder of “${v.name}”`);
    if (!folder) return;
    await api.locateVault(v.id, folder);
    onChanged();
  });

  useWindowKey((e) => {
    if (e.key === 'Enter' && last && !document.querySelector('[role="dialog"]') && (e.target as HTMLElement).tagName !== 'INPUT') onOpen(last.id);
  });

  const q = query.trim().toLowerCase();
  const shown = vaults.filter((v) => !q || v.name.toLowerCase().includes(q) || v.path.toLowerCase().includes(q));
  return (
    <div className="picker">
      <header className="picker-bar drag">
        <div className="row"><Logo size={26} /><b>Developer SecondBrain</b></div>
      </header>
      <div className="picker-body">
        <motion.div className="picker-intro" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          <h1>{last ? 'Pick up where you left off' : 'Choose a vault'}</h1>
          <p className="muted">A vault is a folder of Markdown pages and boards. Keep it on your computer, or in a synced folder your team shares.</p>
        </motion.div>
        {error && <p className="banner error">{error}</p>}

        {last && (
          <motion.button className="continue" onClick={() => onOpen(last.id)} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.04 }} autoFocus>
            <span className="vault-tile large">{last.personal ? <LockIcon size={18} /> : initials(last.name)}</span>
            <span className="grow stack-xs">
              <b>{last.name}</b>
              <span className="mono small faint ellipsis">{last.path}</span>
            </span>
            <span className="continue-cta">Continue<kbd><EnterIcon size={12} /></kbd></span>
          </motion.button>
        )}

        <div className="picker-grid">
          <section className="panel">
            <header className="panel-head">
              <h2>Your vaults</h2><span className="count">{vaults.length}</span>
              <span className="grow" />
              {vaults.length > 4 && <label className="search-field small"><SearchIcon size={14} /><input placeholder="Filter" aria-label="Filter vaults" value={query} onChange={(e) => setQuery(e.target.value)} /></label>}
            </header>
            {vaults.length === 0 && <p className="empty-state small">No vaults yet. Create one, or open a folder your team already shares.</p>}
            <ul className="vault-list">
              {shown.map((v) => (
                <li key={v.id} className={v.available ? '' : 'unavailable'}>
                  <button className="vault-row" disabled={!v.available} onClick={() => onOpen(v.id)}>
                    <span className="vault-tile">{v.personal ? <LockIcon size={14} /> : initials(v.name || '?')}</span>
                    <span className="grow stack-xs">
                      <span className="vault-row-name">{v.name || 'Unnamed vault'}{v.personal ? <span className="pill">personal</span> : <span className="pill">shared</span>}</span>
                      <span className={'small ellipsis ' + (v.available ? 'mono faint' : 'tone-warn')}>{v.available ? v.path : v.reason}</span>
                    </span>
                  </button>
                  {!v.available && <button className="btn small" onClick={() => void locate(v)}>Locate…</button>}
                  <button className="icon-btn" aria-label={`Options for ${v.name}`} onClick={(e) => setMenu({ anchor: anchorFrom(e.currentTarget, 'end'), vault: v })}><MoreIcon size={16} /></button>
                </li>
              ))}
            </ul>
          </section>

          <section className="stack">
            <button className="action-tile" onClick={() => setCreate({ name: '', parent: '', personal: false })}>
              <span className="action-icon accent"><PlusIcon size={18} /></span>
              <span className="stack-xs"><b>Create a vault</b><span className="muted small">Starts with a sample board and a short guide</span></span>
            </button>
            <button className="action-tile" onClick={() => void openFolder()}>
              <span className="action-icon"><FolderOpenIcon size={18} /></span>
              <span className="stack-xs"><b>Open a folder</b><span className="muted small">A local folder, or one synced with OneDrive, Dropbox or git</span></span>
            </button>
          </section>
        </div>

        <footer className="picker-foot">
          <span className="row">
            {editingName
              ? <input className="input small" autoFocus placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)}
                  onBlur={() => { setEditingName(false); void saveName(); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
              : <>Working as <b>{settings.userName || 'nobody'}</b><button className="link" onClick={() => setEditingName(true)}>{settings.userName ? 'Change' : 'Set your name'}</button></>}
          </span>
          <label className="check">
            <input type="checkbox" checked={settings.openLastVault} onChange={(e) => void attempt(async () => { await api.setOpenLastVault(e.target.checked); onChanged(); })} />
            Always open the last vault
          </label>
        </footer>
      </div>

      <AnimatePresence>
        {menu && (
          <Menu anchor={menu.anchor} onClose={() => setMenu(null)} entries={[
            ...(menu.vault.available ? [{ label: 'Show folder', icon: <FolderOpenIcon size={15} />, onSelect: () => void attempt(() => api.revealInFolder(menu.vault.id, '')) }] : []),
            { label: menu.vault.personal ? 'Mark as shared' : 'Mark as personal', icon: menu.vault.personal ? <TeamIcon size={15} /> : <LockIcon size={15} />,
              onSelect: () => void attempt(async () => { await api.setVaultPersonal(menu.vault.id, !menu.vault.personal); onChanged(); }) },
            { separator: true },
            { label: 'Remove from list…', icon: <TrashIcon size={15} />, danger: true, onSelect: () => setRemove(menu.vault) }
          ]} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {create && (
          <Modal key="create" title="Create a vault" onClose={() => setCreate(null)}>
            <label className="field"><span>Name</span><input className="input" autoFocus value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} /></label>
            <div className="field">
              <span>Location</span>
              <div className="row">
                <input className="input mono" readOnly value={create.parent} placeholder="Choose where to keep it, e.g. your synced drive" />
                <button className="btn" onClick={() => void attempt(async () => { const p = await api.pickFolder('Where to create the vault'); if (p) setCreate({ ...create, parent: p }); })}>Choose…</button>
              </div>
              <p className="hint">{create.parent && create.name.trim() ? <>Creates the folder <b>{create.name.trim()}</b> inside it.</> : 'The vault gets its own folder, named after it, inside the location you choose.'}</p>
            </div>
            <label className="check"><input type="checkbox" checked={create.personal} onChange={(e) => setCreate({ ...create, personal: e.target.checked })} />Personal vault, only for me</label>
            {error && <p className="error-text">{error}</p>}
            <DialogActions>
              <button className="btn" onClick={() => setCreate(null)}>Cancel</button>
              <button className="btn primary" disabled={!create.name.trim() || !create.parent}
                onClick={() => void attempt(async () => { const v = await api.createVault(create.name.trim(), create.parent, create.personal); setCreate(null); onChanged(); onOpen(v.id); })}>Create vault</button>
            </DialogActions>
          </Modal>
        )}
        {convert && (
          <Modal key="convert" title="This folder is not a vault yet" description={<span className="mono small">{convert.path}</span>} onClose={() => setConvert(null)}>
            <p className="muted">We add a _vault.md file and the Docs and Boards folders. Files already in the folder are not changed.</p>
            <label className="field"><span>Vault name</span><input className="input" value={convert.name} onChange={(e) => setConvert({ ...convert, name: e.target.value })} /></label>
            <label className="check"><input type="checkbox" checked={convert.personal} onChange={(e) => setConvert({ ...convert, personal: e.target.checked })} />Personal vault</label>
            {error && <p className="error-text">{error}</p>}
            <DialogActions>
              <button className="btn" onClick={() => setConvert(null)}>Cancel</button>
              <button className="btn primary" disabled={!convert.name.trim()}
                onClick={() => void attempt(async () => { const v = await api.convertFolder(convert.path, convert.name.trim(), convert.personal); setConvert(null); onChanged(); onOpen(v.id); })}>Convert and open</button>
            </DialogActions>
          </Modal>
        )}
        {remove && (
          <ConfirmDialog key="remove" title="Remove from the list?" danger confirmLabel="Remove"
            message={`“${remove.name}” will no longer show here. The folder and its files are not deleted.`}
            onConfirm={() => void attempt(async () => { await api.removeVault(remove.id); onChanged(); })} onClose={() => setRemove(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
