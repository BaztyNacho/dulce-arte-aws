/*
 * Punto de entrada del frontend de Dulce Arte.
 * Monta la aplicación React dentro de <div id="raiz"> (ver index.html).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import { SesionProvider } from './sesion.jsx';
import './estilos/dulce.css';
import './estilos/react.css';

createRoot(document.getElementById('raiz')).render(
  <StrictMode>
    <BrowserRouter>
      <SesionProvider>
        <App />
      </SesionProvider>
    </BrowserRouter>
  </StrictMode>,
);
