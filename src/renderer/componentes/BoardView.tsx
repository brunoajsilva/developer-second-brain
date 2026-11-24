import { useEffect, useMemo, useRef, useState } from 'react';
import { api, eConflito, mensagemDe } from '../lib/api';
import { checklist, diasAte, fmtDia, fmtDiasAte, iniciais, useCarregar, useDebounce } from '../lib/util';
import type { Board, Cartao, CartaoEntrada, CofreInfo, ConflitoDados, Estado, Prioridade } from '../../shared/types';
import { Confirmar, Modal } from './Modal';
import { Cab, GerirEquipa } from './Vistas';
import { Fechar } from './Icones';

interface Props { cofre: CofreInfo; boardId: string; tick: number; utilizador: string; pessoas: string[]; abrirId?: string; onBoardsMudaram: () => void }

const vazio = (board: string, estado: string, resp: string): CartaoEntrada => ({ board, titulo: '', estado, responsavel: resp, prazo: '', prioridade: '', etiquetas: [], corpo: '' });
const paraEntrada = (c: Cartao): CartaoEntrada => ({ id: c.id, board: c.board, titulo: c.titulo, estado: c.estado, responsavel: c.responsavel, prazo: c.prazo, prioridade: c.prioridade, etiquetas: c.etiquetas, corpo: c.corpo });
const classePonto = (e: Estado, i: number) => (e.fim ? 'fim' : /bloq/i.test(e.nome) ? 'bloq' : i === 0 ? '' : 'curso');

export function BoardView({ cofre, boardId, tick, utilizador, pessoas, abrirId, onBoardsMudaram }: Props) {
  const cofreId = cofre.id;
  const b = useCarregar(() => api.boards(cofreId), [cofreId, tick]);
  const c = useCarregar(() => api.cartoes(cofreId, boardId), [cofreId, boardId, tick]);
  const board: Board | undefined = b.dados?.find((x) => x.id === boardId);
  const [selId, setSelId] = useState<string | null>(abrirId ?? null);
  const [quem, setQuem] = useState<string>('');
  const [alta, setAlta] = useState(false);
  const [sobre, setSobre] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [config, setConfig] = useState(false);
  const [equipaAberta, setEquipaAberta] = useState(false);
  const [novoEm, setNovoEm] = useState<string | null>(null);
  const [titNovo, setTitNovo] = useState('');
  const arrastado = useRef<string | null>(null);

  useEffect(() => { setSelId(abrirId ?? null); }, [boardId, abrirId]);

  const todos = c.dados ?? [];
  const cartoes = useMemo(() => todos.filter((x) => (!quem || x.responsavel === quem) && (!alta || x.prioridade === 'alta')), [todos, quem, alta]);
  const nomes = useMemo(() => [...new Set(todos.map((x) => x.responsavel).filter((n) => n && n !== utilizador))].sort(), [todos, utilizador]);

  if (b.erro || c.erro) return <div className="erro-t">{b.erro || c.erro}</div>;
  if (!board || !c.dados) return <div className="vazio">A carregar…</div>;

  const tentar = async (f: () => Promise<unknown>) => { setErro(''); try { await f(); } catch (e) { setErro(mensagemDe(e)); c.recarregar(); } };
  const fimIds = new Set(board.estados.filter((e) => e.fim).map((e) => e.id));
  const feitos = todos.filter((x) => fimIds.has(x.estado)).length;

  const largar = (estado: string, antesDe: string | null) => {
    const id = arrastado.current;
    arrastado.current = null; setSobre(null);
    if (!id || id === antesDe) return;
    const atual = c.dados!.find((x) => x.id === id);
    if (atual) c.setDados(c.dados!.map((x) => (x.id === id ? { ...x, estado } : x)));
    void tentar(async () => { await api.moverCartao(cofreId, boardId, id, estado, antesDe); c.recarregar(); });
  };

  const criar = (estado: string, titulo: string) => tentar(async () => {
    const g = await api.guardarCartao(cofreId, { ...vazio(boardId, estado, utilizador), titulo }, null);
    c.recarregar(); setSelId(g.id);
  });

  const sel = selId ? c.dados.find((x) => x.id === selId) : undefined;
  const nmeus = todos.filter((x) => x.responsavel === utilizador).length;
  const fechar = () => { setNovoEm(null); setTitNovo(''); };

  return (
    <>
      <Cab sup={`${cofre.nome} / Boards`} titulo={board.nome} sub={board.descricao}>
        <span className="muted" style={{ fontSize: 13 }}><b className="mono" style={{ fontWeight: 500, color: 'var(--salvia)' }}>{feitos}</b> de {todos.length} feitos</span>
        <button className="btn m" onClick={() => setEquipaAberta(true)}>Equipa</button>
        <button className="btn m" onClick={() => setConfig(true)}>Configurar</button>
        <button className="btn m terra" onClick={() => setNovoEm(board.estados[0].id)}>+ Novo cartão</button>
      </Cab>
      <div role="group" aria-label="Filtros" className="linha quebra">
        <button className={'filtro' + (!quem && !alta ? ' on' : '')} onClick={() => { setQuem(''); setAlta(false); }}>Todos <span className="n">{todos.length}</span></button>
        {utilizador && <button className={'filtro' + (quem === utilizador ? ' on' : '')} onClick={() => setQuem(quem === utilizador ? '' : utilizador)}>Os meus <span className="n">{nmeus}</span></button>}
        {nomes.map((n) => <button key={n} className={'filtro' + (quem === n ? ' on' : '')} onClick={() => setQuem(quem === n ? '' : n)}>{n.split(' ')[0]} <span className="n">{todos.filter((x) => x.responsavel === n).length}</span></button>)}
        <span style={{ width: 1, background: 'var(--linha)', margin: '4px 4px' }} />
        <button className={'filtro' + (alta ? ' on' : '')} onClick={() => setAlta(!alta)}>Prioridade alta</button>
      </div>
      {erro && <div className="aviso-b">{erro}</div>}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 16, alignItems: 'stretch' }}>
        <div style={{ flex: '999 1 520px', minWidth: 0, overflow: 'auto' }}>
          <div className="grelha-col" style={{ gridAutoColumns: `minmax(220px,1fr)` }}>
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
                    {lista.map((x) => <CartaoCaixa key={x.id} c={x} feito={!!e.fim} sel={x.id === selId} onClick={() => setSelId(x.id)}
                      onDragStart={() => { arrastado.current = x.id; }} onDrop={() => largar(e.id, x.id)} />)}
                  </div>
                  <button style={{ textAlign: 'left', padding: 8, borderRadius: 10, fontSize: 13, color: 'var(--tinta2)' }} onClick={() => setNovoEm(e.id)}>+ Adicionar</button>
                </section>
              );
            })}
          </div>
        </div>
        {sel && <Painel key={sel.id} cartao={sel} board={board} cofreId={cofreId} pessoas={pessoas} utilizador={utilizador}
          onFechar={() => setSelId(null)} onGuardado={c.recarregar} onGerirEquipa={() => setEquipaAberta(true)} />}
      </div>
      {novoEm && (
        <Modal titulo="Novo cartão" onFechar={fechar}>
          <form className="linha" onSubmit={(e) => { e.preventDefault(); if (!titNovo.trim()) return; void criar(novoEm, titNovo.trim()); fechar(); }}>
            <input className="campo" autoFocus placeholder="Título" value={titNovo} onChange={(e) => setTitNovo(e.target.value)} />
            <button className="btn g terra" type="submit">Criar</button>
          </form>
        </Modal>
      )}
      {equipaAberta && <GerirEquipa cofreId={cofreId} onFechar={() => setEquipaAberta(false)} onMudou={onBoardsMudaram} />}
      {config && <Config board={board} cofreId={cofreId} onFechar={() => setConfig(false)} onGuardado={() => { b.recarregar(); onBoardsMudaram(); }} />}
    </>
  );
}

function CartaoCaixa({ c, sel, feito, onClick, onDragStart, onDrop }: { c: Cartao; sel: boolean; feito: boolean; onClick: () => void; onDragStart: () => void; onDrop: () => void }) {
  const ch = checklist(c.corpo);
  const d = c.prazo ? diasAte(c.prazo) : null;
  return (
    <article className={'cartao' + (sel ? ' sel' : '') + (feito ? ' feito' : '')} draggable onClick={onClick} onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(); }}>
      <span className="tit">{c.titulo || '(sem título)'}</span>
      {c.etiquetas.length > 0 && <div className="tags">{c.etiquetas.map((e) => <span key={e}>{e}</span>)}</div>}
      <div className="pe">
        {c.responsavel ? <span className="avatar" title={c.responsavel}>{iniciais(c.responsavel)}</span> : <span className="avatar" style={{ background: 'var(--nevoa)', color: 'var(--tinta2)' }}>–</span>}
        <span className="mono">{ch.n > 0 ? `${ch.d}/${ch.n}` : ''}</span>
        {c.prazo && <span className={'mono prazo' + (!feito && d !== null && d <= 7 ? ' perto' : '')}>{fmtDia(c.prazo)}</span>}
      </div>
    </article>
  );
}

function Painel({ cartao, board, cofreId, pessoas, utilizador, onFechar, onGuardado, onGerirEquipa }: { cartao: Cartao; board: Board; cofreId: string; pessoas: string[]; utilizador: string; onFechar: () => void; onGuardado: () => void; onGerirEquipa: () => void }) {
  const [f, setF] = useState<CartaoEntrada>(paraEntrada(cartao));
  const hash = useRef(cartao.hash);
  const sujo = useRef(false);
  const [estado, setEstado] = useState('');
  const [conflito, setConflito] = useState<ConflitoDados['atual'] | null>(null);
  const [apagar, setApagar] = useState(false);
  const fRef = useRef(f); fRef.current = f;

  const guardar = async (forcar?: string) => {
    if (!sujo.current && !forcar) return;
    try {
      const g = await api.guardarCartao(cofreId, fRef.current, forcar ?? hash.current);
      hash.current = g.hash; sujo.current = false; setEstado('Guardado agora'); setConflito(null); onGuardado();
    } catch (e) {
      if (eConflito(e)) { setConflito((e.dados as ConflitoDados).atual); setEstado('Conflito'); } else setEstado(mensagemDe(e));
    }
  };
  const deb = useDebounce(() => void guardar(), 700);
  useEffect(() => () => { if (sujo.current) void guardar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sujo.current && cartao.hash !== hash.current) { setF(paraEntrada(cartao)); hash.current = cartao.hash; }
  }, [cartao]);

  const mudar = (p: Partial<CartaoEntrada>) => { setF({ ...fRef.current, ...p }); sujo.current = true; setEstado('A guardar…'); deb.chamar(); };
  const d = f.prazo ? diasAte(f.prazo) : null;
  const gente = [...new Set([...pessoas, utilizador, f.responsavel].filter(Boolean))];

  const fecharGuardando = () => { deb.cancelar(); void guardar().then(onFechar); };
  const fecharRef = useRef(fecharGuardando); fecharRef.current = fecharGuardando;
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.fundo .modal')) fecharRef.current(); };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  return (
    <div className="fundo fundo-cartao" onMouseDown={(e) => e.target === e.currentTarget && fecharGuardando()}>
    <aside className="painel" role="dialog" aria-modal="true" aria-label="Cartão aberto">
      <div className="linha">
        <span className="fl mono muted" style={{ fontSize: 12, textTransform: 'uppercase' }}>{board.nome} · {cartao.id}</span>
        <span style={{ fontSize: 12, color: estado === 'Conflito' ? 'var(--terra)' : 'var(--salvia)' }}>{estado}</span>
        <button className="icone-b cinza" aria-label="Fechar cartão" onClick={fecharGuardando}><Fechar /></button>
      </div>
      <h2><textarea className="tit-in" rows={1} value={f.titulo} onChange={(e) => mudar({ titulo: e.target.value.replace(/\n/g, " ") })} placeholder="Título" /></h2>
      <div className="estados" role="group" aria-label="Estado">
        {board.estados.map((s: Estado) => <button key={s.id} className={f.estado === s.id ? 'on' : ''} onClick={() => mudar({ estado: s.id })}>{f.estado === s.id && <span className="ponto" style={{ width: 6, height: 6 }} />}{s.nome}</button>)}
      </div>
      <dl>
        <dt>Responsável</dt>
        <dd className="linha">{f.responsavel && <span className="avatar l">{iniciais(f.responsavel)}</span>}
          <select className="ed" value={f.responsavel} onChange={(e) => { if (e.target.value === '__gerir') onGerirEquipa(); else mudar({ responsavel: e.target.value }); }}><option value="">—</option>{gente.map((p) => <option key={p}>{p}</option>)}<option value="__gerir">+ Adicionar / gerir equipa…</option></select></dd>
        <dt>Prazo</dt>
        <dd className="linha"><input type="date" className="ed mono" style={{ width: 'auto', fontSize: 13 }} value={f.prazo} onChange={(e) => mudar({ prazo: e.target.value })} />{f.prazo && <span style={{ color: d !== null && d <= 7 ? 'var(--terra)' : 'var(--tinta2)', fontSize: 13 }}>· {fmtDiasAte(f.prazo)}</span>}</dd>
        <dt>Prioridade</dt>
        <dd className="linha">{f.prioridade === 'alta' && <span className="etq terra">Alta</span>}
          <select className="ed" style={{ width: 'auto' }} value={f.prioridade} onChange={(e) => mudar({ prioridade: e.target.value as Prioridade })}><option value="">—</option><option value="baixa">baixa</option><option value="media">média</option><option value="alta">alta</option></select></dd>
        <dt>Etiquetas</dt>
        <dd><input className="ed" placeholder="separadas por vírgula" value={f.etiquetas.join(', ')} onChange={(e) => mudar({ etiquetas: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /></dd>
      </dl>
      <div className="sep" />
      <textarea className="campo mono" style={{ flex: 1, minHeight: 180, resize: 'vertical', fontSize: 13 }} placeholder="Notas em Markdown. Usa - [ ] para tarefas e [[Página]] para ligar docs." value={f.corpo} onChange={(e) => mudar({ corpo: e.target.value })} />
      <div className="linha"><span className="mono muted" style={{ fontSize: 12 }}>{cartao.atualizado_por && `${cartao.atualizado_por} · ${cartao.atualizado.slice(0, 10)}`}</span><span className="fl" /><button className="btn perigo" onClick={() => setApagar(true)}>Apagar</button></div>
      {apagar && <Confirmar titulo="Apagar cartão?" texto="Vai para a pasta .lixo do cofre e pode ser recuperado dali." ok="Apagar" perigo onOk={() => { deb.cancelar(); sujo.current = false; void api.apagarCartao(cofreId, cartao.board, cartao.id).then(() => { onGuardado(); onFechar(); }); }} onFechar={() => setApagar(false)} />}
      {conflito && (
        <Modal titulo="Alguém alterou este cartão" onFechar={() => setConflito(null)}>
          <div className="muted">Enquanto editavas, o ficheiro mudou noutro PC. O que preferes?</div>
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="btn g" onClick={() => { sujo.current = false; setConflito(null); hash.current = conflito.hash; onGuardado(); setEstado(''); }}>Ficar com a deles</button>
            <button className="btn g pri" onClick={() => void guardar(conflito.hash)}>Manter a minha</button>
          </div>
        </Modal>
      )}
    </aside>
    </div>
  );
}

function Config({ board, cofreId, onFechar, onGuardado }: { board: Board; cofreId: string; onFechar: () => void; onGuardado: () => void }) {
  const [nome, setNome] = useState(board.nome);
  const [estados, setEstados] = useState<Estado[]>(board.estados);
  const [erro, setErro] = useState('');
  const mudar = (i: number, p: Partial<Estado>) => setEstados(estados.map((e, k) => (k === i ? { ...e, ...p } : e)));
  const mover = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= estados.length) return; const a = [...estados]; [a[i], a[j]] = [a[j], a[i]]; setEstados(a); };
  return (
    <Modal titulo="Colunas do board" onFechar={onFechar}>
      <label className="rotulo">Nome do board<input className="campo" value={nome} onChange={(e) => setNome(e.target.value)} /></label>
      {estados.map((e, i) => (
        <div key={e.id} className="linha">
          <input className="campo" value={e.nome} onChange={(ev) => mudar(i, { nome: ev.target.value })} />
          <label className="linha" title="Coluna final (concluído)"><input type="checkbox" checked={!!e.fim} onChange={(ev) => mudar(i, { fim: ev.target.checked })} />fim</label>
          <button className="btn" onClick={() => mover(i, -1)}>↑</button><button className="btn" onClick={() => mover(i, 1)}>↓</button>
          <button className="btn perigo" disabled={estados.length < 2} onClick={() => setEstados(estados.filter((_, k) => k !== i))}>×</button>
        </div>
      ))}
      <button className="btn" onClick={() => setEstados([...estados, { id: 'e' + Math.random().toString(36).slice(2, 7), nome: 'Nova coluna' }])}>+ Coluna</button>
      {erro && <div className="erro-t">{erro}</div>}
      <div className="linha" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onFechar}>Cancelar</button>
        <button className="btn pri" disabled={!nome.trim()} onClick={() => api.guardarBoard(cofreId, { id: board.id, nome: nome.trim(), descricao: board.descricao, estados }).then(() => { onGuardado(); onFechar(); }).catch((e) => setErro(mensagemDe(e)))}>Guardar</button>
      </div>
    </Modal>
  );
}
