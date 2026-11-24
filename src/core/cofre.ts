// Um cofre é uma pasta com um _cofre.md na raiz.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { existe, gravar, ler } from './armazem';
import { escrever, parse, txt } from './frontmatter';
import { ErroValidacao, estaDentro, mesmoCaminho } from './caminhos';
import { guardarBoard, guardarCartao } from './boards';
import type { CofreRegisto } from '../shared/types';

export interface CofreMeta {
  id: string;
  nome: string;
  descricao: string;
}

export const FICHEIRO_COFRE = '_cofre.md';

export function novoIdCofre(): string {
  return randomBytes(4).toString('hex');
}

export async function lerCofre(dir: string): Promise<CofreMeta | null> {
  const f = path.join(dir, FICHEIRO_COFRE);
  if (!(await existe(f))) return null;
  const p = parse((await ler(f)).texto);
  const id = txt(p.dados.id).trim();
  if (!id) return null;
  return { id, nome: txt(p.dados.nome).trim() || path.basename(dir), descricao: p.corpo.trim() };
}

async function verificarPasta(dir: string): Promise<void> {
  if (!path.isAbsolute(dir)) throw new ErroValidacao('use an absolute path');
  const parsed = path.parse(path.resolve(dir));
  if (path.resolve(dir) === parsed.root) throw new ErroValidacao('choose a folder, not the root of a drive');
  await fs.mkdir(dir, { recursive: true });
  const teste = path.join(dir, '.escrita-' + randomBytes(4).toString('hex') + '.tmp');
  try {
    await fs.writeFile(teste, 'x');
    await fs.rm(teste);
  } catch {
    throw new ErroValidacao('no write permission in that folder');
  }
}

/** Recusa cofres dentro de cofres, cofres repetidos ou com o mesmo id. */
export async function validarNovoCofre(dir: string, id: string | null, registados: CofreRegisto[]): Promise<void> {
  for (const c of registados) {
    if (mesmoCaminho(c.caminho, dir)) throw new ErroValidacao('This vault is already in the list.');
    if (estaDentro(c.caminho, dir)) throw new ErroValidacao('The folder is inside the vault "' + c.nome + '". A vault cannot live inside another vault.');
    if (estaDentro(dir, c.caminho)) throw new ErroValidacao('The folder contains the vault "' + c.nome + '". A vault cannot contain another vault.');
    if (id && c.id === id) throw new ErroValidacao('You already have a vault with this identifier ("' + c.nome + '"). If you copied the folder, create a new vault instead of opening the copy.');
  }
}

export async function criarCofre(dir: string, nome: string, comExemplo: boolean, registados: CofreRegisto[]): Promise<CofreMeta> {
  const n = nome.trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, 60);
  if (!n) throw new ErroValidacao('The vault needs a name.');
  await verificarPasta(dir);
  const existente = await lerCofre(dir);
  if (existente) throw new ErroValidacao('This folder is already a vault ("' + existente.nome + '"). Use "Open folder as vault".');
  await validarNovoCofre(dir, null, registados);
  const meta: CofreMeta = { id: novoIdCofre(), nome: n, descricao: '' };
  await converterEmCofre(dir, meta);
  if (comExemplo) await criarExemplo(dir);
  return meta;
}

/** Transforma uma pasta existente em cofre (não toca nos ficheiros que já lá estão). */
export async function converterEmCofre(dir: string, meta: CofreMeta): Promise<void> {
  await gravar(path.join(dir, FICHEIRO_COFRE), escrever({ id: meta.id, nome: meta.nome }, meta.descricao || 'Team vault. Every page and every card is a Markdown file.'));
  for (const sub of ['Docs', 'Boards']) await fs.mkdir(path.join(dir, sub), { recursive: true });
}

export async function abrirPastaComoCofre(dir: string, registados: CofreRegisto[]): Promise<{ meta: CofreMeta | null }> {
  await verificarPasta(dir);
  const meta = await lerCofre(dir);
  if (meta) await validarNovoCofre(dir, meta.id, registados);
  else await validarNovoCofre(dir, null, registados);
  return { meta };
}

async function criarExemplo(dir: string): Promise<void> {
  const b = await guardarBoard(dir, {
    nome: 'Team board',
    descricao: '',
    estados: [
      { id: 'a-fazer', nome: 'To do' },
      { id: 'em-curso', nome: 'In progress' },
      { id: 'bloqueado', nome: 'Blocked' },
      { id: 'feito', nome: 'Done', fim: true }
    ]
  });
  await guardarCartao(dir, { board: b.id, titulo: 'Open me: how cards work', estado: 'a-fazer', responsavel: '', prazo: '', prioridade: '', etiquetas: ['getting started'], corpo: CARTAO_EXEMPLO }, null, '');
  const G = 'User guide';
  for (const [nome, texto] of Object.entries(GUIA)) await gravar(path.join(dir, 'Docs', G, nome + '.md'), texto);
}

const CARTAO_EXEMPLO = "Cards are Markdown files, so notes support everything pages do.\n\n- [x] Open this card\n- [ ] Tick this item without entering edit mode\n- [ ] Click **Edit notes** to change the text\n- [ ] Add a tag with spaces, then press Enter\n\nRead more in [[Boards and cards]].\n";

const GUIA: Record<string, string> = {
  "Welcome": "# Welcome\n\nDeveloper SecondBrain keeps your team's docs and boards as plain Markdown files inside a folder — the **vault**. Edit them here or in any editor, and share the folder with your team through OneDrive, Dropbox or git.\n\nThis collection is a short guide. It is a collection like any other: rename it, edit it or delete it when you no longer need it.\n\n- [[Docs and pages]]\n- [[Boards and cards]]\n- [[Markdown cheatsheet]]\n- [[Vaults, sharing and conflicts]]\n- [[Keyboard shortcuts]]\n",
  "Docs and pages": "# Docs and pages\n\n- A **collection** groups related pages (sidebar → Docs). Create one with **+**, rename or delete it with the pencil.\n- Inside a collection you create **pages** and **sub-pages**: use **+** on a row, or **New sub-page** in the page menu.\n- Drag a page onto another one to make it a sub-page. Drop it on the collection title to move it back to the top.\n- Link pages with `[[Page title]]`. If the page does not exist yet, clicking the link creates it.\n- Every page lists, at the bottom, the pages and cards that link to it (**Linked from**).\n- Deleted files go to the vault's `.lixo/` folder and can be recovered from there.\n\n> [!TIP]\n> Paste an image with Ctrl+V while editing. It is saved next to the page, in `_anexos/`.\n",
  "Boards and cards": "# Boards and cards\n\n- Each board has columns. Change them in **Settings** on the board; the column marked as *done* counts as finished.\n- Each card is a Markdown file. Click a card to open it; click outside or press Esc to close — changes save automatically.\n- Card notes are rendered like any page. Click **Edit notes** to change the Markdown, and tick checklists directly.\n- **Assignee** comes from the vault's team. Manage it with **Team** on the board.\n- Tags can contain spaces. Press Enter or comma to add one; click a tag on a card to filter the board by it.\n- **Today** shows your open work, what is due this week and what is overdue.\n",
  "Markdown cheatsheet": "# Markdown cheatsheet\n\n## Tasks (click to tick)\n- [x] Task lists\n- [ ] Clickable while reading\n\n## Text\n**bold**, *italic*, ~~strikethrough~~, ==highlight==, H~2~O, x^2^, `inline code`, <kbd>Ctrl</kbd> + <kbd>K</kbd>, emoji :rocket:\n\n## Callouts\n> [!NOTE]\n> Also available: TIP, IMPORTANT, WARNING and CAUTION.\n\n## Code\n```ts\nconst add = (a: number, b: number) => a + b;\n```\n\n## Diagrams\n```mermaid\ngraph LR\n  Idea --> Doc --> Card --> Done\n```\n\n## Tables and footnotes\n| Column | Value |\n| --- | --- |\n| A | 1 |\n\nA footnote[^1].\n\n[^1]: Shown at the end of the page.\n\n<details><summary>Collapsible section</summary>\n\nHidden content.\n\n</details>\n",
  "Vaults, sharing and conflicts": "# Vaults, sharing and conflicts\n\n- You can have several vaults (personal and shared). Switch with **Ctrl+Shift+O**.\n- In a shared vault, everyone runs their own app on the same synced folder.\n- If two people change the same file at the same time, the app warns you and lets you choose which version to keep.\n- Conflict copies created by OneDrive or Dropbox show up in the sidebar so you can resolve them.\n",
  "Keyboard shortcuts": "# Keyboard shortcuts\n\n| Shortcut | Action |\n| --- | --- |\n| <kbd>Ctrl</kbd> + <kbd>K</kbd> | Search and jump to anything |\n| <kbd>Alt</kbd> + <kbd>←</kbd> / <kbd>→</kbd> | Back / forward |\n| <kbd>Ctrl</kbd> + <kbd>E</kbd> | Edit / finish editing the current page |\n| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>O</kbd> | Switch vault |\n| <kbd>Ctrl</kbd> + <kbd>1</kbd>…<kbd>9</kbd> | Open vault 1–9 |\n| <kbd>Esc</kbd> | Close dialogs and cards |\n"
};
