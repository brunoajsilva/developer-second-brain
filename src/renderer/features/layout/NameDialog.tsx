import { useState } from 'react';
import { api } from '../../lib/api';
import { DialogActions, Modal } from '../../components/Modal';

export function NameDialog({ current, onClose, onSaved }: { current: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(current);
  return (
    <Modal title="Your name" description="Shows the cards assigned to you and signs your changes. It stays on this computer." size="sm" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void api.setUserName(name.trim()).then(() => { onSaved(); onClose(); }); }}>
        <input className="input" autoFocus placeholder="e.g. Ana Costa" value={name} onChange={(e) => setName(e.target.value)} />
        <DialogActions>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>Save name</button>
        </DialogActions>
      </form>
    </Modal>
  );
}
