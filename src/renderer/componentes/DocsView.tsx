import { useEffect, useMemo, useRef, useState } from 'react';
import { api, eConflito, mensagemDe } from '../lib/api';
import { cabecalhos } from '../lib/markdown';
import { fmtAtras, useCarregar, useDebounce } from '../lib/util';
import type { CofreInfo, ConflitoDados, DocLido, DocResumo } from '../../shared/types';
import { Confirmar, Modal } from './Modal';
import { Editor, VistaMd, alternarLinha } from './Markdown';
import { Mais } from './Icones';

interface Props {
  cofre: CofreInfo;
  pasta: string;
  tick: number;
  path: string | null;
  onPath: (p: string | null) => void;
  onIr: (pasta: string, path: string | null) => void;
  onAbrirCartao: (boardId: string, id: string) => void;
  onLiga: (alvo: string, pastaSugerida: string) => void;
}

type Dlg =
  | { t: 'pagina'; pai: string; nome: string }
  | { t: 'renomear'; key: string; nome: string }
  | { t: 'apagar'; key: string; n: number };

const ultimo = (p: string) => p.replace(/^.*\//, '');
const paiDe = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
const junta = (a: string, b: string) => (a ? a + '/' + b : b);
export const limpaNome = (n: string) => n.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\.md$/i, '').replace(/^[. ]+|[. ]+$/g, '');
const semMd = (p: string) => p.replace(/\.md$/i, '');

/** Pages a sub-page can hang from (the key is the page path without .md, which is also its folder). */
export function opcoesPai(docs: DocResumo[], pastas: string[], base: string, excluir?: string): { v: string; label: string }[] {
  const m = new Map<string, string>();
  for (const p of pastas) m.set(p, ultimo(p));
  for (const d of docs) m.set(semMd(d.path), d.titulo || ultimo(semMd(d.path)));
  return [...m.entries()]
    .filter(([k]) => (!base || k.startsWith(base + '/')) && (!excluir || (k !== excluir && !k.startsWith(excluir + '/'))))
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([k, label]) => ({ v: k, label: '  '.repeat((base ? k.slice(base.length + 1) : k).split('/').length - 1) + (k.includes('/') ? '↳ ' : '') + label }));
}

export function DocsView({ cofre, pasta, tick, path, onPath, onIr, onAbrirCartao, onLiga }: Props) {
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
  useEffect(() => {
    if (path || !docs.length) return;
    // open the collection's overview (or first page) automatically
    const ord = [...docs].sort((x, y) => x.path.split('/').length - y.path.split('/').length || x.path.localeCompare(y.path));
    const visao = ord.find((d) => /\/(overview|vis[aã]o geral|welcome|readme|index)\.md$/i.test(d.path));
    onPath((visao ?? ord[0]).path);
  }, [path, docs.length, pasta]); // eslint-disable-line react-hooks/exhaustive-deps
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
      const d = await api.criarDoc(cofreId, junta(dlg.pai, nome) + '.md', `# ${dlg.nome.trim()}\n\n`);
      setDlg(null); recarregar(); onPath(d.path);
      setFechadas((f) => { const n = new Set(f); n.delete(dlg.pai); return n; });
    } catch (e) { falha(e); }
  };
  /** Keeps the selection in sync after a page/sub-tree moves (keys have no .md). */
  const aposMover = (de: string, para: string) => {
    const reP = (x: string) => (x === de + '.md' ? para + '.md' : x.startsWith(de + '/') ? para + x.slice(de.length) : x);
    const novoPath = path ? reP(path) : path;
    const novaPasta = pasta === de ? para : pasta.startsWith(de + '/') ? para + pasta.slice(de.length) : pasta;
    if (novaPasta !== pasta) onIr(novaPasta, novoPath); else if (novoPath !== path) onPath(novoPath);
  };
  /** Moves a page together with its sub-pages. */
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
      <nav className="docs-nav" aria-label="Pages">
        <div className={'linha nav-cab' + (sobre === '#raiz' ? ' sobre' : '')}
          onDragOver={(e) => { e.preventDefault(); setSobre('#raiz'); }} onDragLeave={() => setSobre(null)} onDrop={(e) => soltar(pasta, e)}>
          <span className="fl col" style={{ minWidth: 0 }}>
            <span className="sup">Collection</span>
            <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pasta ? ultimo(pasta) : 'Loose pages'}</b>
          </span>
          {pasta && <button className="icone-b cinza" style={{ width: 28, height: 28 }} aria-label="Collection actions" title="Rename or delete the collection" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ x: r.left, y: r.bottom + 4, key: pasta }); }}><Mais /></button>}
          <button className="icone-b cinza" style={{ width: 28, height: 28, fontSize: 16 }} aria-label="New page" title="New page" onClick={() => abrir({ t: 'pagina', pai: pasta, nome: '' })}>+</button>
        </div>
        {docs.length === 0 && <div className="vazio" style={{ padding: 16 }}>No pages yet. Create the first one with +.</div>}
        <Ramo no={arvore} nivel={0} path={path} fechadas={fechadas} ac={acoes} />
        <span className="fl" />
        <div className="muted" style={{ fontSize: 12, padding: '12px 10px 0' }}>Drag a page onto another to nest it.</div>
      </nav>
      {path
        ? <Pagina key={cofreId + path} cofre={cofre} path={path} tick={tick} docs={todosDocs} pastas={todasPastas} onPath={onPath} onAbrirCartao={onAbrirCartao} onLiga={onLiga}
            onNovaSub={(k) => abrir({ t: 'pagina', pai: k, nome: '' })} onApagado={() => { recarregar(); onPath(null); }} onGuardado={lista.recarregar} onMovido={(p) => { recarregar(); onPath(p); }} />
        : <div className="artigo"><div className="vazio">{docs.length ? 'Pick a page on the left.' : 'This collection is empty.'}<br /><br /><button className="btn" onClick={() => abrir({ t: 'pagina', pai: pasta, nome: '' })}>+ New page</button></div></div>}
      {erro && !dlg && <div className="aviso-b toast" onClick={() => setErro('')}>{erro}</div>}
      {menu && (
        <div className="menu-pop" style={{ left: menu.x, top: menu.y }} onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={() => abrir({ t: 'pagina', pai: menu.key, nome: '' })}>{menuColecao ? 'New page' : 'New sub-page'}</button>
          <button onClick={() => abrir({ t: 'renomear', key: menu.key, nome: ultimo(menu.key) })}>{menuColecao ? 'Rename collection' : 'Rename'}</button>
          <button className="perigo-t" onClick={() => abrir({ t: 'apagar', key: menu.key, n: nPaginas(menu.key) })}>{menuColecao ? 'Delete collection…' : 'Delete…'}</button>
        </div>
      )}
      {dlg?.t === 'pagina' && (
        <Modal titulo={dlg.pai && dlg.pai !== pasta ? 'New sub-page' : 'New page'} onFechar={() => setDlg(null)}>
          <label className="rotulo">Title<input className="campo" autoFocus value={dlg.nome} placeholder="e.g. Queue decision" onChange={(e) => setDlg({ ...dlg, nome: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void criarPagina()} /></label>
          <label className="rotulo">Inside
            <select className="campo" value={dlg.pai} onChange={(e) => setDlg({ ...dlg, pai: e.target.value })}>
              <option value={pasta}>{pasta ? ultimo(pasta) + ' (top level)' : 'Top level'}</option>
              {opcoes.filter((o) => o.v !== pasta).map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
          {erro && <div className="erro-t">{erro}</div>}
          <div className="linha" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setDlg(null)}>Cancel</button><button className="btn pri" disabled={!dlg.nome.trim()} onClick={() => void criarPagina()}>Create</button></div>
        </Modal>
      )}
      {dlg?.t === 'renomear' && (
        <Modal titulo={dlg.key === pasta ? 'Rename collection' : 'Rename page'} onFechar={() => setDlg(null)}>
          <label className="rotulo">Name<input className="campo" autoFocus value={dlg.nome} onChange={(e) => setDlg({ ...dlg, nome: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && void renomear()} /></label>
          {dlg.key !== pasta && <div className="muted" style={{ fontSize: 13 }}>Renames the file (and its sub-pages folder). The heading inside the page stays as it is.</div>}
          {erro && <div className="erro-t">{erro}</div>}
          <div className="linha" style={{ justifyContent: 'flex-end' }}><button className="btn" onClick={() => setDlg(null)}>Cancel</button><button className="btn pri" disabled={!dlg.nome.trim()} onClick={() => void renomear()}>Rename</button></div>
        </Modal>
      )}
      {dlg?.t === 'apagar' && (
        <Confirmar titulo={`Delete "${ultimo(dlg.key)}"?`} texto={`${dlg.n > 1 ? `Includes ${dlg.n - 1} sub-page${dlg.n === 2 ? '' : 's'}. ` : ''}It goes to the vault's .lixo folder and can be recovered from there.`} ok="Delete" perigo onOk={() => void apagarNo()} onFechar={() => setDlg(null)} />
      )}
    </div>
  );
}

function Pagina({ cofre, path, tick, docs, pastas, onPath, onAbrirCartao, onLiga, onNovaSub, onApagado, onGuardado, onMovido }: {
  cofre: CofreInfo; path: string; tick: number; docs: DocResumo[]; pastas: string[];
  onPath: (p: string | null) => void; onAbrirCartao: (b: string, id: string) => void; onLiga: (alvo: string, pastaSugerida: string) => void;
  onNovaSub: (key: string) => void; onApagado: () => void; onGuardado: () => void; onMovido: (p: string) => void;
}) {
  const cofreId = cofre.id;
  const [doc, setDoc] = useState<DocLido | null>(null);
  const [texto, setTexto] = useState('');
  const [modo, setModo] = useState<'ler' | 'editar'>('ler');
  const [estado, setEstado] = useState('');
  const [conflito, setConflito] = useState<ConflitoDados['atual'] | null>(null);
  const [apagar, setApagar] = useState(false);
  const [mover, setMover] = useState<{ pai: string; nome: string } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const hash = useRef('');
  const sujo = useRef(false);
  const tRef = useRef(''); tRef.current = texto;

  const carregar = () => api.lerDoc(cofreId, path).then((d) => { setDoc(d); setTexto(d.texto); hash.current = d.hash; sujo.current = false; setEstado(''); }).catch((e) => setErro(mensagemDe(e)));
  useEffect(() => { void carregar(); }, [cofreId, path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!sujo.current) void carregar(); }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!menu) return;
    const f = () => setMenu(null);
    window.addEventListener('mousedown', f);
    return () => window.removeEventListener('mousedown', f);
  }, [menu]);

  const guardar = async (forcar?: string) => {
    if (!sujo.current && !forcar) return;
    try {
      const r = await api.gravarDoc(cofreId, path, tRef.current, forcar ?? hash.current);
      hash.current = r.hash; sujo.current = false; setEstado('Saved'); setConflito(null); onGuardado();
    } catch (e) {
      if (eConflito(e)) { setConflito((e.dados as ConflitoDados).atual); setEstado('Conflict'); } else setEstado(mensagemDe(e));
    }
  };
  const deb = useDebounce(() => void guardar(), 900);
  useEffect(() => () => { if (sujo.current) void guardar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const mudou = (t: string) => { setTexto(t); tRef.current = t; sujo.current = true; setEstado('Saving…'); deb.chamar(); };
  const alternarModo = () => { if (modo === 'editar') { deb.cancelar(); void guardar(); setModo('ler'); } else setModo('editar'); };
  const modoRef = useRef(alternarModo); modoRef.current = alternarModo;
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e' && !document.querySelector('.fundo')) { e.preventDefault(); modoRef.current(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const dir = paiDe(path);
  const toc = useMemo(() => cabecalhos(texto), [texto]);
  const titulo = docs.find((d) => d.path === path)?.titulo || ultimo(semMd(path));
  const refs = useCarregar(() => api.referidoEm(cofreId, { tipo: 'doc', titulo, ref: path }), [cofreId, path, tick, titulo]);
  const subpaginas = docs.filter((d) => paiDe(d.path) === semMd(path));

  const irCabecalho = (i: number) => document.querySelector(`.artigo [data-h="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (!doc) return <div className="artigo"><div className="vazio">{erro || 'Loading…'}</div></div>;
  const migalhas = path.replace(/\.md$/i, '').split('/').slice(0, -1);
  const copiarLigacao = () => { void navigator.clipboard.writeText(`[[${titulo}]]`).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }); setMenu(null); };
  return (
    <>
      <article className="artigo">
        <div className="in">
          <div className="pag-topo">
            <nav className="linha migalhas" aria-label="Breadcrumb">
              {migalhas.map((m, i) => <span key={i} className="linha" style={{ gap: 6 }}>{i > 0 && <span className="muted">/</span>}<span>{m}</span></span>)}
              <span className="fl" />
              <span className={'estado-g' + (estado === 'Conflict' ? ' mau' : '')}>{copiado ? 'Link copied' : estado || `Edited ${fmtAtras(doc.mod)}`}</span>
            </nav>
            <div className="linha" style={{ gap: 8 }}>
              <button className={'btn' + (modo === 'editar' ? ' pri' : '')} title="Ctrl+E" onClick={alternarModo}>{modo === 'editar' ? 'Done' : 'Edit'}</button>
              <button className="btn" onClick={() => onNovaSub(semMd(path))}>+ Sub-page</button>
              <span className="fl" />
              <button className="icone-b cinza" aria-label="More page actions" title="More" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right - 220, y: r.bottom + 4 }); }}><Mais /></button>
            </div>
          </div>
          {erro && <div className="aviso-b" onClick={() => setErro('')}>{erro}</div>}
          {modo === 'editar'
            ? <div className="cm-caixa"><div className="muted cm-dica">Markdown · <b>[[</b> links a page · paste images with Ctrl+V · <b>Ctrl+E</b> when you're done</div>
                <Editor texto={texto} onMudou={mudou} docs={docs} onImagem={async (f) => { const ext = (f.name.split('.').pop() || f.type.split('/')[1] || 'png'); return api.guardarAnexo(cofreId, path, ext, new Uint8Array(await f.arrayBuffer())); }} /></div>
            : <div onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('a,input,button,summary')) setModo('editar'); }}>
                <VistaMd texto={texto} cofreId={cofreId} baseDir={dir} onLiga={(a) => onLiga(a, dir)}
                  onTarefa={(linha) => { const n = alternarLinha(tRef.current, linha); if (n !== null) mudou(n); }}
                  vazio={<button className="notas-vazias" onClick={() => setModo('editar')}>This page is empty. Click to start writing.</button>} />
              </div>}
          {modo === 'ler' && subpaginas.length > 0 && (
            <section className="col" style={{ gap: 8 }}>
              <span className="sec-t">Sub-pages</span>
              <div className="grelha-sub">
                {subpaginas.map((d) => <button key={d.path} className="sub-c" onClick={() => onPath(d.path)}><b>{d.titulo}</b><span className="muted">Edited {fmtAtras(d.mod)}</span></button>)}
              </div>
            </section>
          )}
          <section className="col rodape-ref">
            <span className="sec-t">Linked from</span>
            <div className="linha quebra">
              {(refs.dados ?? []).length === 0 && <span className="muted" style={{ fontSize: 13 }}>Nothing links here yet. Use <code className="mono">[[{titulo}]]</code> in another page or card.</span>}
              {(refs.dados ?? []).map((r) => (
                <button key={r.ref} className="ref" onClick={() => { if (r.tipo === 'doc') onPath(r.ref); else { const [b, id] = r.ref.split('/'); onAbrirCartao(b, id); } }}>
                  {r.tipo === 'cartao' && <span className="ponto" style={{ width: 6, height: 6 }} />}{r.titulo}
                </button>
              ))}
            </div>
          </section>
        </div>
      </article>
      <aside className="toc" aria-label="On this page">
        <b>On this page</b>
        {toc.length === 0 && <span className="muted">No headings.</span>}
        {toc.map((h, i) => <a key={i} style={{ marginLeft: (h.nivel - 1) * 8 }} onClick={() => modo === 'ler' && irCabecalho(i)}>{h.texto}</a>)}
      </aside>
      {menu && (
        <div className="menu-pop" style={{ left: menu.x, top: menu.y, minWidth: 220 }} onMouseDown={(e) => e.stopPropagation()}>
          <button onClick={() => { setMenu(null); setErro(''); setMover({ pai: paiDe(path), nome: ultimo(semMd(path)) }); }}>Move / rename…</button>
          <button onClick={copiarLigacao}>Copy link <span className="muted mono" style={{ fontSize: 12 }}>[[…]]</span></button>
          <button onClick={() => { setMenu(null); void api.mostrarNoExplorador(cofreId, 'Docs/' + path); }}>Show file in folder</button>
          <button className="perigo-t" onClick={() => { setMenu(null); setApagar(true); }}>Delete page…</button>
        </div>
      )}
      {mover !== null && (
        <Modal titulo="Move / rename page" onFechar={() => setMover(null)}>
          <label className="rotulo">File name<input className="campo" autoFocus value={mover.nome} onChange={(e) => setMover({ ...mover, nome: e.target.value })} /></label>
          <label className="rotulo">Inside
            <select className="campo" value={mover.pai} onChange={(e) => setMover({ ...mover, pai: e.target.value })}>
              <option value="">Top level (no collection)</option>
              {opcoesPai(docs, pastas, '', semMd(path)).map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
          <div className="muted" style={{ fontSize: 13 }}>Sub-pages move with it. [[Links]] keep working as long as the page title stays the same.</div>
          {erro && <div className="erro-t">{erro}</div>}
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="btn g" onClick={() => setMover(null)}>Cancel</button>
            <button className="btn g pri" disabled={!limpaNome(mover.nome)} onClick={() => {
              const de = semMd(path); const para = junta(mover.pai, limpaNome(mover.nome));
              if (para === de) { setMover(null); return; }
              void guardar().then(async () => { await api.moverDoc(cofreId, path, para + '.md'); if (pastas.includes(de)) await api.renomearPasta(cofreId, de, para); }).then(() => { setMover(null); onMovido(para + '.md'); }).catch((e) => setErro(mensagemDe(e)));
            }}>Move</button>
          </div>
        </Modal>
      )}
      {apagar && <Confirmar titulo="Delete this page?" texto={`${pastas.includes(semMd(path)) ? 'Its sub-pages are deleted too. ' : ''}It goes to the vault's .lixo folder and can be recovered from there.`} ok="Delete" perigo onOk={() => { deb.cancelar(); sujo.current = false; void api.apagarDoc(cofreId, path).then(() => (pastas.includes(semMd(path)) ? api.apagarPasta(cofreId, semMd(path)) : undefined)).then(onApagado); }} onFechar={() => setApagar(false)} />}
      {conflito && (
        <Modal titulo="Someone else changed this page" onFechar={() => setConflito(null)}>
          <div className="muted">The file changed on another computer while you were editing.</div>
          <div className="linha quebra" style={{ justifyContent: 'flex-end' }}>
            <button className="btn g" onClick={() => { sujo.current = false; setConflito(null); setTexto(conflito.texto); hash.current = conflito.hash; setEstado(''); }}>Keep theirs</button>
            <button className="btn g" onClick={() => { const t = `<<<<<<< mine\n${tRef.current}\n=======\n${conflito.texto}\n>>>>>>> theirs\n`; setTexto(t); tRef.current = t; sujo.current = true; void guardar(conflito.hash); setModo('editar'); }}>Merge (with markers)</button>
            <button className="btn g pri" onClick={() => void guardar(conflito.hash)}>Keep mine</button>
          </div>
        </Modal>
      )}
    </>
  );
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
  const fim = (n: No): number => { n.filhos.sort((a, b) => a.nome.localeCompare(b.nome)); n.total = n.filhos.reduce((t, f) => t + fim(f), n.doc ? 1 : 0); return n.total; };
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
              <button className="seta-b" tabIndex={tem ? 0 : -1} aria-label={fechada ? 'Expand' : 'Collapse'} style={{ visibility: tem ? 'visible' : 'hidden' }} onClick={() => ac.alternar(f.key)}>{fechada ? '▸' : '▾'}</button>
              <button className="fl pag-b" title={f.nome} onClick={() => (f.doc ? ac.onPath(f.doc.path) : ac.alternar(f.key))}>{f.nome}</button>
              <span className="pag-acoes">
                <button className="icone-b" title="New sub-page" aria-label={`New sub-page in ${f.nome}`} onClick={() => ac.novaSub(f.key)}>+</button>
                <button className="icone-b" title="More actions" aria-label={`Actions for ${f.nome}`} onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); ac.menu(r.left, r.bottom + 4, f.key); }}><Mais /></button>
              </span>
            </div>
            {tem && !fechada && <Ramo no={f} nivel={nivel + 1} path={path} fechadas={fechadas} ac={ac} />}
          </div>
        );
      })}
    </div>
  );
}
