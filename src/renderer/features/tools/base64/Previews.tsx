import { useEffect, useMemo, useRef, useState } from 'react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { FileKind } from './file-signature';

export interface PreviewFacts {
  /** e.g. "1920 × 1080", "12 pages", "3:21" */
  detail?: string;
  error?: string;
}

/** Object URL for the bytes, revoked when they change or the preview unmounts. */
export function useObjectUrl(bytes: Uint8Array, mime: string): string {
  const url = useMemo(() => URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime })), [bytes, mime]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return url;
}

export function ImagePreview({ bytes, kind, onFacts }: { bytes: Uint8Array; kind: FileKind; onFacts: (f: PreviewFacts) => void }) {
  const url = useObjectUrl(bytes, kind.mime);
  return (
    <div className="preview-canvas checker">
      <img src={url} alt="Decoded file" onLoad={(e) => onFacts({ detail: `${e.currentTarget.naturalWidth} × ${e.currentTarget.naturalHeight} px` })}
        onError={() => onFacts({ error: 'The bytes look like this format, but the image is damaged or incomplete.' })} />
    </div>
  );
}

export function MediaPreview({ bytes, kind, onFacts }: { bytes: Uint8Array; kind: FileKind; onFacts: (f: PreviewFacts) => void }) {
  const url = useObjectUrl(bytes, kind.mime);
  const facts = (d: number) => {
    if (!Number.isFinite(d)) return;
    const m = Math.floor(d / 60);
    onFacts({ detail: `${m}:${String(Math.round(d % 60)).padStart(2, '0')} long` });
  };
  const fail = () => onFacts({ error: 'This build of Chromium cannot play this file. Save it and open it with another app.' });
  return (
    <div className="preview-canvas media">
      {kind.preview === 'audio'
        ? <audio src={url} controls onLoadedMetadata={(e) => facts(e.currentTarget.duration)} onError={fail} />
        : <video src={url} controls onLoadedMetadata={(e) => facts(e.currentTarget.duration)} onError={fail} />}
    </div>
  );
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
const loadPdfJs = () => (pdfjsPromise ??= import('pdfjs-dist').then((m) => { m.GlobalWorkerOptions.workerSrc = workerUrl; return m; }));
const MAX_PDF_PAGES = 40;

/** Draws every page (up to 40) with pdf.js; works without Chromium's PDF plugin. */
export function PdfPreview({ bytes, onFacts }: { bytes: Uint8Array; onFacts: (f: PreviewFacts) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const el = host.current!;
    el.replaceChildren();
    (async () => {
      const pdfjs = await loadPdfJs();
      // pdf.js takes ownership of the buffer it gets, so give it a copy
      const doc = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
      if (cancelled) return;
      setPages(doc.numPages);
      onFacts({ detail: `${doc.numPages} page${doc.numPages === 1 ? '' : 's'}` });
      const width = Math.min(el.clientWidth - 32, 900);
      for (let n = 1; n <= Math.min(doc.numPages, MAX_PDF_PAGES) && !cancelled; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = width / base.width;
        const viewport = page.getViewport({ scale: scale * window.devicePixelRatio });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${base.width * scale}px`;
        canvas.className = 'pdf-page';
        el.append(canvas);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
      }
    })().catch((e: unknown) => !cancelled && onFacts({ error: `The PDF could not be opened: ${e instanceof Error ? e.message : String(e)}` }));
    return () => { cancelled = true; };
  }, [bytes]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="preview-canvas pdf">
      <div ref={host} className="pdf-pages" />
      {pages > MAX_PDF_PAGES && <p className="muted small">Showing the first {MAX_PDF_PAGES} of {pages} pages. Save the file to see the rest.</p>}
    </div>
  );
}

let fontCounter = 0;
export function FontPreview({ bytes, onFacts }: { bytes: Uint8Array; onFacts: (f: PreviewFacts) => void }) {
  const [family, setFamily] = useState('');
  useEffect(() => {
    const name = `decoded-font-${++fontCounter}`;
    const face = new FontFace(name, bytes.slice().buffer);
    face.load()
      .then((f) => { document.fonts.add(f); setFamily(name); })
      .catch(() => onFacts({ error: 'The font could not be loaded; it may be damaged.' }));
    return () => { document.fonts.delete(face); };
  }, [bytes]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!family) return <div className="preview-canvas" />;
  return (
    <div className="preview-canvas font" style={{ fontFamily: family }}>
      <p style={{ fontSize: 44 }}>The quick brown fox jumps over the lazy dog</p>
      <p style={{ fontSize: 22 }}>ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz</p>
      <p style={{ fontSize: 22 }}>0123456789 !?&amp;@#%(){'{}'}[] áéíóú ãõ ç</p>
      <p style={{ fontSize: 14 }}>Pack my box with five dozen liquor jugs. Sphinx of black quartz, judge my vow.</p>
    </div>
  );
}

const MAX_TEXT = 400_000;

export function TextPreview({ bytes, kind }: { bytes: Uint8Array; kind: FileKind }) {
  const text = useMemo(() => {
    const raw = new TextDecoder().decode(bytes.subarray(0, MAX_TEXT)).replace(/^﻿/, '');
    if (kind.preview !== 'json') return raw;
    try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
  }, [bytes, kind.preview]);
  return (
    <div className="preview-text">
      <pre>{text}</pre>
      {bytes.length > MAX_TEXT && <p className="muted small">Showing the first {Math.round(MAX_TEXT / 1000)} KB.</p>}
    </div>
  );
}
