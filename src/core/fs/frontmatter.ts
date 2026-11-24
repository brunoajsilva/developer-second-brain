import matter from 'gray-matter';

export interface ParsedMarkdown {
  data: Record<string, unknown>;
  body: string;
  /** false when the YAML header is malformed. */
  valid: boolean;
}

export function parseFrontmatter(text: string): ParsedMarkdown {
  const t = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!t.startsWith('---')) return { data: {}, body: t, valid: true };
  try {
    const m = matter(t, {});
    return { data: (m.data ?? {}) as Record<string, unknown>, body: m.content.replace(/^\n+/, ''), valid: true };
  } catch {
    return { data: {}, body: t, valid: false };
  }
}

export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) if (v !== undefined) clean[k] = v;
  const content = body.replace(/\r\n/g, '\n').replace(/\n+$/, '');
  return matter
    .stringify('\n' + content + '\n', clean, { lineWidth: -1 } as never)
    .replace(/^---\n([\s\S]*?)\n---\n\n+/, '---\n$1\n---\n\n');
}

export const asText = (value: unknown, fallback = ''): string => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  if (value === null || value === undefined) return fallback;
  return String(value);
};

/** YYYY-MM-DD or '' (YAML may give us a Date for unquoted dates). */
export const asDate = (value: unknown): string => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  const s = asText(value);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

/** A YAML list, or a comma-separated string written by hand. */
export const asList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((x) => asText(x).trim()).filter(Boolean);
  const s = asText(value);
  return s ? s.split(',').map((x) => x.trim()).filter(Boolean) : [];
};

