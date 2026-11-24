import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { shortcut } from '../../lib/platform';
import { Menu, anchorFrom, type MenuEntry } from '../../components/Menu';
import { BackIcon, BoardIcon, CaptureIcon, ChevronDownIcon, CollectionIcon, ForwardIcon, PageIcon, PlusIcon } from '../../components/Icons';
import { ease } from '../../components/motion';

export interface Crumb {
  label: string;
  onClick?: () => void;
}

/** Window-wide bar: history arrows, where you are, and the "New" menu. Doubles as the window drag area. */
export function TopBar({ crumbs, canGoBack, canGoForward, onBack, onForward, newEntries, right }: {
  crumbs: Crumb[];
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  newEntries: MenuEntry[];
  right?: ReactNode;
}) {
  const [menu, setMenu] = useState<ReturnType<typeof anchorFrom> | null>(null);
  return (
    <header className="topbar drag">
      <div className="history no-drag">
        <button className="icon-btn" aria-label="Back" title={`Back (${shortcut('alt+←')})`} disabled={!canGoBack} onClick={onBack}><BackIcon size={16} /></button>
        <button className="icon-btn" aria-label="Forward" title={`Forward (${shortcut('alt+→')})`} disabled={!canGoForward} onClick={onForward}><ForwardIcon size={16} /></button>
      </div>
      <nav className="crumbs no-drag" aria-label="Breadcrumb">
        <AnimatePresence mode="popLayout" initial={false}>
          {crumbs.map((c, i) => (
            <motion.span key={i + c.label} className="crumb" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={ease}>
              {i > 0 && <span className="crumb-sep">/</span>}
              {c.onClick && i < crumbs.length - 1 ? <button onClick={c.onClick}>{c.label}</button> : <span className={i === crumbs.length - 1 ? 'current' : ''}>{c.label}</span>}
            </motion.span>
          ))}
        </AnimatePresence>
      </nav>
      <div className="topbar-right no-drag">
        {right}
        <button className="btn primary small" onClick={(e) => setMenu(anchorFrom(e.currentTarget, 'end'))}>
          <PlusIcon size={15} />New<ChevronDownIcon size={14} />
        </button>
      </div>
      <AnimatePresence>{menu && <Menu anchor={menu} entries={newEntries} onClose={() => setMenu(null)} />}</AnimatePresence>
    </header>
  );
}

export const NEW_MENU_ICONS = {
  card: <BoardIcon size={15} />,
  page: <PageIcon size={15} />,
  board: <BoardIcon size={15} />,
  collection: <CollectionIcon size={15} />,
  capture: <CaptureIcon size={15} />
};
