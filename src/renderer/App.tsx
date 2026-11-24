import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './lib/api';
import { iniciais, useCarregar } from './lib/util';
import type { CofreInfo, Definicoes } from '../shared/types';
import { Boas } from './componentes/Boas';
import { BoardView } from './componentes/BoardView';
import { DocsView } from './componentes/DocsView';
import { Captura, Conflitos, Hoje, Paleta } from './componentes/Vistas';
import { Engrenagem, Setas } from './componentes/Icones';
import { aplicarTema, lerTema, type Tema } from './lib/tema';
import { reiniciarMermaid } from './lib/markdown';
import { Confirmar, Modal } from './componentes/Modal';

export type Vista = { t: 'hoje' } | { t: 'board'; id: string; abrir?: string } | { t: 'docs'; pasta: string; path: string | null } | { t: 'conflitos' };

export default function App() {
  const [def, setDef] = useState<Definicoes | null>(null);
  const [cofres, setCofres] = useState<CofreInfo[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>({ t: 'hoje' });
  const [tick, setTick] = useState(0);
  const [paleta, setPaleta] = useState(false);
  const [captura, setCaptura] = useState(false);
  const [colecao, setColecao] = useState<string | null>(null);
  const [boardNovo, setBoardNovo] = useState<string | null>(null);
  const [erroCol, setErroCol] = useState('');
  const [tema, setTema] = useState<Tema>(lerTema);
  const [menuTema, setMenuTema] = useState<{ x: number; y: number } | null>(null);
  const [apagarCol, setApagarCol] = useState<string | null>(null);
  const [renCol, setRenCol] = useState<{ de: string; nome: string } | null>(null);
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

  const abrirCofre = useCallback((id: string) => { void api.definirAtivo(id); setAberto(id); setVista({ t: 'hoje' }); void recarregarDef(); }, [recarregarDef]);
  const trocar = useCallback(() => { setAberto(null); void recarregarDef(); }, [recarregarDef]);
  const cofre = cofres.find((c) => c.id === aberto);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!aberto || !(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === 'k') { e.preventDefault(); setPaleta(true); }
      else if (e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); trocar(); }
      else if (/^[1-9]$/.test(e.key)) {
        const c = cofres.filter((x) => x.disponivel)[Number(e.key) - 1];
        if (c) { e.preventDefault(); abrirCofre(c.id); }
      }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [aberto, cofres, abrirCofre, trocar]);

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
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [dados, colecaoDe]);

  if (!def) return <div className="vazio">A carregar…</div>;
  if (!aberto || !cofre) return <Boas def={def} cofres={cofres} onAbrir={abrirCofre} onMudou={() => void recarregarDef()} />;

  const ir = (v: Vista) => setVista(v);
  const novoBoard = async (nome: string) => {
    const b = await api.guardarBoard(aberto, { nome, estados: [{ id: 'fazer', nome: 'A fazer' }, { id: 'curso', nome: 'Em curso' }, { id: 'feito', nome: 'Feito', fim: true }] });
    resumo.recarregar(); ir({ t: 'board', id: b.id });
  };
  const irCartao = (b: string, id: string) => ir({ t: 'board', id: b, abrir: id });
  const meus = dados ? dados.cartoes.filter((c) => c.responsavel === def.utilizador).length : 0;
  const item = (ativo: boolean, texto: string, v: Vista, n?: number) => (
    <button key={texto} className={'item' + (ativo ? ' ativo' : '')} onClick={() => ir(v)}><span className="t">{texto}</span>{n !== undefined && <span className="n">{n}</span>}</button>
  );
  const nPartilhados = cofres.filter((c) => !c.pessoal).length;
  const docsPasta = vista.t === 'docs' ? vista.pasta : null;

  return (
    <div className="app">
      <nav className="lateral" aria-label="Navegação principal">
        <button className="cofre-sel" title="Trocar de cofre (Ctrl+Shift+O)" onClick={trocar}>
          <span className="ini">{iniciais(cofre.nome)}</span>
          <span className="fl col"><b style={{ fontSize: 14 }}>{cofre.nome}</b><span className="muted" style={{ fontSize: 12 }}>{cofre.pessoal ? 'pessoal' : 'partilhado'} · {cofres.length} cofre{cofres.length === 1 ? '' : 's'}{nPartilhados === 0 && !cofre.pessoal ? '' : ''}</span></span>
          <span className="muted"><Setas /></span>
        </button>
        <div className="nav">
          {item(vista.t === 'hoje', 'Hoje', { t: 'hoje' }, meus)}
        </div>
        <div className="nav">
          <div className="linha" style={{ justifyContent: 'space-between' }}>
            <span className="sec-h">Boards</span>
            <button className="icone-b muted" style={{ width: 26, height: 26, fontSize: 16 }} title="Novo board" aria-label="Novo board" onClick={() => setBoardNovo('')}>+</button>
          </div>
          {(dados?.boards ?? []).map((b) => item(vista.t === 'board' && vista.id === b.id, b.nome, { t: 'board', id: b.id }, abertosPorBoard.get(b.id) ?? 0))}
        </div>
        <div className="nav">
          <div className="linha" style={{ justifyContent: 'space-between' }}>
            <span className="sec-h">Docs</span>
            <button className="icone-b muted" style={{ width: 26, height: 26, fontSize: 16 }} title="Nova coleção" aria-label="Nova coleção" onClick={() => { setErroCol(''); setColecao(''); }}>+</button>
          </div>
          {pastas.length === 0 && <div className="muted" style={{ fontSize: 13, padding: '4px 12px' }}>Sem coleções. Cria uma com o +.</div>}
          {pastas.map(([k, n]) => (
            <div key={k} className="item-c" onContextMenu={(e) => { e.preventDefault(); setErroCol(''); setRenCol({ de: k, nome: k || 'Geral' }); }}>
              {item(docsPasta === k, k || 'Sem coleção', { t: 'docs', pasta: k, path: null }, n)}
              <button className="item-ed" title={k ? 'Renomear ou apagar coleção' : 'Transformar numa coleção'} aria-label={k ? `Renomear coleção ${k}` : 'Transformar páginas soltas numa coleção'} onClick={() => { setErroCol(''); setRenCol({ de: k, nome: k || 'Geral' }); }}>✎</button>
            </div>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        {(dados?.conflitos.length ?? 0) > 0 && (
          <button className="alerta" onClick={() => ir({ t: 'conflitos' })}><b>{dados!.conflitos.length} conflito{dados!.conflitos.length === 1 ? '' : 's'}</b><span>Resolver ↗</span></button>
        )}
        <div className="linha" style={{ justifyContent: 'flex-end', padding: '0 2px' }}>
          <button className="icone-b muted" aria-label="Tema (claro, escuro ou do sistema)" title="Tema" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuTema({ x: r.left, y: r.top - 6 }); }}>{tema === 'escuro' ? '☾' : tema === 'claro' ? '☀' : '◐'}</button>
          <button className="icone-b muted" aria-label="Definições (página inicial)" title="Definições e cofres" onClick={trocar}><Engrenagem /></button>
        </div>
      </nav>
      <main className={'principal' + (vista.t === 'docs' || vista.t === 'board' ? ' cheio' : '')}>
        {vista.t === 'hoje' && <Hoje cofre={cofre} dados={dados} utilizador={def.utilizador} onAbrir={irCartao} onMudou={resumo.recarregar} />}
        {vista.t === 'board' && <BoardView cofre={cofre} boardId={vista.id} abrirId={vista.abrir} tick={tick} utilizador={def.utilizador} pessoas={dados?.pessoas ?? []} onBoardsMudaram={resumo.recarregar} />}
        {vista.t === 'docs' && <DocsView cofre={cofre} tick={tick} pasta={vista.pasta} path={vista.path} onPath={(p) => ir({ t: 'docs', pasta: vista.pasta, path: p })} onIr={(pa, p) => ir({ t: 'docs', pasta: pa, path: p })} onAbrirCartao={irCartao} />}
        {vista.t === 'conflitos' && <Conflitos cofreId={aberto} tick={tick} onMudou={() => setTick((n) => n + 1)} />}
      </main>
      {paleta && <Paleta cofres={cofres} cofreAtual={aberto} onFechar={() => setPaleta(false)} onIr={(r) => {
        setPaleta(false);
        if (r.cofreId !== aberto) setAberto(r.cofreId);
        if (r.tipo === 'doc') ir({ t: 'docs', pasta: colecaoDe(r.ref), path: r.ref }); else { const [b, id] = r.ref.split('/'); irCartao(b, id); }
      }} />}
      {colecao !== null && (
        <Modal titulo="Nova coleção de docs" onFechar={() => setColecao(null)}>
          <div className="muted" style={{ fontSize: 13 }}>Uma coleção é uma pasta em Docs (ex.: Arquitetura, Runbooks). Podes depois criar páginas e subpáginas lá dentro.</div>
          <input className="campo" autoFocus placeholder="Nome da coleção" value={colecao} onChange={(e) => setColecao(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).form === null && document.getElementById('criar-col')?.click()} />
          {erroCol && <div className="erro-t">{erroCol}</div>}
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="btn g" onClick={() => setColecao(null)}>Cancelar</button>
            <button id="criar-col" className="btn g terra" disabled={!colecao.trim()} onClick={async () => {
              const nome = colecao.trim().replace(/[\\/]+/g, ' ').trim();
              const rel = `${nome}/Visão geral.md`;
              try { await api.criarDoc(aberto, rel, `# ${nome}\n\nVisão geral desta coleção. Cria novas páginas com o botão + à esquerda.\n`); resumo.recarregar(); setColecao(null); ir({ t: 'docs', pasta: nome, path: rel }); } catch (e) { setErroCol(e instanceof Error ? e.message : String(e)); }
            }}>Criar coleção</button>
          </div>
        </Modal>
      )}
      {apagarCol !== null && (
        <Confirmar titulo={`Apagar a coleção "${apagarCol}"?`} texto={`${(dados?.docs ?? []).filter((d) => d.path.startsWith(apagarCol + '/')).length} página(s) lá dentro vão com ela. Vai para a pasta .lixo do cofre e pode ser recuperada dali.`} ok="Apagar coleção" perigo
          onOk={() => { const k = apagarCol; void api.apagarPasta(aberto, k).then(() => { resumo.recarregar(); if (vista.t === 'docs' && vista.pasta === k) ir({ t: 'hoje' }); }).catch((e) => setErroCol(e instanceof Error ? e.message : String(e))); }}
          onFechar={() => setApagarCol(null)} />
      )}
      {menuTema && (
        <div className="fundo" style={{ background: 'transparent', padding: 0 }} onMouseDown={() => setMenuTema(null)}>
          <div className="menu-pop acima" style={{ left: menuTema.x, top: menuTema.y }} onMouseDown={(e) => e.stopPropagation()}>
            {([['claro', '☀  Claro'], ['escuro', '☾  Escuro'], ['sistema', '◐  Igual ao sistema']] as [Tema, string][]).map(([t, l]) => (
              <button key={t} className="tema-op" onClick={() => { aplicarTema(t); setTema(t); reiniciarMermaid(); setMenuTema(null); }}><span className="ck">{tema === t ? '✓' : ''}</span>{l}</button>
            ))}
          </div>
        </div>
      )}
      {renCol && (
        <Modal titulo={renCol.de ? 'Renomear coleção' : 'Transformar páginas soltas numa coleção'} onFechar={() => setRenCol(null)}>
          <input className="campo" autoFocus value={renCol.nome} onChange={(e) => setRenCol({ ...renCol, nome: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && document.getElementById('ren-col')?.click()} />
          <div className="muted" style={{ fontSize: 13 }}>{renCol.de ? 'Muda o nome da pasta em Docs. As páginas lá dentro mantêm-se.' : 'As páginas que estão fora de qualquer coleção passam para uma coleção com este nome.'}</div>
          {erroCol && <div className="erro-t">{erroCol}</div>}
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            {renCol.de && <button className="btn g perigo" style={{ marginRight: 'auto' }} onClick={() => { setApagarCol(renCol.de); setRenCol(null); }}>Apagar coleção…</button>}
            <button className="btn g" onClick={() => setRenCol(null)}>Cancelar</button>
            <button id="ren-col" className="btn g terra" disabled={!renCol.nome.trim()} onClick={async () => {
              const nome = renCol.nome.trim().replace(/[\\/]+/g, ' ').trim();
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
                if (renCol.de && vista.t === 'docs' && (vista.pasta === renCol.de)) ir({ t: 'docs', pasta: nome, path: vista.path && vista.path.startsWith(renCol.de + '/') ? nome + vista.path.slice(renCol.de.length) : null });
              } catch (e) { setErroCol(e instanceof Error ? e.message : String(e)); }
            }}>Renomear</button>
          </div>
        </Modal>
      )}
      {boardNovo !== null && (
        <Modal titulo="Novo board" onFechar={() => setBoardNovo(null)}>
          <form className="linha" onSubmit={(e) => { e.preventDefault(); if (!boardNovo.trim()) return; void novoBoard(boardNovo.trim()); setBoardNovo(null); }}>
            <input className="campo" autoFocus placeholder="Nome do board (ex.: Sprint 24)" value={boardNovo} onChange={(e) => setBoardNovo(e.target.value)} />
            <button className="btn g terra" type="submit" disabled={!boardNovo.trim()}>Criar</button>
          </form>
          <div className="muted" style={{ fontSize: 13 }}>Começa com as colunas A fazer, Em curso e Feito. Podes mudá-las em Configurar.</div>
        </Modal>
      )}
      {captura && <Captura cofreId={aberto} utilizador={def.utilizador} onFechar={() => setCaptura(false)} onFeito={() => setTick((n) => n + 1)} />}
    </div>
  );
}
