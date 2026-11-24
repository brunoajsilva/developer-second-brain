// Recognises a file from its own bytes ("magic numbers"), not from a name or a declared type.

export type Preview = 'image' | 'pdf' | 'audio' | 'video' | 'font' | 'svg' | 'json' | 'xml' | 'html' | 'text' | 'binary';

export interface FileKind {
  /** Short name shown to people, e.g. "PNG image". */
  label: string;
  mime: string;
  extension: string;
  preview: Preview;
}

const kind = (label: string, mime: string, extension: string, preview: Preview): FileKind => ({ label, mime, extension, preview });

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, Math.min(end, b.length)));
const asciiAt = (b: Uint8Array, text: string, offset = 0) => ascii(b, offset, offset + text.length) === text;

/** ZIP-based formats tell themselves apart by the names of the files inside. */
function zipKind(b: Uint8Array): FileKind {
  const head = ascii(b, 0, Math.min(b.length, 4096));
  if (head.includes('mimetypeapplication/epub+zip')) return kind('EPUB book', 'application/epub+zip', 'epub', 'binary');
  if (head.includes('word/')) return kind('Word document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx', 'binary');
  if (head.includes('xl/')) return kind('Excel workbook', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx', 'binary');
  if (head.includes('ppt/')) return kind('PowerPoint deck', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx', 'binary');
  if (head.includes('META-INF/MANIFEST.MF')) return kind('Java archive', 'application/java-archive', 'jar', 'binary');
  if (head.includes('AndroidManifest.xml')) return kind('Android package', 'application/vnd.android.package-archive', 'apk', 'binary');
  return kind('ZIP archive', 'application/zip', 'zip', 'binary');
}

/** ISO base media (MP4, MOV, HEIC, AVIF…): the brand sits at offset 8. */
function isoKind(b: Uint8Array): FileKind | null {
  if (!asciiAt(b, 'ftyp', 4)) return null;
  const brand = ascii(b, 8, 12);
  if (brand === 'avif' || brand === 'avis') return kind('AVIF image', 'image/avif', 'avif', 'image');
  if (['heic', 'heix', 'hevc', 'mif1', 'msf1'].includes(brand)) return kind('HEIC image', 'image/heic', 'heic', 'binary');
  if (brand === 'qt  ') return kind('QuickTime video', 'video/quicktime', 'mov', 'video');
  if (brand.startsWith('M4A') || brand === 'M4B ') return kind('M4A audio', 'audio/mp4', 'm4a', 'audio');
  if (brand.startsWith('3g')) return kind('3GP video', 'video/3gpp', '3gp', 'video');
  return kind('MP4 video', 'video/mp4', 'mp4', 'video');
}

function isUtf8Text(b: Uint8Array): boolean {
  const sample = b.subarray(0, 64 * 1024);
  if (sample.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(sample.length < b.length ? trimPartialChar(sample) : sample);
  } catch {
    return false;
  }
  // mostly printable (allow tabs/newlines)
  let control = 0;
  for (const c of sample) if (c < 0x20 && c !== 9 && c !== 10 && c !== 13) control++;
  return control / Math.max(1, sample.length) < 0.02;
}

/** Drops a multi-byte UTF-8 character cut in half at the end of a sample. */
function trimPartialChar(b: Uint8Array): Uint8Array {
  let end = b.length;
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const c = b[end - i];
    if ((c & 0xc0) === 0x80) continue; // continuation byte
    const need = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 1;
    if (need > i) end -= i;
    break;
  }
  return b.subarray(0, end);
}

function textKind(b: Uint8Array): FileKind {
  const text = new TextDecoder().decode(b.subarray(0, 4096)).replace(/^﻿/, '').trimStart();
  if (/^<svg[\s>]/i.test(text) || (/^<\?xml/i.test(text) && /<svg[\s>]/i.test(text))) return kind('SVG image', 'image/svg+xml', 'svg', 'svg');
  if (/^<!doctype html|^<html[\s>]/i.test(text)) return kind('HTML document', 'text/html', 'html', 'html');
  if (/^<\?xml|^<[A-Za-z][\w:.-]*[\s>/]/.test(text)) return kind('XML document', 'application/xml', 'xml', 'xml');
  if (/^[[{]/.test(text)) {
    try {
      JSON.parse(new TextDecoder().decode(b));
      return kind('JSON', 'application/json', 'json', 'json');
    } catch { /* not JSON after all */ }
  }
  if (/^-----BEGIN [A-Z ]+-----/.test(text)) return kind('PEM text (key or certificate)', 'application/x-pem-file', 'pem', 'text');
  if (/^%!PS/.test(text)) return kind('PostScript', 'application/postscript', 'ps', 'text');
  if (/^(BEGIN:VCALENDAR)/.test(text)) return kind('Calendar (ICS)', 'text/calendar', 'ics', 'text');
  return kind('Text', 'text/plain', 'txt', 'text');
}

export function detectFileKind(b: Uint8Array): FileKind {
  if (b.length === 0) return kind('Empty', 'application/octet-stream', 'bin', 'binary');
  // images
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return kind('PNG image', 'image/png', 'png', 'image');
  if (startsWith(b, [0xff, 0xd8, 0xff])) return kind('JPEG image', 'image/jpeg', 'jpg', 'image');
  if (asciiAt(b, 'GIF87a') || asciiAt(b, 'GIF89a')) return kind('GIF image', 'image/gif', 'gif', 'image');
  if (asciiAt(b, 'RIFF') && asciiAt(b, 'WEBP', 8)) return kind('WebP image', 'image/webp', 'webp', 'image');
  if (asciiAt(b, 'BM') && b.length > 18 && [12, 40, 52, 56, 108, 124].includes(b[14] | (b[15] << 8))) return kind('BMP image', 'image/bmp', 'bmp', 'image');
  if (startsWith(b, [0x00, 0x00, 0x01, 0x00])) return kind('Icon (ICO)', 'image/x-icon', 'ico', 'image');
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00]) || startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) return kind('TIFF image', 'image/tiff', 'tiff', 'binary');
  if (asciiAt(b, '8BPS')) return kind('Photoshop document', 'image/vnd.adobe.photoshop', 'psd', 'binary');
  // documents
  if (asciiAt(b, '%PDF-')) return kind('PDF document', 'application/pdf', 'pdf', 'pdf');
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return kind('Legacy Office document', 'application/x-ole-storage', 'doc', 'binary');
  if (asciiAt(b, '{\\rtf')) return kind('Rich Text (RTF)', 'application/rtf', 'rtf', 'text');
  // audio and video
  const iso = isoKind(b);
  if (iso) return iso;
  if (asciiAt(b, 'RIFF') && asciiAt(b, 'WAVE', 8)) return kind('WAV audio', 'audio/wav', 'wav', 'audio');
  if (asciiAt(b, 'RIFF') && asciiAt(b, 'AVI ', 8)) return kind('AVI video', 'video/x-msvideo', 'avi', 'binary');
  if (asciiAt(b, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && (b[1] & 0x06) !== 0)) return kind('MP3 audio', 'audio/mpeg', 'mp3', 'audio');
  if (asciiAt(b, 'OggS')) return kind('Ogg audio', 'audio/ogg', 'ogg', 'audio');
  if (asciiAt(b, 'fLaC')) return kind('FLAC audio', 'audio/flac', 'flac', 'audio');
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return kind('WebM / Matroska video', 'video/webm', 'webm', 'video');
  // fonts
  if (asciiAt(b, 'wOFF')) return kind('WOFF font', 'font/woff', 'woff', 'font');
  if (asciiAt(b, 'wOF2')) return kind('WOFF2 font', 'font/woff2', 'woff2', 'font');
  if (startsWith(b, [0x00, 0x01, 0x00, 0x00])) return kind('TrueType font', 'font/ttf', 'ttf', 'font');
  if (asciiAt(b, 'OTTO')) return kind('OpenType font', 'font/otf', 'otf', 'font');
  // archives
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])) return zipKind(b);
  if (startsWith(b, [0x1f, 0x8b])) return kind('Gzip archive', 'application/gzip', 'gz', 'binary');
  if (startsWith(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return kind('7-Zip archive', 'application/x-7z-compressed', '7z', 'binary');
  if (asciiAt(b, 'Rar!')) return kind('RAR archive', 'application/vnd.rar', 'rar', 'binary');
  if (asciiAt(b, 'BZh')) return kind('Bzip2 archive', 'application/x-bzip2', 'bz2', 'binary');
  if (startsWith(b, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) return kind('XZ archive', 'application/x-xz', 'xz', 'binary');
  if (startsWith(b, [0x28, 0xb5, 0x2f, 0xfd])) return kind('Zstandard archive', 'application/zstd', 'zst', 'binary');
  if (b.length > 262 && asciiAt(b, 'ustar', 257)) return kind('TAR archive', 'application/x-tar', 'tar', 'binary');
  // executables and data
  if (asciiAt(b, 'MZ')) return kind('Windows executable', 'application/vnd.microsoft.portable-executable', 'exe', 'binary');
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return kind('ELF executable', 'application/x-elf', 'elf', 'binary');
  if ([[0xfe, 0xed, 0xfa, 0xce], [0xfe, 0xed, 0xfa, 0xcf], [0xce, 0xfa, 0xed, 0xfe], [0xcf, 0xfa, 0xed, 0xfe], [0xca, 0xfe, 0xba, 0xbe]].some((s) => startsWith(b, s)))
    return kind('Mach-O executable or Java class', 'application/x-mach-binary', 'bin', 'binary');
  if (startsWith(b, [0x00, 0x61, 0x73, 0x6d])) return kind('WebAssembly module', 'application/wasm', 'wasm', 'binary');
  if (asciiAt(b, 'SQLite format 3\u0000')) return kind('SQLite database', 'application/vnd.sqlite3', 'sqlite', 'binary');
  if (asciiAt(b, 'PAR1')) return kind('Parquet file', 'application/vnd.apache.parquet', 'parquet', 'binary');
  if (startsWith(b, [0x30, 0x82])) return kind('DER certificate or key', 'application/pkix-cert', 'der', 'binary');
  // text-based formats last
  if (isUtf8Text(b)) return textKind(b);
  return kind('Unknown binary', 'application/octet-stream', 'bin', 'binary');
}
