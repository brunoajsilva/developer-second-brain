import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import type { DocSummary } from '../../../shared/types';

const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '650', color: 'var(--ink)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: [t.link, t.url], color: 'var(--accent)' },
  { tag: t.monospace, color: 'var(--code-ink)' },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: 'var(--ink-3)' },
  { tag: t.quote, color: 'var(--ink-2)' }
]);

/** Markdown editor (CodeMirror) with [[ page autocompletion and image paste. */
export function MarkdownEditor({ text, onChange, docs, onPasteImage, hint, autoFocus = true }: {
  text: string;
  onChange: (text: string) => void;
  docs: DocSummary[];
  /** Saves a pasted image and returns the path to insert. */
  onPasteImage?: (file: File) => Promise<string>;
  hint?: string;
  autoFocus?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  const pages = useRef(docs);
  pages.current = docs;
  const pasteImage = useRef(onPasteImage);
  pasteImage.current = onPasteImage;

  useEffect(() => {
    const completePages = (ctx: CompletionContext) => {
      const m = ctx.matchBefore(/\[\[[^\]\n]*/);
      if (!m) return null;
      return {
        from: m.from + 2,
        options: pages.current.map((d) => ({ label: d.title || d.path, detail: d.path.includes('/') ? d.path.slice(0, d.path.lastIndexOf('/')) : '', apply: (d.title || d.path) + ']]' }))
      };
    };
    const view = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: text,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          syntaxHighlighting(highlight),
          EditorView.lineWrapping,
          placeholder(hint ?? 'Write in Markdown. Type [[ to link another page.'),
          autocompletion({ override: [completePages] }),
          EditorView.updateListener.of((u) => { if (u.docChanged) changed.current(u.state.doc.toString()); }),
          EditorView.domEventHandlers({
            paste(e, v) {
              const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
              if (!file || !pasteImage.current) return false;
              e.preventDefault();
              void pasteImage.current(file).then((rel) => v.dispatch(v.state.replaceSelection(`![](${rel})`)));
              return true;
            }
          })
        ]
      })
    });
    if (autoFocus) view.focus();
    return () => view.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={host} className="md-editor" />;
}
