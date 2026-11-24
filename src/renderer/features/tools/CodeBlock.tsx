import { useMemo } from 'react';
import hljs from 'highlight.js/lib/core';
import json from 'highlight.js/lib/languages/json';
import { useToast } from '../../components/Toast';
import { CopyIcon } from '../../components/Icons';

hljs.registerLanguage('json', json);

/** Highlighting large documents gets slow; above this size the text is shown plain. */
const HIGHLIGHT_LIMIT = 300_000;

/** Read-only code with JSON highlighting and a copy button. */
export function CodeBlock({ code, title, language = 'json', className }: { code: string; title?: string; language?: 'json' | 'text'; className?: string }) {
  const toast = useToast();
  const html = useMemo(
    () => (language === 'json' && code.length <= HIGHLIGHT_LIMIT ? hljs.highlight(code, { language: 'json', ignoreIllegals: true }).value : null),
    [code, language]
  );
  return (
    <div className={'code-block' + (className ? ' ' + className : '')}>
      {title && (
        <div className="code-block-bar">
          <span>{title}</span>
          <button className="icon-btn tiny" aria-label={`Copy ${title}`} title="Copy" onClick={() => void navigator.clipboard.writeText(code).then(() => toast(`${title} copied`))}><CopyIcon size={13} /></button>
        </div>
      )}
      {html !== null ? <pre dangerouslySetInnerHTML={{ __html: html }} /> : <pre>{code}</pre>}
    </div>
  );
}
