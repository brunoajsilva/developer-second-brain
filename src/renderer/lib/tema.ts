export type Tema = 'sistema' | 'claro' | 'escuro';
const CHAVE = 'secondbrain.tema';

export function lerTema(): Tema {
  try { const t = localStorage.getItem(CHAVE); if (t === 'claro' || t === 'escuro') return t; } catch { /* sem armazenamento */ }
  return 'sistema';
}

export function aplicarTema(t: Tema): void {
  if (t === 'sistema') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', t);
  try { if (t === 'sistema') localStorage.removeItem(CHAVE); else localStorage.setItem(CHAVE, t); } catch { /* ignora */ }
}

export function temaEscuro(): boolean {
  const t = document.documentElement.getAttribute('data-tema');
  return t === 'escuro' || (t !== 'claro' && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
