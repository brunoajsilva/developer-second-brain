import { useState } from 'react';
import { Reorder } from 'motion/react';
import { api, errorMessage } from '../../lib/api';
import { useLoader } from '../../lib/hooks';
import { ConfirmDialog, DialogActions, Modal } from '../../components/Modal';
import { Avatar } from '../../components/Avatar';
import { CloseIcon, GripIcon, PlusIcon } from '../../components/Icons';
import { useWorkspace } from '../../app/workspace';
import { plural } from '../../lib/format';
import type { Board, Column } from '../../../shared/types';

export function NewBoardDialog({ onClose }: { onClose: () => void }) {
  const { vault, reload, go } = useWorkspace();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const create = async () => {
    try {
      const board = await api.saveBoard(vault.id, {
        name: name.trim(),
        columns: [{ id: 'todo', name: 'To do' }, { id: 'in-progress', name: 'In progress' }, { id: 'done', name: 'Done', done: true }]
      });
      reload();
      onClose();
      go({ kind: 'board', boardId: board.id });
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal title="New board" description="Starts with To do, In progress and Done. You can change the columns in the board settings." onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (name.trim()) void create(); }}>
        <input className="input" autoFocus placeholder="Board name, e.g. Sprint 24" value={name} onChange={(e) => setName(e.target.value)} />
        {error && <p className="error-text">{error}</p>}
        <DialogActions>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>Create board</button>
        </DialogActions>
      </form>
    </Modal>
  );
}

type EditableColumn = Column & { key: string };

export function BoardSettingsDialog({ board, cardCount, onClose, onSaved, onDeleted }: { board: Board; cardCount: number; onClose: () => void; onSaved: () => void; onDeleted: () => void }) {
  const { vault } = useWorkspace();
  const [name, setName] = useState(board.name);
  const [description, setDescription] = useState(board.description);
  const [columns, setColumns] = useState<EditableColumn[]>(board.columns.map((c) => ({ ...c, key: c.id })));
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const update = (key: string, patch: Partial<Column>) => setColumns(columns.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const save = () =>
    api.saveBoard(vault.id, { id: board.id, name: name.trim(), description: description.trim(), columns: columns.map(({ key: _k, ...c }) => c) })
      .then(() => { onSaved(); onClose(); })
      .catch((e) => setError(errorMessage(e)));

  if (confirmDelete) {
    return (
      <ConfirmDialog title={`Delete the board “${board.name}”?`} danger confirmLabel="Delete board"
        message={`${plural(cardCount, 'card')} move with it to the vault's .trash folder, where you can recover them.`}
        onConfirm={() => void api.deleteBoard(vault.id, board.id).then(() => { onClose(); onDeleted(); }).catch((e) => setError(errorMessage(e)))}
        onClose={() => setConfirmDelete(false)} />
    );
  }
  return (
    <Modal title="Board settings" onClose={onClose}>
      <label className="field"><span>Name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>Description</span><input className="input" value={description} placeholder="What is this board for?" onChange={(e) => setDescription(e.target.value)} /></label>
      <div className="field">
        <span>Columns <span className="muted">· drag to reorder, tick the column that counts as done</span></span>
        <Reorder.Group axis="y" values={columns} onReorder={setColumns} className="column-editor">
          {columns.map((c, i) => (
            <Reorder.Item key={c.key} value={c} className="column-row">
              <GripIcon size={16} className="grip" />
              <input className="input" value={c.name} aria-label={`Column ${i + 1} name`} onChange={(e) => update(c.key, { name: e.target.value })} />
              <label className="check" title="Cards here count as done"><input type="checkbox" checked={!!c.done} onChange={(e) => update(c.key, { done: e.target.checked })} />Done</label>
              <button className="icon-btn" aria-label="Remove column" disabled={columns.length < 2} onClick={() => setColumns(columns.filter((x) => x.key !== c.key))}><CloseIcon size={15} /></button>
            </Reorder.Item>
          ))}
        </Reorder.Group>
        <button className="btn ghost self-start" onClick={() => setColumns([...columns, { id: '', key: 'new-' + Math.random().toString(36).slice(2, 7), name: 'New column' }])}><PlusIcon size={15} />Add column</button>
        <p className="hint">Cards in a removed column move to the first column.</p>
      </div>
      {error && <p className="error-text">{error}</p>}
      <DialogActions>
        <button className="btn ghost danger push-left" onClick={() => setConfirmDelete(true)}>Delete board…</button>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!name.trim()} onClick={() => void save()}>Save changes</button>
      </DialogActions>
    </Modal>
  );
}

export function TeamDialog({ onClose }: { onClose: () => void }) {
  const { vault, reload } = useWorkspace();
  const team = useLoader(() => api.listTeam(vault.id), [vault.id]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const run = (f: () => Promise<void>) => f().then(() => { team.reload(); reload(); }).catch((e) => setError(errorMessage(e)));
  const members = team.data ?? [];
  return (
    <Modal title="Team" description="People here can be assigned to cards. The list lives in the vault's _team.md, so everyone sharing the vault sees the same team." onClose={onClose}>
      <form className="row" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) void run(async () => { await api.addTeamMember(vault.id, n); setName(''); }); }}>
        <input className="input" autoFocus placeholder="Full name, e.g. Ana Costa" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" type="submit" disabled={!name.trim()}>Add</button>
      </form>
      {error && <p className="error-text">{error}</p>}
      <ul className="people-list">
        {members.length === 0 && <li className="empty-state small">No one yet. Add the people in your team.</li>}
        {members.map((m) => (
          <li key={m}>
            <Avatar name={m} size={28} />
            <span className="grow">{m}</span>
            <button className="btn ghost small" onClick={() => void run(() => api.removeTeamMember(vault.id, m))}>Remove</button>
          </li>
        ))}
      </ul>
      <DialogActions><button className="btn primary" onClick={onClose}>Done</button></DialogActions>
    </Modal>
  );
}
