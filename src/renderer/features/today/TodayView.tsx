import { motion } from 'motion/react';
import { api } from '../../lib/api';
import { checklistProgress, daysUntil, describeDue, firstName, formatDay, isBlockedColumn, plural } from '../../lib/format';
import { Avatar } from '../../components/Avatar';
import { BlockedIcon, CheckIcon, DoneIcon, FlagIcon, InProgressIcon, TodoIcon } from '../../components/Icons';
import { spring } from '../../components/motion';
import { boardName, columnOf, isDoneCard } from '../../app/useVaultData';
import { useWorkspace } from '../../app/workspace';
import { TYPE_SHORT, addDays, outOn, todayIso } from '../time-off/calendar';
import type { Board, Card } from '../../../shared/types';

const WEEK_MS = 7 * 86_400_000;
const byDue = (a: Card, b: Card) => (a.due || '9').localeCompare(b.due || '9');

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function TodayView() {
  const { data, settings, vault, openCard, reload, dialogs, go, enabled } = useWorkspace();
  if (!data) return <div className="page-scroll" />;
  const boardsOn = enabled('boards');
  const timeOffOn = enabled('time-off');
  // with boards turned off, Today shows no cards at all
  const boards = boardsOn ? data.boards : [];
  const cards = boardsOn ? data.cards : [];
  const me = settings.userName;
  const open = cards.filter((c) => !isDoneCard(boards, c));
  const mine = open.filter((c) => c.assignee === me);
  const days = (c: Card) => (c.due ? daysUntil(c.due) : null);
  const overdue = mine.filter((c) => (days(c) ?? 1) < 0).sort(byDue);
  const thisWeek = mine.filter((c) => { const d = days(c); return d !== null && d >= 0 && d <= 7; }).sort(byDue);
  const later = mine.filter((c) => { const d = days(c); return d === null || d > 7; }).sort(byDue);
  const blocked = open.filter((c) => isBlockedColumn(columnOf(boards, c)?.name ?? ''));
  const doneThisWeek = cards.filter((c) => isDoneCard(boards, c) && Date.parse(c.updated) >= Date.now() - WEEK_MS);
  // "now": my card furthest along (not in the first column, not blocked), soonest due first
  const now = mine
    .filter((c) => { const b = boards.find((x) => x.id === c.board); return b && b.columns[0]?.id !== c.status && !isBlockedColumn(columnOf(boards, c)?.name ?? ''); })
    .sort((a, b) => byDue(a, b) || b.updated.localeCompare(a.updated))[0];

  const markDone = async (card: Card) => {
    const done = boards.find((b) => b.id === card.board)?.columns.find((c) => c.done);
    if (!done) return;
    await api.moveCard(vault.id, card.board, card.id, done.id, null);
    reload();
  };

  const summary: string[] = [];
  if (thisWeek.length) summary.push(`${plural(thisWeek.length, 'card')} due this week`);
  if (overdue.length) summary.push(`${overdue.length} overdue`);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="page-scroll">
      <div className="page-wide stack-xl">
        <header className="today-head">
          <p className="today-date">{today}</p>
          <h1>{greeting()}{me ? `, ${firstName(me)}` : ''}</h1>
          {!boardsOn
            ? null
            : me
            ? <p className="today-summary">{summary.length ? `You have ${summary.join(' and ')}.` : 'Nothing is due this week.'}{blocked.length ? ` ${plural(blocked.length, 'card is', 'cards are')} blocked in the team.` : ''}</p>
            : <p className="today-summary">Add your name to see the cards assigned to you. <button className="link" onClick={dialogs.setName}>Set your name</button></p>}
        </header>

        {now && <NowPanel card={now} boards={boards} onOpen={() => openCard(now.board, now.id)} onDone={() => void markDone(now)} />}

        {(boardsOn || timeOffOn) && <div className={'today-grid' + (boardsOn ? '' : ' single')}>
          {boardsOn && <section className="panel">
            <header className="panel-head"><h2>Your work</h2><span className="count">{mine.length}</span></header>
            {mine.length === 0 && <p className="empty-state small">No open cards assigned to you.</p>}
            <CardGroup title="Overdue" tone="danger" cards={overdue} boards={boards} onOpen={openCard} />
            <CardGroup title="This week" cards={thisWeek} boards={boards} onOpen={openCard} />
            <CardGroup title="Later" cards={later} boards={boards} onOpen={openCard} />
          </section>}
          <section className="panel">
            <header className="panel-head"><h2>Team</h2></header>
            {timeOffOn && <OutThisWeek onOpen={() => go({ kind: 'time-off' })} />}
            {boardsOn && <CardGroup title="Blocked" tone="warn" cards={blocked} boards={boards} onOpen={openCard} showAssignee empty="Nothing is blocked." />}
            {boardsOn && <CardGroup title="Done in the last 7 days" tone="ok" cards={doneThisWeek} boards={boards} onOpen={openCard} showAssignee empty="Nothing finished yet this week." />}
          </section>
        </div>}
      </div>
    </div>
  );
}

function NowPanel({ card, boards, onOpen, onDone }: { card: Card; boards: Board[]; onOpen: () => void; onDone: () => void }) {
  const progress = checklistProgress(card.body);
  return (
    <motion.section className="now" aria-label="Now" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }}>
      <div className="now-main">
        <p className="now-where"><span className="now-dot" />{columnOf(boards, card)?.name} in {boardName(boards, card.board)}</p>
        <button className="now-title" onClick={onOpen}>{card.title}</button>
        <div className="now-meta">
          {progress.total > 0 && (
            <span className="now-progress">
              <span className="segments" aria-hidden>{Array.from({ length: progress.total }, (_, i) => <i key={i} className={i < progress.done ? 'on' : ''} />)}</span>
              {progress.done} of {progress.total} done
            </span>
          )}
          {card.due && <span>Due {formatDay(card.due)}, {describeDue(card.due)}</span>}
        </div>
      </div>
      <div className="now-actions">
        <button className="btn" onClick={onOpen}>Open</button>
        <button className="btn ink" onClick={onDone}><CheckIcon size={15} />Mark done</button>
      </div>
    </motion.section>
  );
}

function CardGroup({ title, cards, boards, onOpen, tone, showAssignee, empty }: {
  title: string; cards: Card[]; boards: Board[]; onOpen: (b: string, id: string) => void; tone?: 'danger' | 'warn' | 'ok'; showAssignee?: boolean; empty?: string;
}) {
  if (!cards.length && !empty) return null;
  return (
    <div className="card-group">
      <h3 className={tone ? 'tone-' + tone : ''}>{title} <span className="count">{cards.length}</span></h3>
      {!cards.length && <p className="group-empty">{empty}</p>}
      <ul>
        {cards.map((c) => <li key={c.board + c.id}><CardRow card={c} boards={boards} onOpen={onOpen} showAssignee={showAssignee} /></li>)}
      </ul>
    </div>
  );
}

export function StatusIcon({ card, boards }: { card: Card; boards: Board[] }) {
  const column = columnOf(boards, card);
  const board = boards.find((b) => b.id === card.board);
  if (column?.done) return <DoneIcon size={16} className="tone-ok" />;
  if (isBlockedColumn(column?.name ?? '')) return <BlockedIcon size={16} className="tone-warn" />;
  if (board && board.columns[0]?.id === card.status) return <TodoIcon size={16} className="faint" />;
  return <InProgressIcon size={16} className="tone-accent" />;
}

function CardRow({ card, boards, onOpen, showAssignee }: { card: Card; boards: Board[]; onOpen: (b: string, id: string) => void; showAssignee?: boolean }) {
  const d = card.due ? daysUntil(card.due) : null;
  const done = isDoneCard(boards, card);
  return (
    <button className="card-row" onClick={() => onOpen(card.board, card.id)}>
      <StatusIcon card={card} boards={boards} />
      <span className="card-row-title">{card.priority === 'high' && !done && <FlagIcon size={13} className="tone-danger flag" />}{card.title || 'Untitled card'}</span>
      <span className="card-row-board">{boardName(boards, card.board)}</span>
      {showAssignee && card.assignee && <Avatar name={card.assignee} size={20} />}
      {card.due && <span className={'due' + (!done && d !== null && d < 0 ? ' overdue' : !done && d !== null && d <= 2 ? ' soon' : '')} title={describeDue(card.due)}>{formatDay(card.due)}</span>}
    </button>
  );
}

/** Who is away today and in the next 7 days, from the team's time off. */
function OutThisWeek({ onOpen }: { onOpen: () => void }) {
  const { data } = useWorkspace();
  const today = todayIso();
  const seen = new Map<string, { person: string; type: string; start: string; end: string }>();
  for (let i = 0; i < 7; i++) {
    for (const o of outOn(data?.timeOff ?? [], addDays(today, i))) {
      seen.set(o.person + o.entry.id, { person: o.person, type: TYPE_SHORT[o.entry.type], start: o.entry.start, end: o.entry.end });
    }
  }
  const list = [...seen.values()].sort((a, b) => a.start.localeCompare(b.start));
  return (
    <div className="card-group">
      <h3>Out this week <span className="count">{list.length}</span></h3>
      {!list.length && <p className="group-empty">Everyone is around this week.</p>}
      <ul>
        {list.map((o) => (
          <li key={o.person + o.start}>
            <button className="card-row" onClick={onOpen}>
              <Avatar name={o.person} size={20} />
              <span className="card-row-title">{o.person}</span>
              <span className="card-row-board">{o.type}</span>
              <span className={'due' + (o.start <= today ? ' soon' : '')}>{o.start <= today ? 'now' : formatDay(o.start)}{o.end !== o.start ? ` → ${formatDay(o.end)}` : ''}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
