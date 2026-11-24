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
    const p = await api.escolherPasta('Open folder as vault');
    if (!p) return;
    const r = await api.abrirPasta(p);
    if (r.estado === 'aberto') { onMudou(); onAbrir(r.cofre.id); }
    else setConverter({ pasta: r.pasta, nome: r.nome, pessoal: false });
  });

  const localizar = (c: CofreInfo) => tentar(async () => {
    const p = await api.escolherPasta('Locate the folder of vault ' + c.nome);
    if (!p) return;
    await api.localizarCofre(c.id, p);
    onMudou();
  });

  const escolherPastaNovo = () => tentar(async () => {
    const p = await api.escolherPasta('Where to create the vault');
    if (p && novo) setNovo({ ...novo, pasta: p });
  });

  const filtrados = cofres.filter((c) => !busca.trim() || c.nome.toLowerCase().includes(busca.trim().toLowerCase()) || c.caminho.toLowerCase().includes(busca.trim().toLowerCase()));
  return (
    <div className="bv">
      <div className="linha" style={{ justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div className="linha" style={{ gap: 12 }}>
          <Logo tamanho={44} />
          <div className="col"><span style={{ fontSize: 18, fontWeight: 600 }}>Developer SecondBrain</span><span className="muted" style={{ fontSize: 13 }}>Pick a vault to get started</span></div>
        </div>
        <span className="mono muted" style={{ fontSize: 12 }}>v0.1 · portable</span>
      </div>
      {erro && <div className="aviso-b">{erro}</div>}
      <div className="grelha">
        <section className="caixa col" style={{ gap: 16, padding: 24 }}>
          <div className="linha" style={{ alignItems: 'baseline', justifyContent: 'space-between' }}><h2>Recent vaults</h2><span className="muted" style={{ fontSize: 13 }}>{cofres.length}</span></div>
          <label className="pesq" style={{ cursor: 'text' }}><Lupa /><input style={{ border: 0, outline: 0, background: 'none', flex: 1, minWidth: 0 }} placeholder="Search vaults" aria-label="Search vaults" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
          {cofres.length === 0 && <div className="vazio">No vaults yet. Create a new one or open a shared folder.</div>}
          {filtrados.map((c) => {
            const eAtivo = c.id === def.cofreAtivo && c.disponivel;
            const ini = iniciais(c.nome || '?').slice(0, 2);
            return (
              <div key={c.id} className={'cofre-l' + (eAtivo ? ' escuro' : '') + (c.disponivel ? '' : ' off')} style={{ padding: 0, flexDirection: 'column', alignItems: 'stretch', gap: 0 }}>
                <div className="linha" style={{ gap: 14, padding: '14px 16px' }}>
                  <button className="linha fl" style={{ gap: 14, textAlign: 'left', minWidth: 0 }} disabled={!c.disponivel} onClick={() => onAbrir(c.id)}>
                    <span className={'ini g' + (eAtivo ? '' : ' claro')} style={eAtivo ? { background: 'var(--agora-s)', color: 'var(--agora-t)' } : undefined}>{c.pessoal && !eAtivo ? <Cadeado /> : ini}</span>
                    <span className="fl col" style={{ gap: 2, minWidth: 0 }}>
                      <span className="nome" style={c.disponivel ? undefined : { color: 'var(--tinta2)' }}>{c.nome || '(unnamed)'}</span>
                      <span className="cam">{c.disponivel ? c.caminho : c.motivo}</span>
                    </span>
                  </button>
                  {c.disponivel && <span style={{ fontSize: 12, color: eAtivo ? 'var(--agora-t)' : 'var(--tinta2)' }}>{c.pessoal ? 'personal' : 'shared'}</span>}
                  {!c.disponivel && <button style={{ fontSize: 13, fontWeight: 500, color: 'var(--terra)' }} onClick={() => localizar(c)}>Locate…</button>}
                </div>
                <div className="linha" style={{ gap: 12, padding: '0 16px 10px 66px', fontSize: 12 }}>
                  {c.disponivel && <button className="muted" onClick={() => tentar(() => api.mostrarNoExplorador(c.id, ''))}>Show folder</button>}
                  <button className="muted" onClick={() => tentar(async () => { await api.definirPessoal(c.id, !c.pessoal); onMudou(); })}>{c.pessoal ? 'Mark as shared' : 'Mark as personal'}</button>
                  <button className="muted" onClick={() => setRemover(c)}>Remove from list</button>
                </div>
              </div>
            );
          })}
        </section>
        <section className="col" style={{ gap: 16 }}>
          {ativo && (
            <div className="agora" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 20, padding: 24 }}>
              <div className="peq"><span className="ponto" style={{ width: 8, height: 8 }} />Last opened vault</div>
              <div className="col" style={{ gap: 6 }}>
                <span style={{ fontSize: 28, fontWeight: 300, letterSpacing: '-.01em' }}>{ativo.nome}</span>
                <span className="mono" style={{ fontSize: 12, color: 'var(--agora-m)', wordBreak: 'break-all' }}>{ativo.caminho}</span>
              </div>
              <div className="linha quebra" style={{ justifyContent: 'space-between', gap: 12 }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--agora-m)' }}>Press Enter to continue</span>
                <button className="btn g branco" autoFocus onClick={() => onAbrir(ativo.id)}>Continue ↗</button>
              </div>
            </div>
          )}
          <div className="caixa col" style={{ padding: 8, gap: 0 }}>
            <div className="linha" style={{ gap: 14, padding: 16 }}>
              <div className="fl col" style={{ gap: 2 }}><b style={{ fontSize: 15 }}>Create a new vault</b><span className="muted" style={{ fontSize: 13 }}>Choose a name and where it lives</span></div>
              <button className="btn g terra" onClick={() => setNovo({ nome: '', pasta: '', pessoal: false })}>Create</button>
            </div>
            <div className="sep" style={{ margin: '0 16px' }} />
            <div className="linha" style={{ gap: 14, padding: 16 }}>
              <div className="fl col" style={{ gap: 2 }}><b style={{ fontSize: 15 }}>Open folder as vault</b><span className="muted" style={{ fontSize: 13 }}>A local or shared (synced) folder</span></div>
              <button className="btn g" onClick={abrirPasta}>Open</button>
            </div>
          </div>
        </section>
      </div>
      <div className="linha quebra muted" style={{ justifyContent: 'space-between', gap: 16, fontSize: 13 }}>
        <span>
          {editarNome
            ? <input className="campo" style={{ height: 32, width: 220 }} autoFocus placeholder="Your name" value={nomeUtil} onChange={(e) => setNomeUtil(e.target.value)} onBlur={() => { setEditarNome(false); void guardarNome(); }} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
            : <>Working as <b style={{ color: 'var(--tinta)', fontWeight: 600 }}>{def.utilizador || 'nobody'}</b> · <a href="#" onClick={(e) => { e.preventDefault(); setEditarNome(true); }}>{def.utilizador ? 'Change' : 'Set your name'}</a></>}
        </span>
        <label className="linha" style={{ cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--tinta)' }} checked={def.abrirUltimo} onChange={(e) => tentar(async () => { await api.definirAbrirUltimo(e.target.checked); onMudou(); })} />
          Always open the last vault
        </label>
      </div>

      {novo && (
        <Modal titulo="Create a new vault" onFechar={() => setNovo(null)}>
          <label className="rotulo">Name<input className="campo" autoFocus value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></label>
          <div className="rotulo">Location
            <div className="linha"><input className="campo mono" readOnly value={novo.pasta} placeholder="Choose where to keep it (e.g. your synced drive)" /><button className="btn" onClick={escolherPastaNovo}>Choose…</button></div>
            <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>{novo.pasta && novo.nome.trim() ? <>Creates the folder <b className="mono">{novo.nome.trim()}</b> inside it. Every vault gets its own folder.</> : 'The vault gets its own folder, named after it, inside the location you choose.'}</span>
          </div>
          <label className="linha"><input type="checkbox" checked={novo.pessoal} onChange={(e) => setNovo({ ...novo, pessoal: e.target.checked })} />Personal vault (only for me)</label>
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setNovo(null)}>Cancel</button>
            <button className="btn pri" disabled={!novo.nome.trim() || !novo.pasta} onClick={() => tentar(async () => { const c = await api.criarCofre(novo.nome.trim(), novo.pasta, novo.pessoal); setNovo(null); onMudou(); onAbrir(c.id); })}>Create</button>
          </div>
        </Modal>
      )}
      {converter && (
        <Modal titulo="This folder is not a vault yet" onFechar={() => setConverter(null)}>
          <div className="mono" style={{ fontSize: 12 }}>{converter.pasta}</div>
          <div className="sub" style={{ margin: 0 }}>We will add a _cofre.md file and the Docs and Boards folders. Existing files are not changed.</div>
          <label className="rotulo">Vault name<input className="campo" value={converter.nome} onChange={(e) => setConverter({ ...converter, nome: e.target.value })} /></label>
          <label className="linha"><input type="checkbox" checked={converter.pessoal} onChange={(e) => setConverter({ ...converter, pessoal: e.target.checked })} />Personal vault</label>
          <div className="linha" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setConverter(null)}>Cancel</button>
            <button className="btn pri" disabled={!converter.nome.trim()} onClick={() => tentar(async () => { const c = await api.converterPasta(converter.pasta, converter.nome.trim(), converter.pessoal); setConverter(null); onMudou(); onAbrir(c.id); })}>Convert and open</button>
          </div>
        </Modal>
      )}
      {remover && <Confirmar titulo="Remove from the list?" texto={`"${remover.nome}" will no longer show here. The folder and its files are not deleted.`} ok="Remove" perigo onOk={() => tentar(async () => { await api.removerCofre(remover.id); onMudou(); })} onFechar={() => setRemover(null)} />}
    </div>
  );
}
