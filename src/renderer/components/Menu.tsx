import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { popover, spring } from './motion';

export interface MenuAnchor {
  x: number;
  y: number;
}

export type MenuEntry =
  | { label: ReactNode; icon?: ReactNode; hint?: string; danger?: boolean; onSelect: () => void }
  | { separator: true }
  | { heading: string }
  | { custom: ReactNode };

/** Anchor just below (or above) a button, aligned to its left or right edge. */
export function anchorFrom(el: Element, align: 'start' | 'end' = 'start', side: 'below' | 'above' = 'below'): MenuAnchor & { align: 'start' | 'end'; side: 'below' | 'above' } {
  const r = el.getBoundingClientRect();
  return { x: align === 'start' ? r.left : r.right, y: side === 'below' ? r.bottom + 6 : r.top - 6, align, side };
}

/** Popover menu in a portal. Keyboard: ↑ ↓ to move, Enter to choose, Esc to close. */
export function Menu({ anchor, entries, onClose, minWidth = 220 }: {
  anchor: MenuAnchor & { align?: 'start' | 'end'; side?: 'below' | 'above' };
  entries: MenuEntry[];
  onClose: () => void;
  minWidth?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(-1);
  const actions = entries.map((e, i) => ('onSelect' in e ? i : -1)).filter((i) => i >= 0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = anchor.align === 'end' ? anchor.x - w : anchor.x;
    let top = anchor.side === 'above' ? anchor.y - h : anchor.y;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
    setPos({ left, top });
  }, [anchor.x, anchor.y, anchor.align, anchor.side]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const k = actions.indexOf(active);
        const next = e.key === 'ArrowDown' ? actions[(k + 1) % actions.length] : actions[(k - 1 + actions.length) % actions.length];
        setActive(next ?? -1);
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        const entry = entries[active];
        if ('onSelect' in entry) { onClose(); entry.onSelect(); }
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onClose);
    };
  });

  const origin = `${anchor.align === 'end' ? 'right' : 'left'} ${anchor.side === 'above' ? 'bottom' : 'top'}`;
  return createPortal(
    <motion.div ref={ref} className="menu" role="menu" style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, minWidth, transformOrigin: origin }}
      variants={popover} initial="hidden" animate="shown" exit="hidden" transition={spring}>
      {entries.map((e, i) => {
        if ('separator' in e) return <div key={i} className="menu-sep" />;
        if ('heading' in e) return <div key={i} className="menu-heading">{e.heading}</div>;
        if ('custom' in e) return <div key={i} className="menu-custom">{e.custom}</div>;
        return (
          <button key={i} role="menuitem" className={'menu-item' + (e.danger ? ' danger' : '') + (i === active ? ' active' : '')}
            onMouseEnter={() => setActive(i)} onClick={() => { onClose(); e.onSelect(); }}>
            {e.icon && <span className="menu-icon">{e.icon}</span>}
            <span className="grow">{e.label}</span>
            {e.hint && <kbd>{e.hint}</kbd>}
          </button>
        );
      })}
    </motion.div>,
    document.body
  );
}
