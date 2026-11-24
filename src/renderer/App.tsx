import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, mensagemDe } from './lib/api';
import { iniciais, useCarregar } from './lib/util';
import type { CofreInfo, Definicoes } from '../shared/types';
import { Boas } from './componentes/Boas';
import { BoardView } from './componentes/BoardView';
import { DocsView, limpaNome, opcoesPai } from './componentes/DocsView';
import { Captura, Conflitos, Hoje, Paleta, type Destino } from './componentes/Vistas';
import { Avancar, Ecra, Engrenagem, Lapis, Lua, Setas, Sol, Voltar } from './componentes/Icones';
import { aplicarTema, lerTema, type Tema } from './lib/tema';
import { reiniciarMermaid } from './lib/markdown';
import { Confirmar, Modal } from './componentes/Modal';

export type Vista = { t: 'hoje' } | { t: 'board'; id: string; abrir?: string } | { t: 'docs'; pasta: string; path: string | null } | { t: 'conflitos' };

const igual = (a: Vista, b: Vista) => JSON.stringify(a) === JSON.stringify(b);

export default function App() {
  const [def, setDef] = useState<Definicoes | null>(null);
  const [cofres, setCofres] = useState<CofreInfo[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [hist, setHist] = useState<{ pilha: Vista[]; pos: number }>({ pilha: [{ t: 'hoje' }], pos: 0 });
  const vista = hist.pilha[hist.pos];
  const [tick, setTick] = useState(0);
  const [paleta, setPaleta] = useState(false);
  const [captura, setCaptura] = useState(false);
  const [colecao, setColecao] = useState<string | null>(null);
  const [boardNovo, setBoardNovo] = useState<string | null>(null);
  const [erroCol, setErroCol] = useState('');
  const [tema, setTema] = useState<Tema>(lerTema);
  const [menuDef, setMenuDef] = useState<{ x: number; y: number } | null>(null);
  const [nomeDlg, setNomeDlg] = useState<string | null>(null);
  const [apagarCol, setApagarCol] = useState<string | null>(null);
  const [renCol, setRenCol] = useState<{ de: string; nome: string } | null>(null);
  const [criarLiga, setCriarLiga] = useState<{ titulo: string; pai: string } | null>(null);
  const [aviso, setAviso] = useState('');
  const inicio = useRef(true);

  const recarregarDef = useCallback(async () => {
    const [d, c] = await Promise.all([api.definicoes(), api.cofres()]);
    setDef(d); setCofres(c);
    return { d, c };
  }, []);

  useEffect(() => {
    void recarregarDef().then(({ d, c }) => {
      if (inicio.current) {
        inicio.current = false;
        if (d.abrirUltimo && c.find((x) => x.id === d.cofreAtivo && x.disponivel)) setAberto(d.cofreAtivo);
      }
    });
  }, [recarregarDef]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = window.ponte.aoMudar((m) => {
      if (m.cofreId !== aberto) return;
      clearTimeout(t);
      t = setTimeout(() => setTick((n) => n + 1), 250);
    });
    return () => { off(); clearTimeout(t); };
  }, [aberto]);
  useEffect(() => window.ponte.aoCapturar(() => { if (aberto) setCaptura(true); }), [aberto]);
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(''), 4000); return () => clearTimeout(t); }, [aviso]);

  /** Navigate. Replaces the current entry when only the selected page of the same collection is being filled in. */
  const ir = useCallback((v: Vista, substituir?: boolean) => {
    setHist((h) => {
      const atual = h.pilha[h.pos];
      if (igual(atual, v)) return h;
      const trocar = substituir || (atual.t === 'docs' && v.t === 'docs' && atual.pasta === v.pasta && atual.path === null);
      const pilha = h.pilha.slice(0, trocar ? h.pos : h.pos + 1).concat(v).slice(-60);
      return { pilha, pos: pilha.length - 1 };
    });
  }, []);
  const voltar = useCallback(() => setHist((h) => (h.pos > 0 ? { ...h, pos: h.pos - 1 } : h)), []);
  const avancar = useCallback(() => setHist((h) => (h.pos < h.pilha.length - 1 ? { ...h, pos: h.pos + 1 } : h)), []);

  const abrirCofre = useCallback((id: string) => { void api.definirAtivo(id); setAberto(id); setHist({ pilha: [{ t: 'hoje' }], pos: 0 }); void recarregarDef(); }, [recarregarDef]);
  const trocar = useCallback(() => { setAberto(null); void recarregarDef(); }, [recarregarDef]);
  const cofre = cofres.find((c) => c.id === aberto);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!aberto) return;
      if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); voltar(); return; }
      if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); avancar(); return; }
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'k') { e.preventDefault(); setPaleta(true); }
      else if (e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); trocar(); }
      else if (/^[1-9]$/.test(e.key)) {
        const c = cofres.filter((x) => x.disponivel)[Number(e.key) - 1];
        if (c) { e.preventDefault(); abrirCofre(c.id); }
      }
    };
    const rato = (e: MouseEvent) => { if (e.button === 3) { e.preventDefault(); voltar(); } else if (e.button === 4) { e.preventDefault(); avancar(); } };
    window.addEventListener('keydown', f);
    window.addEventListener('mouseup', rato);
    return () => { window.removeEventListener('keydown', f); window.removeEventListener('mouseup', rato); };
  }, [aberto, cofres, abrirCofre, trocar, voltar, avancar]);

  const resumo = useCarregar(async () => {
    if (!aberto) return null;
    const [boards, cartoes, docs, pessoas, conflitos, pastasDocs] = await Promise.all([api.boards(aberto), api.todosCartoes(aberto), api.docs(aberto), api.pessoas(aberto), api.conflitos(aberto), api.pastasDocs(aberto)]);
    return { boards, cartoes, docs, pessoas, conflitos, pastasDocs };
  }, [aberto, tick]);

  const dados = resumo.dados;
  const abertosPorBoard = useMemo(() => {
    const m = new Map<string, number>();
    if (!dados) return m;
    const fim = new Set<string>();
    for (const b of dados.boards) for (const e of b.estados) if (e.fim) fim.add(b.id + '/' + e.id);
    for (const c of dados.cartoes) if (!fim.has(c.board + '/' + c.estado)) m.set(c.board, (m.get(c.board) ?? 0) + 1);
    return m;
  }, [dados]);
  const colecaoDe = useMemo(() => {
    const raiz = new Set((dados?.docs ?? []).filter((d) => !d.path.includes('/')).map((d) => d.path.replace(/\.md$/i, '')));
    return (p: string) => { const i = p.indexOf('/'); return i < 0 || raiz.has(p.slice(0, i)) ? '' : p.slice(0, i); };
  }, [dados]);
  const pastas = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of dados?.docs ?? []) { const k = colecaoDe(d.path); m.set(k, (m.get(k) ?? 0) + 1); }
    for (const p of dados?.pastasDocs ?? []) if (!p.includes('/') && !m.has(p) && colecaoDe(p + '/x') === p) m.set(p, 0);
    return [...m.entries()].sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])));
  }, [dados, colecaoDe]);

  if (!def) return <div className="vazio">Loading…</div>;
  if (!aberto || !cofre) return <Boas def={def} cofres={cofres} onAbrir={abrirCofre} onMudou={() => void recarregarDef()} />;

  const novoBoard = async (nome: string) => {
    const b = await api.guardarBoard(aberto, { nome, estados: [{ id: 'fazer', nome: 'To do' }, { id: 'curso', nome: 'In progress' }, { id: 'feito', nome: 'Done', fim: true }] });
    resumo.recarregar(); ir({ t: 'board', id: b.id });
  };
  const irCartao = (b: string, id: string) => ir({ t: 'board', id: b, abrir: id });
  const irDoc = (p: string) => ir({ t: 'docs', pasta: colecaoDe(p), path: p });

  /** Resolves [[links]]: "#id" opens a card; otherwise a page by title or file name; if missing, offers to create it. */
  const abrirLigacao = (alvo: string, pastaSugerida = '') => {
    const a = alvo.trim();
    if (!a) return;
    if (a.startsWith('#')) {
      const id = a.slice(1).toLowerCase();
      const c = dados?.cartoes.find((x) => x.id.toLowerCase() === id);
      if (c) irCartao(c.board, c.id); else setAviso(`Card ${a} not found.`);
      return;
    }
    const k = a.toLowerCase();
    const d = (dados?.docs ?? []).find((x) => x.titulo.toLowerCase() === k || x.path.replace(/\.md$/i, '').toLowerCase() === k || x.path.replace(/^.*\//, '').replace(/\.md$/i, '').toLowerCase() === k);
    if (d) irDoc(d.path);
    else setCriarLiga({ titulo: a, pai: pastaSugerida || (vista.t === 'docs' ? vista.pasta : '') || pastas.find(([p]) => p)?.[0] || '' });
  };

  const irDestino = (d: Destino) => {
    setPaleta(false);
    if (d.t === 'board') ir({ t: 'board', id: d.id });
    else if (d.t === 'colecao') ir({ t: 'docs', pasta: d.nome, path: null });
    else if (d.t === 'doc') irDoc(d.path);
    else {
      const r = d.r;
      if (r.cofreId !== aberto) { setAberto(r.cofreId); void api.definirAtivo(r.cofreId); }
      if (r.tipo === 'doc') ir({ t: 'docs', pasta: r.ref.includes('/') ? r.ref.split('/')[0] : '', path: r.ref });
      else { const [b, id] = r.ref.split('/'); irCartao(b, id); }
    }
  };

  const meus = dados ? dados.cartoes.filter((c) => c.responsavel === def.utilizador && !(dados.boards.find((b) => b.id === c.board)?.estados.find((e) => e.id === c.estado)?.fim)).length : 0;
  const item = (ativo: boolean, texto: string, v: Vista, n?: number) => (
    <button key={texto} className={'item' + (ativo ? ' ativo' : '')} aria-current={ativo ? 'page' : undefined} onClick={() => ir(v)}><span className="t">{texto}</span>{n !== undefined && <span className="n">{n}</span>}</button>
  );
  const docsPasta = vista.t === 'docs' ? vista.pasta : null;
  const opcoesCriar = criarLiga ? opcoesPai(dados?.docs ?? [], dados?.pastasDocs ?? [], '') : [];

  return (
    <div className="app">
      <nav className="lateral" aria-label="Main navigation">
        <button className="cofre-sel" title="Switch vault (Ctrl+Shift+O)" onClick={trocar}>
          <span className="ini">{iniciais(cofre.nome)}</span>
          <span className="fl col" style={{ minWidth: 0 }}><b style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cofre.nome}</b><span className="muted" style={{ fontSize: 12 }}>{cofre.pessoal ? 'Personal' : 'Shared'} vault</span></span>
          <span className="muted"><Setas /></span>
        </button>
        <div className="nav">
          {item(vista.t === 'hoje', 'Today', { t: 'hoje' }, meus)}
        </div>
        <div className="nav">
          <div className="linha sec-l">
            <span className="sec-h fl">Boards</span>
            <button className="icone-b muted mini" title="New board" aria-label="New board" onClick={() => setBoardNovo('')}>+</button>
          </div>
          {(dados?.boards ?? []).map((b) => item(vista.t === 'board' && vista.id === b.id, b.nome, { t: 'board', id: b.id }, abertosPorBoard.get(b.id) ?? 0))}
          {dados && dados.boards.length === 0 && <button className="vazio-nav" onClick={() => setBoardNovo('')}>Create your first board</button>}
        </div>
        <div className="nav">
          <div className="linha sec-l">
            <span className="sec-h fl">Docs</span>
            <button className="icone-b muted mini" title="New collection" aria-label="New collection" onClick={() => { setErroCol(''); setColecao(''); }}>+</button>
          </div>
          {dados && pastas.length === 0 && <button className="vazio-nav" onClick={() => { setErroCol(''); setColecao(''); }}>Create your first collection</button>}
          {pastas.map(([k, n]) => (
            <div key={k || '#soltas'} className="item-c" onContextMenu={(e) => { e.preventDefault(); setErroCol(''); setRenCol({ de: k, nome: k || 'General' }); }}>
              {item(docsPasta === k, k || 'Loose pages', { t: 'docs', pasta: k, path: null }, n)}
              <button className="item-ed" title={k ? 'Rename or delete collection' : 'Move loose pages into a collection'} aria-label={k ? `Rename collection ${k}` : 'Move loose pages into a collection'} onClick={() => { setErroCol(''); setRenCol({ de: k, nome: k || 'General' }); }}><Lapis /></button>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {(dados?.conflitos.length ?? 0) > 0 && (
          <button className="alerta" onClick={() => ir({ t: 'conflitos' })}><b>{dados!.conflitos.length} conflict{dados!.conflitos.length === 1 ? '' : 's'}</b><span>Resolve ↗</span></button>
        )}
        <div className="linha rodape-l">
          <button className="icone-b muted" aria-label="Back" title="Back (Alt+←)" disabled={hist.pos === 0} onClick={voltar}><Voltar /></button>
          <button className="icone-b muted" aria-label="Forward" title="Forward (Alt+→)" disabled={hist.pos >= hist.pilha.length - 1} onClick={avancar}><Avancar /></button>
          <span className="fl" />
          <button className="icone-b muted" aria-label="Settings" title="Settings" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuDef({ x: r.left, y: r.top - 6 }); }}><Engrenagem /></button>
        </div>
      </nav>
      <main className={'principal' + (vista.t === 'docs' || vista.t === 'board' ? ' cheio' : '')}>
        {vista.t === 'hoje' && <Hoje cofre={cofre} dados={dados} utilizador={def.utilizador} onAbrir={irCartao} onMudou={resumo.recarregar} onDefinirNome={() => setNomeDlg(def.utilizador)} />}
        {vista.t === 'board' && <BoardView cofre={cofre} boardId={vista.id} abrirId={vista.abrir} tick={tick} utilizador={def.utilizador} pessoas={dados?.pessoas ?? []} docs={dados?.docs ?? []}
          onBoardsMudaram={resumo.recarregar} onAbrirLigacao={(a) => abrirLigacao(a)} onAbrirCartao={irCartao} onBoardApagado={() => { resumo.recarregar(); ir({ t: 'hoje' }); }} />}
        {vista.t === 'docs' && <DocsView cofre={cofre} tick={tick} pasta={vista.pasta} path={vista.path} onPath={(p) => ir({ t: 'docs', pasta: vista.pasta, path: p })} onIr={(pa, p) => ir({ t: 'docs', pasta: pa, path: p }, true)} onAbrirCartao={irCartao} onLiga={abrirLigacao} />}
        {vista.t === 'conflitos' && <Conflitos cofreId={aberto} tick={tick} onMudou={() => setTick((n) => n + 1)} />}
      </main>
      {aviso && <div className="aviso-b toast" role="status" onClick={() => setAviso('')}>{aviso}</div>}
      {paleta && <Paleta cofres={cofres} cofreAtual={aberto} dados={dados} onFechar={() => setPaleta(false)} onIr={irDestino} />}
      {menuDef && (
        <div className="fundo transparente" onMouseDown={() => setMenuDef(null)}>
          <div className="menu-pop acima" style={{ left: menuDef.x, top: menuDef.y, minWidth: 240 }} onMouseDown={(e) => e.stopPropagation()}>
            <span className="menu-t">Theme</span>
            <div className="segmento" style={{ margin: '0 6px 6px' }}>
              {([['claro', 'Light', <Sol key="s" />], ['escuro', 'Dark', <Lua key="l" />], ['sistema', 'System', <Ecra key="e" />]] as [Tema, string, React.ReactNode][]).map(([t, l, ic]) => (
                <button key={t} className={tema === t ? 'on' : ''} onClick={() => { aplicarTema(t); setTema(t); reiniciarMermaid(); }}>{ic}{l}</button>
              ))}
            </div>
            <div className="sep" style={{ margin: '4px 0' }} />
            <button onClick={() => { setMenuDef(null); setNomeDlg(def.utilizador); }}>Your name: <b>{def.utilizador || 'not set'}</b></button>
            <button onClick={() => { setMenuDef(null); void api.mostrarNoExplorador(aberto, ''); }}>Show vault folder</button>
            <button onClick={() => { setMenuDef(null); trocar(); }}>Switch vault… <span className="muted mono" style={{ fontSize: 11 }}>Ctrl+Shift+O</span></button>
            <button onClick={() => { setMenuDef(null); setPaleta(true); }}>Search… <span className="muted mono" style={{ fontSize: 11 }}>Ctrl+K</span></button>
          </div>
        </div>
      )}
      {nomeDlg !== null && (
        <Modal titulo="Your name" onFechar={() => setNomeDlg(null)}>
          <div className="muted" style={{ fontSize: 13 }}>Used to show the cards assigned to you and to sign your changes. It stays on this computer.</div>
          <form className="linha" onSubmit={(e) => { e.preventDefault(); void api.definirUtilizador(nomeDlg.trim()).then(() => { setNomeDlg(null); void recarregarDef(); resumo.recarregar(); }); }}>
            <input className="campo" autoFocus placeholder="e.g. Ana Costa" value={nomeDlg} onChange={(e) => setNomeDlg(e.target.value)} />
            <button className="btn g pri" type="submit" disabled={!nomeDlg.trim()}>Save</button>
          </form>
        </Modal>
      )}
      {colecao !== null && (
        <Modal titulo="New collection" onFechar={() => setColecao(null)}>
          <div className="muted" style={{ fontSize: 13 }}>A collection groups related pages, e.g. Architecture, Runbooks or Onboarding. It is a folder inside Docs.</div>
          <form className="col" style={{ gap: 12 }} onSubmit={async (e) => {
            e.preventDefault();
            const nome = colecao.trim().replace(/[\\/]+/g, ' ').trim();
            if (!nome) return;
            const rel = `${limpaNome(nome)}/Overview.md`;
            try { await api.criarDoc(aberto, rel, `# ${nome}\n\nWhat this collection is about. Add pages with the + button on the left.\n`); resumo.recarregar(); setColecao(null); ir({ t: 'docs', pasta: limpaNome(nome), path: rel }); } catch (err) { setErroCol(mensagemDe(err)); }
          }}>
            <input className="campo" autoFocus placeholder="Collection name" value={colecao} onChange={(e) => setColecao(e.target.value)} />
            {erroCol && <div className="erro-t">{erroCol}</div>}
            <div className="linha" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn g" onClick={() => setColecao(null)}>Cancel</button>
              <button type="submit" className="btn g terra" disabled={!colecao.trim()}>Create collection</button>
            </div>
          </form>
        </Modal>
      )}
      {apagarCol !== null && (
        <Confirmar titulo={`Delete the collection "${apagarCol}"?`} texto={`Its ${(dados?.docs ?? []).filter((d) => d.path.startsWith(apagarCol + '/')).length} page(s) go with it to the vault's .lixo folder and can be recovered from there.`} ok="Delete collection" perigo
          onOk={() => { const k = apagarCol; void api.apagarPasta(aberto, k).then(() => { resumo.recarregar(); if (vista.t === 'docs' && vista.pasta === k) ir({ t: 'hoje' }, true); }).catch((e) => setAviso(mensagemDe(e))); }}
          onFechar={() => setApagarCol(null)} />
      )}
      {renCol && (
        <Modal titulo={renCol.de ? 'Rename collection' : 'Move loose pages into a collection'} onFechar={() => setRenCol(null)}>
          <form className="col" style={{ gap: 12 }} onSubmit={async (e) => {
            e.preventDefault();
            const nome = limpaNome(renCol.nome.replace(/[\\/]+/g, ' '));
            if (!nome || nome === renCol.de) { setRenCol(null); return; }
            try {
              if (renCol.de) await api.renomearPasta(aberto, renCol.de, nome);
              else {
                const raiz = (dados?.docs ?? []).filter((d) => !d.path.includes('/'));
                for (const d of raiz) {
                  const k = d.path.replace(/\.md$/i, '');
                  await api.moverDoc(aberto, d.path, `${nome}/${d.path}`);
                  if ((dados?.pastasDocs ?? []).includes(k)) await api.renomearPasta(aberto, k, `${nome}/${k}`);
                }
                ir({ t: 'docs', pasta: nome, path: null });
              }
              resumo.recarregar(); setRenCol(null);
              if (renCol.de && vista.t === 'docs' && vista.pasta === renCol.de) ir({ t: 'docs', pasta: nome, path: vista.path && vista.path.startsWith(renCol.de + '/') ? nome + vista.path.slice(renCol.de.length) : null }, true);
            } catch (err) { setErroCol(mensagemDe(err)); }
          }}>
            <input className="campo" autoFocus value={renCol.nome} onChange={(e) => setRenCol({ ...renCol, nome: e.target.value })} />
            <div className="muted" style={{ fontSize: 13 }}>{renCol.de ? 'Renames the folder in Docs. The pages inside stay as they are.' : 'Pages that are not in any collection move into a collection with this name.'}</div>
            {erroCol && <div className="erro-t">{erroCol}</div>}
            <div className="linha" style={{ justifyContent: 'flex-end' }}>
              {renCol.de && <button type="button" className="btn g perigo" style={{ marginRight: 'auto' }} onClick={() => { setApagarCol(renCol.de); setRenCol(null); }}>Delete collection…</button>}
              <button type="button" className="btn g" onClick={() => setRenCol(null)}>Cancel</button>
              <button type="submit" className="btn g terra" disabled={!renCol.nome.trim()}>{renCol.de ? 'Rename' : 'Move pages'}</button>
            </div>
          </form>
        </Modal>
      )}
      {criarLiga && (
        <Modal titulo={`Create “${criarLiga.titulo}”?`} onFechar={() => setCriarLiga(null)}>
          <div className="muted" style={{ fontSize: 13 }}>No page with this title exists yet. Create it now and the link starts working.</div>
          <label className="rotulo">Inside
            <select className="campo" value={criarLiga.pai} onChange={(e) => setCriarLiga({ ...criarLiga, pai: e.target.value })}>
              <option value="">Top level (no collection)</option>
              {opcoesCriar.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </label>
          {erroCol && <div className="erro-t">{erroCol}</div>}
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="btn g" onClick={() => setCriarLiga(null)}>Cancel</button>
            <button className="btn g terra" autoFocus onClick={async () => {
              const nome = limpaNome(criarLiga.titulo);
              const rel = (criarLiga.pai ? criarLiga.pai + '/' : '') + nome + '.md';
              try { await api.criarDoc(aberto, rel, `# ${criarLiga.titulo}\n\n`); resumo.recarregar(); setCriarLiga(null); setErroCol(''); irDoc(rel); } catch (e) { setErroCol(mensagemDe(e)); }
            }}>Create page</button>
          </div>
        </Modal>
      )}
      {boardNovo !== null && (
        <Modal titulo="New board" onFechar={() => setBoardNovo(null)}>
          <form className="linha" onSubmit={(e) => { e.preventDefault(); if (!boardNovo.trim()) return; void novoBoard(boardNovo.trim()); setBoardNovo(null); }}>
            <input className="campo" autoFocus placeholder="Board name (e.g. Sprint 24)" value={boardNovo} onChange={(e) => setBoardNovo(e.target.value)} />
            <button className="btn g terra" type="submit" disabled={!boardNovo.trim()}>Create</button>
          </form>
          <div className="muted" style={{ fontSize: 13 }}>Starts with To do, In progress and Done. Change the columns in the board's Settings.</div>
        </Modal>
      )}
      {captura && <Captura cofreId={aberto} utilizador={def.utilizador} onFechar={() => setCaptura(false)} onFeito={() => setTick((n) => n + 1)} />}
    </div>
  );
}
