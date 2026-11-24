import { contextBridge, ipcRenderer } from 'electron';

// A interface só fala com o processo principal por aqui (contextIsolation ligado, sem Node na página).
contextBridge.exposeInMainWorld('ponte', {
  chamar: (nome: string, args: unknown[]) => ipcRenderer.invoke('api', nome, args),
  aoMudar: (cb: (m: unknown) => void) => {
    const f = (_e: unknown, m: unknown) => cb(m);
    ipcRenderer.on('mudanca', f);
    return () => ipcRenderer.removeListener('mudanca', f);
  },
  aoCapturar: (cb: () => void) => {
    const f = () => cb();
    ipcRenderer.on('captura', f);
    return () => ipcRenderer.removeListener('captura', f);
  }
});
