// Boards are folders under Boards/; each has a _board.md and one Markdown file per card.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { moveToTrash, pathExists, readTextFile, writeTextFile } from '../fs/file-store';
import { asDate, asList, asText, parseFrontmatter, stringifyFrontmatter } from '../fs/frontmatter';
import { ID_PATTERN, ValidationError, resolveInside, shortId, slugify } from '../fs/paths';
import { BOARDS_DIR, BOARD_FILE } from '../vault/layout';
import { keyBetween } from './fractional-index';
import type { Board, Card, CardInput, Column, Priority } from '../../shared/types';

const PRIORITIES: Priority[] = ['', 'low', 'medium', 'high'];
const MAX_COLUMNS = 12;

const boardsDir = (vault: string) => path.join(vault, BOARDS_DIR);
const now = () => new Date().toISOString().slice(0, 19);
const stripControl = (s: string) => s.replace(/[\u0000-\u001f]/g, ' ');

export function defaultColumns(): Column[] {
  return [
    { id: 'todo', name: 'To do' },
    { id: 'in-progress', name: 'In progress' },
    { id: 'done', name: 'Done', done: true }
  ];
}

function normalizeColumns(columns: Column[]): Column[] {
  const used = new Set<string>();
  const out: Column[] = [];
  for (const c of columns) {
    const name = stripControl(c.name || '').trim().slice(0, 30);
    if (!name) continue;
    let id = ID_PATTERN.test(c.id || '') && !used.has(c.id) ? c.id : slugify(name, 30) || 'column';
    const base = id;
    for (let k = 2; used.has(id); k++) id = `${base}-${k}`;
    used.add(id);
    out.push({ id, name, ...(c.done ? { done: true } : {}) });
  }
  if (out.length < 1) throw new ValidationError('A board needs at least one column.');
  if (out.length > MAX_COLUMNS) throw new ValidationError(`A board can have at most ${MAX_COLUMNS} columns.`);
  if (!out.some((c) => c.done)) out[out.length - 1].done = true;
  return out;
}

async function readBoardFolder(dir: string, id: string): Promise<Board | null> {
  const file = path.join(dir, BOARD_FILE);
  if (!(await pathExists(file))) return null;
  const { data, body } = parseFrontmatter((await readTextFile(file)).text);
  let columns: Column[] = [];
  if (Array.isArray(data.columns)) {
    columns = data.columns
      .map((raw) => {
        const o = (raw ?? {}) as Record<string, unknown>;
        return { id: asText(o.id), name: asText(o.name), done: o.done === true };
      })
      .filter((c) => ID_PATTERN.test(c.id) && c.name)
      .map((c) => ({ id: c.id, name: c.name, ...(c.done ? { done: true } : {}) }));
  }
  if (columns.length === 0) columns = defaultColumns();
  return { id, name: asText(data.name).trim() || id, description: body.trim(), columns };
}

export async function listBoards(vault: string): Promise<Board[]> {
  let entries;
  try {
    entries = await fs.readdir(boardsDir(vault), { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Board[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !ID_PATTERN.test(e.name)) continue;
    const board = await readBoardFolder(path.join(boardsDir(vault), e.name), e.name);
    if (board) out.push(board);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

async function findBoard(vault: string, boardId: string): Promise<Board> {
  const board = (await listBoards(vault)).find((b) => b.id === boardId);
  if (!board) throw new ValidationError('board not found');
  return board;
}

export async function saveBoard(vault: string, input: { id?: string; name: string; description?: string; columns: Column[] }): Promise<Board> {
  const name = stripControl(input.name).trim().slice(0, 60);
  if (!name) throw new ValidationError('The board needs a name.');
  const columns = normalizeColumns(input.columns);
  let id = input.id || '';
  if (id) {
    if (!ID_PATTERN.test(id)) throw new ValidationError('invalid board id');
    if (!(await pathExists(path.join(boardsDir(vault), id)))) throw new ValidationError('board not found');
  } else {
    const base = slugify(name, 30) || 'board';
    id = base;
    for (let k = 2; await pathExists(path.join(boardsDir(vault), id)); k++) id = `${base}-${k}`;
  }
  const dir = path.join(boardsDir(vault), id);
  await fs.mkdir(dir, { recursive: true });
  const description = (input.description ?? '').trim();
  await writeTextFile(path.join(dir, BOARD_FILE), stringifyFrontmatter({ name, columns }, description));
  // cards whose column no longer exists move to the first column
  const ids = new Set(columns.map((c) => c.id));
  for (const card of await readCards(vault, id, columns)) {
    if (!ids.has(card.storedStatus)) await rewritePosition(vault, id, card.id, columns[0].id, card.order);
  }
  return { id, name, description, columns };
}

export async function deleteBoard(vault: string, boardId: string): Promise<void> {
  if (!ID_PATTERN.test(boardId)) throw new ValidationError('invalid board id');
  const dir = path.join(boardsDir(vault), boardId);
  if (!(await pathExists(dir))) throw new ValidationError('board not found');
  await moveToTrash(vault, dir);
}

// ---------- Cards

/** A card plus the details only the core layer needs. */
export type StoredCard = Card & { storedStatus: string; file: string };

function cardFile(vault: string, boardId: string, fileName: string): string {
  return resolveInside(vault, BOARDS_DIR, `${boardId}/${fileName}`);
}

function toCard(boardId: string, file: string, text: string, hash: string, columns: Column[]): StoredCard {
  const { data, body } = parseFrontmatter(text);
  const stem = path.basename(file, '.md');
  const id = asText(data.id).trim() || stem.split('-').pop() || stem;
  const storedStatus = asText(data.status).trim();
  const priority = asText(data.priority).trim().toLowerCase() as Priority;
  return {
    id,
    board: boardId,
    title: asText(data.title).trim() || stem,
    status: columns.some((c) => c.id === storedStatus) ? storedStatus : columns[0].id,
    storedStatus,
    assignee: asText(data.assignee).trim(),
    due: asDate(data.due),
    priority: PRIORITIES.includes(priority) ? priority : '',
    tags: asList(data.tags),
    order: asText(data.order),
    created: asText(data.created),
    updated: asText(data.updated),
    updatedBy: asText(data.updated_by),
    body: body.replace(/\n+$/, ''),
    hash,
    file
  };
}

export function toPublicCard(card: StoredCard): Card {
  const { storedStatus: _s, file: _f, ...rest } = card;
  return rest;
}

/** Cards of a board, in display order. */
export async function readCards(vault: string, boardId: string, columns?: Column[]): Promise<StoredCard[]> {
  if (!ID_PATTERN.test(boardId)) throw new ValidationError('invalid board id');
  const dir = path.join(boardsDir(vault), boardId);
  const cols = columns ?? (await readBoardFolder(dir, boardId))?.columns ?? defaultColumns();
  let names: string[];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.toLowerCase().endsWith('.md') && !n.startsWith('_') && !n.startsWith('.'));
  } catch {
    return [];
  }
  const out: StoredCard[] = [];
  for (const n of names) {
    const file = path.join(dir, n);
    const { text, hash } = await readTextFile(file);
    out.push(toCard(boardId, file, text, hash, cols));
  }
  return out.sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : a.id.localeCompare(b.id)));
}

export async function listCards(vault: string, boardId: string): Promise<Card[]> {
  return (await readCards(vault, boardId)).map(toPublicCard);
}

export async function listAllCards(vault: string): Promise<Card[]> {
  const out: Card[] = [];
  for (const b of await listBoards(vault)) for (const c of await readCards(vault, b.id, b.columns)) out.push(toPublicCard(c));
  return out;
}

async function findCard(vault: string, boardId: string, id: string): Promise<StoredCard> {
  if (!ID_PATTERN.test(id)) throw new ValidationError('invalid card id');
  const card = (await readCards(vault, boardId)).find((c) => c.id === id);
  if (!card) throw new ValidationError('card not found');
  return card;
}

/** Frontmatter written for every card, in a stable key order. */
function cardHeader(c: Pick<Card, 'id' | 'title' | 'status' | 'assignee' | 'due' | 'priority' | 'tags' | 'order' | 'created' | 'updated' | 'updatedBy'>) {
  return {
    id: c.id,
    title: c.title,
    status: c.status,
    assignee: c.assignee,
    due: c.due,
    priority: c.priority,
    tags: c.tags,
    order: c.order,
    created: c.created,
    updated: c.updated,
    updated_by: c.updatedBy
  };
}

function sanitizeInput(input: CardInput) {
  const title = stripControl(input.title).trim().slice(0, 120);
  if (!title) throw new ValidationError('The title cannot be empty.');
  if (input.body.length > 200_000) throw new ValidationError('Card is too large.');
  return {
    title,
    due: /^\d{4}-\d{2}-\d{2}$/.test(input.due) ? input.due : '',
    priority: PRIORITIES.includes(input.priority) ? input.priority : ('' as Priority),
    tags: [...new Set(input.tags.map((t) => t.replace(/[,\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean))].slice(0, 12),
    assignee: input.assignee.trim().slice(0, 60),
    body: input.body.replace(/\r\n/g, '\n').replace(/\n+$/, '')
  };
}

const lastOrderIn = (cards: StoredCard[], status: string, exceptId?: string) =>
  cards.filter((c) => c.status === status && c.id !== exceptId).map((c) => c.order).sort().pop() ?? '';

/** Saves a card. New card: no id and expectedHash null. Existing card: the hash the renderer read. */
export async function saveCard(vault: string, input: CardInput, expectedHash: string | null, author: string): Promise<Card> {
  const board = await findBoard(vault, input.board);
  const clean = sanitizeInput(input);
  const status = board.columns.some((c) => c.id === input.status) ? input.status : board.columns[0].id;

  if (!input.id) {
    const id = shortId();
    const order = keyBetween(lastOrderIn(await readCards(vault, board.id, board.columns), status), null);
    const file = cardFile(vault, board.id, `${slugify(clean.title, 40) || 'card'}-${id}.md`);
    const header = cardHeader({ id, ...clean, status, order, created: now(), updated: now(), updatedBy: author });
    const written = await writeTextFile(file, stringifyFrontmatter(header, clean.body), null);
    return toPublicCard(toCard(board.id, file, written.text, written.hash, board.columns));
  }

  const current = await findCard(vault, board.id, input.id);
  let order = current.order;
  if (status !== current.status) order = keyBetween(lastOrderIn(await readCards(vault, board.id, board.columns), status, current.id), null);
  const header = cardHeader({ ...current, ...clean, status, order, updated: now(), updatedBy: author });
  const written = await writeTextFile(current.file, stringifyFrontmatter(header, clean.body), expectedHash ?? undefined);
  return toPublicCard(toCard(board.id, current.file, written.text, written.hash, board.columns));
}

async function rewritePosition(vault: string, boardId: string, id: string, status: string, order: string): Promise<void> {
  const card = await findCard(vault, boardId, id);
  const { data, body } = parseFrontmatter((await readTextFile(card.file)).text);
  await writeTextFile(card.file, stringifyFrontmatter({ ...data, status, order }, body));
}

/** Moves a card into a column, before `beforeId` (or to the end). Only the moved card's file is rewritten. */
export async function moveCard(vault: string, boardId: string, id: string, status: string, beforeId: string | null): Promise<void> {
  const board = await findBoard(vault, boardId);
  if (!board.columns.some((c) => c.id === status)) throw new ValidationError('invalid column');
  const column = (await readCards(vault, boardId, board.columns)).filter((c) => c.status === status && c.id !== id);
  const index = beforeId ? column.findIndex((c) => c.id === beforeId) : -1;
  let order: string;
  if (index < 0) {
    order = keyBetween(column.length ? column[column.length - 1].order : '', null);
  } else {
    const prev = index > 0 ? column[index - 1].order : '';
    const next = column[index].order;
    if (next <= prev) {
      // equal keys (cards created at the same time on two computers): renumber the column first
      let last = '';
      for (const c of column) {
        last = keyBetween(last, null);
        await rewritePosition(vault, boardId, c.id, status, last);
      }
      const fresh = (await readCards(vault, boardId, board.columns)).filter((c) => c.status === status && c.id !== id);
      const j = fresh.findIndex((c) => c.id === beforeId);
      order = keyBetween(j > 0 ? fresh[j - 1].order : '', fresh[j].order);
    } else {
      order = keyBetween(prev, next);
    }
  }
  await rewritePosition(vault, boardId, id, status, order);
}

export async function deleteCard(vault: string, boardId: string, id: string): Promise<void> {
  const card = await findCard(vault, boardId, id);
  await moveToTrash(vault, card.file);
}
