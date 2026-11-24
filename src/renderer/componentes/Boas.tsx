import { useState } from 'react';
import { api, mensagemDe } from '../lib/api';
import type { CofreInfo, Definicoes } from '../../shared/types';
import { Confirmar, Modal } from './Modal';
import { Cadeado, Lupa } from './Icones';
import { Logo } from './Logo';
import { iniciais } from '../lib/util';

interface Props {
  def: Definicoes;
  cofres: CofreInfo[];
  onAbrir: (id: string) => void;
  onMudou: () => void;
}

export function Boas({ def, cofres, onAbrir, onMudou }: Props) {
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState<{ nome: string; pasta: string; pessoal: boolean } | null>(null);
  const [converter, setConverter] = useState<{ pasta: string; nome: string; pessoal: boolean } | null>(null);
  const [remover, setRemover] = useState<CofreInfo | null>(null);
  const [nomeUtil, setNomeUtil] = useState(def.utilizador);
  const [busca, setBusca] = useState('');
  const [editarNome, setEditarNome] = useState(!def.utilizador);
  const ativo = cofres.find((c) => c.id === def.cofreAtivo && c.disponivel);

  const tentar = async (f: () => Promise<void>) => {
    setErro('');
    try { await f(); } catch (e) { setErro(mensagemDe(e)); }
  };

  const guardarNome = () => tentar(async () => { if (nomeUtil.trim() !== def.utilizador) { await api.definirUtilizador(nomeUtil.trim()); onMudou(); } });

  const abrirPasta = () => tentar(async () => {
    const p = await api.escolherPasta('Abrir pasta como cofre');
    if (!p) return;
    const r = await api.abrirPasta(p);
    if (r.estado === 'aberto') { onMudou(); onAbrir(r.cofre.id); }
    else setConverter({ pasta: r.pasta, nome: r.nome, pessoal: false });
  });

  const localizar = (c: CofreInfo) => tentar(async () => {
    const p = await api.escolherPasta('Localizar a pasta do cofre ' + c.nome);
    if (!p) return;
    await api.localizarCofre(c.id, p);
    onMudou();
  });

  const escolherPastaNovo = () => tentar(async () => {
    const p = await api.escolherPasta('Onde guardar o cofre');
    if (p && novo) setNovo({ ...novo, pasta: p });
  });

  const filtrados = cofres.filter((c) => !busca.trim() || c.nome.toLowerCase().includes(busca.trim().toLowerCase()) || c.caminho.toLowerCase().includes(busca.trim().toLowerCase()));
  return (
    <div className="bv">
      <div className="linha" style={{ justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div className="linha" style={{ gap: 12 }}>
          <Logo tamanho={44} />
          <div className="col"><span style={{ fontSize: 18, fontWeight: 600 }}>Developer SecondBrain</span><span className="muted" style={{ fontSize: 13 }}>Escolhe um cofre para começar</span></div>
        </div>
        <span className="mono muted" style={{ fontSize: 12 }}>v0.1 · portátil</span>
      </div>
      {erro && <div className="aviso-b">{erro}</div>}
      <div className="grelha">
        <section className="caixa col" style={{ gap: 16, padding: 24 }}>
          <div className="linha" style={{ alignItems: 'baseline', justifyContent: 'space-between' }}><h2>Cofres recentes</h2><span className="muted" style={{ fontSize: 13 }}>{cofres.length}</span></div>
          <label className="pesq" style={{ cursor: 'text' }}><Lupa /><input style={{ border: 0, outline: 0, background: 'none', flex: 1, minWidth: 0 }} placeholder="Pesquisar cofres" aria-label="Pesquisar cofres" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
          {cofres.length === 0 && <div className="vazio">Ainda não tens cofres. Cria um novo ou abre uma pasta partilhada.</div>}
          {filtrados.map((c) => {
            const eAtivo = c.id === def.cofreAtivo && c.disponivel;
            const ini = iniciais(c.nome || '?').slice(0, 2);
            return (
              <div key={c.id} className={'cofre-l' + (eAtivo ? ' escuro' : '') + (c.disponivel ? '' : ' off')} style={{ padding: 0, flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
                <div className="linha" style={{ gap: 14, padding: '14px 16px' }}>
                  <button className="linha fl" style={{ gap: 14, textAlign: 'left', minWidth: 0 }} disabled={!c.disponivel} onClick={() => onAbrir(c.id)}>
                    <span className={'ini g' + (eAtivo ? '' : ' claro')} style={eAtivo ? { background: 'var(--agora-s)', color: 'var(--agora-t)' } : undefined}>{c.pessoal && !eAtivo ? <Cadeado /> : ini}</span>
                    <span className="fl col" style={{ gap: 2, minWidth: 0 }}>
                      <span className="nome" style={c.disponivel ? undefined : { color: 'var(--tinta2)' }}>{c.nome || '(sem nome)'}</span>
                      <span className="cam">{c.disponivel ? c.caminho : c.motivo}</span>
                    </span>
                  </button>
                  {c.disponivel && <span style={{ fontSize: 12, color: eAtivo ? 'var(--agora-t)' : 'var(--tinta2)' }}>{c.pessoal ? 'só tu' : 'partilhado'}</span>}
                  {!c.disponivel && <button style={{ fontSize: 13, fontWeight: 500, color: 'var(--terra)' }} onClick={() => localizar(c)}>Localizar…</button>}
                </div>
                <div className="linha" style={{ gap: 12, padding: '0 16px 10px 66px', fontSize: 12 }}>
                  {c.disponivel && <button className="muted" onClick={() => tentar(() => api.mostrarNoExplorador(c.id, ''))}>Mostrar pasta</button>}
                  <button className="muted" onClick={() => tentar(async () => { await api.definirPessoal(c.id, !c.pessoal); onMudou(); })}>{c.pessoal ? 'Tornar partilhado' : 'Marcar pessoal'}</button>
                  <button className="muted" onClick={() => setRemover(c)}>Remover da lista</button>
                </div>
              </div>
            );
          })}
        </section>
        <section className="col" style={{ gap: 16 }}>
          {ativo && (
            <div className="agora" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 20, padding: 24 }}>
              <div className="peq"><span className="ponto" style={{ width: 8, height: 8 }} />Último cofre aberto</div>
              <div className="col" style={{ gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-.01em' }}>{ativo.nome}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--agora-m)', wordBreak: 'break-all' }}>{ativo.caminho}</span>
              </div>
              <div className="linha quebra" style={{ justifyContent: 'space-between', gap: 12 }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--agora-m)' }}>Enter para continuar</span>
                <button className="btn g branco" autoFocus onClick={() => onAbrir(ativo.id)}>Continuar ↗</button>
              </div>
            </div>
          )}
          <div className="caixa col" style={{ padding: 8, gap: 0 }}>
            <div className="linha" style={{ gap: 14, padding: 16 }}>
              <div className="fl col" style={{ gap: 2 }}><b style={{ fontSize: 15 }}>Criar cofre novo</b><span className="muted" style={{ fontSize: 13 }}>Escolhe o nome e a pasta onde fica</span></div>
              <button className="btn g terra" onClick={() => setNovo({ nome: '', pasta: '', pessoal: false })}>Criar</button>
            </div>
            <div className="sep" style={{ margin: '0 16px' }} />
            <div className="linha" style={{ gap: 14, padding: 16 }}>
              <div className="fl col" style={{ gap: 2 }}><b style={{ fontSize: 15 }}>Abrir pasta como cofre</b><span className="muted" style={{ fontSize: 13 }}>Uma pasta local ou partilhada</span></div>
              <button className="btn g" onClick={abrirPasta}>Abrir</button>
            </div>
          </div>
        </section>
      </div>
      <div className="linha quebra muted" style={{ justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
        <span>
          {editarNome
            ? <input className="campo" style={{ height: 32, width: 220 }} autoFocus placeholder="O teu nome" value={nomeUtil} onChange={(e) => setNomeUtil(e.target.value)} onBlur={() => { setEditarNome(false); void guardarNome(); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            : <>A trabalhar como <b style={{ color: 'var(--tinta)', fontWeight: 600 }}>{def.utilizador || 'ninguém'}</b> · <a href="#" onClick={(e) => { e.preventDefault(); setEditarNome(true); }}>{def.utilizador ? 'Mudar' : 'Definir nome'}</a></>}
        </span>
        <label className="linha" style={{ cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--tinta)' }} checked={def.abrirUltimo} onChange={(e) => tentar(async () => { await api.definirAbrirUltimo(e.target.checked); onMudou(); })} />
          Abrir sempre o último cofre
        </label>
      </div>

      {novo && (
        <Modal titulo="Criar cofre novo" onFechar={() => setNovo(null)}>
          <label className="rotulo">Nome<input className="campo" autoFocus value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></label>
          <div className="rotulo">Pasta
            <div className="linha"><input className="campo mono" readOnly value={novo.pasta} placeholder="Escolhe onde guardar (ex.: na tua drive)" /><button className="btn" onClick={escolherPastaNovo}>Escolher…</button></div>
            <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{novo.pasta && novo.nome.trim() ? <>Cria a pasta <b className="mono">{novo.nome.trim()}</b> dentro desta. Cada cofre tem a sua pasta.</> : 'O cofre fica numa pasta própria, com o nome que escolheres, dentro da pasta escolhida.'}</span>
          </div>
          <label className="linha"><input type="checkbox" checked={novo.pessoal} onChange={(e) => setNovo({ ...novo, pessoal: e.target.checked })} />Cofre só meu (mostra cadeado)</label>
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setNovo(null)}>Cancelar</button>
            <button className="btn pri" disabled={!novo.nome.trim() || !novo.pasta} onClick={() => tentar(async () => { const c = await api.criarCofre(novo.nome.trim(), novo.pasta, novo.pessoal); setNovo(null); onMudou(); onAbrir(c.id); })}>Criar</button>
          </div>
        </Modal>
      )}
      {converter && (
        <Modal titulo="Esta pasta ainda não é um cofre" onFechar={() => setConverter(null)}>
          <div className="mono" style={{ fontSize: 12 }}>{converter.pasta}</div>
          <div className="sub" style={{ margin: 0 }}>Vamos acrescentar um ficheiro _cofre.md e as pastas Docs e Boards. Os ficheiros existentes não são alterados.</div>
          <label className="rotulo">Nome do cofre<input className="campo" value={converter.nome} onChange={(e) => setConverter({ ...converter, nome: e.target.value })} /></label>
          <label className="linha"><input type="checkbox" checked={converter.pessoal} onChange={(e) => setConverter({ ...converter, pessoal: e.target.checked })} />Cofre só meu</label>
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setConverter(null)}>Cancelar</button>
            <button className="btn pri" disabled={!converter.nome.trim()} onClick={() => tentar(async () => { const c = await api.converterPasta(converter.pasta, converter.nome.trim(), converter.pessoal); setConverter(null); onMudou(); onAbrir(c.id); })}>Converter e abrir</button>
          </div>
        </Modal>
      )}
      {remover && <Confirmar titulo="Remover da lista?" texto={`"${remover.nome}" deixa de aparecer aqui. A pasta e os ficheiros não são apagados.`} ok="Remover" perigo onOk={() => tentar(async () => { await api.removerCofre(remover.id); onMudou(); })} onFechar={() => setRemover(null)} />}
    </div>
  );
}
