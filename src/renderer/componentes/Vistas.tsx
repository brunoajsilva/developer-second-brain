import { useEffect, useState, type ReactNode } from 'react';
import { api, mensagemDe } from '../lib/api';
import { checklist, diasAte, fmtDia, fmtAtras, iniciais, useCarregar } from '../lib/util';
import type { Board, Cartao, CofreInfo, CopiaConflito, DocResumo, ResultadoPesquisa } from '../../shared/types';
import { Modal } from './Modal';

export interface Dados { boards: Board[]; cartoes: Cartao[]; docs: DocResumo[]; pessoas: string[]; conflitos: CopiaConflito[] }

export function Cab({ sup, titulo, sub, children }: { sup?: string; titulo: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="cab">
      <div className="col" style={{ gap: 4 }}>
        {sup && <span className="sup">{sup}</span>}
        <div className="linha quebra" style={{ alignItems: 'baseline', gap: 14 }}><h1>{titulo}</h1>{sub && <span className="sub">{sub}</span>}</div>
      </div>
      {children && <div className="linha quebra">{children}</div>}
    </header>
  );
}

function dataCurta(): string {
  const d = new Date();
  const sem = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d.getDay()];
  const mes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][d.getMonth()];
  return `${sem} · ${String(d.getDate()).padStart(2, '0')} ${mes} ${d.getFullYear()}`;
}

const ehFim = (boards: Board[], c: Cartao) => !!boards.find((b) => b.id === c.board)?.estados.find((e) => e.id === c.estado)?.fim;
const nomeBoard = (boards: Board[], id: string) => boards.find((b) => b.id === id)?.nome ?? '';
const nomeEstado = (boards: Board[], c: Cartao) => boards.find((b) => b.id === c.board)?.estados.find((e) => e.id === c.estado)?.nome ?? '';

function Lista({ titulo, cartoes, boards, cofre, vazio, onAbrir }: { titulo: string; cartoes: Cartao[]; boards: Board[]; cofre: string; vazio?: string; onAbrir: (b: string, id: string) => void }) {
  return (
    <section className="caixa col" style={{ gap: 4 }}>
      <div className="linha" style={{ padding: '0 4px 8px' }}><h2 className="fl">{titulo}</h2><span className="muted" style={{ fontSize: 13 }}>{cartoes.length}</span></div>
      {cartoes.length === 0 && <div className="vazio" style={{ padding: 16 }}>{vazio ?? 'Nada por aqui.'}</div>}
      {cartoes.map((c) => {
        const d = c.prazo ? diasAte(c.prazo) : null;
        const perto = d !== null && d <= 2;
        return (
          <button key={c.id} className="lin-t" onClick={() => onAbrir(c.board, c.id)}>
            <span className={'ponto' + (c.prioridade === 'alta' || perto ? '' : ' oco')} />
            <span className="fl col" style={{ gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{c.titulo || '(sem título)'}</span>
              <span className="muted" style={{ fontSize: 12 }}>{cofre} · {nomeBoard(boards, c.board)}{c.responsavel ? ' · ' + c.responsavel : ''}</span>
            </span>
            {c.prazo && <span className="mono" style={{ fontSize: 12, color: perto ? 'var(--terra)' : 'var(--tinta2)' }}>{fmtDia(c.prazo)}</span>}
          </button>
        );
      })}
    </section>
  );
}

export function Hoje({ cofre, dados, utilizador, onAbrir, onMudou }: { cofre: CofreInfo; dados: Dados | null; utilizador: string; onAbrir: (b: string, id: string) => void; onMudou: () => void }) {
  if (!dados) return <div className="vazio">A carregar…</div>;
  const { boards } = dados;
  const abertos = dados.cartoes.filter((c) => !ehFim(boards, c));
  const meus = abertos.filter((c) => c.responsavel === utilizador);
  const dias = (c: Cartao) => (c.prazo ? diasAte(c.prazo) : null);
  const semana = meus.filter((c) => { const d = dias(c); return d !== null && d <= 7; }).sort((a, b) => a.prazo.localeCompare(b.prazo));
  const atrasados = meus.filter((c) => (dias(c) ?? 1) < 0);
  const semPrazo = meus.filter((c) => !c.prazo);
  const bloqueados = abertos.filter((c) => /bloq/i.test(nomeEstado(boards, c)));
  const limite = Date.now() - 7 * 86400000;
  const feitos = dados.cartoes.filter((c) => c.responsavel === utilizador && ehFim(boards, c) && Date.parse(c.atualizado) >= limite);
  const agora = meus.filter((c) => { const b = boards.find((x) => x.id === c.board); return b && b.estados[0]?.id !== c.estado && !/bloq/i.test(nomeEstado(boards, c)); }).sort((a, b) => (a.prazo || '9').localeCompare(b.prazo || '9') || b.atualizado.localeCompare(a.atualizado))[0];
  const ch = agora ? checklist(agora.corpo) : { n: 0, d: 0 };
  const hora = new Date().getHours();
  const saud = hora < 12 ? 'Bom dia' : hora < 20 ? 'Boa tarde' : 'Boa noite';
  const concluir = async () => {
    if (!agora) return;
    const fim = boards.find((b) => b.id === agora.board)?.estados.find((e) => e.fim);
    if (!fim) return;
    await api.moverCartao(cofre.id, agora.board, agora.id, fim.id, null);
    onMudou();
  };
  const stats: [string, number, boolean?][] = [['Prazos esta semana', semana.length], ['Atrasados', atrasados.length], ['Bloqueados na equipa', bloqueados.length], ['Feitos esta semana', feitos.length, true]];
  return (
    <div className="rolar">
      <Cab sup={dataCurta()} titulo={`${saud}${utilizador ? ', ' + utilizador.split(' ')[0] : ''}`}>
        <span className="btn pri" style={{ cursor: 'default' }}>{cofre.nome}</span>
      </Cab>
      {!utilizador && <div className="aviso-b">Define o teu nome na página inicial (ícone de definições) para veres aqui os cartões que são teus.</div>}
      {agora && (
        <section className="agora" aria-label="Agora">
          <div className="fl col" style={{ gap: 12, flex: '999 1 420px' }}>
            <div className="peq"><span className="ponto" />Agora · {nomeEstado(boards, agora)} · {nomeBoard(boards, agora.board)}</div>
            <span style={{ fontSize: 26, letterSpacing: '-.01em' }}>{agora.titulo}</span>
            <div className="linha quebra" style={{ gap: 18, fontSize: 13, color: 'var(--agora-m)' }}>
              {ch.n > 0 && <span>Checklist <b className="mono" style={{ fontWeight: 500, color: 'var(--agora-t)' }}>{ch.d}/{ch.n}</b></span>}
              {agora.prazo && <span>Prazo <b className="mono" style={{ fontWeight: 500, color: 'var(--agora-t)' }}>{fmtDia(agora.prazo)}</b></span>}
            </div>
            {ch.n > 0 && <div style={{ height: 6, borderRadius: 999, background: 'repeating-linear-gradient(90deg,var(--agora-l) 0 6px,transparent 6px 10px)', overflow: 'hidden' }}><div style={{ width: (ch.d / ch.n) * 100 + '%', height: 6, borderRadius: 999, background: 'var(--terra-ponto)' }} /></div>}
          </div>
          <div className="linha quebra" style={{ flex: '1 1 200px', justifyContent: 'flex-end' }}>
            <button className="btn g fantasma" onClick={() => onAbrir(agora.board, agora.id)}>Abrir</button>
            <button className="btn g branco" onClick={() => void concluir()}>Concluir</button>
          </div>
        </section>
      )}
      <section className="stats" aria-label="Resumo">
        {stats.map(([l, v, verde]) => <div key={l} className="stat"><span className="l">{l}</span><span className="v" style={verde ? { color: 'var(--salvia)' } : undefined}>{v}</span></div>)}
      </section>
      <div className="linha gap" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 420px', minWidth: 0 }}><Lista titulo="Para esta semana" cartoes={semana} boards={boards} cofre={cofre.nome} vazio={utilizador ? 'Sem prazos esta semana.' : 'Define o teu nome para veres os teus cartões.'} onAbrir={onAbrir} /></div>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}><Lista titulo="Sem prazo" cartoes={semPrazo} boards={boards} cofre={cofre.nome} onAbrir={onAbrir} /></div>
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
    <Modal titulo="Equipa deste cofre" onFechar={onFechar}>
      <div className="muted" style={{ fontSize: 13 }}>As pessoas aqui listadas aparecem como opção de responsável nos cartões. Ficam guardadas no ficheiro _equipa.md do cofre, por isso todos os que partilham o cofre veem a mesma lista.</div>
      <form className="linha" onSubmit={(e) => { e.preventDefault(); void adicionar(); }}>
        <input className="campo" autoFocus placeholder="Nome da pessoa (ex.: Ana Costa)" value={nome} onChange={(e) => setNome(e.target.value)} />
        <button className="btn g terra" type="submit" disabled={!nome.trim()}>Adicionar</button>
      </form>
      {erro && <div className="erro-t">{erro}</div>}
      <div className="col" style={{ gap: 2 }}>
        {membros.length === 0 && <div className="vazio" style={{ padding: 16 }}>Ainda ninguém. Adiciona as pessoas da tua equipa.</div>}
        {membros.map((n) => (
          <div key={n} className="linha" style={{ padding: '8px 4px', borderTop: '1px solid var(--linha)' }}>
            <span className="avatar l">{iniciais(n)}</span><span className="fl">{n}</span>
            <button className="btn" style={{ height: 30 }} onClick={() => void remover(n)}>Remover</button>
          </div>
        ))}
      </div>
      <div className="linha" style={{ justifyContent: 'flex-end' }}><button className="btn g pri" onClick={onFechar}>Concluir</button></div>
    </Modal>
  );
}

export function Conflitos({ cofreId, tick, onMudou }: { cofreId: string; tick: number; onMudou: () => void }) {
  const r = useCarregar(() => api.conflitos(cofreId), [cofreId, tick]);
  const [ver, setVer] = useState<{ original: string; copia: string; a: string; b: string; ca: string; co: string } | null>(null);
  const [erro, setErro] = useState('');
  const abrir = async (cp: { copia: string; original: string }) => {
    try { const [a, b] = await Promise.all([api.lerFicheiro(cofreId, cp.original), api.lerFicheiro(cofreId, cp.copia)]); setVer({ ...cp, a, b, ca: '', co: '' }); } catch (e) { setErro(mensagemDe(e)); }
  };
  const resolver = async (manter: 'original' | 'copia') => {
    if (!ver) return;
    try { await api.resolverConflito(cofreId, ver.copia, manter); setVer(null); r.recarregar(); onMudou(); } catch (e) { setErro(mensagemDe(e)); }
  };
  return (
    <div className="rolar">
      <Cab titulo="Conflitos" sub="Cópias criadas pela drive quando duas pessoas editaram o mesmo ficheiro ao mesmo tempo" />
      {erro && <div className="aviso-b">{erro}</div>}
      <section className="caixa col" style={{ gap: 4 }}>
        {(r.dados ?? []).length === 0 && <div className="vazio">Sem conflitos. ✓</div>}
        {(r.dados ?? []).map((c) => (
          <button key={c.copia} className="lin-t" onClick={() => void abrir(c)}>
            <span className="ponto" /><span className="fl mono" style={{ fontSize: 12 }}>{c.original}</span>
            <span className="etq terra">cópia {fmtAtras(c.copiaMod)}</span>
          </button>
        ))}
      </section>
      {ver && (
        <Modal titulo="Resolver conflito" onFechar={() => setVer(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div><div className="sec-h">Atual</div><pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 260, overflow: 'auto' }}>{ver.a}</pre></div>
            <div><div className="sec-h">Cópia</div><pre className="mono" style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 260, overflow: 'auto' }}>{ver.b}</pre></div>
          </div>
          <div className="sub" style={{ margin: 0 }}>O ficheiro que não escolheres vai para a pasta .lixo.</div>
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => void resolver('original')}>Manter o atual</button>
            <button className="btn pri" onClick={() => void resolver('copia')}>Manter a cópia</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Paleta({ cofres, cofreAtual, onIr, onFechar }: { cofres: CofreInfo[]; cofreAtual: string; onIr: (r: ResultadoPesquisa) => void; onFechar: () => void }) {
  const [q, setQ] = useState('');
  const [todos, setTodos] = useState(false);
  const [res, setRes] = useState<ResultadoPesquisa[]>([]);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!q.trim()) { setRes([]); return; }
    const t = setTimeout(() => {
      const ids = todos ? cofres.filter((c) => c.disponivel).map((c) => c.id) : [cofreAtual];
      api.pesquisar(q, ids).then((r) => { setRes(r); setI(0); }).catch(() => setRes([]));
    }, 120);
    return () => clearTimeout(t);
  }, [q, todos, cofreAtual, cofres]);
  return (
    <Modal onFechar={onFechar}>
      <input className="campo" autoFocus placeholder="Procurar páginas e cartões…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setI(Math.min(i + 1, res.length - 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setI(Math.max(i - 1, 0)); } else if (e.key === 'Enter' && res[i]) onIr(res[i]); }} />
      <label className="linha" style={{ color: 'var(--tinta2)' }}><input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />Procurar em todos os cofres</label>
      <div>
        {res.map((r, k) => (
          <button key={r.cofreId + r.ref} className={'res' + (k === i ? ' ativo' : '')} onClick={() => onIr(r)}>
            <div>{r.tipo === 'doc' ? '📄' : '🗂'} {r.titulo} <span style={{ color: 'var(--tinta3)' }}>· {r.contexto}{todos ? ' · ' + r.cofreNome : ''}</span></div>
            <div style={{ color: 'var(--tinta2)', fontSize: 12 }}>{r.excerto}</div>
          </button>
        ))}
        {q.trim() && res.length === 0 && <div className="vazio">Nada encontrado.</div>}
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
      if (!b) { setErro('Este cofre ainda não tem boards.'); return; }
      await api.guardarCartao(cofreId, { board: b.id, titulo: t.trim(), estado: b.estados[0].id, responsavel: utilizador, prazo: '', prioridade: '', etiquetas: [], corpo: '' }, null);
      onFeito(); onFechar();
    } catch (e) { setErro(mensagemDe(e)); }
  };
  return (
    <Modal titulo="Captura rápida" onFechar={onFechar}>
      <input className="campo" autoFocus placeholder="O que tens de fazer?" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && t.trim() && void criar()} />
      <div className="sub" style={{ margin: 0 }}>Cria um cartão na primeira coluna do primeiro board do cofre aberto.</div>
      {erro && <div className="erro-t">{erro}</div>}
    </Modal>
  );
}
