import { AnimatePresence, motion } from 'motion/react';
import { ChevronRightIcon, MoreIcon, PageIcon, PlusIcon } from '../../components/Icons';
import { spring } from '../../components/motion';
import { baseName, parentOf, withoutMd } from './doc-paths';
import type { DocSummary } from '../../../shared/types';

export interface TreeNode {
  key: string;
  name: string;
  doc?: DocSummary;
  children: TreeNode[];
  total: number;
}

/** Builds the page tree of one collection ('' = loose pages). Folders without a page still show as nodes. */
export function buildTree(docs: DocSummary[], base: string, folders: string[]): TreeNode {
  const root: TreeNode = { key: base, name: base, children: [], total: 0 };
  const nodes = new Map<string, TreeNode>([[base, root]]);
  const ensure = (key: string): TreeNode => {
    const existing = nodes.get(key);
    if (existing) return existing;
    const parent = ensure(parentOf(key) === '' && base ? base : parentOf(key));
    const node: TreeNode = { key, name: baseName(key), children: [], total: 0 };
    parent.children.push(node);
    nodes.set(key, node);
    return node;
  };
  for (const f of folders) if (f !== base && (!base || f.startsWith(base + '/'))) ensure(f);
  for (const d of docs) {
    const node = ensure(withoutMd(d.path));
    node.doc = d;
    node.name = d.title || baseName(withoutMd(d.path));
  }
  const finish = (n: TreeNode): number => {
    n.children.sort((a, b) => a.name.localeCompare(b.name));
    n.total = n.children.reduce((t, c) => t + finish(c), n.doc ? 1 : 0);
    return n.total;
  };
  finish(root);
  return root;
}

export interface TreeActions {
  toggle: (key: string) => void;
  open: (path: string) => void;
  dropTarget: string | null;
  setDropTarget: (key: string | null) => void;
  drop: (targetKey: string, e: React.DragEvent) => void;
  newSubPage: (key: string) => void;
  menu: (x: number, y: number, key: string) => void;
}

export function PageTree({ node, depth, activePath, collapsed, actions }: { node: TreeNode; depth: number; activePath: string | null; collapsed: Set<string>; actions: TreeActions }) {
  return (
    <ul className="tree" role={depth === 0 ? 'tree' : 'group'}>
      {node.children.map((child) => {
        const isCollapsed = collapsed.has(child.key);
        const hasChildren = child.children.length > 0;
        const active = !!child.doc && child.doc.path === activePath;
        return (
          <li key={child.key} role="treeitem" aria-expanded={hasChildren ? !isCollapsed : undefined} aria-selected={active}>
            <div className={'tree-row' + (active ? ' active' : '') + (actions.dropTarget === child.key ? ' drop-over' : '')} style={{ paddingLeft: 6 + depth * 14 }}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData('text/x-page', child.key); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); actions.setDropTarget(child.key); }}
              onDragLeave={() => actions.setDropTarget(null)}
              onDrop={(e) => actions.drop(child.key, e)}
              onContextMenu={(e) => { e.preventDefault(); actions.menu(e.clientX, e.clientY, child.key); }}>
              {active && <motion.span layoutId="tree-pill" className="tree-pill" transition={spring} />}
              <button className="tree-toggle" tabIndex={hasChildren ? 0 : -1} aria-label={isCollapsed ? 'Expand' : 'Collapse'} style={{ visibility: hasChildren ? 'visible' : 'hidden' }} onClick={() => actions.toggle(child.key)}>
                <motion.span animate={{ rotate: isCollapsed ? 0 : 90 }} transition={spring} style={{ display: 'inline-flex' }}><ChevronRightIcon size={14} /></motion.span>
              </button>
              <button className="tree-label" title={child.name} onClick={() => (child.doc ? actions.open(child.doc.path) : actions.toggle(child.key))}>
                <PageIcon size={15} className="faint" /><span>{child.name}</span>
              </button>
              <span className="tree-actions">
                <button className="icon-btn tiny" title="New sub-page" aria-label={`New sub-page in ${child.name}`} onClick={() => actions.newSubPage(child.key)}><PlusIcon size={14} /></button>
                <button className="icon-btn tiny" title="More actions" aria-label={`Actions for ${child.name}`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); actions.menu(r.left, r.bottom + 4, child.key); }}><MoreIcon size={14} /></button>
              </span>
            </div>
            <AnimatePresence initial={false}>
              {hasChildren && !isCollapsed && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} style={{ overflow: 'hidden' }}>
                  <PageTree node={child} depth={depth + 1} activePath={activePath} collapsed={collapsed} actions={actions} />
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
