import { useEffect, useMemo, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { desenharMermaid, renderMarkdown } from '../lib/markdown';
import type { DocResumo } from '../../shared/types';

const realce = HighlightStyle.define([
  { tag: t.heading, fontWeight: '600', color: 'var(--tinta)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: [t.link, t.url], color: 'var(--terra)' },
  { tag: t.monospace, color: 'var(--salvia)' },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: 'var(--tinta3)' },
  { tag: t.quote, color: 'var(--tinta2)' }
]);

/** Markdown editor (CodeMirror) with [[ autocompletion and image paste. */
export function Editor({ texto, onMudou, docs, onImagem, dica, foco = true }: {
  texto: string;
  onMudou: (t: string) => void;
  docs: DocResumo[];
  onImagem?: (f: File) => Promise<string>;
  dica?: string;
  foco?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const cb = useRef(onMudou); cb.current = onMudou;
  const dr = useRef(docs); dr.current = docs;
  const im = useRef(onImagem); im.current = onImagem;
  useEffect(() => {
    const completar = (c: CompletionContext) => {
      const m = c.matchBefore(/\[\[[^\]\n]*/);
      if (!m) return null;
      return { from: m.from + 2, options: dr.current.map((d) => ({ label: d.titulo || d.path, detail: d.path.includes('/') ? d.path.slice(0, d.path.lastIndexOf('/')) : '', apply: (d.titulo || d.path) + ']]' })) };
    };
    const view = new EditorView({
      parent: el.current!,
      state: EditorState.create({
        doc: texto,
        extensions: [
          history(), keymap.of([...defaultKeymap, ...historyKeymap]), markdown(), syntaxHighlighting(realce), EditorView.lineWrapping,
          placeholder(dica ?? 'Write in Markdown. Type [[ to link another page.'), autocompletion({ override: [completar] }),
          EditorView.updateListener.of((u) => { if (u.docChanged) cb.current(u.state.doc.toString()); }),
          EditorView.domEventHandlers({
            paste(e, v) {
              const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'));
              if (!f || !im.current) return false;
              e.preventDefault();
              void im.current(f).then((rel) => v.dispatch(v.state.replaceSelection(`![](${rel})`)));
              return true;
            }
          })
        ]
      })
    });
    if (foco) view.focus();
    return () => view.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={el} className="editor-md" />;
}

/** Rendered Markdown with clickable checklists, [[links]] and footnotes. */
export function VistaMd({ texto, cofreId, baseDir, onTarefa, onLiga, vazio, className }: {
  texto: string;
  cofreId: string;
  baseDir: string;
  onTarefa?: (linha: number) => void;
  onLiga?: (alvo: string) => void;
  vazio?: React.ReactNode;
  className?: string;
}) {
  const html = useMemo(() => renderMarkdown(texto, { cofreId, baseDir }), [texto, cofreId, baseDir]);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) void desenharMermaid(ref.current); }, [html]);
  if (!texto.trim() && vazio) return <>{vazio}</>;
  return (
    <div className={'md' + (className ? ' ' + className : '')} ref={ref}
      onClick={(e) => {
        const alvo = e.target as HTMLElement;
        if (alvo instanceof HTMLInputElement && alvo.dataset.linha) {
          if (onTarefa) onTarefa(Number(alvo.dataset.linha)); else e.preventDefault();
          return;
        }
        const a = alvo.closest('a');
        if (!a) return;
        if (a.dataset.wiki) { e.preventDefault(); onLiga?.(a.dataset.wiki); }
        else if (a.getAttribute('href')?.startsWith('#')) {
          e.preventDefault();
          const id = decodeURIComponent(a.getAttribute('href')!.slice(1));
          ref.current?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }}
      dangerouslySetInnerHTML={{ __html: html }} />
  );
}

/** Toggles the "- [ ]" checkbox on a given line. */
export function alternarLinha(texto: string, linha: number): string | null {
  const ls = texto.split('\n');
  const l = ls[linha];
  if (l === undefined) return null;
  const nova = l.replace(/\[([ xX])\]/, (_m, c: string) => (c === ' ' ? '[x]' : '[ ]'));
  if (nova === l) return null;
  ls[linha] = nova;
  return ls.join('\n');
}
