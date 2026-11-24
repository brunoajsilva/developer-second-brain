import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, errorMessage } from '../../lib/api';
import { Avatar } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/Modal';
import { useToast } from '../../components/Toast';
import { spring } from '../../components/motion';
import { AgendaIcon, CloseIcon, EditIcon, FeedbackIcon, ImproveIcon, MeetingIcon, NoteIcon, PlusIcon, PraiseIcon, ReviewIcon, StartIcon, TrashIcon } from '../../components/Icons';
import { MarkdownView } from '../../components/markdown/MarkdownView';
import { useWorkspace } from '../../app/workspace';
import { todayIso } from '../time-off/calendar';
import { CADENCES, cadenceLabel, describeSince, oneOnOneStatus } from './one-on-one-status';
import { timeAgo } from '../../lib/format';
import type { PersonTab } from '../../app/navigation';
import type { FeedbackEntry, FeedbackKind, OneOnOnePerson, ReviewSummary } from '../../../shared/types';

const KINDS: { kind: FeedbackKind; label: string; icon: ReactNode }[] = [
  { kind: 'praise', label: 'Praise', icon: <PraiseIcon size={14} /> },
  { kind: 'improve', label: 'To improve', icon: <ImproveIcon size={14} /> },
  { kind: 'note', label: 'Note', icon: <NoteIcon size={14} /> }
];
const longDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });


export function PersonPage({ storeId, person, record, initialTab, onChanged }: { storeId: string; person: string; record?: OneOnOnePerson; initialTab?: PersonTab; onChanged: () => void }) {
  const { go } = useWorkspace();
  const toast = useToast();
  const [tab, setTab] = useState<PersonTab>(initialTab ?? 'feedback');
  const status = oneOnOneStatus(record);
  const cadence = record?.cadenceDays ?? 14;
  const feedback = record?.feedback ?? [];
  const meetings = record?.meetings ?? [];
  const reviews = record?.reviews ?? [];

  const start = async () => {
    try {
      const id = await api.startOneOnOne(storeId, person, todayIso());
      onChanged();
      go({ kind: 'people', person, meeting: id });
    } catch (e) { toast(errorMessage(e), 'error'); }
  };
  const addToAgenda = async (topic: string) => {
    try {
      await api.setOneOnOneAgenda(storeId, person, [...(record?.agenda ?? []), topic]);
      onChanged();
      toast('Added to the next 1:1');
    } catch (e) { toast(errorMessage(e), 'error'); }
  };

  return (
    <div className="person-page">
      <header className="person-head">
        <Avatar name={person} size={52} />
        <div className="grow stack-xs">
          <h1>{person}</h1>
          <p className="muted">
            {status.last ? <>Last 1:1 {describeSince(status.since!)}</> : 'No 1:1 yet'}
            {status.next && <> · <span className={status.overdue ? 'tone-warn strong' : ''}>{status.overdue ? 'due since' : 'next by'} {longDate(status.next)}</span></>}
          </p>
        </div>
        <label className="inline-select">
          <span className="muted">1:1s</span>
          <select value={cadence} onChange={(e) => void api.setOneOnOneCadence(storeId, person, Number(e.target.value)).then(onChanged).catch((err) => toast(errorMessage(err), 'error'))}>
            {CADENCES.map(([d, label]) => <option key={d} value={d}>{label}</option>)}
            {!CADENCES.some(([d]) => d === cadence) && <option value={cadence}>{cadenceLabel(cadence)}</option>}
          </select>
        </label>
        <button className="btn primary" onClick={() => void start()}><StartIcon size={14} />Start 1:1</button>
      </header>

      <div className="segmented person-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'feedback'} className={tab === 'feedback' ? 'on' : ''} onClick={() => setTab('feedback')}><FeedbackIcon size={15} />Feedback<span className="n">{feedback.length}</span></button>
        <button role="tab" aria-selected={tab === 'one-on-ones'} className={tab === 'one-on-ones' ? 'on' : ''} onClick={() => setTab('one-on-ones')}><MeetingIcon size={15} />1:1s<span className="n">{meetings.length}</span></button>
        <button role="tab" aria-selected={tab === 'reviews'} className={tab === 'reviews' ? 'on' : ''} onClick={() => setTab('reviews')}><ReviewIcon size={15} />Reviews<span className="n">{reviews.length}</span></button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {tab === 'feedback'
            ? <FeedbackLog storeId={storeId} person={person} entries={feedback} onChanged={onChanged} onBringToOneOnOne={(t) => void addToAgenda(t)} />
            : tab === 'reviews'
            ? <Reviews storeId={storeId} person={person} reviews={reviews} onChanged={onChanged} />
            : <OneOnOnes storeId={storeId} person={person} record={record} onChanged={onChanged} onStart={() => void start()} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ---------- Feedback

function FeedbackLog({ storeId, person, entries, onChanged, onBringToOneOnOne }: {
  storeId: string; person: string; entries: FeedbackEntry[]; onChanged: () => void; onBringToOneOnOne: (topic: string) => void;
}) {
  const toast = useToast();
  const [filter, setFilter] = useState<FeedbackKind | ''>('');
  const [editing, setEditing] = useState<FeedbackEntry | null>(null);
  const [removing, setRemoving] = useState<FeedbackEntry | null>(null);
  const shown = entries.filter((e) => !filter || e.kind === filter);

  return (
    <div className="feedback">
      <FeedbackComposer key={editing?.id ?? 'new'} storeId={storeId} person={person} editing={editing} onDone={() => { setEditing(null); onChanged(); }} onCancel={() => setEditing(null)} />
      {entries.length > 0 && (
        <div className="row wrap">
          <button className={'chip-toggle' + (!filter ? ' on' : '')} onClick={() => setFilter('')}>All {entries.length}</button>
          {KINDS.map((k) => {
            const n = entries.filter((e) => e.kind === k.kind).length;
            return n ? <button key={k.kind} className={'chip-toggle kind-' + k.kind + (filter === k.kind ? ' on' : '')} onClick={() => setFilter(filter === k.kind ? '' : k.kind)}>{k.icon}{k.label} {n}</button> : null;
          })}
        </div>
      )}
      {entries.length === 0 && <p className="empty-state small">No feedback yet. Write down praise, things to improve and observations as they happen; they make reviews and 1:1s much easier.</p>}
      <ul className="feedback-list">
        <AnimatePresence initial={false}>
          {shown.map((e) => {
            const kind = KINDS.find((k) => k.kind === e.kind)!;
            return (
              <motion.li key={e.id} layout className={'feedback-item kind-' + e.kind} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={spring}>
                <div className="feedback-meta">
                  <span className={'kind-tag kind-' + e.kind}>{kind.icon}{kind.label}</span>
                  <span className="muted small">{longDate(e.date)}</span>
                  <span className="grow" />
                  <button className="btn ghost small" title="Add it to the agenda of the next 1:1" onClick={() => onBringToOneOnOne(e.text.split('\n')[0].slice(0, 140))}><AgendaIcon size={14} />Bring to next 1:1</button>
                  <button className="icon-btn tiny" aria-label="Edit feedback" onClick={() => setEditing(e)}><EditIcon size={14} /></button>
                  <button className="icon-btn tiny" aria-label="Delete feedback" onClick={() => setRemoving(e)}><TrashIcon size={14} /></button>
                </div>
                <MarkdownView text={e.text} vaultId={storeId} baseDir="" className="feedback-text" />
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      <AnimatePresence>
        {removing && (
          <ConfirmDialog title="Delete this feedback?" message="It is removed from the feedback file." confirmLabel="Delete" danger onClose={() => setRemoving(null)}
            onConfirm={() => void api.deleteFeedback(storeId, person, removing.id).then(onChanged).catch((err) => toast(errorMessage(err), 'error'))} />
        )}
      </AnimatePresence>
    </div>
  );
}

function FeedbackComposer({ storeId, person, editing, onDone, onCancel }: { storeId: string; person: string; editing: FeedbackEntry | null; onDone: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState<FeedbackKind>(editing?.kind ?? 'praise');
  const [date, setDate] = useState(editing?.date ?? todayIso());
  const [text, setText] = useState(editing?.text ?? '');
  const [error, setError] = useState('');
  const save = async () => {
    try {
      await api.saveFeedback(storeId, person, { id: editing?.id, kind, date, text });
      setText('');
      setError('');
      onDone();
    } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <form className={'composer' + (editing ? ' editing' : '')} onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="row wrap">
        <div className="segmented small" role="radiogroup" aria-label="Kind of feedback">
          {KINDS.map((k) => <button type="button" key={k.kind} role="radio" aria-checked={kind === k.kind} className={(kind === k.kind ? 'on ' : '') + 'kind-' + k.kind} onClick={() => setKind(k.kind)}>{k.icon}{k.label}</button>)}
        </div>
        <span className="grow" />
        <input className="input small mono date-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
      </div>
      <textarea className="composer-text" rows={3} value={text} placeholder={`What did you notice about ${person.split(' ')[0]}? Be specific: the situation, what they did, the effect.`}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void save(); } }} />
      {error && <p className="error-text">{error}</p>}
      <div className="row end">
        <span className="muted small grow">Markdown works. Ctrl/⌘+Enter saves.</span>
        {editing && <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn primary small" disabled={!text.trim()}><PlusIcon size={14} />{editing ? 'Save changes' : 'Add feedback'}</button>
      </div>
    </form>
  );
}

// ---------- 1:1s

function OneOnOnes({ storeId, person, record, onChanged, onStart }: { storeId: string; person: string; record?: OneOnOnePerson; onChanged: () => void; onStart: () => void }) {
  const { go } = useWorkspace();
  const toast = useToast();
  const [topic, setTopic] = useState('');
  const agenda = record?.agenda ?? [];
  const actions = record?.openActions ?? [];
  const meetings = record?.meetings ?? [];

  const setAgenda = (topics: string[]) => api.setOneOnOneAgenda(storeId, person, topics).then(onChanged).catch((e) => toast(errorMessage(e), 'error'));
  const completeAction = async (meeting: string, line: number) => {
    try {
      const note = await api.readOneOnOne(storeId, person, meeting);
      const lines = note.text.split('\n');
      if (!/\[ \]/.test(lines[line] ?? '')) { onChanged(); return; }
      lines[line] = lines[line].replace('[ ]', '[x]');
      await api.writeOneOnOne(storeId, person, meeting, lines.join('\n'), note.hash);
      onChanged();
    } catch (e) { toast(errorMessage(e), 'error'); }
  };

  return (
    <div className="one-on-ones">
      <div className="ooo-grid">
        <section className="panel">
          <header className="panel-head"><h2>Next 1:1</h2><span className="count">{agenda.length}</span></header>
          <form className="agenda-add" onSubmit={(e) => { e.preventDefault(); if (topic.trim()) { void setAgenda([...agenda, topic.trim()]); setTopic(''); } }}>
            <input className="input" value={topic} placeholder="Add a topic to talk about" onChange={(e) => setTopic(e.target.value)} />
            <button className="btn small" type="submit" disabled={!topic.trim()}>Add</button>
          </form>
          <ul className="agenda">
            <AnimatePresence initial={false}>
              {agenda.map((t, i) => (
                <motion.li key={t + i} layout initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={spring}>
                  <span className="agenda-dot" /><span className="grow">{t}</span>
                  <button className="icon-btn tiny" aria-label={`Remove ${t}`} onClick={() => void setAgenda(agenda.filter((_, k) => k !== i))}><CloseIcon size={13} /></button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {agenda.length === 0 && <p className="group-empty">Nothing yet. Topics added here move into the note when the 1:1 starts.</p>}
        </section>
        <section className="panel">
          <header className="panel-head"><h2>Open action items</h2><span className="count">{actions.length}</span></header>
          <ul className="actions-list">
            <AnimatePresence initial={false}>
              {actions.map((a) => (
                <motion.li key={a.meeting + a.line} layout exit={{ opacity: 0, height: 0 }} transition={spring}>
                  <input type="checkbox" className="task-box-inline" aria-label={`Mark done: ${a.text}`} onChange={() => void completeAction(a.meeting, a.line)} />
                  <span className="grow">{a.text}</span>
                  <button className="link small" onClick={() => go({ kind: 'people', person, meeting: a.meeting })}>{a.meeting.slice(0, 10)}</button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {actions.length === 0 && <p className="group-empty">No open action items. Write “- [ ] …” in a 1:1 note to add one.</p>}
        </section>
      </div>

      <section className="stack">
        <h3 className="section-label">Past 1:1s</h3>
        {meetings.length === 0 && (
          <button className="empty-cta" onClick={onStart}>No 1:1 notes yet. Start the first one; it opens a note with the agenda already in it.</button>
        )}
        <div className="meeting-list">
          {meetings.map((m) => (
            <button key={m.id} className="meeting-card" onClick={() => go({ kind: 'people', person, meeting: m.id })}>
              <span className="meeting-date"><b>{new Date(m.date + 'T00:00:00Z').getUTCDate()}</b><span>{new Date(m.date + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</span></span>
              <span className="grow stack-xs">
                <span className="meeting-excerpt">{m.excerpt || 'Empty note'}</span>
                {m.openActions > 0 && <span className="small tone-accent">{m.openActions} open action item{m.openActions === 1 ? '' : 's'}</span>}
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

// ---------- Reviews: free Markdown documents

function Reviews({ storeId, person, reviews, onChanged }: { storeId: string; person: string; reviews: ReviewSummary[]; onChanged: () => void }) {
  const { go } = useWorkspace();
  const toast = useToast();
  const suggested = (() => {
    const base = `${new Date().getFullYear()} review`;
    if (!reviews.some((r) => r.id.toLowerCase() === base.toLowerCase())) return base;
    for (let n = 2; ; n++) if (!reviews.some((r) => r.id.toLowerCase() === `${base} ${n}`)) return `${base} ${n}`;
  })();
  const [name, setName] = useState('');
  const create = async () => {
    try {
      const id = await api.createReview(storeId, person, name.trim() || suggested);
      onChanged();
      go({ kind: 'people', person, review: id });
    } catch (e) { toast(errorMessage(e), 'error'); }
  };
  return (
    <div className="stack">
      <form className="review-new" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <span className="action-icon"><ReviewIcon size={18} /></span>
        <div className="grow stack-xs">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested} aria-label="Document name" />
          <span className="muted small">A free Markdown document about {person.split(' ')[0]}: a performance review, a development plan, promotion notes…</span>
        </div>
        <button className="btn primary" type="submit"><PlusIcon size={14} />New document</button>
      </form>
      {reviews.length === 0
        ? <p className="empty-state small">No documents yet. Name one above, or just press “New document” to start “{suggested}”.</p>
        : (
          <div className="meeting-list">
            {reviews.map((r) => (
              <button key={r.id} className="meeting-card review-card" onClick={() => go({ kind: 'people', person, review: r.id })}>
                <span className="review-icon"><ReviewIcon size={18} /></span>
                <span className="grow stack-xs">
                  <b className="review-title">{r.id}</b>
                  <span className="meeting-excerpt">{r.excerpt || 'Empty document'}</span>
                  <span className="muted small">Edited {timeAgo(r.modified)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
    </div>
  );
}
