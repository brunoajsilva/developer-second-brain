import { describe, expect, it } from 'vitest';
import { Base64Error, encodeBase64, hexDump, parseBase64, toUrlSafe } from '../../src/renderer/features/tools/base64/base64';
import { detectFileKind } from '../../src/renderer/features/tools/base64/file-signature';

const bytes = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x])));
const text = (s: string) => new TextEncoder().encode(s);

describe('parseBase64', () => {
  const png = bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
  const b64 = encodeBase64(png);

  it('round-trips plain base64', () => {
    expect(Array.from(parseBase64(b64).bytes)).toEqual(Array.from(png));
  });

  it('accepts data URIs and reports the declared type', () => {
    const r = parseBase64(`data:image/png;base64,${b64}`);
    expect(r.declaredMime).toBe('image/png');
    expect(r.bytes.length).toBe(png.length);
  });

  it('accepts base64url without padding, quotes and line breaks', () => {
    const raw = new Uint8Array([251, 255, 254, 1, 2]);
    const url = toUrlSafe(encodeBase64(raw));
    expect(url).toMatch(/[-_]/);
    const r = parseBase64(`"${url.slice(0, 3)}\n${url.slice(3)}"`);
    expect(Array.from(r.bytes)).toEqual(Array.from(raw));
    expect(r.variant).toBe('url-safe');
    expect(r.repairedPadding).toBe(true);
  });

  it('explains what is wrong', () => {
    expect(() => parseBase64('abc$def')).toThrow(/“\$” is not a base64 character \(position 4\)/);
    expect(() => parseBase64('ab=cd')).toThrow(/only appear at the end/);
    expect(() => parseBase64('abcde')).toThrow(/cut short/);
    expect(() => parseBase64('   ')).toThrow(Base64Error);
    expect(() => parseBase64('data:text/plain,hello')).toThrow(/not base64-encoded/);
  });

  it('encodes large inputs without overflowing the stack', () => {
    const big = new Uint8Array(3_000_000).map((_, i) => i % 251);
    expect(parseBase64(encodeBase64(big)).bytes.length).toBe(big.length);
  });
});

describe('detectFileKind', () => {
  it.each([
    [bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a), 'png', 'image'],
    [bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 'JFIF'), 'jpg', 'image'],
    [bytes('GIF89a', 1, 0), 'gif', 'image'],
    [bytes('RIFF', 0, 0, 0, 0, 'WEBPVP8 '), 'webp', 'image'],
    [bytes('%PDF-1.7\n'), 'pdf', 'pdf'],
    [bytes(0, 0, 0, 0x18, 'ftypmp42', 0, 0, 0, 0), 'mp4', 'video'],
    [bytes(0, 0, 0, 0x1c, 'ftypavif'), 'avif', 'image'],
    [bytes('ID3', 4, 0), 'mp3', 'audio'],
    [bytes('RIFF', 0, 0, 0, 0, 'WAVEfmt '), 'wav', 'audio'],
    [bytes('wOF2', 0, 1), 'woff2', 'font'],
    [bytes(0x1f, 0x8b, 8, 0), 'gz', 'binary'],
    [bytes('MZ', 0x90, 0), 'exe', 'binary'],
    [bytes('SQLite format 3', 0), 'sqlite', 'binary'],
    [bytes(0, 'asm', 1, 0, 0, 0), 'wasm', 'binary']
  ])('recognises %#', (input, extension, preview) => {
    const k = detectFileKind(input);
    expect(k.extension).toBe(extension);
    expect(k.preview).toBe(preview);
  });

  it('tells Office files apart inside ZIPs', () => {
    expect(detectFileKind(bytes('PK', 3, 4, 'xxxx[Content_Types].xmlword/document.xml')).extension).toBe('docx');
    expect(detectFileKind(bytes('PK', 3, 4, 'xl/workbook.xml')).extension).toBe('xlsx');
    expect(detectFileKind(bytes('PK', 3, 4, 'readme.txt')).extension).toBe('zip');
  });

  it('recognises text formats', () => {
    expect(detectFileKind(text('{"a": [1, 2]}')).preview).toBe('json');
    expect(detectFileKind(text('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')).preview).toBe('svg');
    expect(detectFileKind(text('<svg viewBox="0 0 1 1"></svg>')).preview).toBe('svg');
    expect(detectFileKind(text('<?xml version="1.0"?><note/>')).preview).toBe('xml');
    expect(detectFileKind(text('<!DOCTYPE html><html></html>')).preview).toBe('html');
    expect(detectFileKind(text('-----BEGIN CERTIFICATE-----\nMIIB')).extension).toBe('pem');
    expect(detectFileKind(text('Olá, mundo — texto simples')).preview).toBe('text');
    expect(detectFileKind(text('BMW is not a bitmap')).preview).toBe('text');
    expect(detectFileKind(text('{ not json')).preview).toBe('text');
  });

  it('falls back to unknown binary', () => {
    expect(detectFileKind(new Uint8Array([1, 2, 3, 0, 200, 7])).label).toBe('Unknown binary');
    expect(detectFileKind(new Uint8Array()).label).toBe('Empty');
  });
});

describe('hexDump', () => {
  it('prints offset, hex and printable ASCII', () => {
    expect(hexDump(text('Hello\nWorld'))).toBe('00000000  48 65 6c 6c 6f 0a 57 6f 72 6c 64                 Hello·World');
  });
});
