import { useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { Modal } from '../../components/Modal';
import { EnterIcon } from '../../components/Icons';
import { useWorkspace } from '../../app/workspace';

/** Ctrl+Shift+N from anywhere: one line becomes a card assigned to you, in the first column. */
export function QuickCapture({ boardId, onClose }: { boardId?: string; onClose: () => void }) {
  const { vault, data, settings, reload, openCard } = useWorkspace();
  const boards = data?.boards ?? [];
  const [title, setTitle] = useState('');
  const [board, setBoard] = useState(boardId ?? boards[0]?.id ?? '');
  const [error, setError] = useState('');

  const create = async (open: boolean) => {
    const target = boards.find((b) => b.id === board);
    if (!target) { setError('Create a board first.'); return; }
    try {
      const card = await api.saveCard(vault.id, { board: target.id, title: title.trim(), status: target.columns[0].id, assignee: settings.userName, due: '', priority: '', tags: [], body: '' }, null);
      reload();
      onClose();
      if (open) openCard(target.id, card.id);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <Modal onClose={onClose} className="capture" size="md">
      <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) void create(false); }}>
        <input className="capture-input" autoFocus placeholder="What needs to be done?" value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && title.trim()) { e.preventDefault(); void create(e.shiftKey); } }} />
        <div className="capture-foot">
          <label className="inline-select">
            <span className="muted">Board</span>
            <select value={board} onChange={(e) => setBoard(e.target.value)}>
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <span className="muted grow">Assigned to {settings.userName || 'nobody'}</span>
          <span className="key-hint"><kbd>↵</kbd> add <kbd>⇧↵</kbd> add and open</span>
          <button className="btn primary small" type="submit" disabled={!title.trim()}><EnterIcon size={14} />Add card</button>
        </div>
        {error && <p className="error-text pad">{error}</p>}
      </form>
    </Modal>
  );
}
