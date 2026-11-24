import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, mensagemDe } from '../lib/api';
import { checklist, diasAte, eBloqueado, fmtAtras, fmtDia, fmtDiasAte, iniciais, textoSimples, useCarregar } from '../lib/util';
import type { Board, Cartao, CofreInfo, CopiaConflito, DocResumo, ResultadoPesquisa } from '../../shared/types';
import { Modal } from './Modal';
import { Cartao as IcCartao, Colecao, Pagina, Quadro } from './Icones';

export interface Dados { boards: Board[]; cartoes: Cartao[]; docs: DocResumo[]; pessoas: string[]; conflitos: CopiaConflito[]; pastasDocs: string[] }

/** Common page header: breadcrumb, title, optional subtitle and right-aligned actions. */
export function Cab({ sup, titulo, sub, children }: { sup?: string; titulo: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="cab">
      <div className="col fl" style={{ gap: 4, minWidth: 240 }}>
        {sup && <span className="sup">{sup}</span>}
        <h1>{titulo}</h1>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {children && <div className="linha quebra cab-acoes">{children}</div>}
    </header>
  );
}

function dataCurta(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).replace(/,/g, ' ·');
}

const ehFim = (boards: Board[], c: Cartao) => !!boards.find((b) => b.id === c.board)?.estados.find((e) => e.id === c.estado)?.fim;
const nomeBoard = (boards: Board[], id: string) => boards.find((b) => b.id === id)?.nome ?? '';
const nomeEstado = (boards: Board[], c: Cartao) => boards.find((b) => b.id === c.board)?.estados.find((e) => e.id === c.estado)?.nome ?? '';

function Lista({ titulo, cartoes, boards, vazio, onAbrir, mostrarQuem }: { titulo: string; cartoes: Cartao[]; boards: Board[]; vazio?: string; onAbrir: (b: string, id: string) => void; mostrarQuem?: boolean }) {
  return (
    <section className="caixa col" style={{ gap: 4 }}>
      <div className="linha" style={{ padding: '0 4px 8px' }}><h2 className="fl">{titulo}</h2><span className="muted" style={{ fontSize: 13 }}>{cartoes.length}</span></div>
      {cartoes.length === 0 && <div className="vazio" style={{ padding: 16 }}>{vazio ?? 'Nothing here.'}</div>}
      {cartoes.map((c) => {
        const d = c.prazo ? diasAte(c.prazo) : null;
        const perto = d !== null && d <= 2;
        return (
          <button key={c.board + c.id} className="lin-t" onClick={() => onAbrir(c.board, c.id)}>
            <span className={'ponto' + (c.prioridade === 'alta' || perto ? '' : ' oco')} />
            <span className="fl col" style={{ gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{c.titulo || '(untitled)'}</span>
              <span className="muted" style={{ fontSize: 12 }}>{nomeBoard(boards, c.board)} · {nomeEstado(boards, c)}{mostrarQuem && c.responsavel ? ' · ' + c.responsavel : ''}</span>
            </span>
            {c.prazo && <span className="mono" title={fmtDiasAte(c.prazo)} style={{ fontSize: 12, color: perto ? 'var(--terra)' : 'var(--tinta2)' }}>{fmtDia(c.prazo)}</span>}
          </button>
        );
      })}
    </section>
  );
}

export function Hoje({ dados, utilizador, onAbrir, onMudou, cofre, onDefinirNome }: { cofre: CofreInfo; dados: Dados | null; utilizador: string; onAbrir: (b: string, id: string) => void; onMudou: () => void; onDefinirNome: () => void }) {
  if (!dados) return <div className="vazio">Loading…</div>;
  const { boards } = dados;
  const abertos = dados.cartoes.filter((c) => !ehFim(boards, c));
  const meus = abertos.filter((c) => c.responsavel === utilizador);
  const dias = (c: Cartao) => (c.prazo ? diasAte(c.prazo) : null);
  const porPrazo = (a: Cartao, b: Cartao) => a.prazo.localeCompare(b.prazo);
  const atrasados = meus.filter((c) => (dias(c) ?? 1) < 0).sort(porPrazo);
  const semana = meus.filter((c) => { const d = dias(c); return d !== null && d >= 0 && d <= 7; }).sort(porPrazo);
  const depois = meus.filter((c) => { const d = dias(c); return d === null || d > 7; }).sort((a, b) => (a.prazo || '9').localeCompare(b.prazo || '9'));
  const bloqueados = abertos.filter((c) => eBloqueado(nomeEstado(boards, c)));
  const limite = Date.now() - 7 * 86400000;
  const feitos = dados.cartoes.filter((c) => ehFim(boards, c) && Date.parse(c.atualizado) >= limite);
  const agora = meus.filter((c) => { const b = boards.find((x) => x.id === c.board); return b && b.estados[0]?.id !== c.estado && !eBloqueado(nomeEstado(boards, c)); })
    .sort((a, b) => (a.prazo || '9').localeCompare(b.prazo || '9') || b.atualizado.localeCompare(a.atualizado))[0];
  const ch = agora ? checklist(agora.corpo) : { n: 0, d: 0 };
  const hora = new Date().getHours();
  const saud = hora < 12 ? 'Good morning' : hora < 18 ? 'Good afternoon' : 'Good evening';
  const concluir = async () => {
    if (!agora) return;
    const fim = boards.find((b) => b.id === agora.board)?.estados.find((e) => e.fim);
    if (!fim) return;
    await api.moverCartao(cofre.id, agora.board, agora.id, fim.id, null);
    onMudou();
  };
  const stats: [string, number, string?][] = [
    ['Due this week', semana.length],
    ['Overdue', atrasados.length, atrasados.length ? 'var(--terra)' : undefined],
    ['Blocked (team)', bloqueados.length, bloqueados.length ? 'var(--bloq)' : undefined],
    ['Done this week (team)', feitos.length, 'var(--salvia)']
  ];
  return (
    <div className="rolar">
      <Cab sup={dataCurta()} titulo={`${saud}${utilizador ? ', ' + utilizador.split(' ')[0] : ''}`} />
      {!utilizador && <div className="aviso-b linha" style={{ justifyContent: 'space-between' }}><span>Set your name to see the cards assigned to you.</span><button className="btn" onClick={onDefinirNome}>Set name</button></div>}
      {agora && (
        <section className="agora" aria-label="Now">
          <div className="fl col" style={{ gap: 12, flex: '999 1 420px' }}>
            <div className="peq"><span className="ponto" />Now · {nomeEstado(boards, agora)} · {nomeBoard(boards, agora.board)}</div>
            <span style={{ fontSize: 26, letterSpacing: '-.01em' }}>{agora.titulo}</span>
            <div className="linha quebra" style={{ gap: 18, fontSize: 13, color: 'var(--agora-m)' }}>
              {ch.n > 0 && <span>Checklist <b className="mono" style={{ fontWeight: 500, color: 'var(--agora-t)' }}>{ch.d}/{ch.n}</b></span>}
              {agora.prazo && <span>Due <b className="mono" style={{ fontWeight: 500, color: 'var(--agora-t)' }}>{fmtDia(agora.prazo)}</b> · {fmtDiasAte(agora.prazo)}</span>}
            </div>
            {ch.n > 0 && <div style={{ height: 6, borderRadius: 999, background: 'repeating-linear-gradient(90deg,var(--agora-l) 0 6px,transparent 6px 10px)', overflow: 'hidden' }}><div style={{ width: (ch.d / ch.n) * 100 + '%', height: 6, borderRadius: 999, background: 'var(--terra-ponto)' }} /></div>}
          </div>
          <div className="linha quebra" style={{ flex: '1 1 200px', justifyContent: 'flex-end' }}>
            <button className="btn g fantasma" onClick={() => onAbrir(agora.board, agora.id)}>Open</button>
            <button className="btn g branco" onClick={() => void concluir()}>Mark done</button>
          </div>
        </section>
      )}
      <section className="stats" aria-label="Summary">
        {stats.map(([l, v, cor]) => <div key={l} className="stat"><span className="l">{l}</span><span className="v" style={cor ? { color: cor } : undefined}>{v}</span></div>)}
      </section>
      <div className="grelha-hoje">
        {atrasados.length > 0 && <Lista titulo="Overdue" cartoes={atrasados} boards={boards} onAbrir={onAbrir} />}
        <Lista titulo="Due this week" cartoes={semana} boards={boards} vazio={utilizador ? 'Nothing due this week.' : 'Set your name to see your cards.'} onAbrir={onAbrir} />
        <Lista titulo="Later / no due date" cartoes={depois} boards={boards} vazio="No other open cards assigned to you." onAbrir={onAbrir} />
        {bloqueados.length > 0 && <Lista titulo="Blocked in the team" cartoes={bloqueados} boards={boards} onAbrir={onAbrir} mostrarQuem />}
      </div>
    </div>
  );
}

export function GerirEquipa({ cofreId, onFechar, onMudou }: { cofreId: string; onFechar: () => void; onMudou: () => void }) {
  const r = useCarregar(() => api.equipa(cofreId), [cofreId]);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  const adicionar = async () => {
    const n = nome.trim();
    if (!n) return;
    try { await api.adicionarPessoa(cofreId, n); setNome(''); r.recarregar(); onMudou(); } catch (e) { setErro(mensagemDe(e)); }
  };
  const remover = async (n: string) => {
    try { await api.removerPessoa(cofreId, n); r.recarregar(); onMudou(); } catch (e) { setErro(mensagemDe(e)); }
  };
  const membros = r.dados ?? [];
  return (
    <Modal titulo="Team" onFechar={onFechar}>
      <div className="muted" style={{ fontSize: 13 }}>People listed here can be assigned to cards. The list lives in the vault's _equipa.md file, so everyone sharing the vault sees the same team.</div>
      <form className="linha" onSubmit={(e) => { e.preventDefault(); void adicionar(); }}>
        <input className="campo" autoFocus placeholder="Full name (e.g. Ana Costa)" value={nome} onChange={(e) => setNome(e.target.value)} />
        <button className="btn g terra" type="submit" disabled={!nome.trim()}>Add</button>
      </form>
      {erro && <div className="erro-t">{erro}</div>}
      <div className="col" style={{ gap: 2 }}>
        {membros.length === 0 && <div className="vazio" style={{ padding: 16 }}>No one yet. Add the people in your team.</div>}
        {membros.map((n) => (
          <div key={n} className="linha" style={{ padding: '8px 4px', borderTop: '1px solid var(--linha)' }}>
            <span className="avatar l">{iniciais(n)}</span><span className="fl">{n}</span>
            <button className="btn" style={{ height: 30 }} onClick={() => void remover(n)}>Remove</button>
          </div>
        ))}
      </div>
      <div className="linha" style={{ justifyContent: 'flex-end' }}><button className="btn g pri" onClick={onFechar}>Done</button></div>
    </Modal>
  );
}

export function Conflitos({ cofreId, tick, onMudou }: { cofreId: string; tick: number; onMudou: () => void }) {
  const r = useCarregar(() => api.conflitos(cofreId), [cofreId, tick]);
  const [ver, setVer] = useState<{ original: string; copia: string; a: string; b: string } | null>(null);
  const [erro, setErro] = useState('');
  const abrir = async (cp: { copia: string; original: string }) => {
    try { const [a, b] = await Promise.all([api.lerFicheiro(cofreId, cp.original), api.lerFicheiro(cofreId, cp.copia)]); setVer({ ...cp, a, b }); } catch (e) { setErro(mensagemDe(e)); }
  };
  const resolver = async (manter: 'original' | 'copia') => {
    if (!ver) return;
    try { await api.resolverConflito(cofreId, ver.copia, manter); setVer(null); r.recarregar(); onMudou(); } catch (e) { setErro(mensagemDe(e)); }
  };
  return (
    <div className="rolar">
      <Cab sup="Vault" titulo="Conflicts" sub="Copies created by your sync drive when two people edited the same file at the same time." />
      {erro && <div className="aviso-b">{erro}</div>}
      <section className="caixa col" style={{ gap: 4 }}>
        {(r.dados ?? []).length === 0 && <div className="vazio">No conflicts. ✓</div>}
        {(r.dados ?? []).map((c) => (
          <button key={c.copia} className="lin-t" onClick={() => void abrir(c)}>
            <span className="ponto" /><span className="fl mono" style={{ fontSize: 12 }}>{c.original}</span>
            <span className="etq terra">copy from {fmtAtras(c.copiaMod)}</span>
          </button>
        ))}
      </section>
      {ver && (
        <Modal titulo="Resolve conflict" onFechar={() => setVer(null)} largo>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><div className="sec-t">Current file</div><pre className="mono diff-p">{ver.a}</pre></div>
            <div><div className="sec-t">Conflict copy</div><pre className="mono diff-p">{ver.b}</pre></div>
          </div>
          <div className="sub" style={{ margin: 0 }}>The version you don't keep goes to the vault's .lixo folder.</div>
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => void resolver('original')}>Keep current</button>
            <button className="btn pri" onClick={() => void resolver('copia')}>Keep the copy</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export type Destino =
  | { t: 'board'; id: string; nome: string }
  | { t: 'colecao'; nome: string }
  | { t: 'doc'; path: string; titulo: string; contexto: string }
  | { t: 'res'; r: ResultadoPesquisa };

/** Ctrl+K: jump to boards, collections and pages by name, plus full-text search. */
export function Paleta({ cofres, cofreAtual, dados, onIr, onFechar }: { cofres: CofreInfo[]; cofreAtual: string; dados: Dados | null; onIr: (d: Destino) => void; onFechar: () => void }) {
  const [q, setQ] = useState('');
  const [todos, setTodos] = useState(false);
  const [res, setRes] = useState<ResultadoPesquisa[]>([]);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!q.trim()) { setRes([]); return; }
    const t = setTimeout(() => {
      const ids = todos ? cofres.filter((c) => c.disponivel).map((c) => c.id) : [cofreAtual];
      api.pesquisar(q, ids).then((r) => { setRes(r); }).catch(() => setRes([]));
    }, 120);
    return () => clearTimeout(t);
  }, [q, todos, cofreAtual, cofres]);
  const termo = q.trim().toLowerCase();
  const rapidos: Destino[] = useMemo(() => {
    if (!dados) return [];
    const bate = (s: string) => !termo || s.toLowerCase().includes(termo);
    const colecoes = [...new Set(dados.docs.filter((d) => d.path.includes('/')).map((d) => d.path.split('/')[0]))].sort();
    const out: Destino[] = [
      ...dados.boards.filter((b) => bate(b.nome)).map((b): Destino => ({ t: 'board', id: b.id, nome: b.nome })),
      ...colecoes.filter(bate).map((n): Destino => ({ t: 'colecao', nome: n }))
    ];
    if (termo) out.push(...dados.docs.filter((d) => bate(d.titulo)).slice(0, 8).map((d): Destino => ({ t: 'doc', path: d.path, titulo: d.titulo, contexto: d.path.includes('/') ? d.path.slice(0, d.path.lastIndexOf('/')) : '' })));
    return out.slice(0, termo ? 12 : 8);
  }, [dados, termo]);
  const vistos = new Set(rapidos.filter((x) => x.t === 'doc').map((x) => (x as { path: string }).path));
  const lista: Destino[] = [...rapidos, ...res.filter((r) => !(r.tipo === 'doc' && r.cofreId === cofreAtual && vistos.has(r.ref))).map((r): Destino => ({ t: 'res', r }))];
  useEffect(() => { setI(0); }, [q, todos]);
  const icone = (d: Destino) => d.t === 'board' ? <Quadro /> : d.t === 'colecao' ? <Colecao /> : d.t === 'doc' || (d.t === 'res' && d.r.tipo === 'doc') ? <Pagina /> : <IcCartao />;
  return (
    <Modal onFechar={onFechar} largo>
      <input className="campo paleta-in" autoFocus placeholder="Search pages and cards, or jump to a board…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(i + 1, lista.length - 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(i - 1, 0)); } else if (e.key === 'Enter' && lista[i]) onIr(lista[i]); }} />
      <div className="col paleta-res">
        {lista.map((d, k) => {
          const tit = d.t === 'board' ? d.nome : d.t === 'colecao' ? d.nome : d.t === 'doc' ? d.titulo : d.r.titulo;
          const ctx = d.t === 'board' ? 'Board' : d.t === 'colecao' ? 'Collection' : d.t === 'doc' ? (d.contexto || 'Page') : `${d.r.tipo === 'doc' ? 'Page' : 'Card'} · ${d.r.contexto}${todos ? ' · ' + d.r.cofreNome : ''}`;
          return (
            <button key={k} className={'res' + (k === i ? ' ativo' : '')} onMouseEnter={() => setI(k)} onClick={() => onIr(d)}>
              <span className="res-ic">{icone(d)}</span>
              <span className="fl col" style={{ minWidth: 0, gap: 2 }}>
                <span className="linha" style={{ gap: 8 }}><b style={{ fontWeight: 500 }}>{tit}</b><span className="muted" style={{ fontSize: 12 }}>{ctx}</span></span>
                {d.t === 'res' && <span className="res-ex">{textoSimples(d.r.excerto)}</span>}
              </span>
            </button>
          );
        })}
        {q.trim() && lista.length === 0 && <div className="vazio">No results for “{q.trim()}”.</div>}
      </div>
      <div className="linha muted paleta-pe">
        <label className="linha"><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />Search all vaults</label>
        <span className="fl" />
        <span><kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close</span>
      </div>
    </Modal>
  );
}

export function Captura({ cofreId, utilizador, onFechar, onFeito }: { cofreId: string; utilizador: string; onFechar: () => void; onFeito: () => void }) {
  const [t, setT] = useState('');
  const [erro, setErro] = useState('');
  const criar = async () => {
    try {
      const bs = await api.boards(cofreId);
      const b = bs[0];
      if (!b) { setErro('This vault has no boards yet.'); return; }
      await api.guardarCartao(cofreId, { board: b.id, titulo: t.trim(), estado: b.estados[0].id, responsavel: utilizador, prazo: '', prioridade: '', etiquetas: [], corpo: '' }, null);
      onFeito(); onFechar();
    } catch (e) { setErro(mensagemDe(e)); }
  };
  return (
    <Modal titulo="Quick capture" onFechar={onFechar}>
      <input className="campo" autoFocus placeholder="What do you need to do?" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && t.trim() && void criar()} />
      <div className="sub" style={{ margin: 0 }}>Creates a card, assigned to you, in the first column of the first board.</div>
      {erro && <div className="erro-t">{erro}</div>}
    </Modal>
  );
}
