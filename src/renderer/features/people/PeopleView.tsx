import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api, errorMessage } from '../../lib/api';
import { useLoader } from '../../lib/hooks';
import { Avatar } from '../../components/Avatar';
import { ease, spring } from '../../components/motion';
import { LockIcon, PeopleIcon, TeamIcon, WarningIcon } from '../../components/Icons';
import { useWorkspace } from '../../app/workspace';
import type { PersonTab } from '../../app/navigation';
import { usePeople } from '../time-off/TimeOffView';
import { describeSince, oneOnOneStatus } from './one-on-one-status';
import { PersonPage } from './PersonPage';
import { NotePage } from './NotePage';
import type { OneOnOnePerson, VaultInfo } from '../../../shared/types';

/**
 * People: private 1:1 notes and feedback about each team member.
 * The team comes from the open vault; the notes live in the vault chosen in settings (ideally a personal one).
 */
export function PeopleView({ person, meeting, review, tab }: { person?: string; meeting?: string; review?: string; tab?: PersonTab }) {
  const { settings, vaults, vault, go } = useWorkspace();
  const store = vaults.find((v) => v.id === settings.oneOnOneVaultId);

  if (!settings.oneOnOneVaultId || !store) return <ChooseStore missing={!!settings.oneOnOneVaultId && !store} />;
  if (!store.available) {
    return (
      <div className="page-scroll"><div className="page-narrow stack-lg">
        <p className="banner error">Your 1:1 notes live in “{store.name}”, which is not reachable right now ({store.reason}). Connect the drive or locate the vault from the vault list.</p>
        <button className="btn self-start" onClick={() => void api.setOneOnOneVault('').then(() => go({ kind: 'people' }, true))}>Choose another vault for 1:1s…</button>
      </div></div>
    );
  }
  return <People storeId={store.id} storeName={store.name} shared={!store.personal} sameAsTeam={store.id === vault.id} person={person} meeting={meeting} review={review} tab={tab} />;
}

function People({ storeId, storeName, shared, sameAsTeam, person, meeting, review, tab }: { storeId: string; storeName: string; shared: boolean; sameAsTeam: boolean; person?: string; meeting?: string; review?: string; tab?: PersonTab }) {
  const { settings, go, tick, refreshSettings } = useWorkspace();
  const [version, setVersion] = useState(0);
  const records = useLoader(() => api.listOneOnOnes(storeId), [storeId, version, sameAsTeam ? tick : 0]);
  const team = usePeople();
  const me = settings.userName;
  const people = useMemo(() => {
    const names = new Set([...team, ...(records.data ?? []).map((r) => r.person)]);
    names.delete(me);
    return [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [team, records.data, me]);
  const recordOf = (p: string): OneOnOnePerson | undefined => records.data?.find((r) => r.person === p);
  const selected = person && people.includes(person) ? person : undefined;

  // open the first person when none is selected
  useEffect(() => { if (!person && people.length) go({ kind: 'people', person: people[0] }, true); }, [person, people.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = () => setVersion((v) => v + 1);
  return (
    <div className="people-screen">
      <nav className="people-panel" aria-label="People">
        <div className="people-head">
          <span className="pages-icon"><PeopleIcon size={16} /></span>
          <div className="grow stack-xs"><b>People</b><span className="muted small">{people.length} in the team</span></div>
        </div>
        <div className="people-scroll">
          {people.length === 0 && <p className="empty-state small">No one in the team yet. Use the + next to “Team” in the sidebar to add people.</p>}
          {people.map((p) => {
            const status = oneOnOneStatus(recordOf(p));
            const active = p === selected;
            return (
              <button key={p} className={'person-row' + (active ? ' active' : '')} onClick={() => go({ kind: 'people', person: p })}>
                {active && <motion.span layoutId="person-pill" className="tree-pill" transition={spring} />}
                <Avatar name={p} size={30} />
                <span className="grow stack-xs">
                  <span className="person-name">{p}</span>
                  <span className={'small ' + (status.overdue ? 'tone-warn' : 'muted')}>
                    {status.last ? `1:1 ${describeSince(status.since!)}${status.overdue ? ' · due' : ''}` : 'No 1:1 yet'}
                  </span>
                </span>
                {(recordOf(p)?.openActions.length ?? 0) > 0 && <span className="count-pill" title="Open action items">{recordOf(p)!.openActions.length}</span>}
              </button>
            );
          })}
        </div>
        <div className={'store-note' + (shared ? ' shared' : '')}>
          {shared ? <WarningIcon size={14} /> : <LockIcon size={14} />}
          <span className="grow">{shared ? <>Notes are in <b>{storeName}</b>, a shared vault: anyone with the folder can read them.</> : <>Private notes, kept in <b>{storeName}</b>.</>}</span>
          <button className="link" onClick={() => void api.setOneOnOneVault('').then(refreshSettings)}>Change</button>
        </div>
      </nav>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={(selected ?? '#none') + (meeting ? '/m/' + meeting : review ? '/r/' + review : '')} className="person-stage" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={ease}>
          {records.error && <p className="banner error inset">{records.error}</p>}
          {selected && (meeting || review)
            ? <NotePage storeId={storeId} person={selected} note={meeting ? { type: 'meeting', id: meeting } : { type: 'review', id: review! }} onChanged={reload} />
            : selected
              ? <PersonPage storeId={storeId} person={selected} record={recordOf(selected)} initialTab={tab} onChanged={reload} />
              : <div className="empty-state"><TeamIcon size={28} /><p>Pick someone on the left.</p></div>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** First visit: choose where private 1:1 notes and feedback are kept. */
function ChooseStore({ missing }: { missing: boolean }) {
  const { vaults, vault, refreshSettings } = useWorkspace();
  const [error, setError] = useState('');
  const personal = vaults.filter((v) => v.available && v.personal);
  const choose = (v: VaultInfo) => void api.setOneOnOneVault(v.id).then(refreshSettings).catch((e) => setError(errorMessage(e)));
  return (
    <div className="page-scroll">
      <div className="page-narrow stack-lg">
        <header className="view-head">
          <h1>Where should your 1:1 notes live?</h1>
          <p className="muted">1:1 notes and feedback are private. The team comes from this vault, but the notes can be kept in another one, so they never land in the shared folder. You only choose once, on this computer.</p>
        </header>
        {missing && <p className="banner warn inset"><WarningIcon size={15} />The vault chosen before is no longer in your list. Choose another one.</p>}
        {error && <p className="banner error">{error}</p>}
        <div className="store-options">
          {personal.map((v) => (
            <button key={v.id} className="action-tile" onClick={() => choose(v)}>
              <span className="action-icon accent"><LockIcon size={18} /></span>
              <span className="stack-xs grow"><b>{v.name}</b><span className="muted small">Personal vault · recommended · {v.path}</span></span>
            </button>
          ))}
          <button className="action-tile" onClick={() => choose(vault)}>
            <span className="action-icon"><TeamIcon size={18} /></span>
            <span className="stack-xs grow"><b>{vault.name}</b><span className="muted small">{vault.personal ? 'This vault (personal)' : 'This vault · shared: everyone with the folder can read the notes'}</span></span>
          </button>
        </div>
        {personal.length === 0 && <p className="muted small">You have no personal vault yet. Switch vault (Ctrl/⌘+Shift+O), create one marked “Personal vault, only for me”, and come back.</p>}
      </div>
    </div>
  );
}

