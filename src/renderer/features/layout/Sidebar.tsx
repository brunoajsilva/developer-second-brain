import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { api } from '../../lib/api';
import { initials } from '../../lib/format';
import { shortcut } from '../../lib/platform';
import { spring } from '../../components/motion';
import { Menu, anchorFrom, type MenuAnchor, type MenuEntry } from '../../components/Menu';
import { Avatar } from '../../components/Avatar';
import {
  BoardIcon, CollectionIcon, ConflictIcon, EditIcon, FolderOpenIcon, InboxIcon, LockIcon, PlusIcon, SearchIcon, SettingsIcon, SidebarIcon, SwitchIcon, TeamIcon, TodayIcon, TrashIcon, UserIcon
} from '../../components/Icons';
import { useWorkspace } from '../../app/workspace';
import type { View } from '../../app/navigation';

interface SidebarProps {
  view: View;
  collapsed: boolean;
  onToggle: () => void;
  onSearch: () => void;
  onSwitchVault: () => void;
  onOpenVault: (vaultId: string) => void;
  onEditCollection: (collection: string) => void;
  openCountByBoard: Map<string, number>;
  collections: [string, number][];
  myOpenCount: number;
}

export function Sidebar({ view, collapsed, onToggle, onSearch, onSwitchVault, onOpenVault, onEditCollection, openCountByBoard, collections, myOpenCount }: SidebarProps) {
  const { vault, vaults, data, settings, go, dialogs } = useWorkspace();
  const [menu, setMenu] = useState<{ anchor: MenuAnchor & { align?: 'start' | 'end'; side?: 'below' | 'above' }; entries: MenuEntry[] } | null>(null);
  const activeDocs = view.kind === 'docs' ? view.collection : null;

  const vaultMenu = (el: Element) => setMenu({
    anchor: anchorFrom(el, 'start', 'below'),
    entries: [
      { heading: 'Vaults' },
      ...vaults.filter((v) => v.available).slice(0, 9).map((v, i): MenuEntry => ({
        label: v.name, icon: v.personal ? <LockIcon size={15} /> : <span className="mini-tile">{initials(v.name)}</span>, hint: shortcut(`mod+${i + 1}`),
        onSelect: () => { if (v.id !== vault.id) onOpenVault(v.id); }
      })),
      { separator: true },
      { label: 'Show vault folder', icon: <FolderOpenIcon size={15} />, onSelect: () => void api.revealInFolder(vault.id, '') },
      { label: 'All vaults…', icon: <SwitchIcon size={15} />, hint: shortcut('mod+shift+O'), onSelect: onSwitchVault }
    ]
  });
  const userMenu = (el: Element) => setMenu({
    anchor: anchorFrom(el, 'start', 'above'),
    entries: [
      { label: <>Signed as <b>{settings.userName || 'nobody'}</b></>, icon: <UserIcon size={15} />, onSelect: dialogs.setName },
      { label: 'Team', icon: <TeamIcon size={15} />, onSelect: dialogs.team },
      { separator: true },
      { label: 'Search', icon: <SearchIcon size={15} />, hint: shortcut('mod+K'), onSelect: onSearch },
      { label: 'Collapse sidebar', icon: <SidebarIcon size={15} />, hint: shortcut('mod+\\'), onSelect: onToggle }
    ]
  });

  return (
    <motion.nav className={'sidebar' + (collapsed ? ' collapsed' : '')} aria-label="Main navigation" animate={{ width: collapsed ? 68 : 264 }} transition={spring} initial={false}>
      <div className="sidebar-top drag">
        <button className="vault-switch no-drag" onClick={(e) => vaultMenu(e.currentTarget)} title="Switch vault">
          <span className="vault-tile">{vault.personal ? <LockIcon size={14} /> : initials(vault.name)}</span>
          {!collapsed && <span className="vault-name">{vault.name}</span>}
          {!collapsed && <SwitchIcon size={14} className="faint" />}
        </button>
      </div>

      <button className="search-trigger" onClick={onSearch} title={`Search (${shortcut('mod+K')})`}>
        <SearchIcon size={16} />
        {!collapsed && <><span className="grow">Search</span><kbd>{shortcut('mod+K')}</kbd></>}
      </button>

      <div className="sidebar-scroll">
        <NavGroup>
          <NavItem icon={<TodayIcon size={17} />} label="Today" count={myOpenCount} active={view.kind === 'today'} collapsed={collapsed} onClick={() => go({ kind: 'today' })} />
        </NavGroup>

        <NavGroup title="Boards" collapsed={collapsed} onAdd={dialogs.newBoard} addLabel="New board">
          {(data?.boards ?? []).map((b) => (
            <NavItem key={b.id} icon={<BoardIcon size={17} />} label={b.name} count={openCountByBoard.get(b.id) ?? 0} collapsed={collapsed}
              active={view.kind === 'board' && view.boardId === b.id} onClick={() => go({ kind: 'board', boardId: b.id })} />
          ))}
          {data && data.boards.length === 0 && !collapsed && <button className="nav-empty" onClick={dialogs.newBoard}>Create your first board</button>}
        </NavGroup>

        <NavGroup title="Docs" collapsed={collapsed} onAdd={dialogs.newCollection} addLabel="New collection">
          {collections.map(([name, count]) => (
            <NavItem key={name || '#loose'} icon={name ? <CollectionIcon size={17} /> : <InboxIcon size={17} />} label={name || 'Loose pages'} count={count} collapsed={collapsed}
              active={activeDocs === name} onClick={() => go({ kind: 'docs', collection: name, path: null })}
              onContextMenu={(e) => setMenu({
                anchor: { x: e.clientX, y: e.clientY },
                entries: name
                  ? [{ label: 'Rename collection', icon: <EditIcon size={15} />, onSelect: () => onEditCollection(name) }, { label: 'Delete collection…', icon: <TrashIcon size={15} />, danger: true, onSelect: () => onEditCollection(name) }]
                  : [{ label: 'Move into a collection…', icon: <CollectionIcon size={15} />, onSelect: () => onEditCollection('') }]
              })} />
          ))}
          {data && collections.length === 0 && !collapsed && <button className="nav-empty" onClick={dialogs.newCollection}>Create your first collection</button>}
        </NavGroup>
      </div>

      <AnimatePresence>
        {(data?.conflicts.length ?? 0) > 0 && (
          <motion.button className={'conflict-alert' + (view.kind === 'conflicts' ? ' active' : '')} onClick={() => go({ kind: 'conflicts' })} title="Sync conflicts"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={spring}>
            <ConflictIcon size={16} />
            {!collapsed && <span className="grow">{data!.conflicts.length} sync conflict{data!.conflicts.length === 1 ? '' : 's'}</span>}
            {!collapsed && <span className="link">Resolve</span>}
          </motion.button>
        )}
      </AnimatePresence>

      <div className="sidebar-foot">
        <button className="user-btn" onClick={(e) => userMenu(e.currentTarget)} title="Account and preferences">
          <Avatar name={settings.userName || '?'} size={26} />
          {!collapsed && <span className="grow ellipsis">{settings.userName || 'Set your name'}</span>}
          {!collapsed && <SettingsIcon size={15} className="faint" />}
        </button>
        {!collapsed && <button className="icon-btn" onClick={onToggle} aria-label="Collapse sidebar" title={`Collapse (${shortcut('mod+\\')})`}><SidebarIcon size={16} /></button>}
      </div>
      {collapsed && <button className="icon-btn expand-btn" onClick={onToggle} aria-label="Expand sidebar" title={`Expand (${shortcut('mod+\\')})`}><SidebarIcon size={16} /></button>}

      <AnimatePresence>{menu && <Menu anchor={menu.anchor} entries={menu.entries} onClose={() => setMenu(null)} />}</AnimatePresence>
    </motion.nav>
  );
}

function NavGroup({ title, collapsed, onAdd, addLabel, children }: { title?: string; collapsed?: boolean; onAdd?: () => void; addLabel?: string; children: ReactNode }) {
  return (
    <div className="nav-group">
      {title && (collapsed
        ? <div className="nav-divider" />
        : (
          <div className="nav-title">
            <span className="grow">{title}</span>
            {onAdd && <button className="icon-btn tiny" onClick={onAdd} aria-label={addLabel} title={addLabel}><PlusIcon size={14} /></button>}
          </div>
        ))}
      {children}
    </div>
  );
}

function NavItem({ icon, label, count, active, collapsed, onClick, onContextMenu }: {
  icon: ReactNode; label: string; count?: number; active: boolean; collapsed: boolean; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button className={'nav-item' + (active ? ' active' : '')} aria-current={active ? 'page' : undefined} onClick={onClick} onContextMenu={onContextMenu} title={collapsed ? label : undefined}>
      {active && <motion.span layoutId="nav-pill" className="nav-pill" transition={spring} />}
      <span className="nav-icon">{icon}</span>
      {!collapsed && <span className="nav-label">{label}</span>}
      {!collapsed && !!count && <span className="nav-count">{count}</span>}
    </button>
  );
}
