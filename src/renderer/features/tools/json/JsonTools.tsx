import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../components/Toast';
import { CheckIcon, CloseIcon, CopyIcon, PasteIcon, WarningIcon } from '../../../components/Icons';
import { formatBytes } from '../base64/base64';
import { CodeBlock } from '../CodeBlock';
import { JsonSyntaxError, jsonStats, parseJson, printJson, type JsonStats } from './json-format';

type Mode = 'format' | 'minify';
type Indent = 2 | 4 | 'tab';

const SAMPLE = '{"id":9007199254740993,"name":"auth-service","replicas":3,"regions":["eu-west-1","us-east-1"],"healthy":true,"limits":{"cpu":"500m","memory":"256Mi"},"owner":null}';

/** Beautify and minify JSON, keeping numbers exact; explains syntax errors by line and column. */
export function JsonTools() {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('format');
  const [indent, setIndent] = useState<Indent>(2);
  const [sortKeys, setSortKeys] = useState(false);
  const [lenient, setLenient] = useState(false);
  const [debounced, setDebounced] = useState('');
  const toast = useToast();

  useEffect(() => { const t = setTimeout(() => setDebounced(input), 120); return () => clearTimeout(t); }, [input]);

  const result = useMemo((): { output: string; stats: JsonStats; duplicates: string[] } | { error: JsonSyntaxError } | null => {
    if (!debounced.trim()) return null;
    try {
      const parsed = parseJson(debounced, { lenient });
      return { output: printJson(parsed.root, { indent: mode === 'minify' ? 0 : indent, sortKeys }), stats: jsonStats(parsed.root), duplicates: parsed.duplicateKeys };
    } catch (e) {
      if (e instanceof JsonSyntaxError) return { error: e };
      throw e;
    }
  }, [debounced, mode, indent, sortKeys, lenient]);

  const ok = result && 'output' in result ? result : null;
  const error = result && 'error' in result ? result.error : null;

  return (
    <div className="page-scroll">
      <div className="tool-page">
        <header className="tool-head">
          <div className="stack-xs grow">
            <h1>JSON tools</h1>
            <p className="muted">Beautify or minify JSON. Numbers are kept exactly as written, so 64-bit ids are never rounded. Errors point to the line and column.</p>
          </div>
          <div className="segmented" role="tablist" aria-label="Mode">
            <button role="tab" aria-selected={mode === 'format'} className={mode === 'format' ? 'on' : ''} onClick={() => setMode('format')}>Beautify</button>
            <button role="tab" aria-selected={mode === 'minify'} className={mode === 'minify' ? 'on' : ''} onClick={() => setMode('minify')}>Minify</button>
          </div>
        </header>

        <div className="tool-grid even">
          <section className="tool-input">
            <div className="tool-bar">
              <h2>Input</h2>
              <span className="grow" />
              {!input && <button className="btn ghost small" onClick={() => setInput(SAMPLE)}>Try a sample</button>}
              <button className="btn ghost small" onClick={() => void navigator.clipboard.readText().then(setInput)}><PasteIcon size={14} />Paste</button>
              {input && <button className="btn ghost small" onClick={() => setInput('')}><CloseIcon size={14} />Clear</button>}
            </div>
            <textarea className="code-area" spellCheck={false} autoFocus value={input} onChange={(e) => setInput(e.target.value)} placeholder='{"paste": "your JSON here"}'
              onKeyDown={(e) => {
                // Tab inserts two spaces instead of leaving the field
                if (e.key !== 'Tab' || e.shiftKey) return;
                e.preventDefault();
                const t = e.currentTarget;
                const at = t.selectionStart;
                setInput(input.slice(0, at) + '  ' + input.slice(t.selectionEnd));
                requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = at + 2; });
              }} />
            <div className="tool-options">
              <label className="check" title="Accept // and /* */ comments and trailing commas, as in tsconfig.json"><input type="checkbox" checked={lenient} onChange={(e) => setLenient(e.target.checked)} />Allow comments and trailing commas</label>
            </div>
            {error && <ErrorDetail text={debounced} error={error} />}
          </section>

          <section className="tool-result">
            <div className="tool-bar">
              <h2>Output</h2>
              {ok && <span className="ok-pill"><CheckIcon size={13} />Valid JSON</span>}
              <span className="grow" />
              {mode === 'format' && (
                <label className="inline-select">
                  <span className="muted">Indent</span>
                  <select value={String(indent)} onChange={(e) => setIndent(e.target.value === 'tab' ? 'tab' : (Number(e.target.value) as 2 | 4))}>
                    <option value="2">2 spaces</option><option value="4">4 spaces</option><option value="tab">Tab</option>
                  </select>
                </label>
              )}
              <label className="check small-check"><input type="checkbox" checked={sortKeys} onChange={(e) => setSortKeys(e.target.checked)} />Sort keys</label>
              <button className="btn ghost small" disabled={!ok} onClick={() => ok && setInput(ok.output)}>Use as input</button>
              <button className="btn primary small" disabled={!ok} onClick={() => ok && void navigator.clipboard.writeText(ok.output).then(() => toast(mode === 'minify' ? 'Minified JSON copied' : 'Formatted JSON copied'))}><CopyIcon size={14} />Copy</button>
            </div>
            {ok
              ? <>
                  <CodeBlock code={ok.output} className={'output-code' + (mode === 'minify' ? ' wrap' : '')} />
                  <p className="tool-status">
                    {formatBytes(new Blob([ok.output]).size)} ({mode === 'minify' ? 'minified' : 'formatted'}, from {formatBytes(new Blob([debounced]).size)}) · {ok.stats.keys} keys · {ok.stats.values} values · depth {ok.stats.depth}
                  </p>
                  {ok.duplicates.length > 0 && <p className="banner warn inset"><WarningIcon size={15} />Duplicate keys: {ok.duplicates.map((k) => `“${k}”`).join(', ')}. Most parsers keep only the last one.</p>}
                  {ok.stats.unsafeNumbers.length > 0 && <p className="banner warn inset"><WarningIcon size={15} />{ok.stats.unsafeNumbers.length === 1 ? 'One number is' : `${ok.stats.unsafeNumbers.length} numbers are`} too large for JavaScript ({ok.stats.unsafeNumbers.slice(0, 3).join(', ')}). They are kept exact here, but JSON.parse would round them.</p>}
                </>
              : <div className="output-empty">{error ? 'Fix the error to see the result.' : 'The result shows up here as you type.'}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}

/** The offending line with a caret under the column. */
function ErrorDetail({ text, error }: { text: string; error: JsonSyntaxError }) {
  const lines = text.replace(/^﻿/, '').split('\n');
  const line = lines[error.line - 1] ?? '';
  // keep long lines readable: show a window around the column
  const start = Math.max(0, error.column - 60);
  const shown = (start > 0 ? '…' : '') + line.slice(start, start + 100);
  const caret = ' '.repeat(error.column - 1 - start + (start > 0 ? 1 : 0)) + '^';
  return (
    <div className="json-error" role="alert">
      <p>{error.message}</p>
      <pre>{`${String(error.line).padStart(4)} | ${shown}\n     | ${caret}`}</pre>
    </div>
  );
}
