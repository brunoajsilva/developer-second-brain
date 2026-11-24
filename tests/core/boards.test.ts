import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deleteBoard, deleteCard, listBoards, moveCard, readCards, saveBoard, saveCard } from '../../src/core/boards/boards';
import { ConflictError } from '../../src/core/fs/file-store';
import { createVault } from '../../src/core/vault/vault';
import { parseFrontmatter } from '../../src/core/fs/frontmatter';
import { tempDir } from './helpers';
import type { CardInput } from '../../src/shared/types';

const input = (board: string, title: string, extra: Partial<CardInput> = {}): CardInput => ({
  board, title, status: 'to-do', assignee: '', due: '', priority: '', tags: [], body: '', ...extra
});

async function setup() {
  const vault = await tempDir();
  await createVault(vault, 'T', false, []);
  const board = await saveBoard(vault, { name: 'Sprint 24', columns: [{ id: '', name: 'To do' }, { id: '', name: 'In progress' }, { id: '', name: 'Done' }] });
  return { vault, board };
}

describe('boards', () => {
  it('creates a board in _board.md with derived ids and a done column', async () => {
    const { vault, board } = await setup();
    expect(board.id).toBe('sprint-24');
    expect(board.columns.map((c) => c.id)).toEqual(['to-do', 'in-progress', 'done']);
    expect(board.columns[2].done).toBe(true);
    const raw = await fs.readFile(path.join(vault, 'Boards', 'sprint-24', '_board.md'), 'utf8');
    expect(parseFrontmatter(raw).data.name).toBe('Sprint 24');
    expect((await listBoards(vault))[0].name).toBe('Sprint 24');
  });

  it('creates cards with valid YAML, slug-id.md file names and increasing order', async () => {
    const { vault } = await setup();
    const c1 = await saveCard(vault, input('sprint-24', 'Fix timeout: Cards', { due: '2026-12-04', tags: ['cards', 'backend'], priority: 'high', assignee: 'Bruno Silva', body: '- [x] a\n- [ ] b' }), null, 'Bruno Silva');
    const c2 = await saveCard(vault, input('sprint-24', 'Second'), null, 'Bruno Silva');
    expect(c1.order < c2.order).toBe(true);
    const file = path.join(vault, 'Boards', 'sprint-24', `fix-timeout-cards-${c1.id}.md`);
    const parsed = parseFrontmatter(await fs.readFile(file, 'utf8'));
    expect(parsed.valid).toBe(true);
    expect(parsed.data.due).toBe('2026-12-04'); // quoted string, not a Date
    expect(parsed.data.tags).toEqual(['cards', 'backend']);
    expect(parsed.data.updated_by).toBe('Bruno Silva');
    expect(parsed.body).toContain('- [x] a');
    expect((await readCards(vault, 'sprint-24')).find((c) => c.id === c1.id)?.due).toBe('2026-12-04');
  });

  it('reads hand-written cards (unquoted date, comma-separated tags, unknown column)', async () => {
    const { vault } = await setup();
    await fs.writeFile(path.join(vault, 'Boards', 'sprint-24', 'by-hand-zzzz.md'), '---\ntitle: By hand\nstatus: missing\ndue: 2026-12-04\ntags: x, y\n---\n\nText\n');
    const [card] = await readCards(vault, 'sprint-24');
    expect(card.status).toBe('to-do');
    expect(card.due).toBe('2026-12-04');
    expect(card.tags).toEqual(['x', 'y']);
    expect(card.id).toBe('zzzz');
  });

  it('moving rewrites only the moved card', async () => {
    const { vault } = await setup();
    const a = await saveCard(vault, input('sprint-24', 'A'), null, 'x');
    const b = await saveCard(vault, input('sprint-24', 'B'), null, 'x');
    const c = await saveCard(vault, input('sprint-24', 'C'), null, 'x');
    const dir = path.join(vault, 'Boards', 'sprint-24');
    const before = new Map<string, string>();
    for (const n of await fs.readdir(dir)) before.set(n, await fs.readFile(path.join(dir, n), 'utf8'));
    await moveCard(vault, 'sprint-24', c.id, 'to-do', a.id);
    const changed: string[] = [];
    for (const n of await fs.readdir(dir)) if ((await fs.readFile(path.join(dir, n), 'utf8')) !== before.get(n)) changed.push(n);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain(c.id);
    expect((await readCards(vault, 'sprint-24')).map((x) => x.title)).toEqual(['C', 'A', 'B']);
    await moveCard(vault, 'sprint-24', a.id, 'in-progress', null);
    expect((await readCards(vault, 'sprint-24')).find((x) => x.id === a.id)?.status).toBe('in-progress');
    await moveCard(vault, 'sprint-24', b.id, 'to-do', c.id);
    expect((await readCards(vault, 'sprint-24')).filter((x) => x.status === 'to-do').map((x) => x.title)).toEqual(['B', 'C']);
  });

  it('many inserts at the same spot keep their order', async () => {
    const { vault } = await setup();
    const base = await saveCard(vault, input('sprint-24', 'Base'), null, 'x');
    for (let i = 0; i < 30; i++) {
      const n = await saveCard(vault, input('sprint-24', 'N' + i), null, 'x');
      await moveCard(vault, 'sprint-24', n.id, 'to-do', base.id);
    }
    const titles = (await readCards(vault, 'sprint-24')).map((c) => c.title);
    expect(titles).toHaveLength(31);
    expect(titles[titles.length - 1]).toBe('Base');
    expect(titles.slice(0, 30)).toEqual(Array.from({ length: 30 }, (_, i) => 'N' + i));
  });

  it('recovers when two computers created cards with the same order key', async () => {
    const { vault } = await setup();
    const dir = path.join(vault, 'Boards', 'sprint-24');
    for (const [id, t] of [['aaaa', 'X'], ['bbbb', 'Y'], ['cccc', 'Z']]) await fs.writeFile(path.join(dir, `${t.toLowerCase()}-${id}.md`), `---\nid: ${id}\ntitle: ${t}\nstatus: to-do\norder: V\n---\n\n`);
    await moveCard(vault, 'sprint-24', 'cccc', 'to-do', 'bbbb');
    const cards = await readCards(vault, 'sprint-24');
    expect(new Set(cards.map((c) => c.order)).size).toBe(3);
    expect(cards.map((c) => c.title).indexOf('Z')).toBeLessThan(cards.map((c) => c.title).indexOf('Y'));
  });

  it('editing with a stale hash is a conflict and overwrites nothing', async () => {
    const { vault } = await setup();
    const c = await saveCard(vault, input('sprint-24', 'Card', { body: 'v1' }), null, 'Bruno');
    await saveCard(vault, { ...input('sprint-24', 'Card', { body: 'v2 from Ana' }), id: c.id }, c.hash, 'Ana');
    await expect(saveCard(vault, { ...input('sprint-24', 'Card', { body: 'v2 from Bruno' }), id: c.id }, c.hash, 'Bruno')).rejects.toBeInstanceOf(ConflictError);
    expect((await readCards(vault, 'sprint-24'))[0].body).toBe('v2 from Ana');
  });

  it('changing the column in the editor puts the card at the end of the new column', async () => {
    const { vault } = await setup();
    const a = await saveCard(vault, input('sprint-24', 'A', { status: 'in-progress' }), null, 'x');
    const b = await saveCard(vault, input('sprint-24', 'B'), null, 'x');
    const moved = await saveCard(vault, { ...input('sprint-24', 'B', { status: 'in-progress' }), id: b.id }, b.hash, 'x');
    expect(moved.order > a.order).toBe(true);
  });

  it('removing a column moves its cards to the first one', async () => {
    const { vault, board } = await setup();
    const c = await saveCard(vault, input('sprint-24', 'A', { status: 'in-progress' }), null, 'x');
    await saveBoard(vault, { id: board.id, name: board.name, columns: board.columns.filter((col) => col.id !== 'in-progress') });
    const [card] = await readCards(vault, 'sprint-24');
    expect(card.status).toBe('to-do');
    expect(parseFrontmatter(await fs.readFile(card.file, 'utf8')).data.status).toBe('to-do');
    expect(card.id).toBe(c.id);
  });

  it('deleted cards and boards go to .trash', async () => {
    const { vault } = await setup();
    const c = await saveCard(vault, input('sprint-24', 'A'), null, 'x');
    await deleteCard(vault, 'sprint-24', c.id);
    expect(await readCards(vault, 'sprint-24')).toHaveLength(0);
    await deleteBoard(vault, 'sprint-24');
    expect(await listBoards(vault)).toHaveLength(0);
    expect(await fs.readdir(path.join(vault, '.trash'))).toHaveLength(2);
  });
});
