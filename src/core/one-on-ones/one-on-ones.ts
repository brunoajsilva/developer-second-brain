// 1:1 notes. One folder per person; one Markdown file per meeting, plus the running agenda and the cadence.
//   One-on-ones/Ana Costa/_agenda.md     topics for the next 1:1 (a bullet list)
//   One-on-ones/Ana Costa/_profile.md    cadence (days between meetings)
//   One-on-ones/Ana Costa/2026-11-24.md  one meeting; "- [ ]" lines are action items
//   One-on-ones/Ana Costa/feedback.md    general feedback, one "## date · kind" section per entry
//   One-on-ones/Ana Costa/Reviews/*.md   free documents (performance reviews and the like)
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { moveToTrash, pathExists, readTextFile, writeTextFile } from '../fs/file-store';
import { asText, parseFrontmatter, stringifyFrontmatter } from '../fs/frontmatter';
import { ValidationError } from '../fs/paths';
import { ONE_ON_ONES_DIR } from '../vault/layout';
import type { DocFile, FeedbackEntry, FeedbackKind, OneOnOneAction, OneOnOneMeeting, OneOnOnePerson, ReviewSummary } from '../../shared/types';

const AGENDA_FILE = '_agenda.md';
const PROFILE_FILE = '_profile.md';
const FEEDBACK_FILE = 'feedback.md';
const MEETING_ID = /^\d{4}-\d{2}-\d{2}(-\d{1,2})?$/;
const OPEN_ACTION = /^\s*[-*+]\s+\[ \]\s+(.*\S)\s*$/;
export const DEFAULT_CADENCE_DAYS = 14;

/** Folder name for a person (same rules as file names on every OS). */
export function personFolder(person: string): string {
  const clean = person.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 60);
  if (!clean) throw new ValidationError('Choose a person.');
  return clean;
}

const personDir = (vault: string, person: string) => path.join(vault, ONE_ON_ONES_DIR, personFolder(person));

function meetingFile(vault: string, person: string, meetingId: string): string {
  if (!MEETING_ID.test(meetingId)) throw new ValidationError('invalid meeting');
  return path.join(personDir(vault, person), meetingId + '.md');
}

const bullets = (text: string) => parseFrontmatter(text).body.split('\n').map((l) => l.match(/^\s*[-*+]\s+(.*\S)\s*$/)?.[1]).filter((x): x is string => !!x && !/^\[[ xX]\]/.test(x));

function excerptOf(body: string): string {
  const lines = body.split('\n').filter((l) => l.trim() && !/^#/.test(l.trim()) && !/^\s*[-*+]\s+\[[ xX]\]\s*$/.test(l));
  return lines.map((l) => l.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')).join(' ').replace(/[#*_`>]|\[[ xX]\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
}

async function readPerson(vault: string, folder: string): Promise<OneOnOnePerson> {
  const dir = path.join(vault, ONE_ON_ONES_DIR, folder);
  const profilePath = path.join(dir, PROFILE_FILE);
  const profile = (await pathExists(profilePath)) ? parseFrontmatter((await readTextFile(profilePath)).text).data : {};
  const cadence = Number(profile.cadenceDays);
  const agendaPath = path.join(dir, AGENDA_FILE);
  const agenda = (await pathExists(agendaPath)) ? bullets((await readTextFile(agendaPath)).text) : [];
  const meetings: OneOnOneMeeting[] = [];
  const openActions: OneOnOneAction[] = [];
  const names = (await fs.readdir(dir)).filter((n) => MEETING_ID.test(n.replace(/\.md$/i, '')) && n.toLowerCase().endsWith('.md'));
  for (const name of names.sort().reverse()) {
    const id = name.replace(/\.md$/i, '');
    const { text } = await readTextFile(path.join(dir, name));
    const { body } = parseFrontmatter(text);
    const offset = text.split('\n').length - body.split('\n').length;
    let open = 0;
    body.split('\n').forEach((line, i) => {
      const m = line.match(OPEN_ACTION);
      if (m) { open++; openActions.push({ meeting: id, line: i + offset, text: m[1] }); }
    });
    meetings.push({ id, date: id.slice(0, 10), excerpt: excerptOf(body), openActions: open });
  }
  const feedbackPath = path.join(dir, FEEDBACK_FILE);
  const feedback = (await pathExists(feedbackPath)) ? parseFeedback((await readTextFile(feedbackPath)).text).entries : [];
  feedback.sort((x, y) => y.date.localeCompare(x.date) || x.id.localeCompare(y.id));
  return { person: asText(profile.person).trim() || folder, cadenceDays: Number.isFinite(cadence) && cadence >= 0 ? cadence : DEFAULT_CADENCE_DAYS, agenda, meetings, openActions, feedback, reviews: await listReviews(dir) };
}

export async function listOneOnOnes(vault: string): Promise<OneOnOnePerson[]> {
  let entries;
  try {
    entries = await fs.readdir(path.join(vault, ONE_ON_ONES_DIR), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: OneOnOnePerson[] = [];
  for (const e of entries) if (e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_')) out.push(await readPerson(vault, e.name));
  return out.sort((a, b) => a.person.localeCompare(b.person));
}

export async function readOneOnOne(vault: string, person: string, meetingId: string): Promise<DocFile> {
  const file = meetingFile(vault, person, meetingId);
  if (!(await pathExists(file))) throw new ValidationError('This 1:1 note no longer exists.');
  const { text, hash, modified } = await readTextFile(file);
  return { path: meetingId, text, hash, modified };
}

export async function writeOneOnOne(vault: string, person: string, meetingId: string, text: string, expectedHash: string | null): Promise<{ hash: string; modified: number }> {
  if (text.length > 500_000) throw new ValidationError('This note is too large.');
  const { hash, modified } = await writeTextFile(meetingFile(vault, person, meetingId), text, expectedHash);
  return { hash, modified };
}

const LONG_DATE = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Creates the note for a 1:1 on `date`, moving the agenda topics into it. Returns the meeting id. */
export async function startOneOnOne(vault: string, person: string, date: string): Promise<string> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError('invalid date');
  const dir = personDir(vault, person);
  await fs.mkdir(dir, { recursive: true });
  let id = date;
  for (let n = 2; await pathExists(path.join(dir, id + '.md')); n++) id = `${date}-${n}`;
  const agendaPath = path.join(dir, AGENDA_FILE);
  const topics = (await pathExists(agendaPath)) ? bullets((await readTextFile(agendaPath)).text) : [];
  const text = [
    `# 1:1 with ${person.trim()}, ${LONG_DATE(date)}`,
    '',
    '## Topics',
    '',
    ...(topics.length ? topics.map((t) => `- ${t}`) : ['- ']),
    '',
    '## Notes',
    '',
    '',
    '## Action items',
    '',
    '- [ ] ',
    ''
  ].join('\n');
  await writeTextFile(path.join(dir, id + '.md'), text, null);
  if (topics.length) await writeAgenda(dir, person, []);
  await ensureProfile(vault, person);
  return id;
}

export async function deleteOneOnOne(vault: string, person: string, meetingId: string): Promise<void> {
  const file = meetingFile(vault, person, meetingId);
  if (!(await pathExists(file))) throw new ValidationError('This 1:1 note no longer exists.');
  await moveToTrash(vault, file);
}

async function writeAgenda(dir: string, person: string, topics: string[]): Promise<void> {
  const body = `# Next 1:1 with ${person.trim()}\n\nTopics to bring up. They move into the note when the 1:1 starts.\n\n${topics.map((t) => `- ${t}`).join('\n')}\n`;
  await writeTextFile(path.join(dir, AGENDA_FILE), body);
}

export async function setOneOnOneAgenda(vault: string, person: string, topics: string[]): Promise<void> {
  const clean = topics.map((t) => t.replace(/[\r\n\u0000-\u001f]+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, 50);
  const dir = personDir(vault, person);
  await fs.mkdir(dir, { recursive: true });
  await writeAgenda(dir, person, clean);
  await ensureProfile(vault, person);
}

async function ensureProfile(vault: string, person: string, cadenceDays?: number): Promise<void> {
  const file = path.join(personDir(vault, person), PROFILE_FILE);
  const exists = await pathExists(file);
  if (exists && cadenceDays === undefined) return;
  const current = exists ? parseFrontmatter((await readTextFile(file)).text).data : {};
  await writeTextFile(file, stringifyFrontmatter({ person: person.trim(), cadenceDays: cadenceDays ?? (Number(current.cadenceDays) || DEFAULT_CADENCE_DAYS) }, 'Settings for these 1:1s.'));
}

export async function setOneOnOneCadence(vault: string, person: string, days: number): Promise<void> {
  if (!Number.isInteger(days) || days < 0 || days > 365) throw new ValidationError('Choose how often you meet.');
  await fs.mkdir(personDir(vault, person), { recursive: true });
  await ensureProfile(vault, person, days);
}

// ---------- Feedback log

const KIND_LABELS: Record<FeedbackKind, string> = { praise: 'Praise', improve: 'To improve', note: 'Note' };
const kindFromLabel = (label: string): FeedbackKind => (/praise|elogio/i.test(label) ? 'praise' : /improve|melhorar/i.test(label) ? 'improve' : 'note');
const SECTION = /^## (\d{4}-\d{2}-\d{2})(?:\s*[·-]\s*(.+?))?\s*$/;

/** Splits feedback.md into its intro (everything before the first entry) and entries, in file order. */
export function parseFeedback(text: string): { intro: string; entries: FeedbackEntry[] } {
  const lines = parseFrontmatter(text).body.split('\n');
  const entries: FeedbackEntry[] = [];
  const intro: string[] = [];
  const perDate = new Map<string, number>();
  let current: { date: string; kind: FeedbackKind; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const n = (perDate.get(current.date) ?? 0) + 1;
    perDate.set(current.date, n);
    entries.push({ id: `${current.date}#${n}`, date: current.date, kind: current.kind, text: current.lines.join('\n').trim() });
  };
  for (const line of lines) {
    const m = line.match(SECTION);
    if (m) {
      flush();
      current = { date: m[1], kind: kindFromLabel(m[2] ?? ''), lines: [] };
    } else if (current) current.lines.push(line);
    else intro.push(line);
  }
  flush();
  return { intro: intro.join('\n').trim(), entries };
}

function feedbackText(person: string, intro: string, entries: FeedbackEntry[]): string {
  // newest first; entries of the same day keep their order (stable sort)
  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date));
  const head = intro || `# Feedback about ${person.trim()}\n\nPrivate notes: praise, things to improve and observations, newest first.`;
  return `${head}\n\n${sorted.map((e) => `## ${e.date} · ${KIND_LABELS[e.kind]}\n\n${e.text.trim()}\n`).join('\n')}`;
}

async function updateFeedback(vault: string, person: string, change: (entries: FeedbackEntry[]) => FeedbackEntry[]): Promise<void> {
  const dir = personDir(vault, person);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, FEEDBACK_FILE);
  const current = (await pathExists(file)) ? await readTextFile(file) : null;
  const parsed = current ? parseFeedback(current.text) : { intro: '', entries: [] };
  await writeTextFile(file, feedbackText(person, parsed.intro, change(parsed.entries)), current ? current.hash : null);
  await ensureProfile(vault, person);
}

export async function saveFeedback(vault: string, person: string, input: Omit<FeedbackEntry, 'id'> & { id?: string }): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new ValidationError('Use a valid date.');
  if (!['praise', 'improve', 'note'].includes(input.kind)) throw new ValidationError('Unknown kind of feedback.');
  // a line starting with "## " would split the entry in two when read back
  const text = input.text.replace(/\r\n/g, '\n').replace(/^##\s/gm, '### ').trim();
  if (!text) throw new ValidationError('Write the feedback first.');
  if (text.length > 20_000) throw new ValidationError('This feedback is too long.');
  await updateFeedback(vault, person, (entries) => {
    if (input.id && !entries.some((e) => e.id === input.id)) throw new ValidationError('That feedback no longer exists.');
    const entry: FeedbackEntry = { id: input.id ?? 'new', date: input.date, kind: input.kind, text };
    return input.id ? entries.map((e) => (e.id === input.id ? entry : e)) : [entry, ...entries];
  });
}

export async function deleteFeedback(vault: string, person: string, entryId: string): Promise<void> {
  await updateFeedback(vault, person, (entries) => {
    if (!entries.some((e) => e.id === entryId)) throw new ValidationError('That feedback no longer exists.');
    return entries.filter((e) => e.id !== entryId);
  });
}

// ---------- Reviews: free Markdown documents (performance reviews, development plans…)
//   One-on-ones/Ana Costa/Reviews/2026 review.md

const REVIEWS_DIR = 'Reviews';
const reviewsDir = (vault: string, person: string) => path.join(personDir(vault, person), REVIEWS_DIR);

/** A review's id is its file name without ".md"; it doubles as the title. */
export function reviewTitle(title: string): string {
  const clean = title.replace(/[\u0000-\u001f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').replace(/^[. ]+|[. ]+$/g, '').slice(0, 80);
  if (!clean) throw new ValidationError('Give the document a name.');
  return clean;
}

function reviewFile(vault: string, person: string, reviewId: string): string {
  if (reviewTitle(reviewId) !== reviewId) throw new ValidationError('invalid document');
  return path.join(reviewsDir(vault, person), reviewId + '.md');
}

async function listReviews(dir: string): Promise<ReviewSummary[]> {
  let names: string[];
  try {
    names = (await fs.readdir(path.join(dir, REVIEWS_DIR))).filter((n) => n.toLowerCase().endsWith('.md') && !n.startsWith('.'));
  } catch {
    return [];
  }
  const out: ReviewSummary[] = [];
  for (const name of names) {
    const { text, modified } = await readTextFile(path.join(dir, REVIEWS_DIR, name));
    out.push({ id: name.replace(/\.md$/i, ''), modified, excerpt: excerptOf(parseFrontmatter(text).body) });
  }
  return out.sort((a, b) => b.modified - a.modified);
}

export async function createReview(vault: string, person: string, title: string): Promise<string> {
  const id = reviewTitle(title);
  const dir = reviewsDir(vault, person);
  await fs.mkdir(dir, { recursive: true });
  if (await pathExists(path.join(dir, id + '.md'))) throw new ValidationError(`There is already a document called “${id}”.`);
  await writeTextFile(path.join(dir, id + '.md'), '', null);
  await ensureProfile(vault, person);
  return id;
}

export async function readReview(vault: string, person: string, reviewId: string): Promise<DocFile> {
  const file = reviewFile(vault, person, reviewId);
  if (!(await pathExists(file))) throw new ValidationError('This document no longer exists.');
  const { text, hash, modified } = await readTextFile(file);
  return { path: reviewId, text, hash, modified };
}

export async function writeReview(vault: string, person: string, reviewId: string, text: string, expectedHash: string | null): Promise<{ hash: string; modified: number }> {
  if (text.length > 1_000_000) throw new ValidationError('This document is too large.');
  const { hash, modified } = await writeTextFile(reviewFile(vault, person, reviewId), text, expectedHash);
  return { hash, modified };
}

export async function renameReview(vault: string, person: string, reviewId: string, title: string): Promise<string> {
  const from = reviewFile(vault, person, reviewId);
  const id = reviewTitle(title);
  if (id === reviewId) return id;
  const to = path.join(reviewsDir(vault, person), id + '.md');
  // a case-only rename is the same file on macOS and Windows
  if (id.toLowerCase() !== reviewId.toLowerCase() && (await pathExists(to))) throw new ValidationError(`There is already a document called “${id}”.`);
  await fs.rename(from, to);
  return id;
}

export async function deleteReview(vault: string, person: string, reviewId: string): Promise<void> {
  const file = reviewFile(vault, person, reviewId);
  if (!(await pathExists(file))) throw new ValidationError('This document no longer exists.');
  await moveToTrash(vault, file);
}
