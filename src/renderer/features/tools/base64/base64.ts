// Parsing base64 the way developers paste it: data URIs, base64url, line breaks, quotes, missing padding.

export interface ParsedBase64 {
  bytes: Uint8Array;
  /** MIME type declared by a data: URI, if any. */
  declaredMime: string | null;
  variant: 'standard' | 'url-safe';
  /** Padding was missing and has been added. */
  repairedPadding: boolean;
}

export class Base64Error extends Error {
  constructor(message: string, readonly position?: number) {
    super(message);
  }
}

const DATA_URI = /^data:([\w.+-]+\/[\w.+-]+)?((?:;[\w-]+=[^;,]*)*)(;base64)?,/i;

export function parseBase64(input: string): ParsedBase64 {
  let text = input.trim().replace(/^["'`]|["'`]$/g, '').trim();
  let declaredMime: string | null = null;
  const uri = text.match(DATA_URI);
  if (uri) {
    if (!uri[3]) throw new Base64Error('This data URI is not base64-encoded (it has no ";base64").');
    declaredMime = uri[1]?.toLowerCase() ?? null;
    text = text.slice(uri[0].length);
  }
  // line breaks and spaces (MIME, PEM, pretty-printed JSON strings) and escaped newlines
  text = text.replace(/\\[nr]/g, '').replace(/\s+/g, '');
  if (!text) throw new Base64Error('Paste some base64 to decode.');

  const invalid = text.search(/[^A-Za-z0-9+/\-_=]/);
  if (invalid >= 0) throw new Base64Error(`“${text[invalid]}” is not a base64 character (position ${invalid + 1}).`, invalid);
  const urlSafe = /[-_]/.test(text);
  if (urlSafe && /[+/]/.test(text)) throw new Base64Error('This mixes standard (+ /) and URL-safe (- _) base64 characters.');
  const firstPad = text.indexOf('=');
  if (firstPad >= 0 && !/^=+$/.test(text.slice(firstPad))) throw new Base64Error(`Padding “=” can only appear at the end (position ${firstPad + 1}).`, firstPad);

  let body = text.replace(/=+$/, '');
  const missingPadding = body.length % 4 !== 0 && !text.endsWith('=');
  if (body.length % 4 === 1) throw new Base64Error('The base64 is cut short: its length is not valid. Check that you copied all of it.');
  if (urlSafe) body = body.replace(/-/g, '+').replace(/_/g, '/');
  const padded = body + '='.repeat((4 - (body.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, declaredMime, variant: urlSafe ? 'url-safe' : 'standard', repairedPadding: missingPadding };
}

/** Bytes → base64 (standard alphabet, padded). Works in chunks so large files do not overflow the stack. */
export function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export const toUrlSafe = (b64: string) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/** Classic hex dump: offset, 16 bytes in hex, printable ASCII. */
export function hexDump(bytes: Uint8Array, limit = bytes.length): string {
  const lines: string[] = [];
  const end = Math.min(bytes.length, limit);
  for (let offset = 0; offset < end; offset += 16) {
    const row = bytes.subarray(offset, Math.min(offset + 16, end));
    const hex = Array.from(row, (b) => b.toString(16).padStart(2, '0')).join(' ');
    const ascii = Array.from(row, (b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '·')).join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex.padEnd(47, ' ')}  ${ascii}`);
  }
  return lines.join('\n');
}
