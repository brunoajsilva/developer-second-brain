import { useState, type ReactNode } from 'react';
import { api, errorMessage } from '../../lib/api';
import { initials } from '../../lib/format';
import { shortcut } from '../../lib/platform';
import { Modal } from '../../components/Modal';
import { BoardIcon, CalendarIcon, CloseIcon, CollectionIcon, LockIcon, PeopleIcon } from '../../components/Icons';
import { useWorkspace } from '../../app/workspace';
import { FEATURE_GROUPS, type Feature, type FeatureId } from '../../app/features';

const ICONS: Partial<Record<FeatureId, ReactNode>> = {
  people: <PeopleIcon size={17} />,
  'time-off': <CalendarIcon size={17} />,
  boards: <BoardIcon size={17} />,
  docs: <CollectionIcon size={17} />
};
const GROUPS = FEATURE_GROUPS.filter((g) => g.features.length);
const ALL_IDS = GROUPS.flatMap((g) => g.features.map((f) => f.id));

/** Settings of the open vault: which features show in the sidebar, Today, ⌘K and the New menu. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { vault, refreshSettings } = useWorkspace();
  // optimistic: the switch moves at once, the file is written behind it
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(vault.hiddenFeatures ?? []));
  const [error, setError] = useState('');

  const save = (next: Set<string>) => {
    const previous = hidden;
    setHidden(next);
    setError('');
    api.setVaultFeatures(vault.id, [...next]).then(refreshSettings).catch((e) => { setHidden(previous); setError(errorMessage(e)); });
  };
  const setMany = (ids: FeatureId[], on: boolean) => {
    const next = new Set(hidden);
    for (const id of ids) { if (on) next.delete(id); else next.add(id); }
    save(next);
  };
  const shown = ALL_IDS.filter((id) => !hidden.has(id)).length;

  return (
    <Modal onClose={onClose} className="settings">
      <header className="settings-head">
        <span className="vault-tile">{vault.personal ? <LockIcon size={15} /> : initials(vault.name)}</span>
        <div className="stack-xs grow">
          <h2>Settings</h2>
          <p>Features shown in <b>{vault.name}</b> · only for you, on this computer</p>
        </div>
        <button className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon size={16} /></button>
      </header>

      <div className="settings-body">
        <div className="settings-summary">
          <span><b>{shown}</b> of {ALL_IDS.length} shown</span>
          <span className="meter" aria-hidden>{ALL_IDS.map((id) => <i key={id} className={hidden.has(id) ? '' : 'on'} />)}</span>
          <button className="btn small" disabled={shown === ALL_IDS.length} onClick={() => setMany(ALL_IDS, true)}>Show everything</button>
        </div>

        {GROUPS.map((group) => {
          const ids = group.features.map((f) => f.id);
          const onCount = ids.filter((id) => !hidden.has(id)).length;
          return (
            <section key={group.title} className="settings-group" aria-label={group.title}>
              <header className="settings-group-head">
                <h3>{group.title}</h3>
                {ids.length > 1 && <span className="count">{onCount} of {ids.length}</span>}
                {ids.length > 1 && (
                  <button className="link-btn" onClick={() => setMany(ids, onCount === 0)}>{onCount === 0 ? 'Show all' : 'Hide all'}</button>
                )}
              </header>
              <ul className="settings-list">
                {group.features.map((f) => <li key={f.id}><FeatureRow feature={f} on={!hidden.has(f.id)} onChange={(on) => setMany([f.id], on)} /></li>)}
              </ul>
            </section>
          );
        })}
        {error && <p className="error-text">{error}</p>}
      </div>

      <footer className="settings-foot">
        <p className="hint">Hiding never deletes files. Today and search are always on. Open with {shortcut('mod+,')}.</p>
        <button className="btn primary" onClick={onClose}>Done</button>
      </footer>
    </Modal>
  );
}

/** The whole row is the switch: a bigger target than the knob, and one control for screen readers. */
function FeatureRow({ feature, on, onChange }: { feature: Feature; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={'settings-row' + (on ? '' : ' off')} onClick={() => onChange(!on)}>
      <span className="settings-icon">{feature.icon ?? ICONS[feature.id]}</span>
      <span className="settings-text">
        <span className="settings-name">{feature.name}</span>
        <span className="settings-desc">{feature.description}</span>
      </span>
      <span className={'switch' + (on ? ' on' : '')} aria-hidden><span className="switch-knob" /></span>
    </button>
  );
}
