import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './estilos.css';
import App from './App';
import { aplicarTema, lerTema } from './lib/tema';

aplicarTema(lerTema());

createRoot(document.getElementById('raiz')!).render(<App />);
