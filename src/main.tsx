import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { registerServiceWorker } from './lib/pwa.js';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el contenedor #root en index.html');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
