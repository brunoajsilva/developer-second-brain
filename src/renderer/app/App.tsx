import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { api } from '../lib/api';
import { useWindowKey } from '../lib/hooks';
import { isMac } from '../lib/platform';
import { ToastProvider, useToast } from '../components/Toast';
import { view as viewMotion, ease } from '../components/motion';
import type { MenuEntry } from '../components/Menu';
import type { Settings, VaultInfo } from '../../shared/types';
import { screenKey, useNavigation } from './navigation';
import { isDoneCard, useVaultData } from './useVaultData';
import { WorkspaceContext, type Workspace } from './workspace';
import { Sidebar } from '../features/layout/Sidebar';
import { TopBar, NEW_MENU_ICONS, type Crumb } from '../features/layout/TopBar';
import { NameDialog } from '../features/layout/NameDialog';
import { VaultPicker } from '../features/vaults/VaultPicker';
import { TodayView } from '../features/today/TodayView';
import { BoardView } from '../features/boards/BoardView';
import { BoardSettingsDialog, NewBoardDialog, TeamDialog } from '../features/boards/BoardDialogs';
import { DocsView } from '../features/docs/DocsView';
import { NewPageDialog } from '../features/docs/NewPageDialog';
import { CreateLinkedPageDialog, EditCollectionDialog, NewCollectionDialog } from '../features/docs/CollectionDialogs';
import { CommandPalette, type PaletteTarget } from '../features/search/CommandPalette';
import { ConflictsView } from '../features/conflicts/ConflictsView';
import { QuickCapture } from '../features/capture/QuickCapture';
import { TOOLS, findTool } from '../features/tools/registry';
import { TimeOffView } from '../features/time-off/TimeOffView';
import { PeopleView } from '../features/people/PeopleView';
import { SettingsDialog } from '../features/settings/SettingsDialog';
import { featureCheck, featureOfView, toolFeature } from './features';

const SIDEBAR_KEY = 'secondbrain.sidebarCollapsed';
const readCollapsed = () => { try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; } };

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <Root />
      </ToastProvider>
    </MotionConfig>
  );
}

/** Loads settings and decides between the vault picker and an open vault. */
function Root() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [vaults, setVaults] = useState<VaultInfo[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const firstLoad = useRef(true);

  const refresh = useCallback(async () => {
    const [s, v] = await Promise.all([api.getSettings(), api.listVaults()]);
    setSettings(s);
    setVaults(v);
    return { s, v };
  }, []);

  useEffect(() => {
    void refresh().then(({ s, v }) => {
      if (!firstLoad.current) return;
      firstLoad.current = false;
      if (s.openLastVault && v.find((x) => x.id === s.activeVaultId && x.available)) setOpenId(s.activeVaultId);
    });
  }, [refresh]);

  const open = useCallback((id: string) => {
    void api.setActiveVault(id);
    setOpenId(id);
    void refresh();
  }, [refresh]);
  const close = useCallback(() => { setOpenId(null); void refresh(); }, [refresh]);

  if (!settings) return <div className="boot" />;
  const vault = vaults.find((v) => v.id === openId);
  return (
    <AnimatePresence mode="wait">
      {vault
        ? <motion.div key={'vault:' + vault.id} className="fill" initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.985 }} transition={ease}>
            <OpenVault vault={vault} vaults={vaults} settings={settings} onOpenVault={open} onSwitchVault={close} onSettingsChanged={() => void refresh()} />
          </motion.div>
        : <motion.div key="picker" className="fill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={ease}>
            <VaultPicker settings={settings} vaults={vaults} onOpen={open} onChanged={() => void refresh()} />
          </motion.div>}
    </AnimatePresence>
  );
}

type Dialog =
  | { kind: 'new-board' } | { kind: 'new-collection' } | { kind: 'edit-collection'; collection: string } | { kind: 'name' } | { kind: 'team' }
  | { kind: 'link'; title: string; parent: string } | { kind: 'new-page'; parent: string } | { kind: 'capture'; boardId?: string }
  | { kind: 'board-settings'; boardId: string } | { kind: 'settings' };

function OpenVault({ vault, vaults, settings, onOpenVault, onSwitchVault, onSettingsChanged }: {
  vault: VaultInfo; vaults: VaultInfo[]; settings: Settings; onOpenVault: (id: string) => void; onSwitchVault: () => void; onSettingsChanged: () => void;
}) {
  const nav = useNavigation();
  const { view, go } = nav;
  const toast = useToast();
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [palette, setPalette] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { data, reload, openCountByBoard, collectionOf, collections } = useVaultData(vault.id, tick);
  const enabled = useMemo(() => featureCheck(vault.hiddenFeatures), [vault.hiddenFeatures]);
  const failureKey = data?.failures.join('|') ?? '';
  useEffect(() => { if (failureKey) toast(`Could not load ${failureKey.split('|').join('; ')}`, 'error'); }, [failureKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // reload (debounced) when files change on disk
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = window.bridge.onVaultChanged((change) => {
      if (change.vaultId !== vault.id) return;
      clearTimeout(timer);
      timer = setTimeout(() => setTick((n) => n + 1), 250);
    });
    return () => { off(); clearTimeout(timer); };
  }, [vault.id]);
  useEffect(() => window.bridge.onQuickCapture(() => {
    if (enabled('boards')) setDialog({ kind: 'capture' });
    else toast('Boards are turned off in this vault. Turn them on in Settings.', 'error');
  }), [enabled, toast]);

  // a screen whose feature was just turned off falls back to Today
  const viewFeature = featureOfView(view);
  useEffect(() => { if (viewFeature && !enabled(viewFeature)) go({ kind: 'today' }, true); }, [viewFeature, enabled, go]);

  const toggleSidebar = useCallback(() => setCollapsed((c) => {
    try { localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1'); } catch { /* storage unavailable */ }
    return !c;
  }), []);

  useWindowKey((e) => {
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); nav.back(); return; }
    if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); nav.forward(); return; }
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'k') { e.preventDefault(); setPalette((p) => !p); }
    else if (key === ',') { e.preventDefault(); setDialog({ kind: 'settings' }); }
    else if (key === '\\') { e.preventDefault(); toggleSidebar(); }
    else if (e.shiftKey && key === 'o') { e.preventDefault(); onSwitchVault(); }
    else if (/^[1-9]$/.test(e.key)) {
      const target = vaults.filter((v) => v.available)[Number(e.key) - 1];
      if (target) { e.preventDefault(); if (target.id !== vault.id) onOpenVault(target.id); }
    }
  });
  useEffect(() => {
    const onMouse = (e: MouseEvent) => {
      if (e.button === 3) { e.preventDefault(); nav.back(); } else if (e.button === 4) { e.preventDefault(); nav.forward(); }
    };
    window.addEventListener('mouseup', onMouse);
    return () => window.removeEventListener('mouseup', onMouse);
  }, [nav]);

  const openCard = useCallback((boardId: string, cardId: string) => go({ kind: 'board', boardId, cardId }), [go]);
  const openDoc = useCallback((path: string) => go({ kind: 'docs', collection: collectionOf(path), path }), [go, collectionOf]);

  const openLink = useCallback((target: string, folderHint = '') => {
    const t = target.trim();
    if (!t) return;
    if (t.startsWith('#')) {
      const id = t.slice(1).toLowerCase();
      const card = data?.cards.find((c) => c.id.toLowerCase() === id);
      if (card) openCard(card.board, card.id);
      else toast(`No card with the id ${t}.`, 'error');
      return;
    }
    const key = t.toLowerCase();
    const doc = data?.docs.find((d) => {
      const stem = d.path.replace(/\.md$/i, '');
      return d.title.toLowerCase() === key || stem.toLowerCase() === key || stem.replace(/^.*\//, '').toLowerCase() === key;
    });
    if (doc) openDoc(doc.path);
    else setDialog({ kind: 'link', title: t, parent: folderHint || (view.kind === 'docs' ? view.collection : '') || collections.find(([c]) => c)?.[0] || '' });
  }, [data, openCard, openDoc, toast, view, collections]);

  const workspace: Workspace = useMemo(() => ({
    vault, vaults, settings, data, tick,
    reload: () => setTick((n) => n + 1),
    refreshSettings: onSettingsChanged,
    go, openCard, openDoc, openLink, collectionOf, enabled,
    dialogs: {
      newBoard: () => setDialog({ kind: 'new-board' }),
      newCollection: () => setDialog({ kind: 'new-collection' }),
      setName: () => setDialog({ kind: 'name' }),
      team: () => setDialog({ kind: 'team' }),
      settings: () => setDialog({ kind: 'settings' })
    }
  }), [vault, vaults, settings, data, tick, go, openCard, openDoc, openLink, collectionOf, enabled]);

  const myOpenCount = data && enabled('boards') ? data.cards.filter((c) => c.assignee === settings.userName && !isDoneCard(data.boards, c)).length : 0;
  const currentBoard = view.kind === 'board' ? data?.boards.find((b) => b.id === view.boardId) : undefined;

  const crumbs: Crumb[] = [{ label: vault.name, onClick: () => go({ kind: 'today' }) }];
  if (view.kind === 'today') crumbs.push({ label: 'Today' });
  if (view.kind === 'conflicts') crumbs.push({ label: 'Sync conflicts' });
  if (view.kind === 'time-off') crumbs.push({ label: 'Team' }, { label: 'Time off' });
  if (view.kind === 'people') {
    crumbs.push({ label: 'Team' }, { label: 'People', onClick: () => go({ kind: 'people' }) });
    if (view.person) crumbs.push({ label: view.person, onClick: () => go({ kind: 'people', person: view.person }) });
    if (view.meeting) crumbs.push({ label: `1:1 ${view.meeting.slice(0, 10)}` });
    if (view.review) crumbs.push({ label: view.review });
  }
  if (view.kind === 'tool') crumbs.push({ label: 'Tools' }, { label: findTool(view.toolId)?.name ?? view.toolId });
  if (view.kind === 'board') crumbs.push({ label: 'Boards' }, { label: currentBoard?.name ?? view.boardId });
  if (view.kind === 'docs') {
    crumbs.push({ label: view.collection || 'Loose pages', onClick: () => go({ kind: 'docs', collection: view.collection, path: null }) });
    if (view.path) crumbs.push({ label: data?.docs.find((d) => d.path === view.path)?.title ?? view.path });
  }

  const boardsOn = enabled('boards');
  const docsOn = enabled('docs');
  const newEntries: MenuEntry[] = [
    ...(boardsOn ? [{ label: currentBoard ? `Card in ${currentBoard.name}` : 'Card', icon: NEW_MENU_ICONS.card, hint: isMac ? '⌘⇧N' : 'Ctrl+Shift+N', onSelect: () => setDialog({ kind: 'capture', boardId: currentBoard?.id }) }] : []),
    ...(docsOn ? [{ label: 'Page', icon: NEW_MENU_ICONS.page, onSelect: () => setDialog({ kind: 'new-page', parent: view.kind === 'docs' ? view.collection : '' }) }] : []),
    ...(boardsOn || docsOn ? [{ separator: true } as const] : []),
    ...(boardsOn ? [{ label: 'Board', icon: NEW_MENU_ICONS.board, onSelect: () => setDialog({ kind: 'new-board' }) }] : []),
    ...(docsOn ? [{ label: 'Collection', icon: NEW_MENU_ICONS.collection, onSelect: () => setDialog({ kind: 'new-collection' }) }] : [])
  ];

  const jump = (target: PaletteTarget) => {
    setPalette(false);
    if (target.kind === 'board') go({ kind: 'board', boardId: target.id });
    else if (target.kind === 'collection') go({ kind: 'docs', collection: target.name, path: null });
    else if (target.kind === 'doc') openDoc(target.path);
    else if (target.kind === 'action') target.run();
    else {
      const r = target.result;
      if (r.vaultId !== vault.id) { onOpenVault(r.vaultId); return; }
      if (r.kind === 'doc') openDoc(r.ref);
      else { const [b, id] = r.ref.split('/'); openCard(b, id); }
    }
  };
  const paletteActions = [
    ...(boardsOn ? [{ label: 'New card', run: () => setDialog({ kind: 'capture', boardId: currentBoard?.id }) }] : []),
    ...(docsOn ? [{ label: 'New page', run: () => setDialog({ kind: 'new-page', parent: view.kind === 'docs' ? view.collection : '' }) }] : []),
    ...(boardsOn ? [{ label: 'New board', run: () => setDialog({ kind: 'new-board' }) }] : []),
    ...(docsOn ? [{ label: 'New collection', run: () => setDialog({ kind: 'new-collection' }) }] : []),
    { label: 'Go to Today', run: () => go({ kind: 'today' }) },
    ...(enabled('people') ? [{ label: 'Go to People (1:1s, feedback and reviews)', keywords: ['1:1', 'one on one', 'feedback', 'people', 'manager', 'review', 'performance'], run: () => go({ kind: 'people' }) }] : []),
    ...(enabled('time-off') ? [{ label: 'Go to Time off', keywords: ['vacation', 'holiday', 'leave', 'férias', 'absence', 'calendar'], run: () => go({ kind: 'time-off' }) }] : []),
    ...TOOLS.filter((t) => enabled(toolFeature(t.id))).map((t) => ({ label: `Open ${t.name}`, keywords: t.keywords, run: () => go({ kind: 'tool', toolId: t.id }) })),
    { label: 'Settings: features in this vault', keywords: ['settings', 'preferences', 'features', 'tools', 'hide', 'show', 'toggle', 'configurações'], run: () => setDialog({ kind: 'settings' }) },
    { label: 'Switch vault', run: onSwitchVault },
    { label: collapsed ? 'Expand sidebar' : 'Collapse sidebar', run: toggleSidebar }
  ];

  const closeDialog = () => setDialog(null);
  return (
    <WorkspaceContext.Provider value={workspace}>
      <div className="shell">
        <Sidebar view={view} collapsed={collapsed} onToggle={toggleSidebar} onSearch={() => setPalette(true)} onSwitchVault={onSwitchVault} onOpenVault={onOpenVault}
          onEditCollection={(c) => setDialog({ kind: 'edit-collection', collection: c })} openCountByBoard={openCountByBoard} collections={collections} myOpenCount={myOpenCount} />
        <div className="main-column">
          <TopBar crumbs={crumbs} canGoBack={nav.canGoBack} canGoForward={nav.canGoForward} onBack={nav.back} onForward={nav.forward} newEntries={newEntries} />
          <main className="stage">
            <AnimatePresence mode="wait" custom={nav.direction} initial={false}>
              <motion.div key={screenKey(view)} className="screen" custom={nav.direction} variants={viewMotion} initial="enter" animate="center" exit="exit" transition={ease}>
                {view.kind === 'today' && <TodayView />}
                {view.kind === 'board' && <BoardView boardId={view.boardId} cardId={view.cardId} onOpenSettings={() => setDialog({ kind: 'board-settings', boardId: view.boardId })} />}
                {view.kind === 'docs' && <DocsView collection={view.collection} path={view.path} onNewPage={(parent) => setDialog({ kind: 'new-page', parent })} />}
                {view.kind === 'conflicts' && <ConflictsView />}
                {view.kind === 'time-off' && <TimeOffView />}
                {view.kind === 'people' && <PeopleView person={view.person} meeting={view.meeting} review={view.review} tab={view.tab} />}
                {view.kind === 'tool' && <ToolScreen toolId={view.toolId} />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      <CommandPalette open={palette} actions={paletteActions} onClose={() => setPalette(false)} onSelect={jump} />
      <AnimatePresence>
        {dialog?.kind === 'new-board' && <NewBoardDialog key="nb" onClose={closeDialog} />}
        {dialog?.kind === 'new-collection' && <NewCollectionDialog key="nc" onClose={closeDialog} />}
        {dialog?.kind === 'edit-collection' && <EditCollectionDialog key="ec" collection={dialog.collection} onClose={closeDialog} />}
        {dialog?.kind === 'link' && <CreateLinkedPageDialog key="lk" title={dialog.title} parent={dialog.parent} onClose={closeDialog} />}
        {dialog?.kind === 'new-page' && <NewPageDialog key="np" parent={dialog.parent} onClose={closeDialog} />}
        {dialog?.kind === 'team' && <TeamDialog key="tm" onClose={closeDialog} />}
        {dialog?.kind === 'name' && <NameDialog key="nm" current={settings.userName} onClose={closeDialog} onSaved={() => { onSettingsChanged(); reload(); }} />}
        {dialog?.kind === 'settings' && <SettingsDialog key="st" onClose={closeDialog} />}
        {dialog?.kind === 'capture' && <QuickCapture key="qc" boardId={dialog.boardId} onClose={closeDialog} />}
        {dialog?.kind === 'board-settings' && data?.boards.find((b) => b.id === dialog.boardId) && (
          <BoardSettingsDialog key="bs" board={data.boards.find((b) => b.id === dialog.boardId)!} cardCount={data.cards.filter((c) => c.board === dialog.boardId).length}
            onClose={closeDialog} onSaved={reload} onDeleted={() => { reload(); go({ kind: 'today' }, true); }} />
        )}
      </AnimatePresence>
    </WorkspaceContext.Provider>
  );
}

function ToolScreen({ toolId }: { toolId: string }) {
  const tool = findTool(toolId);
  if (!tool) return <div className="page-scroll"><p className="empty-state">This tool does not exist.</p></div>;
  const Component = tool.component;
  return <Component />;
}
