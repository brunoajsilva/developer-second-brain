import { useMemo, useState } from 'react';
import { api, errorMessage } from '../../lib/api';
import { ConfirmDialog, DialogActions, Modal } from '../../components/Modal';
import { useWorkspace } from '../../app/workspace';
import { LEAVE_REASONS, TYPE_SHORT, holidayOn, vacationBalance, workingDays } from './calendar';
import type { TimeOffEntry, TimeOffPerson, TimeOffType } from '../../../shared/types';

export interface TimeOffDraft {
  person: string;
  start: string;
  end: string;
  entry?: TimeOffEntry;
}

const TYPES: TimeOffType[] = ['vacation', 'sick', 'training', 'leave', 'other'];

/** Book, edit or remove time off. Shows the working days it takes and what is left of the vacation allowance. */
export function TimeOffDialog({ draft, people, records, onClose, onSaved }: { draft: TimeOffDraft; people: string[]; records: TimeOffPerson[]; onClose: () => void; onSaved: () => void }) {
  const { vault } = useWorkspace();
  const [person, setPerson] = useState(draft.person);
  const [type, setType] = useState<TimeOffType>(draft.entry?.type ?? 'vacation');
  const [start, setStart] = useState(draft.entry?.start ?? draft.start);
  const [end, setEnd] = useState(draft.entry?.end ?? draft.end);
  const [half, setHalf] = useState<'' | 'am' | 'pm'>(draft.entry?.half ?? '');
  const [note, setNote] = useState(draft.entry?.note ?? '');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const singleDay = start === end;
  const days = start && end && end >= start ? workingDays({ start, end, half: singleDay && half ? half : undefined }) : 0;

  const after = useMemo(() => {
    if (type !== 'vacation' || !start) return null;
    const year = Number(start.slice(0, 4));
    const record = records.find((r) => r.person === person) ?? { person, allowance: 22, allowanceByYear: {}, entries: [] };
    const others = { ...record, entries: record.entries.filter((e) => e.id !== draft.entry?.id) };
    const b = vacationBalance(others, year);
    return { year, left: b.remaining - workingDays({ start, end: end >= start ? end : start, half: singleDay && half ? half : undefined }, `${year}-01-01`, `${year}-12-31`) };
  }, [type, start, end, half, singleDay, person, records, draft.entry?.id]);

  const save = async () => {
    try {
      await api.saveTimeOff(vault.id, person, { id: draft.entry?.id, type, start, end, ...(singleDay && half ? { half } : {}), note });
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  if (confirmDelete && draft.entry) {
    return (
      <ConfirmDialog title="Remove this time off?" message={`${TYPE_SHORT[draft.entry.type]} for ${draft.person}, ${draft.entry.start}${draft.entry.end !== draft.entry.start ? ' to ' + draft.entry.end : ''}.`}
        confirmLabel="Remove" danger onClose={() => setConfirmDelete(false)}
        onConfirm={() => void api.deleteTimeOff(vault.id, draft.person, draft.entry!.id).then(() => { onSaved(); onClose(); }).catch((e) => setError(errorMessage(e)))} />
    );
  }
  const holidaysInside = (() => {
    const out: string[] = [];
    if (!start || !end || end < start) return out;
    for (let d = new Date(start + 'T00:00:00Z'); d.toISOString().slice(0, 10) <= end && out.length < 4; d.setUTCDate(d.getUTCDate() + 1)) {
      const h = holidayOn(d.toISOString().slice(0, 10));
      if (h && !h.optional) out.push(h.name);
    }
    return out;
  })();

  return (
    <Modal title={draft.entry ? 'Edit time off' : 'Add time off'} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <label className="field">
          <span>Who</span>
          <select className="input" value={person} disabled={!!draft.entry} onChange={(e) => setPerson(e.target.value)}>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <div className="field">
          <span>Type</span>
          <div className="segmented full" role="radiogroup">
            {TYPES.map((t) => <button type="button" key={t} role="radio" aria-checked={type === t} className={type === t ? 'on' : ''} onClick={() => setType(t)}><i className={'type-dot ' + t} />{TYPE_SHORT[t]}</button>)}
          </div>
        </div>
        <div className="row">
          <label className="field grow"><span>From</span><input className="input mono" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); }} /></label>
          <label className="field grow"><span>To</span><input className="input mono" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        {singleDay && (
          <div className="segmented full small" role="radiogroup" aria-label="Part of the day">
            {([['', 'Full day'], ['am', 'Morning'], ['pm', 'Afternoon']] as const).map(([v, label]) => (
              <button type="button" key={v || 'full'} role="radio" aria-checked={half === v} className={half === v ? 'on' : ''} onClick={() => setHalf(v)}>{label}</button>
            ))}
          </div>
        )}
        <label className="field">
          <span>{type === 'leave' ? 'Kind of leave' : <>Note <span className="muted">(optional)</span></>}</span>
          <input className="input" value={note} maxLength={120} placeholder={type === 'leave' ? 'e.g. Parental leave' : 'e.g. Summer holiday, KubeCon'} onChange={(e) => setNote(e.target.value)} />
        </label>
        {type === 'leave' && (
          <div className="reason-chips" role="group" aria-label="Common kinds of leave">
            {LEAVE_REASONS.map((r) => <button type="button" key={r} className={'reason-chip' + (note === r ? ' on' : '')} onClick={() => setNote(r)}>{r}</button>)}
          </div>
        )}
        <p className="time-off-summary">
          <b>{days} working day{days === 1 ? '' : 's'}</b>
          {holidaysInside.length > 0 && <span className="muted"> · skips {holidaysInside.join(', ')}</span>}
          {(type === 'leave' || type === 'sick') && <span className="muted"> · not deducted from vacation days</span>}
          {after && <span className={after.left < 0 ? 'tone-danger' : 'muted'}> · {after.left < 0 ? `${-after.left} over the ${after.year} allowance` : `${after.left} vacation days left in ${after.year}`}</span>}
        </p>
        {error && <p className="error-text">{error}</p>}
        <DialogActions>
          {draft.entry && <button type="button" className="btn ghost danger push-left" onClick={() => setConfirmDelete(true)}>Remove…</button>}
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!start || !end || end < start || !person}>{draft.entry ? 'Save changes' : 'Add time off'}</button>
        </DialogActions>
      </form>
    </Modal>
  );
}
