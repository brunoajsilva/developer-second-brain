const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Dec 4" for an ISO day. */
export function formatDay(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8))}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function daysUntil(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return Math.round((Date.parse(iso + 'T00:00:00Z') - Date.parse(todayIso() + 'T00:00:00Z')) / 86_400_000);
}

export function describeDue(iso: string): string {
  const n = daysUntil(iso);
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days overdue`;
}

export function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/** Counts "- [ ]" items in Markdown. */
export function checklistProgress(body: string): { total: number; done: number } {
  const items = body.match(/^\s*[-*+]\s+\[[ xX]\]/gm) ?? [];
  return { total: items.length, done: items.filter((x) => /\[[xX]\]/.test(x)).length };
}

/** "Blocked" columns are recognised by name (columns are free text). Portuguese names are kept for old boards. */
export const isBlockedColumn = (name: string) => /block|bloq/i.test(name);

/** Plain-text excerpt of Markdown, for search results and previews. */
export function plainText(md: string): string {
  return md
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[!(note|tip|important|warning|caution)\]/gi, '')
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s*/gm, '')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s*/gm, '')
    .replace(/(^|\s)(#{1,6}|>)\s/g, ' ')
    .replace(/\[[ xX]\]\s*/g, '')
    .replace(/(^|\s)[-*+](?=\s)/g, ' ')
    .replace(/-{3,}/g, ' ')
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (_m, a: string, b: string) => b || a)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~=|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const plural = (n: number, word: string, many = word + 's') => `${n} ${n === 1 ? word : many}`;
