import { useEffect, type ReactNode } from 'react';

export function Modal({ titulo, onFechar, children }: { titulo?: string; onFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onFechar]);
  return (
    <div className="fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="modal">
        {titulo && <h3>{titulo}</h3>}
        {children}
      </div>
    </div>
  );
}

export function Confirmar({ titulo, texto, ok, perigo, onOk, onFechar }: { titulo: string; texto: string; ok: string; perigo?: boolean; onOk: () => void; onFechar: () => void }) {
  return (
    <Modal titulo={titulo} onFechar={onFechar}>
      <div className="sub" style={{ margin: 0 }}>{texto}</div>
      <div className="linha" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onFechar}>Cancelar</button>
        <button className={'btn ' + (perigo ? 'perigo' : 'pri')} onClick={() => { onOk(); onFechar(); }}>{ok}</button>
      </div>
    </Modal>
  );
}

export function Aviso({ texto, onFechar }: { texto: string; onFechar: () => void }) {
  return (
    <Modal titulo="Atenção" onFechar={onFechar}>
      <div>{texto}</div>
      <div className="linha" style={{ justifyContent: 'flex-end' }}><button className="btn pri" onClick={onFechar}>OK</button></div>
    </Modal>
  );
}
