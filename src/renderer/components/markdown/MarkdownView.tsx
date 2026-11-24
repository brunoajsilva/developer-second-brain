import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { renderMarkdown, renderMermaid } from '../../lib/markdown';

/** Rendered Markdown with clickable checklists, [[links]], footnotes and diagrams. */
export function MarkdownView({ text, vaultId, baseDir, onToggleTask, onOpenLink, empty, className }: {
  text: string;
  vaultId: string;
  baseDir: string;
  /** A checkbox on this (0-based) line of the source was clicked. */
  onToggleTask?: (line: number) => void;
  onOpenLink?: (target: string) => void;
  empty?: ReactNode;
  className?: string;
}) {
  const html = useMemo(() => renderMarkdown(text, { vaultId, baseDir }), [text, vaultId, baseDir]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) void renderMermaid(ref.current); }, [html]);
  if (!text.trim() && empty) return <>{empty}</>;
  return (
    <div
      ref={ref}
      className={'prose' + (className ? ' ' + className : '')}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target instanceof HTMLInputElement && target.dataset.line) {
          if (onToggleTask) onToggleTask(Number(target.dataset.line));
          else e.preventDefault();
          return;
        }
        const a = target.closest('a');
        if (!a) return;
        if (a.dataset.wiki) {
          e.preventDefault();
          onOpenLink?.(a.dataset.wiki);
        } else if (a.getAttribute('href')?.startsWith('#')) {
          e.preventDefault();
          const id = decodeURIComponent(a.getAttribute('href')!.slice(1));
          ref.current?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Toggles the "- [ ]" checkbox on a given line. Returns null if that line has none. */
export function toggleTaskOnLine(text: string, line: number): string | null {
  const lines = text.split('\n');
  const current = lines[line];
  if (current === undefined) return null;
  const next = current.replace(/\[([ xX])\]/, (_m, c: string) => (c === ' ' ? '[x]' : '[ ]'));
  if (next === current) return null;
  lines[line] = next;
  return lines.join('\n');
}
