import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { api, errorMessage } from '../../lib/api';
import { useLoader } from '../../lib/hooks';
import { timeAgo } from '../../lib/format';
import { DialogActions, Modal } from '../../components/Modal';
import { ConflictIcon, DoneIcon } from '../../components/Icons';
import { useWorkspace } from '../../app/workspace';
import type { ConflictCopy } from '../../../shared/types';

/** Conflict copies made by a sync drive when two people edited the same file at once. */
export function ConflictsView() {
  const { vault, tick, reload } = useWorkspace();
  const conflicts = useLoader(() => api.listConflicts(vault.id), [vault.id, tick]);
  const [open, setOpen] = useState<(ConflictCopy & { current: string; copyText: string }) | null>(null);
  const [error, setError] = useState('');

  const show = async (c: ConflictCopy) => {
    try {
      const [current, copyText] = await Promise.all([api.readVaultFile(vault.id, c.original), api.readVaultFile(vault.id, c.copy)]);
      setOpen({ ...c, current, copyText });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const resolve = async (keep: 'original' | 'copy') => {
    if (!open) return;
    try {
      await api.resolveConflict(vault.id, open.copy, keep);
      setOpen(null);
      conflicts.reload();
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const list = conflicts.data ?? [];
  return (
    <div className="page-scroll">
      <div className="page-narrow stack-lg">
        <header className="view-head">
          <h1>Sync conflicts</h1>
          <p className="muted">When two people change the same file at the same time, the sync drive keeps both. Pick the version to keep; the other goes to the vault's .trash folder.</p>
        </header>
        {error && <p className="banner error">{error}</p>}
        {list.length === 0
          ? <div className="empty-state"><DoneIcon size={28} /><p>No conflicts. Everything is in sync.</p></div>
          : (
            <ul className="list-panel">
              {list.map((c) => (
                <li key={c.copy}>
                  <button className="list-row" onClick={() => void show(c)}>
                    <ConflictIcon size={16} className="tone-warn" />
                    <span className="grow mono small">{c.original}</span>
                    <span className="pill warn">copy from {timeAgo(c.copyModified)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </div>
      <AnimatePresence>
        {open && (
          <Modal title="Resolve conflict" description={open.original} size="lg" onClose={() => setOpen(null)}>
            <div className="diff-grid">
              <section><h3>Current file</h3><pre className="diff-pane">{open.current}</pre></section>
              <section><h3>Conflict copy · {timeAgo(open.copyModified)}</h3><pre className="diff-pane">{open.copyText}</pre></section>
            </div>
            <DialogActions>
              <button className="btn" onClick={() => void resolve('original')}>Keep current file</button>
              <button className="btn primary" onClick={() => void resolve('copy')}>Keep the copy</button>
            </DialogActions>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}
