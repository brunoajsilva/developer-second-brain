import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useToast } from '../../../components/Toast';
import { ease, spring } from '../../../components/motion';
import {
  ArchiveIcon, AudioIcon, BinaryFileIcon, CloseIcon, CodeIcon, CopyIcon, FontIcon, ImageIcon, JsonIcon, PageIcon, PasteIcon, SaveIcon, UnknownFileIcon, UploadIcon, VideoIcon, WarningIcon
} from '../../../components/Icons';
import { Base64Error, encodeBase64, formatBytes, hexDump, parseBase64, toUrlSafe, type ParsedBase64 } from './base64';
import { detectFileKind, type FileKind } from './file-signature';
import { FontPreview, ImagePreview, MediaPreview, PdfPreview, TextPreview, useObjectUrl, type PreviewFacts } from './Previews';

type Mode = 'decode' | 'encode';
type Tab = 'preview' | 'text' | 'hex';
const HEX_LIMIT = 16 * 1024;

/** Decodes base64 (or a data URI), recognises the file from its own bytes and renders it. Also encodes files. */
export function Base64Viewer() {
  const [mode, setMode] = useState<Mode>('decode');
  const [input, setInput] = useState('');
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const openFile = async (f: File) => {
    setFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    setMode('encode');
  };

  return (
    <div className="page-scroll" onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) void openFile(f); }}>
      <div className="tool-page">
        <header className="tool-head">
          <div className="stack-xs grow">
            <h1>Base64 viewer</h1>
            <p className="muted">Paste base64 or a data URI to see what is inside. The type comes from the bytes themselves, not from a name. Drop any file here to get its base64.</p>
          </div>
          <div className="segmented" role="tablist" aria-label="Direction">
            {(['decode', 'encode'] as Mode[]).map((m) => (
              <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m === 'decode' ? 'Base64 → file' : 'File → base64'}</button>
            ))}
          </div>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          {mode === 'decode'
            ? <motion.div key="decode" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={ease}><Decoder input={input} onInput={setInput} /></motion.div>
            : <motion.div key="encode" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={ease}>
                <Encoder file={file} onPick={() => fileInput.current?.click()} onClear={() => setFile(null)} onDecode={(b64) => { setInput(b64); setMode('decode'); toast('Sent to the decoder'); }} />
              </motion.div>}
        </AnimatePresence>
        <input ref={fileInput} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); e.target.value = ''; }} />
      </div>
      <AnimatePresence>
        {dragging && (
          <motion.div className="drop-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={ease}>
            <motion.div className="drop-card" initial={{ scale: 0.94 }} animate={{ scale: 1 }} transition={spring}><UploadIcon size={22} />Drop the file to get its base64</motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Decoder({ input, onInput }: { input: string; onInput: (s: string) => void }) {
  const [parsed, setParsed] = useState<ParsedBase64 | null>(null);
  const [error, setError] = useState('');
  // decode shortly after typing stops, so pasting megabytes stays smooth
  useEffect(() => {
    const t = setTimeout(() => {
      if (!input.trim()) { setParsed(null); setError(''); return; }
      try { setParsed(parseBase64(input)); setError(''); } catch (e) { setParsed(null); setError(e instanceof Base64Error ? e.message : String(e)); }
    }, 120);
    return () => clearTimeout(t);
  }, [input]);

  const paste = async () => onInput(await navigator.clipboard.readText());
  return (
    <div className="tool-grid">
      <section className="tool-input">
        <div className="tool-bar">
          <h2>Base64</h2>
          <span className="grow" />
          <button className="btn ghost small" onClick={() => void paste()}><PasteIcon size={14} />Paste</button>
          {input && <button className="btn ghost small" onClick={() => onInput('')}><CloseIcon size={14} />Clear</button>}
        </div>
        <textarea className="code-area" spellCheck={false} autoFocus value={input} onChange={(e) => onInput(e.target.value)}
          placeholder={'iVBORw0KGgoAAAANSUhEUgAA…\n\nAlso accepted: data:image/png;base64,…, base64url, line breaks and surrounding quotes.'} />
        <p className={'tool-status' + (error ? ' bad' : '')}>
          {error || (parsed
            ? `${input.length.toLocaleString()} characters · ${parsed.variant === 'url-safe' ? 'URL-safe alphabet' : 'standard alphabet'}${parsed.repairedPadding ? ' · padding added' : ''}`
            : 'Nothing decoded yet.')}
        </p>
      </section>
      {parsed
        ? <Result key={parsed.bytes.length + ':' + input.length} bytes={parsed.bytes} declaredMime={parsed.declaredMime} />
        : <section className="tool-result empty"><BinaryFileIcon size={28} /><p>The decoded file shows up here.</p></section>}
    </div>
  );
}

function Encoder({ file, onPick, onClear, onDecode }: { file: { name: string; bytes: Uint8Array } | null; onPick: () => void; onClear: () => void; onDecode: (b64: string) => void }) {
  const [dataUri, setDataUri] = useState(false);
  const [urlSafe, setUrlSafe] = useState(false);
  const [wrap, setWrap] = useState(false);
  const toast = useToast();
  const kind = useMemo(() => (file ? detectFileKind(file.bytes) : null), [file]);
  const raw = useMemo(() => (file ? encodeBase64(file.bytes) : ''), [file]);
  const output = useMemo(() => {
    let s = urlSafe ? toUrlSafe(raw) : raw;
    if (wrap) s = s.replace(/(.{76})/g, '$1\n');
    return dataUri && kind ? `data:${kind.mime};base64,${raw}` : s;
  }, [raw, urlSafe, wrap, dataUri, kind]);

  if (!file || !kind) {
    return (
      <button className="dropzone" onClick={onPick}>
        <UploadIcon size={26} />
        <b>Choose a file or drop it anywhere on this page</b>
        <span className="muted">It never leaves your computer.</span>
      </button>
    );
  }
  return (
    <div className="tool-grid">
      <section className="tool-input">
        <div className="tool-bar">
          <h2 className="ellipsis">{file.name}</h2>
          <span className="grow" />
          <button className="btn ghost small" onClick={onPick}>Choose another…</button>
          <button className="icon-btn" aria-label="Clear" onClick={onClear}><CloseIcon size={15} /></button>
        </div>
        <textarea className="code-area" readOnly spellCheck={false} value={output} />
        <div className="tool-options">
          <label className="check"><input type="checkbox" checked={dataUri} onChange={(e) => setDataUri(e.target.checked)} />Data URI</label>
          <label className="check"><input type="checkbox" checked={urlSafe} disabled={dataUri} onChange={(e) => setUrlSafe(e.target.checked)} />URL-safe</label>
          <label className="check"><input type="checkbox" checked={wrap} disabled={dataUri} onChange={(e) => setWrap(e.target.checked)} />Wrap at 76</label>
          <span className="grow" />
          <span className="muted small">{output.length.toLocaleString()} characters</span>
          <button className="btn ghost small" onClick={() => onDecode(output)}>Open in decoder</button>
          <button className="btn primary small" onClick={() => void navigator.clipboard.writeText(output).then(() => toast('Base64 copied'))}><CopyIcon size={14} />Copy</button>
        </div>
      </section>
      <Result bytes={file.bytes} declaredMime={null} fileName={file.name} />
    </div>
  );
}

const KIND_ICONS: Record<FileKind['preview'], ReactNode> = {
  image: <ImageIcon size={18} />, svg: <ImageIcon size={18} />, pdf: <PageIcon size={18} />, audio: <AudioIcon size={18} />, video: <VideoIcon size={18} />,
  font: <FontIcon size={18} />, json: <JsonIcon size={18} />, xml: <CodeIcon size={18} />, html: <CodeIcon size={18} />, text: <PageIcon size={18} />, binary: <ArchiveIcon size={18} />
};

/** What the bytes are, facts about them, and the best view for that type. */
function Result({ bytes, declaredMime, fileName }: { bytes: Uint8Array; declaredMime: string | null; fileName?: string }) {
  const kind = useMemo(() => detectFileKind(bytes), [bytes]);
  const textual = ['json', 'xml', 'html', 'text', 'svg'].includes(kind.preview);
  const canPreview = kind.preview !== 'binary' && kind.preview !== 'text';
  const [tab, setTab] = useState<Tab>(canPreview ? 'preview' : textual ? 'text' : 'hex');
  const [facts, setFacts] = useState<PreviewFacts>({});
  const [sha, setSha] = useState('');
  const url = useObjectUrl(bytes, kind.mime);
  const toast = useToast();

  useEffect(() => {
    setSha('');
    if (!crypto.subtle) return;
    void crypto.subtle.digest('SHA-256', bytes as BufferSource).then((h) => setSha(Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('')));
  }, [bytes]);

  const mismatch = declaredMime && declaredMime !== kind.mime && kind.mime !== 'application/octet-stream' && !(declaredMime === 'image/jpg' && kind.mime === 'image/jpeg');
  const tabs: [Tab, string][] = [...(canPreview ? [['preview', 'Preview'] as [Tab, string]] : []), ...(textual ? [['text', 'Text'] as [Tab, string]] : []), ['hex', 'Hex']];
  const saveName = fileName ?? `decoded.${kind.extension}`;

  return (
    <section className="tool-result">
      <header className="result-head">
        <span className={'kind-badge kind-' + kind.preview}>{kind.label === 'Unknown binary' ? <UnknownFileIcon size={18} /> : KIND_ICONS[kind.preview]}</span>
        <div className="stack-xs grow">
          <b>{kind.label}</b>
          <span className="muted small"><span className="mono">{kind.mime}</span> · {formatBytes(bytes.length)}{bytes.length >= 1024 ? ` (${bytes.length.toLocaleString()} bytes)` : ''}{facts.detail ? ` · ${facts.detail}` : ''}</span>
        </div>
        <button className="btn small" onClick={() => void navigator.clipboard.writeText(`data:${kind.mime};base64,${encodeBase64(bytes)}`).then(() => toast('Data URI copied'))}><CopyIcon size={14} />Data URI</button>
        <a className="btn primary small" href={url} download={saveName}><SaveIcon size={14} />Save .{kind.extension}</a>
      </header>
      {mismatch && <p className="banner warn"><WarningIcon size={15} />The data URI says <b className="mono">{declaredMime}</b>, but the bytes are {/^[AEIOU]/.test(kind.label) ? 'an' : 'a'} {kind.label}.</p>}
      {facts.error && <p className="banner error">{facts.error}</p>}

      <div className="result-tabs">
        <div className="segmented small" role="tablist">
          {tabs.map(([t, label]) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{label}</button>)}
        </div>
        {sha && <span className="sha mono" title="SHA-256 of the decoded bytes">sha256 {sha.slice(0, 16)}…<button className="icon-btn tiny" aria-label="Copy SHA-256" onClick={() => void navigator.clipboard.writeText(sha).then(() => toast('SHA-256 copied'))}><CopyIcon size={12} /></button></span>}
      </div>

      <div className="result-body">
        {tab === 'preview' && (
          (kind.preview === 'image' || kind.preview === 'svg') ? <ImagePreview bytes={bytes} kind={kind} onFacts={setFacts} />
          : kind.preview === 'pdf' ? <PdfPreview bytes={bytes} onFacts={setFacts} />
          : (kind.preview === 'audio' || kind.preview === 'video') ? <MediaPreview bytes={bytes} kind={kind} onFacts={setFacts} />
          : kind.preview === 'font' ? <FontPreview bytes={bytes} onFacts={setFacts} />
          : <TextPreview bytes={bytes} kind={kind} />
        )}
        {tab === 'text' && <TextPreview bytes={bytes} kind={kind} />}
        {tab === 'hex' && (
          <div className="preview-text">
            {!canPreview && !textual && <p className="muted small hex-note">There is no preview for this type. Save the file to open it with another app, or read the bytes below.</p>}
            <pre className="hex">{hexDump(bytes, HEX_LIMIT)}</pre>
            {bytes.length > HEX_LIMIT && <p className="muted small">Showing the first {HEX_LIMIT / 1024} KB of {formatBytes(bytes.length)}.</p>}
          </div>
        )}
      </div>
    </section>
  );
}
