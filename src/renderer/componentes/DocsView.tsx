import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete';
import { api, eConflito, mensagemDe } from '../lib/api';
import { cabecalhos, desenharMermaid, renderMarkdown } from '../lib/markdown';
import { fmtAtras, useCarregar, useDebounce } from '../lib/util';
import type { CofreInfo, ConflitoDados, DocLido, DocResumo } from '../../shared/types';
import { Confirmar, Modal } from './Modal';

interface Props { cofre: CofreInfo; pasta: string; tick: number; path: string | null; onPath: (p: string | null) => void; onIr: (pasta: string, path: string | null) => void; onAbrirCartao: (boardId: string, id: string) => void }

type Dlg =
  | { t: 'pagina'; pai: string; nome: string }
  | { t: 'renomear'; key: string; nome: string }
  | { t: 'apagar'; key: string; n: number };

const ultimo = (p: string) => p.replace(/^.*\//, '');
const paiDe = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const junta = (a: string, b: string) => (a ? a + '/' + b : b);
const limpaNome = (n: string) => n.trim().replace(/[\\/]+/g, '-').replace(/\.md$/i, '');
const semMd = (p: string) => p.replace(/\.md$/i, '');

/** Páginas onde se pode "pendurar" uma subpágina (a chave é o caminho da página sem .md = a sua pasta). */
export function opcoesPai(docs: DocResumo[], pastas: string[], base: string, excluir?: string): { v: string; label: string }[] {
  const m = new Map<string, string>();
  for (const p of pastas) m.set(p, ultimo(p));
  for (const d of docs) m.set(semMd(d.path), d.titulo || ultimo(semMd(d.path)));
  return [...m.entries()]
    .filter(([k]) => (!base || k.startsWith(base + '/')) && (!excluir || (k !== excluir && !k.startsWith(excluir + '/'))))
    .sort((x, y) => x[0].localeCompare(y[0], 'pt'))
    .map(([k, label]) => ({ v: k, label: '\u00A0\u00A0'.repeat((base ? k.slice(base.length + 1) : k).split('/').length - 1) + (k.includes('/') ? '↳ ' : '') + label }));
}

export function DocsView({ cofre, pasta, tick, path, onPath, onIr, onAbrirCartao }: Props) {
  const cofreId = cofre.id;
  const lista = useCarregar(() => api.docs(cofreId), [cofreId, tick]);
  const listaPastas = useCarregar(() => api.pastasDocs(cofreId), [cofreId, tick]);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; key: string } | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const todosDocs = lista.dados ?? [];
  const raizNomes = useMemo(() => new Set(todosDocs.filter((d) => !d.path.includes('/')).map((d) => semMd(d.path))), [todosDocs]);
  const naRaiz = (p: string) => { const i = p.indexOf('/'); return i < 0 || raizNomes.has(p.slice(0, i)); };
  const docs = pasta ? todosDocs.filter((d) => d.path.startsWith(pasta + '/')) : todosDocs.filter((d) => naRaiz(d.path));
  const todasPastas = listaPastas.dados ?? [];
  const pastasVis = pasta ? todasPastas.filter((p) => p === pasta || p.startsWith(pasta + '/')) : todasPastas.filter((p) => raizNomes.has(p.split('/')[0]));

  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const arvore = useMemo(() => construirArvore(docs, pasta, pastasVis), [docs, pasta, pastasVis]);
  const alternar = (k: string) => setFechadas((f) => { const n = new Set(f); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  useEffect(() => { if (!path && docs.length) onPath([...docs].sort((x, y) => x.path.localeCompare(y.path))[0].path); }, [path, docs.length, pasta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!menu) return;
    const f = () => setMenu(null);
    window.addEventListener('mousedown', f); window.addEventListener('blur', f);
    return () => { window.removeEventListener('mousedown', f); window.removeEventListener('blur', f); };
  }, [menu]);

  const abrir = (d: Dlg) => { setErro(''); setMenu(null); setDlg(d); };
  const recarregar = () => { lista.recarregar(); listaPastas.recarregar(); };
  const falha = (e: unknown) => setErro(mensagemDe(e));
  const temPagina = (key: string) => todosDocs.some((d) => d.path === key + '.md');
  const temPasta = (key: string) => todasPastas.includes(key);
  const opcoes = useMemo(() => opcoesPai(todosDocs, todasPastas, pasta), [todosDocs, todasPastas, pasta]);

  const criarPagina = async () => {
    if (dlg?.t !== 'pagina') return;
    try {
      const nome = limpaNome(dlg.nome);
      if (!nome) return;
      const d = await api.criarDoc(cofreId, junta(dlg.pai, nome) + '.md', `# ${nome}\n\n`);
      setDlg(null); recarregar(); onPath(d.path);
      setFechadas((f) => { const n = new Set(f); n.delete(dlg.pai); return n; });
    } catch (e) { falha(e); }
  };
  /** Atualiza a seleção depois de uma página/pasta mudar de sítio (de → para são chaves sem .md). */
  const aposMover = (de: string, para: string) => {
    const reP = (x: string) => (x === de + '.md' ? para + '.md' : x.startsWith(de + '/') ? para + x.slice(de.length) : x);
    const novoPath = path ? reP(path) : path;
    const novaPasta = pasta === de ? para : pasta.startsWith(de + '/') ? para + pasta.slice(de.length) : pasta;
    if (novaPasta !== pasta) onIr(novaPasta, novoPath); else if (novoPath !== path) onPath(novoPath);
  };
  /** Move uma página (e as suas subpáginas) para outra chave. */
  const moverNo = async (de: string, para: string) => {
    if (de === para) return;
    if (temPagina(de)) await api.moverDoc(cofreId, de + '.md', para + '.md');
    if (temPasta(de)) await api.renomearPasta(cofreId, de, para);
    aposMover(de, para);
  };
  const renomear = async () => {
    if (dlg?.t !== 'renomear') return;
    try {
      const nome = limpaNome(dlg.nome);
      if (!nome) return;
      await moverNo(dlg.key, junta(paiDe(dlg.key), nome));
      setDlg(null); recarregar();
    } catch (e) { falha(e); }
  };
  const apagarNo = async () => {
    if (dlg?.t !== 'apagar') return;
    try {
      const k = dlg.key;
      if (temPagina(k)) await api.apagarDoc(cofreId, k + '.md');
      if (temPasta(k)) await api.apagarPasta(cofreId, k);
      setDlg(null); recarregar();
      if (pasta === k || pasta.startsWith(k + '/')) onIr('', null); else if (path && (path === k + '.md' || path.startsWith(k + '/'))) onPath(null);
    } catch (e) { falha(e); }
  };
  const soltar = (destino: string, e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setSobre(null);
    const origem = e.dataTransfer.getData('text/x-no');
    if (!origem || origem === destino || destino.startsWith(origem + '/') || paiDe(origem) === destino) return;
    void moverNo(origem, junta(destino, ultimo(origem))).then(recarregar).catch(falha);
  };
  const acoes: AcoesArvore = {
    alternar, onPath, sobre, setSobre, soltar,
    novaSub: (k) => abrir({ t: 'pagina', pai: k, nome: '' }),
    menu: (x, y, key) => setMenu({ x, y, key })
  };
  const nPaginas = (k: string) => todosDocs.filter((d) => d.path === k + '.md' || d.path.startsWith(k + '/')).length;
  const menuColecao = !!menu && menu.key === pasta;

  return (
    <div className="docs-l">
      <nav className="docs-nav" aria-label="Páginas">
        <div className={'linha nav-cab' + (sobre === '#raiz' ? ' sobre' : '')} style={{ justifyContent: 'space-between' }}
          onDragOver={(e) => { e.preventDefault(); setSobre('#raiz'); }} onDragLeave={() => setSobre(null)} onDrop={(e) => soltar(pasta, e)}>
          <b className="fl" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pasta ? ultimo(pasta) : 'Sem coleção'}</b>
          <span className="linha" style={{ gap: 4 }}>
            {pasta && <button className="icone-b" style={{ background: 'var(--sup)', width: 28, height: 28 }} aria-label="Ações da coleção (renomear, apagar)" title="Renomear ou apagar a coleção" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4, key: pasta }); }}>⋯</button>}
            <button className="icone-b" style={{ background: 'var(--sup)', width: 28, height: 28, fontSize: 16 }} aria-label="Nova página" title="Nova página" onClick={() => abrir({ t: 'pagina', pai: pasta, nome: '' })}>+</button>
          </span>
        </div>
        {docs.length === 0 && <div className="vazio" style={{ padding: 16 }}>Sem páginas aqui. Cria a primeira com o botão +.</div>}
        <Ramo no={arvore} nivel={0} path={path} fechadas={fechadas} ac={acoes} />
        <div className="muted" style={{ fontSize: 12, padding: '12px 10px 0' }}>Arrasta uma página para cima de outra para a tornar subpágina.</div>
      </nav>
      {path ? <Pagina key={cofreId + path} cofre={cofre} path={path} tick={tick} docs={todosDocs} pastas={todasPastas} onPath={onPath} onAbrirCartao={onAbrirCartao} onNovaSub={(k) => abrir({ t: 'pagina', pai: k, nome: '' })} onApagado={() => { recarregar(); onPath(null); }} onGuardado={lista.recarregar} onMovido={(p) => { recarregar(); onPath(p); }} /> : <div className="artigo"><div className="vazio">Escolhe uma página à esquerda.</div></div>}
      {erro && !dlg && <div className="aviso-b" style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 60 }} onClick={() => setErro('')}>{erro}</div>}
      {menu && (
        <div className="menu-pop" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={() => abrir({ t: 'pagina', pai: menu.key, nome: '' })}>Nova subpágina</button>
          <button onClick={() => abrir({ t: 'renomear', key: menu.key, nome: ultimo(menu.key) })}>{menuColecao ? 'Renomear coleção' : 'Renomear'}</button>
          <button className="perigo-t" onClick={() => abrir({ t: 'apagar', key: menu.key, n: nPaginas(menu.key) })}>{menuColecao ? 'Apagar coleção…' : 'Apagar…'}</button>
        </div>
      )}
      {dlg?.t === 'pagina' && (
        <Modal titulo={dlg.pai && dlg.pai !== pasta ? 'Nova subpágina' : 'Nova página'} onFechar={() => setDlg(null)}>
          <label className="rotulo">Nome<input className="campo" autoFocus value={dlg.nome} placeholder="Ex.: Decisão sobre filas" onChange={(e) => setDlg({ ...dlg, nome: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void criarPagina()} /></label>
          <label className="rotulo">Dentro de
            <select className="campo" value={dlg.pai} onChange={(e) => setDlg({ ...dlg, pai: e.target.value })}>
              <option value={pasta}>{pasta ? ultimo(pasta) + ' (raiz da coleção)' : 'Raiz dos Docs'}</option>
              {opcoes.filter((o) => o.v !== pasta).map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
          {erro && <div className="erro-t">{erro}</div>}
          <div className="linha" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setDlg(null)}>Cancelar</button><button className="btn pri" disabled={!dlg.nome.trim()} onClick={() => void criarPagina()}>Criar</button></div>
        </Modal>
      )}
      {dlg?.t === 'renomear' && (
        <Modal titulo={dlg.key === pasta ? 'Renomear coleção' : 'Renomear página'} onFechar={() => setDlg(null)}>
          <label className="rotulo">Nome<input className="campo" autoFocus value={dlg.nome} onChange={(e) => setDlg({ ...dlg, nome: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void renomear()} /></label>
          <div className="muted" style={{ fontSize: 13 }}>Muda o nome do ficheiro (e da pasta das subpáginas). O título dentro da página não muda.</div>
          {erro && <div className="erro-t">{erro}</div>}
          <div className="linha" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setDlg(null)}>Cancelar</button><button className="btn pri" disabled={!dlg.nome.trim()} onClick={() => void renomear()}>Renomear</button></div>
        </Modal>
      )}
      {dlg?.t === 'apagar' && (
        <Confirmar titulo={`Apagar "${ultimo(dlg.key)}"?`} texto={`${dlg.n > 1 ? `Inclui ${dlg.n - 1} subpágina${dlg.n === 2 ? '' : 's'}. ` : ''}Vai para a pasta .lixo do cofre e pode ser recuperado dali.`} ok="Apagar" perigo onOk={() => void apagarNo()} onFechar={() => setDlg(null)} />
      )}
    </div>
  );
}

function Pagina({ cofre, path, tick, docs, pastas, onPath, onAbrirCartao, onNovaSub, onApagado, onGuardado, onMovido }: { cofre: CofreInfo; path: string; tick: number; docs: DocResumo[]; pastas: string[]; onPath: (p: string | null) => void; onAbrirCartao: (b: string, id: string) => void; onNovaSub: (key: string) => void; onApagado: () => void; onGuardado: () => void; onMovido: (p: string) => void }) {
  const cofreId = cofre.id;
  const [doc, setDoc] = useState<DocLido | null>(null);
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState<'ler' | 'editar'>('ler');
  const [estado, setEstado] = useState('');
  const [conflito, setConflito] = useState<ConflitoDados['atual'] | null>(null);
  const [apagar, setApagar] = useState(false);
  const [mover, setMover] = useState<{ pai: string; nome: string } | null>(null);
  const [erro, setErro] = useState('');
  const hash = useRef('');
  const sujo = useRef(false);
  const tRef = useRef(''); tRef.current = texto;
  const docsRef = useRef(docs); docsRef.current = docs;

  const carregar = () => api.lerDoc(cofreId, path).then((d) => { setDoc(d); setTexto(d.texto); hash.current = d.hash; sujo.current = false; setEstado(''); }).catch((e) => setErro(mensagemDe(e)));
  useEffect(() => { void carregar(); }, [cofreId, path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!sujo.current) void carregar(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const guardar = async (forcar?: string) => {
    if (!sujo.current && !forcar) return;
    try {
      const r = await api.gravarDoc(cofreId, path, tRef.current, forcar ?? hash.current);
      hash.current = r.hash; sujo.current = false; setEstado('Guardado ' + fmtAtras(r.mod)); setConflito(null); onGuardado();
    } catch (e) {
      if (eConflito(e)) { setConflito((e.dados as ConflitoDados).atual); setEstado('Conflito'); } else setEstado(mensagemDe(e));
    }
  };
  const deb = useDebounce(() => void guardar(), 900);
  useEffect(() => () => { if (sujo.current) void guardar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mudou = (t: string) => { setTexto(t); tRef.current = t; sujo.current = true; setEstado('A guardar…'); deb.chamar(); };

  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const html = useMemo(() => renderMarkdown(texto, { cofreId, baseDir: dir }), [texto, cofreId, dir]);
  const lerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (modo === 'ler' && lerRef.current) void desenharMermaid(lerRef.current); }, [html, modo]);
  const toc = useMemo(() => cabecalhos(texto), [texto]);
  const refs = useCarregar(() => api.referidoEm(cofreId, { tipo: 'doc', titulo: docs.find((d) => d.path === path)?.titulo || path.replace(/^.*\//, '').replace(/\.md$/i, ''), ref: path }), [cofreId, path, tick, doc?.path]);

  const alternarTarefa = (linha: number) => {
    const ls = tRef.current.split('\n');
    const l = ls[linha];
    if (l === undefined) return;
    const nova = l.replace(/\[([ xX])\]/, (_m, c: string) => (c === ' ' ? '[x]' : '[ ]'));
    if (nova === l) return;
    ls[linha] = nova;
    mudou(ls.join('\n'));
  };

  const abrirLiga = (alvo: string) => {
    if (alvo.startsWith('#')) return;
    const a = alvo.toLowerCase();
    const d = docsRef.current.find((x) => x.titulo.toLowerCase() === a || x.path.replace(/\.md$/i, '').toLowerCase() === a || x.path.replace(/^.*\//, '').replace(/\.md$/i, '').toLowerCase() === a);
    if (d) onPath(d.path); else setErro(`Página "${alvo}" não encontrada`);
  };

  const irCabecalho = (i: number) => lerRef.current?.querySelector(`[data-h="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (!doc) return <div className="artigo"><div className="vazio">{erro || 'A carregar…'}</div></div>;
  const caminho = [cofre.nome, 'Docs', ...path.replace(/\.md$/i, '').split('/').slice(0, -1)].join(' / ');
  return (
    <>
      <article className="artigo">
        <div className="in">
          <div className="col" style={{ gap: 10 }}>
            <div className="linha muted" style={{ fontSize: 13, gap: 10 }}>
              <span className="fl" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={caminho}>{caminho}</span>
              <span style={{ color: estado === 'Conflito' ? 'var(--terra)' : 'var(--salvia)', whiteSpace: 'nowrap' }}>{estado}</span>
            </div>
            <div className="linha quebra" style={{ gap: 8 }}>
              <button className={'btn' + (modo === 'editar' ? ' pri' : '')} style={{ height: 32 }} onClick={() => { if (modo === 'editar') { deb.cancelar(); void guardar(); setModo('ler'); } else setModo('editar'); }}>{modo === 'editar' ? 'Concluir edição' : 'Editar'}</button>
              <button className="btn" style={{ height: 32 }} onClick={() => onNovaSub(semMd(path))}>+ Subpágina</button>
              <button className="btn" style={{ height: 32 }} onClick={() => void api.mostrarNoExplorador(cofreId, 'Docs/' + path)}>Abrir pasta</button>
              <button className="btn" style={{ height: 32 }} onClick={() => { setErro(''); setMover({ pai: paiDe(path), nome: ultimo(semMd(path)) }); }}>Mover</button>
              <span className="fl" />
              <button className="btn perigo" style={{ height: 32 }} onClick={() => setApagar(true)}>Apagar</button>
            </div>
          </div>
          {erro && <div className="aviso-b" onClick={() => setErro('')}>{erro}</div>}
          {modo === 'editar'
            ? <div className="cm-caixa"><div className="muted" style={{ fontSize: 12, padding: '8px 14px 0' }}>A editar · Markdown · [[ para ligar páginas · cola imagens com Ctrl+V</div><Cm texto={texto} onMudou={mudou} docs={docs} onImagem={async (f) => { const ext = (f.name.split('.').pop() || f.type.split('/')[1] || 'png'); return api.guardarAnexo(cofreId, path, ext, new Uint8Array(await f.arrayBuffer())); }} /></div>
            : <div className="md" ref={lerRef} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                onClick={(e) => {
                  const alvo = e.target as HTMLElement;
                  if (alvo instanceof HTMLInputElement && alvo.dataset.linha) { alternarTarefa(Number(alvo.dataset.linha)); return; }
                  const a = alvo.closest('a'); if (!a) return;
                  if (a.dataset.wiki) { e.preventDefault(); abrirLiga(a.dataset.wiki); }
                  else if (a.getAttribute('href')?.startsWith('#')) { e.preventDefault(); const id = decodeURIComponent(a.getAttribute('href')!.slice(1)); lerRef.current?.querySelector(`[id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
                }}
                dangerouslySetInnerHTML={{ __html: html }} />}
          <section className="col rodape-ref" style={{ borderTop: '1px solid var(--linha)', paddingTop: 16, gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Referido em</span>
            <div className="linha quebra">
              {(refs.dados ?? []).length === 0 && <span className="muted" style={{ fontSize: 13 }}>Ninguém aponta para aqui. Usa [[{docs.find((d) => d.path === path)?.titulo || path.replace(/^.*\//, '').replace(/\.md$/i, '')}]] noutra página ou cartão.</span>}
              {(refs.dados ?? []).map((r) => (
                <button key={r.ref} className="ref" onClick={() => { if (r.tipo === 'doc') onPath(r.ref); else { const [b, id] = r.ref.split('/'); onAbrirCartao(b, id); } }}>
                  {r.tipo === 'cartao' && <span className="ponto" style={{ width: 6, height: 6 }} />}{r.titulo}
                </button>
              ))}
            </div>
          </section>
        </div>
      </article>
      <aside className="toc" aria-label="Nesta página">
        <b>Nesta página</b>
        {toc.length === 0 && <span className="muted">Sem títulos.</span>}
        {toc.map((h, i) => <a key={i} className={i === 0 ? 'on' : ''} style={{ marginLeft: (h.nivel - 1) * 8 }} onClick={() => modo === 'ler' && irCabecalho(i)}>{h.texto}</a>)}
      </aside>
      {mover !== null && (
        <Modal titulo="Mover / renomear página" onFechar={() => setMover(null)}>
          <label className="rotulo">Nome<input className="campo" autoFocus value={mover.nome} onChange={(e) => setMover({ ...mover, nome: e.target.value })} /></label>
          <label className="rotulo">Dentro de
            <select className="campo" value={mover.pai} onChange={(e) => setMover({ ...mover, pai: e.target.value })}>
              <option value="">Raiz dos Docs</option>
              {opcoesPai(docs, pastas, '', semMd(path)).map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
          <div className="muted" style={{ fontSize: 13 }}>As subpáginas vão com ela. As ligações [[Página]] continuam a funcionar enquanto o título não mudar.</div>
          {erro && <div className="erro-t">{erro}</div>}
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="btn g" onClick={() => setMover(null)}>Cancelar</button>
            <button className="btn g pri" disabled={!limpaNome(mover.nome)} onClick={() => {
              const de = semMd(path); const para = junta(mover.pai, limpaNome(mover.nome));
              if (para === de) { setMover(null); return; }
              void guardar().then(async () => { await api.moverDoc(cofreId, path, para + '.md'); if (pastas.includes(de)) await api.renomearPasta(cofreId, de, para); }).then(() => { setMover(null); onMovido(para + '.md'); }).catch((e) => setErro(mensagemDe(e)));
            }}>Mover</button>
          </div>
        </Modal>
      )}
      {apagar && <Confirmar titulo="Apagar página?" texto={`${pastas.includes(semMd(path)) ? 'As subpáginas também são apagadas. ' : ''}Vai para a pasta .lixo do cofre e pode ser recuperado dali.`} ok="Apagar" perigo onOk={() => { deb.cancelar(); sujo.current = false; void api.apagarDoc(cofreId, path).then(() => (pastas.includes(semMd(path)) ? api.apagarPasta(cofreId, semMd(path)) : undefined)).then(onApagado); }} onFechar={() => setApagar(false)} />}
      {conflito && (
        <Modal titulo="Alguém alterou esta página" onFechar={() => setConflito(null)}>
          <div className="muted">O ficheiro mudou noutro PC enquanto editavas.</div>
          <div className="linha quebra" style={{ justifyContent: 'flex-end' }}>
            <button className="btn g" onClick={() => { sujo.current = false; setConflito(null); setTexto(conflito.texto); hash.current = conflito.hash; setEstado(''); }}>Ficar com a deles</button>
            <button className="btn g" onClick={() => { const t = `<<<<<<< a minha\n${tRef.current}\n=======\n${conflito.texto}\n>>>>>>> a deles\n`; setTexto(t); tRef.current = t; sujo.current = true; void guardar(conflito.hash); setModo('editar'); }}>Juntar (com marcas)</button>
            <button className="btn g pri" onClick={() => void guardar(conflito.hash)}>Manter a minha</button>
          </div>
        </Modal>
      )}
    </>
  );
}

const realce = HighlightStyle.define([
  { tag: t.heading, fontWeight: '600', color: 'var(--tinta)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: [t.link, t.url], color: 'var(--terra)' },
  { tag: t.monospace, color: 'var(--salvia)' },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: 'var(--tinta3)' },
  { tag: t.quote, color: 'var(--tinta2)' }
]);

function Cm({ texto, onMudou, docs, onImagem }: { texto: string; onMudou: (t: string) => void; docs: DocResumo[]; onImagem: (f: File) => Promise<string> }) {
  const el = useRef<HTMLDivElement>(null);
  const cb = useRef(onMudou); cb.current = onMudou;
  const dr = useRef(docs); dr.current = docs;
  const im = useRef(onImagem); im.current = onImagem;
  useEffect(() => {
    const completar = (c: CompletionContext) => {
      const m = c.matchBefore(/\[\[[^\]\n]*/);
      if (!m) return null;
      return { from: m.from + 2, options: dr.current.map((d) => ({ label: d.titulo || d.path, apply: (d.titulo || d.path) + ']]' })) };
    };
    const view = new EditorView({
      parent: el.current!,
      state: EditorState.create({
        doc: texto,
        extensions: [history(), keymap.of([...defaultKeymap, ...historyKeymap]), markdown(), syntaxHighlighting(realce), EditorView.lineWrapping, placeholder('Escreve em Markdown. [[ para ligar a outra página.'), autocompletion({ override: [completar] }),
          EditorView.updateListener.of((u) => { if (u.docChanged) cb.current(u.state.doc.toString()); }),
          EditorView.domEventHandlers({
            paste(e, v) {
              const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith('image/'));
              if (!f) return false;
              e.preventDefault();
              void im.current(f).then((rel) => v.dispatch(v.state.replaceSelection(`![](${rel})`)));
              return true;
            }
          })]
      })
    });
    view.focus();
    return () => view.destroy();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={el} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }} />;
}

interface No { key: string; nome: string; doc?: DocResumo; filhos: No[]; total: number }

function construirArvore(docs: DocResumo[], base: string, pastas: string[]): No {
  const raiz: No = { key: base, nome: base, filhos: [], total: 0 };
  const mapa = new Map<string, No>([[base, raiz]]);
  const garantir = (key: string): No => {
    const ex = mapa.get(key);
    if (ex) return ex;
    const pai = garantir(paiDe(key) === '' && base ? base : paiDe(key));
    const n: No = { key, nome: ultimo(key), filhos: [], total: 0 };
    pai.filhos.push(n); mapa.set(key, n);
    return n;
  };
  for (const p of pastas) if (p !== base && (!base || p.startsWith(base + '/'))) garantir(p);
  for (const d of docs) { const n = garantir(semMd(d.path)); n.doc = d; n.nome = d.titulo || ultimo(semMd(d.path)); }
  const fim = (n: No): number => { n.filhos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt')); n.total = n.filhos.reduce((t, f) => t + fim(f), n.doc ? 1 : 0); return n.total; };
  fim(raiz);
  return raiz;
}

interface AcoesArvore {
  alternar: (k: string) => void;
  onPath: (p: string) => void;
  sobre: string | null;
  setSobre: (k: string | null) => void;
  soltar: (destino: string, e: React.DragEvent) => void;
  novaSub: (key: string) => void;
  menu: (x: number, y: number, key: string) => void;
}

function Ramo({ no, nivel, path, fechadas, ac }: { no: No; nivel: number; path: string | null; fechadas: Set<string>; ac: AcoesArvore }) {
  return (
    <div className="col" style={{ gap: 2 }}>
      {no.filhos.map((f) => {
        const fechada = fechadas.has(f.key);
        const tem = f.filhos.length > 0;
        const ativo = !!f.doc && f.doc.path === path;
        return (
          <div key={f.key} className="col" style={{ gap: 2 }}>
            <div className={'linha pag-l' + (ativo ? ' ativo' : '') + (ac.sobre === f.key ? ' sobre' : '')} style={{ paddingLeft: 4 + nivel * 14 }}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData('text/x-no', f.key); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); ac.setSobre(f.key); }}
              onDragLeave={() => ac.setSobre(null)}
              onDrop={(e) => ac.soltar(f.key, e)}
              onContextMenu={(e) => { e.preventDefault(); ac.menu(e.clientX, e.clientY, f.key); }}>
              <button className="seta-b" tabIndex={tem ? 0 : -1} aria-label={fechada ? 'Expandir' : 'Recolher'} style={{ visibility: tem ? 'visible' : 'hidden' }} onClick={() => ac.alternar(f.key)}>{fechada ? '▸' : '▾'}</button>
              <button className="fl pag-b" onClick={() => (f.doc ? ac.onPath(f.doc.path) : ac.alternar(f.key))}>{f.nome}</button>
              <button className="icone-b pasta-add muted" title="Nova subpágina" aria-label={`Nova subpágina em ${f.nome}`} onClick={() => ac.novaSub(f.key)}>+</button>
              <button className="icone-b pasta-add muted" title="Mais ações" aria-label={`Ações de ${f.nome}`} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); ac.menu(r.left, r.bottom + 4, f.key); }}>⋯</button>
            </div>
            {tem && !fechada && <Ramo no={f} nivel={nivel + 1} path={path} fechadas={fechadas} ac={ac} />}
          </div>
        );
      })}
    </div>
  );
}
