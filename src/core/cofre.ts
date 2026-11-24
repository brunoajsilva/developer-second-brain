// Um cofre é uma pasta com um _cofre.md na raiz.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { randomBytes } from 'node:crypto';
import { existe, gravar, ler } from './armazem';
import { escrever, parse, txt } from './frontmatter';
import { ErroValidacao, estaDentro, mesmoCaminho } from './caminhos';
import { guardarBoard } from './boards';
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
  if (!path.isAbsolute(dir)) throw new ErroValidacao('indica um caminho absoluto');
  const parsed = path.parse(path.resolve(dir));
  if (path.resolve(dir) === parsed.root) throw new ErroValidacao('escolhe uma pasta, nao a raiz de uma unidade');
  await fs.mkdir(dir, { recursive: true });
  const teste = path.join(dir, '.escrita-' + randomBytes(4).toString('hex') + '.tmp');
  try {
    await fs.writeFile(teste, 'x');
    await fs.rm(teste);
  } catch {
    throw new ErroValidacao('sem permissao de escrita nessa pasta');
  }
}

/** Recusa cofres dentro de cofres, cofres repetidos ou com o mesmo id. */
export async function validarNovoCofre(dir: string, id: string | null, registados: CofreRegisto[]): Promise<void> {
  for (const c of registados) {
    if (mesmoCaminho(c.caminho, dir)) throw new ErroValidacao('Este cofre ja esta na lista.');
    if (estaDentro(c.caminho, dir)) throw new ErroValidacao('A pasta fica dentro do cofre "' + c.nome + '". Um cofre nao pode ficar dentro de outro.');
    if (estaDentro(dir, c.caminho)) throw new ErroValidacao('A pasta contem o cofre "' + c.nome + '". Um cofre nao pode conter outro.');
    if (id && c.id === id) throw new ErroValidacao('Ja tens um cofre com este identificador ("' + c.nome + '"). Se copiaste a pasta, cria um cofre novo em vez de abrir a copia.');
  }
}

export async function criarCofre(dir: string, nome: string, comExemplo: boolean, registados: CofreRegisto[]): Promise<CofreMeta> {
  const n = nome.trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, 60);
  if (!n) throw new ErroValidacao('O cofre precisa de um nome.');
  await verificarPasta(dir);
  const existente = await lerCofre(dir);
  if (existente) throw new ErroValidacao('Esta pasta ja e um cofre ("' + existente.nome + '"). Usa "Abrir pasta como cofre".');
  await validarNovoCofre(dir, null, registados);
  const meta: CofreMeta = { id: novoIdCofre(), nome: n, descricao: '' };
  await converterEmCofre(dir, meta);
  if (comExemplo) await criarExemplo(dir);
  return meta;
}

/** Transforma uma pasta existente em cofre (não toca nos ficheiros que já lá estão). */
export async function converterEmCofre(dir: string, meta: CofreMeta): Promise<void> {
  await gravar(path.join(dir, FICHEIRO_COFRE), escrever({ id: meta.id, nome: meta.nome }, meta.descricao || 'Cofre de notas. Cada pagina e um ficheiro .md; cada cartao tambem.'));
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
  await guardarBoard(dir, {
    nome: 'Primeiro board',
    descricao: 'Muda os estados em Configurar. O ultimo estado marcado como final conta como feito.',
    estados: [
      { id: 'a-fazer', nome: 'A fazer' },
      { id: 'em-curso', nome: 'Em curso' },
      { id: 'bloqueado', nome: 'Bloqueado' },
      { id: 'feito', nome: 'Feito', fim: true }
    ]
  });
  const G = 'Guia de utilização';
  const paginas: [string, string][] = [
    ['Bem-vindo', `# Bem-vindo

O Developer SecondBrain guarda tudo em ficheiros Markdown dentro de uma pasta (o **cofre**). Podes editá-los aqui ou em qualquer editor, e partilhar a pasta com a equipa por OneDrive, Dropbox ou git.

Esta coleção é um guia rápido. É uma coleção como as outras: podes renomeá-la, editá-la ou apagá-la.

- [[Docs, coleções e subpáginas]]
- [[Boards e cartões]]
- [[Markdown suportado]]
- [[Cofres, equipa e conflitos]]
`],
    ['Docs, coleções e subpáginas', `# Docs, coleções e subpáginas

- Uma **coleção** é uma pasta em Docs (menu lateral, secção Docs). Cria uma com o **+** e renomeia com o lápis.
- Dentro de uma coleção crias **páginas** e **subpáginas** (botão **+** da linha ou **+ Subpágina**).
- Arrasta uma página para cima de outra para a tornar subpágina.
- No menu **⋯** (ou botão direito) renomeias, moves ou apagas. As subpáginas vão com a página.
- Liga páginas com \`[[Nome da página]]\`. Em baixo de cada página vês onde ela é referida.
- Os ficheiros apagados vão para \`.lixo/\` e podem ser recuperados.
`],
    ['Boards e cartões', `# Boards e cartões

- Cada board tem colunas (estados). Muda-as em **Configurar**; a última marcada como final conta como feito.
- Cada cartão é um ficheiro Markdown. Clica num cartão para o abrir; clicar fora fecha e guarda.
- O **Responsável** vem da equipa do cofre. Gere-a em **Equipa**, no próprio board.
- Arrasta cartões entre colunas. A página **Hoje** mostra o teu trabalho em aberto e os prazos.
- Liga um cartão a partir de um doc com \`[[#id]]\`.
`],
    ['Markdown suportado', `# Markdown suportado

## Tarefas (clica para marcar)
- [x] Listas de tarefas
- [ ] Clicáveis na leitura

## Texto
**negrito**, *itálico*, ~~riscado~~, ==destaque==, H~2~O, x^2^, \`código\`, <kbd>Ctrl</kbd> + <kbd>K</kbd>, emojis :tada:

## Avisos
> [!NOTE]
> Também existem TIP, IMPORTANT, WARNING e CAUTION.

## Código
\`\`\`ts
const soma = (a: number, b: number) => a + b;
\`\`\`

## Tabelas, notas e mais
| Coluna | Valor |
| --- | --- |
| A | 1 |

Nota de rodapé[^1].

[^1]: Aparece no fim da página.

<details><summary>Secção recolhível</summary>

Conteúdo escondido.

</details>

Diagramas: usa um bloco de código com a linguagem mermaid. Imagens coladas com Ctrl+V ficam em \`_anexos/\`.
`],
    ['Cofres, equipa e conflitos', `# Cofres, equipa e conflitos

- Podes ter vários cofres (pessoal e partilhados). Troca com **Ctrl+Shift+O**; **Ctrl+K** pesquisa tudo.
- Num cofre partilhado cada pessoa corre a sua própria app sobre a mesma pasta.
- Se duas pessoas editarem o mesmo ficheiro ao mesmo tempo, a app avisa e deixa-te escolher que versão manter. Cópias de conflito do OneDrive/Dropbox aparecem na secção de conflitos.
`]
  ];
  for (const [nome, texto] of paginas) await gravar(path.join(dir, 'Docs', G, nome + '.md'), texto);
}
