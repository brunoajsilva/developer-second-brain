import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { dialog, ease, fade, spring } from './motion';
import { CloseIcon } from './Icons';

interface ModalProps {
  title?: string;
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Extra class on the panel (e.g. the command palette). */
  className?: string;
  /** Distance from the top of the window. */
  placement?: 'center' | 'top';
}

/**
 * Animated dialog rendered in a portal (so transformed parents never trap it).
 * Wrap the conditional render in <AnimatePresence> to also animate the exit.
 */
export function Modal({ title, description, onClose, children, size = 'md', className, placement = 'top' }: ModalProps) {
  const close = useRef(onClose);
  close.current = onClose;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // only the top-most dialog reacts
      if (e.key !== 'Escape' || !panel.current || panel.current !== lastDialog()) return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return createPortal(
    <motion.div className={'scrim' + (placement === 'center' ? ' center' : '')} variants={fade} initial="hidden" animate="shown" exit="hidden" transition={ease}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div ref={panel} className={`dialog dialog-${size}${className ? ' ' + className : ''}`} role="dialog" aria-modal="true" aria-label={title}
        variants={dialog} initial="hidden" animate="shown" exit="hidden" transition={spring}>
        {title && (
          <header className="dialog-head">
            <div className="stack-xs">
              <h2>{title}</h2>
              {description && <p className="muted">{description}</p>}
            </div>
            <button className="icon-btn" aria-label="Close" onClick={onClose}><CloseIcon size={16} /></button>
          </header>
        )}
        {children}
      </motion.div>
    </motion.div>,
    document.body
  );
}

const lastDialog = () => {
  const all = document.querySelectorAll('[role="dialog"]');
  return all[all.length - 1] ?? null;
};

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="dialog-actions">{children}</div>;
}

export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} description={message} size="sm" onClose={onClose} placement="center">
      <DialogActions>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className={'btn ' + (danger ? 'danger' : 'primary')} autoFocus onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
      </DialogActions>
    </Modal>
  );
}
