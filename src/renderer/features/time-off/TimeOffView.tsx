import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, errorMessage } from '../../lib/api';
import { firstName } from '../../lib/format';
import { Avatar } from '../../components/Avatar';
import { ease, spring } from '../../components/motion';
import { BackIcon, ForwardIcon, PlusIcon } from '../../components/Icons';
import { useWorkspace } from '../../app/workspace';
import { TimeOffDialog, type TimeOffDraft } from './TimeOffDialog';
import { TYPE_LABELS, TYPE_SHORT, addDays, dayOfWeek, daysInMonth, entriesOn, holidayOn, iso, isWeekend, isWorkingDay, outOn, todayIso, vacationBalance, workingDays } from './calendar';
import type { TimeOffEntry, TimeOffPerson } from '../../../shared/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
type Scale = 'month' | 'year';

/** Everyone who can be on the map: the team, people with time off, and me first. */
export function usePeople(): string[] {
  const { data, settings } = useWorkspace();
  return useMemo(() => {
    const me = settings.userName;
    // me first, then the team (and anyone assigned to a card), then anyone who already has time off
    const names = new Set([me, ...(data?.people ?? []), ...(data?.timeOff ?? []).map((p) => p.person)]);
    return [...names].filter(Boolean).sort((a, b) => (a === me ? -1 : b === me ? 1 : a.localeCompare(b)));
  }, [data, settings.userName]);
}

export function TimeOffView() {
  const { data, settings, reload } = useWorkspace();
  const people = usePeople();
  const records = useMemo(() => data?.timeOff ?? [], [data]);
  const today = todayIso();
  const [scale, setScale] = useState<Scale>('month');
  const [cursor, setCursor] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [draft, setDraft] = useState<TimeOffDraft | null>(null);
  const [direction, setDirection] = useState(1);

  const recordOf = (person: string): TimeOffPerson => records.find((r) => r.person === person) ?? { person, allowance: 22, allowanceByYear: {}, entries: [] };
  const step = (n: number) => {
    setDirection(n);
    setCursor((c) => {
      if (scale === 'year') return { ...c, year: c.year + n };
      const m = c.month + n;
      return m < 1 ? { year: c.year - 1, month: 12 } : m > 12 ? { year: c.year + 1, month: 1 } : { ...c, month: m };
    });
  };
  const goToday = () => setCursor({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) });
  const outToday = outOn(records, today);
  const me = settings.userName || people[0] || '';

  return (
    <div className="page-scroll">
      <div className="page-wide stack-lg">
        <header className="time-off-head">
          <div className="stack-xs grow">
            <h1>Time off</h1>
            <p className="muted">
              {outToday.length ? <>Out today: {outToday.map((o) => `${firstName(o.person)} (${TYPE_SHORT[o.entry.type].toLowerCase()}${o.entry.half ? `, ${o.entry.half === 'am' ? 'morning' : 'afternoon'}` : ''})`).join(', ')}.</> : 'Everyone is in today.'} Drag across the days on someone’s row to book time off.
            </p>
          </div>
          <div className="period-nav">
            <button className="icon-btn bordered" aria-label={scale === 'month' ? 'Previous month' : 'Previous year'} onClick={() => step(-1)}><BackIcon size={16} /></button>
            <button className="btn" onClick={goToday}>Today</button>
            <button className="icon-btn bordered" aria-label={scale === 'month' ? 'Next month' : 'Next year'} onClick={() => step(1)}><ForwardIcon size={16} /></button>
            <h2 className="period-title">{scale === 'month' ? `${MONTHS[cursor.month - 1]} ${cursor.year}` : cursor.year}</h2>
          </div>
          <div className="segmented">
            <button className={scale === 'month' ? 'on' : ''} onClick={() => setScale('month')}>Month</button>
            <button className={scale === 'year' ? 'on' : ''} onClick={() => setScale('year')}>Year</button>
          </div>
          <button className="btn primary" onClick={() => setDraft({ person: me, start: today, end: today })}><PlusIcon size={15} />Add time off</button>
        </header>

        <Legend />

        <AnimatePresence mode="wait" custom={direction} initial={false}>
          <motion.div key={`${scale}-${cursor.year}-${scale === 'month' ? cursor.month : ''}`} custom={direction}
            initial={{ opacity: 0, x: direction * 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -10 }} transition={ease}>
            {scale === 'month'
              ? <MonthMap year={cursor.year} month={cursor.month} people={people} recordOf={recordOf} today={today} onBook={setDraft} />
              : <YearMap year={cursor.year} people={people} recordOf={recordOf} today={today} onOpenMonth={(m) => { setCursor({ year: cursor.year, month: m }); setScale('month'); }} />}
          </motion.div>
        </AnimatePresence>

        <Balances year={cursor.year} people={people} recordOf={recordOf} onChanged={reload} />
      </div>
      <AnimatePresence>
        {draft && <TimeOffDialog key="dialog" draft={draft} people={people} records={records} onClose={() => setDraft(null)} onSaved={reload} />}
      </AnimatePresence>
    </div>
  );
}

function Legend() {
  return (
    <div className="legend">
      {(Object.keys(TYPE_LABELS) as (keyof typeof TYPE_LABELS)[]).map((t) => <span key={t}><i className={'type-dot ' + t} />{TYPE_LABELS[t]}</span>)}
      <span><i className="swatch holiday" />Public holiday</span>
      <span><i className="swatch weekend" />Weekend</span>
      <span><i className="swatch half" />Half day</span>
    </div>
  );
}

interface Segment { entry: TimeOffEntry; from: number; to: number; clippedStart: boolean; clippedEnd: boolean }

/** Contiguous bars for one person inside a range of days (indexes into `days`). */
function segmentsFor(record: TimeOffPerson, days: string[]): Segment[] {
  const first = days[0];
  const last = days[days.length - 1];
  return record.entries
    .filter((e) => e.start <= last && e.end >= first)
    .map((e) => ({
      entry: e,
      from: e.start < first ? 0 : days.indexOf(e.start),
      to: e.end > last ? days.length - 1 : days.indexOf(e.end),
      clippedStart: e.start < first,
      clippedEnd: e.end > last
    }));
}

function MonthMap({ year, month, people, recordOf, today, onBook }: {
  year: number; month: number; people: string[]; recordOf: (p: string) => TimeOffPerson; today: string; onBook: (d: TimeOffDraft) => void;
}) {
  const days = useMemo(() => Array.from({ length: daysInMonth(year, month) }, (_, i) => iso(year, month, i + 1)), [year, month]);
  const [drag, setDrag] = useState<{ person: string; from: number; to: number } | null>(null);
  useEffect(() => {
    if (!drag) return;
    const up = () => {
      const [a, b] = [Math.min(drag.from, drag.to), Math.max(drag.from, drag.to)];
      onBook({ person: drag.person, start: days[a], end: days[b] });
      setDrag(null);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [drag, days, onBook]);

  const columns = `200px repeat(${days.length}, minmax(26px, 1fr))`;
  const threshold = Math.max(2, Math.ceil(people.length * 0.4));
  const outCount = days.map((d) => (!isWorkingDay(d) ? 0 : people.filter((p) => entriesOn(recordOf(p), d).length > 0).length));

  return (
    <div className="time-map" role="grid" aria-label={`Time off in ${MONTHS[month - 1]} ${year}`}>
      <div className="map-row map-header" style={{ gridTemplateColumns: columns }}>
        <div className="map-person head" />
        {days.map((d) => {
          const h = holidayOn(d);
          return (
            <div key={d} className={'map-day-head' + (isWeekend(d) ? ' weekend' : '') + (h ? (h.optional ? ' optional' : ' holiday') : '') + (d === today ? ' today' : '')} title={h ? `${h.name}${h.optional ? ' (optional)' : ''}` : undefined}>
              <span>{WEEKDAY[dayOfWeek(d)]}</span><b>{Number(d.slice(8))}</b>
            </div>
          );
        })}
      </div>
      {people.length === 0 && <p className="empty-state small">Add people to the team to see them here.</p>}
      {people.map((person) => {
        const record = recordOf(person);
        const balance = vacationBalance(record, year, today);
        return (
          <div key={person} className="map-row" style={{ gridTemplateColumns: columns }} role="row">
            <div className="map-person">
              <Avatar name={person} size={24} />
              <span className="grow ellipsis">{person}</span>
              <span className={'balance-chip' + (balance.remaining < 0 ? ' over' : '')} title={`${balance.remaining} of ${balance.allowance} vacation days left in ${year}`}>{balance.remaining}</span>
            </div>
            {days.map((d, i) => {
              const h = holidayOn(d);
              const selected = drag?.person === person && i >= Math.min(drag.from, drag.to) && i <= Math.max(drag.from, drag.to);
              return (
                <div key={d} role="gridcell" aria-label={`${person}, ${d}`}
                  className={'map-cell' + (isWeekend(d) ? ' weekend' : '') + (h && !h.optional ? ' holiday' : '') + (d === today ? ' today' : '') + (selected ? ' selecting' : '')}
                  style={{ gridColumn: i + 2, gridRow: 1 }}
                  onMouseDown={(e) => { if (e.button === 0) { e.preventDefault(); setDrag({ person, from: i, to: i }); } }}
                  onMouseEnter={() => drag?.person === person && setDrag({ ...drag, to: i })} />
              );
            })}
            {segmentsFor(record, days).map((s) => (
              <motion.button key={s.entry.id} layout className={`map-bar ${s.entry.type}${s.entry.half ? ' half ' + s.entry.half : ''}${s.clippedStart ? ' clip-start' : ''}${s.clippedEnd ? ' clip-end' : ''}`}
                style={{ gridColumn: `${s.from + 2} / ${s.to + 3}`, gridRow: 1 }} transition={spring}
                initial={{ opacity: 0, scaleX: 0.6 }} animate={{ opacity: 1, scaleX: 1 }}
                title={`${TYPE_LABELS[s.entry.type]}: ${s.entry.start}${s.entry.end !== s.entry.start ? ' to ' + s.entry.end : ''}${s.entry.half ? (s.entry.half === 'am' ? ' (morning)' : ' (afternoon)') : ''} · ${workingDays(s.entry)} working day(s)${s.entry.note ? ' · ' + s.entry.note : ''}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => onBook({ person, start: s.entry.start, end: s.entry.end, entry: s.entry })}>
                <span>{s.to - s.from >= 2 ? (s.entry.note || TYPE_SHORT[s.entry.type]) : ''}</span>
              </motion.button>
            ))}
          </div>
        );
      })}
      <div className="map-row map-footer" style={{ gridTemplateColumns: columns }}>
        <div className="map-person head">Out</div>
        {outCount.map((n, i) => (
          <div key={days[i]} className={'map-count' + (n >= threshold ? ' crowded' : '')} title={n ? `${n} out on ${days[i]}` : undefined}>{n || ''}</div>
        ))}
      </div>
    </div>
  );
}

function YearMap({ year, people, recordOf, today, onOpenMonth }: { year: number; people: string[]; recordOf: (p: string) => TimeOffPerson; today: string; onOpenMonth: (m: number) => void }) {
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = iso(year, 1, 1); d.startsWith(String(year)); d = addDays(d, 1)) out.push(d);
    return out;
  }, [year]);
  const columns = `200px repeat(${days.length}, minmax(2px, 1fr))`;
  return (
    <div className="time-map year" role="grid" aria-label={`Time off in ${year}`}>
      <div className="map-row map-header" style={{ gridTemplateColumns: columns }}>
        <div className="map-person head" />
        {MONTHS.map((m, i) => {
          const start = days.indexOf(iso(year, i + 1, 1));
          return <button key={m} className="map-month" style={{ gridColumn: `${start + 2} / span ${daysInMonth(year, i + 1)}` }} onClick={() => onOpenMonth(i + 1)}>{m.slice(0, 3)}</button>;
        })}
      </div>
      {people.map((person) => {
        const record = recordOf(person);
        return (
          <div key={person} className="map-row" style={{ gridTemplateColumns: columns }}>
            <div className="map-person"><Avatar name={person} size={22} /><span className="grow ellipsis">{person}</span></div>
            {days.map((d, i) => {
              const h = holidayOn(d);
              const month = Number(d.slice(5, 7));
              return <div key={d} className={'year-cell' + (isWeekend(d) ? ' weekend' : '') + (h && !h.optional ? ' holiday' : '') + (d.endsWith('-01') ? ' month-start' : '') + (d === today ? ' today' : '')} style={{ gridColumn: i + 2, gridRow: 1 }} onClick={() => onOpenMonth(month)} />;
            })}
            {segmentsFor(record, days).map((s) => (
              <div key={s.entry.id} className={`year-bar ${s.entry.type}${s.entry.half ? ' half' : ''}`} style={{ gridColumn: `${s.from + 2} / ${s.to + 3}`, gridRow: 1 }}
                title={`${TYPE_LABELS[s.entry.type]}: ${s.entry.start}${s.entry.end !== s.entry.start ? ' to ' + s.entry.end : ''}${s.entry.note ? ' · ' + s.entry.note : ''}`} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Balances({ year, people, recordOf, onChanged }: { year: number; people: string[]; recordOf: (p: string) => TimeOffPerson; onChanged: () => void }) {
  const { vault } = useWorkspace();
  const [editing, setEditing] = useState<{ person: string; value: string } | null>(null);
  const [error, setError] = useState('');
  const save = async () => {
    if (!editing) return;
    try {
      await api.setTimeOffAllowance(vault.id, editing.person, Number(editing.value.replace(',', '.')), String(year));
      setEditing(null);
      onChanged();
    } catch (e) { setError(errorMessage(e)); }
  };
  return (
    <section className="panel">
      <header className="panel-head"><h2>Vacation days in {year}</h2><span className="muted small">Working days only; public holidays and weekends are not counted.</span></header>
      {error && <p className="banner error inset">{error}</p>}
      <table className="balances">
        <thead><tr><th>Person</th><th>Allowance</th><th>Taken</th><th>Booked</th><th>Left</th><th className="bar-col" /></tr></thead>
        <tbody>
          {people.map((person) => {
            const b = vacationBalance(recordOf(person), year);
            const pct = (n: number) => `${Math.max(0, Math.min(100, (n / Math.max(b.allowance, 1)) * 100))}%`;
            return (
              <tr key={person}>
                <td><span className="row"><Avatar name={person} size={22} />{person}</span></td>
                <td>
                  {editing?.person === person
                    ? <input className="input small allowance-input" autoFocus value={editing.value} onChange={(e) => setEditing({ person, value: e.target.value })}
                        onBlur={() => void save()} onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(null); }} />
                    : <button className="allowance" title="Change the allowance for this year" onClick={() => setEditing({ person, value: String(b.allowance) })}>{b.allowance}</button>}
                </td>
                <td>{b.taken}</td>
                <td>{b.planned}</td>
                <td className={b.remaining < 0 ? 'tone-danger strong' : 'strong'}>{b.remaining}</td>
                <td className="bar-col">
                  <span className="balance-bar" aria-hidden>
                    <motion.i className="taken" initial={false} animate={{ width: pct(b.taken) }} transition={spring} />
                    <motion.i className="planned" initial={false} animate={{ width: pct(b.planned) }} transition={spring} />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
