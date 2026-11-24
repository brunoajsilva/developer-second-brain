import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles/index.css';
import App from './app/App';
import { isMac } from './lib/platform';

document.documentElement.classList.toggle('mac', isMac);

createRoot(document.getElementById('root')!).render(<App />);
