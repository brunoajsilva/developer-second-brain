import { useEffect, useMemo, useRef, useState } from 'react';
import { api, eConflito, mensagemDe } from '../lib/api';
import { checklist, diasAte, eBloqueado, fmtAtras, fmtDia, fmtDiasAte, iniciais, useCarregar, useDebounce } from '../lib/util';
import type { Board, Cartao, CartaoEntrada, CofreInfo, ConflitoDados, DocResumo, Estado, Prioridade } from '../../shared/types';
import { Confirmar, Modal } from './Modal';
import { Cab, GerirEquipa } from './Vistas';
import { Fechar, Lupa } from './Icones';
import { Editor, VistaMd, alternarLinha } from './Markdown';

interface Props {
  cofre: CofreInfo;
  boardId: string;
  tick: number;
  utilizador: string;
  pessoas: string[];
  docs: DocResumo[];
  abrirId?: string;
  onBoardsMudaram: () => void;
  onAbrirLigacao: (alvo: string) => void;
  onAbrirCartao: (boardId: string, id: string) => void;
  onBoardApagado: () => void;
}

const vazio = (board: string, estado: string, resp: string): CartaoEntrada => ({ board, titulo: '', estado, responsavel: resp, prazo: '', prioridade: '', etiquetas: [], corpo: '' });
const paraEntrada = (c: Cartao): CartaoEntrada => ({ id: c.id, board: c.board, titulo: c.titulo, estado: c.estado, responsavel: c.responsavel, prazo: c.prazo, prioridade: c.prioridade, etiquetas: c.etiquetas, corpo: c.corpo });
const classePonto = (e: Estado, i: number) => (e.fim ? 'fim' : eBloqueado(e.nome) ? 'bloq' : i === 0 ? '' : 'curso');
export const PRIORIDADES: [Prioridade, string][] = [['', 'None'], ['baixa', 'Low'], ['media', 'Medium'], ['alta', 'High']];

export function BoardView({ cofre, boardId, tick, utilizador, pessoas, docs, abrirId, onBoardsMudaram, onAbrirLigacao, onAbrirCartao, onBoardApagado }: Props) {
  const cofreId = cofre.id;
  const b = useCarregar(() => api.boards(cofreId), [cofreId, tick]);
  const c = useCarregar(() => api.cartoes(cofreId, boardId), [cofreId, boardId, tick]);
  const board: Board | undefined = b.dados?.find((x) => x.id === boardId);
  const [selId, setSelId] = useState<string | null>(abrirId ?? null);
  const [quem, setQuem] = useState<string>('');
  const [alta, setAlta] = useState(false);
  const [etiqueta, setEtiqueta] = useState('');
  const [texto, setTexto] = useState('');
  const [sobre, setSobre] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [config, setConfig] = useState(false);
  const [equipaAberta, setEquipaAberta] = useState(false);
  const [novoEm, setNovoEm] = useState<string | null>(null);
  const [titNovo, setTitNovo] = useState('');
  const arrastado = useRef<string | null>(null);

  useEffect(() => { setSelId(abrirId ?? null); }, [boardId, abrirId]);
  useEffect(() => { setQuem(''); setAlta(false); setEtiqueta(''); setTexto(''); }, [boardId]);

  const todos = c.dados ?? [];
  const q = texto.trim().toLowerCase();
  const cartoes = useMemo(() => todos.filter((x) =>
    (!quem || x.responsavel === quem) && (!alta || x.prioridade === 'alta') && (!etiqueta || x.etiquetas.includes(etiqueta)) &&
    (!q || x.titulo.toLowerCase().includes(q) || x.corpo.toLowerCase().includes(q) || x.etiquetas.some((t) => t.toLowerCase().includes(q)))
  ), [todos, quem, alta, etiqueta, q]);
  const nomes = useMemo(() => [...new Set(todos.map((x) => x.responsavel).filter((n) => n && n !== utilizador))].sort(), [todos, utilizador]);
  const todasEtiquetas = useMemo(() => [...new Set(todos.flatMap((x) => x.etiquetas))].sort((a, b2) => a.localeCompare(b2)), [todos]);

  if (b.erro || c.erro) return <div className="erro-t">{b.erro || c.erro}</div>;
  if (!b.dados || !c.dados) return <div className="vazio">Loading…</div>;
  if (!board) return <div className="vazio">This board no longer exists.</div>;

  const tentar = async (f: () => Promise<unknown>) => { setErro(''); try { await f(); } catch (e) { setErro(mensagemDe(e)); c.recarregar(); } };
  const fimIds = new Set(board.estados.filter((e) => e.fim).map((e) => e.id));
  const feitos = todos.filter((x) => fimIds.has(x.estado)).length;
  const filtrado = !!(quem || alta || etiqueta || q);

  const largar = (estado: string, antesDe: string | null) => {
    const id = arrastado.current;
    arrastado.current = null; setSobre(null);
    if (!id || id === antesDe) return;
    const atual = c.dados!.find((x) => x.id === id);
    if (atual) c.setDados(c.dados!.map((x) => (x.id === id ? { ...x, estado } : x)));
    void tentar(async () => { await api.moverCartao(cofreId, boardId, id, estado, antesDe); c.recarregar(); });
  };

  const criar = (estado: string, titulo: string) => tentar(async () => {
    const g = await api.guardarCartao(cofreId, { ...vazio(boardId, estado, utilizador), titulo, etiquetas: etiqueta ? [etiqueta] : [] }, null);
    c.recarregar(); setSelId(g.id);
  });

  const sel = selId ? c.dados.find((x) => x.id === selId) : undefined;
  const nmeus = todos.filter((x) => x.responsavel === utilizador).length;
  const fechar = () => { setNovoEm(null); setTitNovo(''); };

  return (
    <>
      <Cab sup={`${cofre.nome} / Boards`} titulo={board.nome} sub={board.descricao || undefined}>
        <span className="muted" style={{ fontSize: 13 }}><b className="mono" style={{ fontWeight: 500, color: 'var(--salvia)' }}>{feitos}</b> of {todos.length} done</span>
        <button className="btn m" onClick={() => setEquipaAberta(true)}>Team</button>
        <button className="btn m" onClick={() => setConfig(true)}>Settings</button>
        <button className="btn m terra" onClick={() => setNovoEm(board.estados[0].id)}>+ New card</button>
      </Cab>
      <div role="group" aria-label="Filters" className="linha quebra filtros">
        <label className="pesq filtro-pesq"><Lupa /><input placeholder="Filter cards" aria-label="Filter cards" value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
        <button className={'filtro' + (!quem && !alta && !etiqueta ? ' on' : '')} onClick={() => { setQuem(''); setAlta(false); setEtiqueta(''); }}>All <span className="n">{todos.length}</span></button>
        {utilizador && <button className={'filtro' + (quem === utilizador ? ' on' : '')} onClick={() => setQuem(quem === utilizador ? '' : utilizador)}>Mine <span className="n">{nmeus}</span></button>}
        {nomes.map((n) => <button key={n} className={'filtro' + (quem === n ? ' on' : '')} onClick={() => setQuem(quem === n ? '' : n)}>{n.split(' ')[0]} <span className="n">{todos.filter((x) => x.responsavel === n).length}</span></button>)}
        <span className="div-v" />
        <button className={'filtro' + (alta ? ' on' : '')} onClick={() => setAlta(!alta)}>High priority</button>
        {todasEtiquetas.length > 0 && (
          <select className={'filtro' + (etiqueta ? ' on' : '')} aria-label="Filter by tag" value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)}>
            <option value="">Any tag</option>
            {todasEtiquetas.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
        )}
        {filtrado && <span className="muted" style={{ fontSize: 13 }}>Showing {cartoes.length} of {todos.length}</span>}
      </div>
      {erro && <div className="aviso-b">{erro}</div>}
      <div className="board-area">
        <div className="grelha-col">
          {board.estados.map((e, i) => {
            const lista = cartoes.filter((x) => x.estado === e.id);
            return (
              <section key={e.id} className={'coluna' + (sobre === e.id ? ' sobre' : '')}
                onDragOver={(ev) => { ev.preventDefault(); setSobre(e.id); }} onDragLeave={() => setSobre(null)} onDrop={(ev) => { ev.preventDefault(); largar(e.id, null); }}>
                <div className="linha" style={{ padding: '4px 4px 6px' }}>
                  <span className={'col-pt ' + classePonto(e, i)} />
                  <h2 className="fl" style={{ fontSize: 14 }}>{e.nome}</h2>
                  <span style={{ fontSize: 22, fontWeight: 300, lineHeight: 1 }}>{lista.length}</span>
                </div>
                <div className="lista">
                  {lista.map((x) => <CartaoCaixa key={x.id} c={x} feito={!!e.fim} sel={x.id === selId} onClick={() => setSelId(x.id)} onEtiqueta={(t) => setEtiqueta(etiqueta === t ? '' : t)} etiquetaAtiva={etiqueta}
                    onDragStart={() => { arrastado.current = x.id; }} onDrop={() => largar(e.id, x.id)} />)}
                  {lista.length === 0 && filtrado && <div className="muted" style={{ fontSize: 12, padding: '4px 6px' }}>No matching cards</div>}
                </div>
                <button className="add-cartao" onClick={() => setNovoEm(e.id)}>+ Add card</button>
              </section>
            );
          })}
        </div>
      </div>
      {sel && <CartaoModal key={sel.id} cartao={sel} board={board} cofreId={cofreId} pessoas={pessoas} utilizador={utilizador} docs={docs} etiquetas={todasEtiquetas}
        onFechar={() => setSelId(null)} onGuardado={c.recarregar} onGerirEquipa={() => setEquipaAberta(true)}
        onLiga={(alvo) => { setSelId(null); onAbrirLigacao(alvo); }} onAbrirCartao={onAbrirCartao} />}
      {novoEm && (
        <Modal titulo={`New card in ${board.estados.find((e) => e.id === novoEm)?.nome ?? ''}`} onFechar={fechar}>
          <form className="linha" onSubmit={(e) => { e.preventDefault(); if (!titNovo.trim()) return; void criar(novoEm, titNovo.trim()); fechar(); }}>
            <input className="campo" autoFocus placeholder="What needs to be done?" value={titNovo} onChange={(e) => setTitNovo(e.target.value)} />
            <button className="btn g terra" type="submit" disabled={!titNovo.trim()}>Create</button>
          </form>
          <div className="muted" style={{ fontSize: 13 }}>The card opens right away so you can add details.</div>
        </Modal>
      )}
      {equipaAberta && <GerirEquipa cofreId={cofreId} onFechar={() => setEquipaAberta(false)} onMudou={onBoardsMudaram} />}
      {config && <Config board={board} cofreId={cofreId} nCartoes={todos.length} onFechar={() => setConfig(false)} onGuardado={() => { b.recarregar(); onBoardsMudaram(); }} onApagado={onBoardApagado} />}
    </>
  );
}

function CartaoCaixa({ c, sel, feito, etiquetaAtiva, onClick, onEtiqueta, onDragStart, onDrop }: { c: Cartao; sel: boolean; feito: boolean; etiquetaAtiva: string; onClick: () => void; onEtiqueta: (t: string) => void; onDragStart: () => void; onDrop: () => void }) {
  const ch = checklist(c.corpo);
  const d = c.prazo ? diasAte(c.prazo) : null;
  const atrasado = !feito && d !== null && d < 0;
  return (
    <article className={'cartao' + (sel ? ' sel' : '') + (feito ? ' feito' : '')} draggable onClick={onClick} onDragStart={onDragStart} tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}>
      <span className="tit">{c.prioridade === 'alta' && !feito && <span className="prio-alta" title="High priority" />}{c.titulo || '(untitled)'}</span>
      {c.etiquetas.length > 0 && (
        <div className="tags">{c.etiquetas.map((t) => <button key={t} className={t === etiquetaAtiva ? 'on' : ''} title={`Filter by ${t}`} onClick={(e) => { e.stopPropagation(); onEtiqueta(t); }}>{t}</button>)}</div>
      )}
      <div className="pe">
        {c.responsavel ? <span className="avatar" title={c.responsavel}>{iniciais(c.responsavel)}</span> : <span className="avatar vazio-av" title="Unassigned">–</span>}
        <span className="mono">{ch.n > 0 ? `☑ ${ch.d}/${ch.n}` : ''}</span>
        {c.prazo && <span className={'mono prazo' + (!feito && d !== null && d <= 7 ? ' perto' : '') + (atrasado ? ' atrasado' : '')} title={fmtDiasAte(c.prazo)}>{fmtDia(c.prazo)}</span>}
      </div>
    </article>
  );
}

/** Chip input: Enter or comma adds a tag; spaces are allowed inside a tag. */
export function CampoTags({ valor, onMudar, sugestoes }: { valor: string[]; onMudar: (v: string[]) => void; sugestoes: string[] }) {
  const [t, setT] = useState('');
  const id = useMemo(() => 'tags-' + Math.random().toString(36).slice(2, 8), []);
  const adicionar = (x: string) => {
    const n = x.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    setT('');
    if (!n || valor.some((v) => v.toLowerCase() === n.toLowerCase())) return;
    onMudar([...valor, n]);
  };
  return (
    <div className="campo-tags" onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}>
      {valor.map((v) => (
        <span key={v} className="chip">{v}<button aria-label={`Remove tag ${v}`} onClick={(e) => { e.stopPropagation(); onMudar(valor.filter((x) => x !== v)); }}>×</button></span>
      ))}
      <input list={id} value={t} placeholder={valor.length ? '' : 'Add a tag…'} aria-label="Add a tag"
        onChange={(e) => { const v = e.target.value; if (v.includes(',')) adicionar(v); else setT(v); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); adicionar(t); }
          else if (e.key === 'Backspace' && !t && valor.length) onMudar(valor.slice(0, -1));
        }}
        onBlur={() => t.trim() && adicionar(t)} />
      <datalist id={id}>{sugestoes.filter((s) => !valor.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

function CartaoModal({ cartao, board, cofreId, pessoas, utilizador, docs, etiquetas, onFechar, onGuardado, onGerirEquipa, onLiga, onAbrirCartao }: {
  cartao: Cartao; board: Board; cofreId: string; pessoas: string[]; utilizador: string; docs: DocResumo[]; etiquetas: string[];
  onFechar: () => void; onGuardado: () => void; onGerirEquipa: () => void; onLiga: (alvo: string) => void; onAbrirCartao: (b: string, id: string) => void;
}) {
  const [f, setF] = useState<CartaoEntrada>(paraEntrada(cartao));
  const hash = useRef(cartao.hash);
  const sujo = useRef(false);
  const [estado, setEstado] = useState('');
  const [conflito, setConflito] = useState<ConflitoDados['atual'] | null>(null);
  const [apagar, setApagar] = useState(false);
  const [editar, setEditar] = useState(!cartao.corpo.trim() && !cartao.titulo.trim());
  const fRef = useRef(f); fRef.current = f;
  const refs = useCarregar(() => api.referidoEm(cofreId, { tipo: 'cartao', titulo: cartao.titulo, ref: cartao.board + '/' + cartao.id }), [cofreId, cartao.id]);

  const guardar = async (forcar?: string) => {
    if (!sujo.current && !forcar) return;
    try {
      const g = await api.guardarCartao(cofreId, fRef.current, forcar ?? hash.current);
      hash.current = g.hash; sujo.current = false; setEstado('Saved'); setConflito(null); onGuardado();
    } catch (e) {
      if (eConflito(e)) { setConflito((e.dados as ConflitoDados).atual); setEstado('Conflict'); } else setEstado(mensagemDe(e));
    }
  };
  const deb = useDebounce(() => void guardar(), 700);
  useEffect(() => () => { if (sujo.current) void guardar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sujo.current && cartao.hash !== hash.current) { setF(paraEntrada(cartao)); hash.current = cartao.hash; }
  }, [cartao]);

  const mudar = (p: Partial<CartaoEntrada>) => { setF({ ...fRef.current, ...p }); fRef.current = { ...fRef.current, ...p }; sujo.current = true; setEstado('Saving…'); deb.chamar(); };
  const d = f.prazo ? diasAte(f.prazo) : null;
  const gente = [...new Set([...pessoas, utilizador, f.responsavel].filter(Boolean))].sort((a, b2) => a.localeCompare(b2));
  const estadoAtual = board.estados.find((e) => e.id === f.estado);

  const fecharGuardando = () => { deb.cancelar(); void guardar().then(onFechar); };
  const fecharRef = useRef(fecharGuardando); fecharRef.current = fecharGuardando;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.fundo .modal') || document.querySelector('.cm-tooltip-autocomplete')) return;
      fecharRef.current();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="fundo fundo-cartao" onMouseDown={(e) => e.target === e.currentTarget && fecharGuardando()}>
      <div className="cartao-modal" role="dialog" aria-modal="true" aria-label={`Card: ${f.titulo}`}>
        <header className="linha cm-topo">
          <span className="fl mono muted" style={{ fontSize: 12, textTransform: 'uppercase' }}>{board.nome} · {cartao.id}</span>
          <span className={'estado-g' + (estado === 'Conflict' ? ' mau' : '')}>{estado}</span>
          <button className="icone-b cinza" aria-label="Close card" title="Close (Esc)" onClick={fecharGuardando}><Fechar /></button>
        </header>
        <div className="cm-corpo">
          <main className="cm-principal">
            <textarea className="tit-in" rows={1} value={f.titulo} onChange={(e) => mudar({ titulo: e.target.value.replace(/\n/g, ' ') })} placeholder="Card title" aria-label="Title" />
            <section className="col" style={{ gap: 10, flex: 1, minHeight: 0 }}>
              <div className="linha">
                <span className="sec-t fl">Notes</span>
                {editar
                  ? <button className="btn pri" style={{ height: 30 }} onClick={() => { setEditar(false); deb.cancelar(); void guardar(); }}>Done</button>
                  : <button className="btn" style={{ height: 30 }} onClick={() => setEditar(true)}>Edit notes</button>}
              </div>
              {editar
                ? <div className="cm-caixa notas-ed"><Editor texto={f.corpo} onMudou={(t) => mudar({ corpo: t })} docs={docs} dica="Notes in Markdown. Use - [ ] for checklists and [[Page]] to link docs." foco={!!cartao.titulo.trim()} /></div>
                : <div className="notas-ler" onDoubleClick={() => setEditar(true)}>
                    <VistaMd texto={f.corpo} cofreId={cofreId} baseDir="" onLiga={onLiga}
                      onTarefa={(linha) => { const n = alternarLinha(fRef.current.corpo, linha); if (n !== null) mudar({ corpo: n }); }}
                      vazio={<button className="notas-vazias" onClick={() => setEditar(true)}>No notes yet. Click to add details, a checklist or links.</button>} />
                  </div>}
            </section>
            {(refs.dados ?? []).length > 0 && (
              <section className="col" style={{ gap: 8 }}>
                <span className="sec-t">Linked from</span>
                <div className="linha quebra">
                  {(refs.dados ?? []).map((r) => (
                    <button key={r.ref} className="ref" onClick={() => { if (r.tipo === 'doc') onLiga(r.titulo); else { const [bb, id] = r.ref.split('/'); onAbrirCartao(bb, id); } }}>{r.titulo}</button>
                  ))}
                </div>
              </section>
            )}
          </main>
          <aside className="cm-props">
            <div className="prop">
              <span className="prop-l">Status</span>
              <div className="estados" role="group" aria-label="Status">
                {board.estados.map((s: Estado) => <button key={s.id} className={f.estado === s.id ? 'on' : ''} onClick={() => mudar({ estado: s.id })}>{s.nome}</button>)}
              </div>
            </div>
            <label className="prop">
              <span className="prop-l">Assignee</span>
              <span className="linha">
                {f.responsavel ? <span className="avatar l">{iniciais(f.responsavel)}</span> : null}
                <select className="campo ed-sel" value={f.responsavel} onChange={(e) => { if (e.target.value === '__gerir') onGerirEquipa(); else mudar({ responsavel: e.target.value }); }}>
                  <option value="">Unassigned</option>
                  {gente.map((p) => <option key={p} value={p}>{p}{p === utilizador ? ' (me)' : ''}</option>)}
                  <option value="__gerir">Manage team…</option>
                </select>
              </span>
            </label>
            <label className="prop">
              <span className="prop-l">Due date</span>
              <span className="linha">
                <input type="date" className="campo ed-sel mono" value={f.prazo} onChange={(e) => mudar({ prazo: e.target.value })} />
                {f.prazo && <button className="icone-b" aria-label="Clear due date" title="Clear" onClick={() => mudar({ prazo: '' })}><Fechar /></button>}
              </span>
              {f.prazo && <span style={{ fontSize: 12, color: !estadoAtual?.fim && d !== null && d <= 2 ? 'var(--terra)' : 'var(--tinta2)' }}>{fmtDiasAte(f.prazo)}</span>}
            </label>
            <div className="prop">
              <span className="prop-l">Priority</span>
              <div className="segmento" role="group" aria-label="Priority">
                {PRIORIDADES.map(([v, l]) => <button key={v || 'none'} className={(f.prioridade === v ? 'on' : '') + (v === 'alta' ? ' alta' : '')} onClick={() => mudar({ prioridade: v })}>{l}</button>)}
              </div>
            </div>
            <div className="prop">
              <span className="prop-l">Tags</span>
              <CampoTags valor={f.etiquetas} onMudar={(v) => mudar({ etiquetas: v })} sugestoes={etiquetas} />
            </div>
            <div className="sep" />
            <div className="col muted" style={{ gap: 4, fontSize: 12 }}>
              {cartao.atualizado && <span>Updated {fmtAtras(Date.parse(cartao.atualizado))}{cartao.atualizado_por ? ` by ${cartao.atualizado_por}` : ''}</span>}
              {cartao.criado && <span>Created {cartao.criado.slice(0, 10)}</span>}
              <span className="mono" title="Linking this card from a page">[[#{cartao.id}]]</span>
            </div>
            <span className="fl" />
            <button className="btn perigo" style={{ alignSelf: 'flex-start' }} onClick={() => setApagar(true)}>Delete card</button>
          </aside>
        </div>
        {apagar && <Confirmar titulo="Delete this card?" texto="It goes to the vault's .lixo folder and can be recovered from there." ok="Delete" perigo onOk={() => { deb.cancelar(); sujo.current = false; void api.apagarCartao(cofreId, cartao.board, cartao.id).then(() => { onGuardado(); onFechar(); }); }} onFechar={() => setApagar(false)} />}
        {conflito && (
          <Modal titulo="Someone else changed this card" onFechar={() => setConflito(null)}>
            <div className="muted">The file changed on another computer while you were editing. Which version do you want to keep?</div>
            <div className="linha" style={{ justifyContent: 'flex-end' }}>
              <button className="btn g" onClick={() => { sujo.current = false; setConflito(null); hash.current = conflito.hash; onGuardado(); setEstado(''); }}>Keep theirs</button>
              <button className="btn g pri" onClick={() => void guardar(conflito.hash)}>Keep mine</button>
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}

function Config({ board, cofreId, nCartoes, onFechar, onGuardado, onApagado }: { board: Board; cofreId: string; nCartoes: number; onFechar: () => void; onGuardado: () => void; onApagado: () => void }) {
  const [nome, setNome] = useState(board.nome);
  const [descricao, setDescricao] = useState(board.descricao);
  const [estados, setEstados] = useState<Estado[]>(board.estados);
  const [erro, setErro] = useState('');
  const [apagar, setApagar] = useState(false);
  const mudar = (i: number, p: Partial<Estado>) => setEstados(estados.map((e, k) => (k === i ? { ...e, ...p } : e)));
  const mover = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= estados.length) return; const a = [...estados]; [a[i], a[j]] = [a[j], a[i]]; setEstados(a); };
  return (
    <Modal titulo="Board settings" onFechar={onFechar}>
      <label className="rotulo">Name<input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      <label className="rotulo">Description (optional)<input className="campo" value={descricao} placeholder="What is this board for?" onChange={(e) => setDescricao(e.target.value)} /></label>
      <div className="rotulo">Columns
        <div className="col" style={{ gap: 6 }}>
          {estados.map((e, i) => (
            <div key={e.id} className="linha">
              <input className="campo" value={e.nome} aria-label={`Column ${i + 1} name`} onChange={(ev) => mudar(i, { nome: ev.target.value })} />
              <label className="linha" style={{ fontSize: 13, color: 'var(--tinta)', whiteSpace: 'nowrap' }} title="Cards here count as done"><input type="checkbox" checked={!!e.fim} onChange={(ev) => mudar(i, { fim: ev.target.checked })} />Done</label>
              <button className="btn" aria-label="Move up" onClick={() => mover(i, -1)}>↑</button><button className="btn" aria-label="Move down" onClick={() => mover(i, 1)}>↓</button>
              <button className="btn perigo" aria-label="Remove column" disabled={estados.length < 2} onClick={() => setEstados(estados.filter((_, k) => k !== i))}>×</button>
            </div>
          ))}
        </div>
      </div>
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => setEstados([...estados, { id: 'e' + Math.random().toString(36).slice(2, 7), nome: 'New column' }])}>+ Column</button>
      <div className="muted" style={{ fontSize: 12 }}>Cards in a removed column move to the first column.</div>
      {erro && <div className="erro-t">{erro}</div>}
      <div className="linha" style={{ justifyContent: 'flex-end' }}>
        <button className="btn perigo" style={{ marginRight: 'auto' }} onClick={() => setApagar(true)}>Delete board…</button>
        <button className="btn" onClick={onFechar}>Cancel</button>
        <button className="btn pri" disabled={!nome.trim()} onClick={() => api.guardarBoard(cofreId, { id: board.id, nome: nome.trim(), descricao: descricao.trim(), estados }).then(() => { onGuardado(); onFechar(); }).catch((e) => setErro(mensagemDe(e)))}>Save</button>
      </div>
      {apagar && <Confirmar titulo={`Delete the board "${board.nome}"?`} texto={`${nCartoes} card${nCartoes === 1 ? '' : 's'} go with it to the vault's .lixo folder and can be recovered from there.`} ok="Delete board" perigo
        onOk={() => { void api.apagarBoard(cofreId, board.id).then(() => { onFechar(); onApagado(); }).catch((e) => setErro(mensagemDe(e))); }} onFechar={() => setApagar(false)} />}
    </Modal>
  );
}
