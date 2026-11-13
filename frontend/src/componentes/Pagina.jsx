/*
 * Estructura común de cada pantalla: banner con título, subtítulo y opciones,
 * y debajo el contenido. Los avisos (éxito o error) aparecen arriba del contenido.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

const AvisosContexto = createContext(() => {});

/** Proveedor de avisos: avisar('Pedido confirmado', 'success') */
export function AvisosProvider({ children }) {
  const [aviso, setAviso] = useState(null);
  const ubicacion = useLocation();
  // Al cambiar de pantalla se borra el aviso anterior, salvo que venga en el estado de la navegación
  useEffect(() => { setAviso(ubicacion.state?.aviso || null); }, [ubicacion.pathname, ubicacion.state]);
  const avisar = useCallback((texto, tipo = 'info') => {
    setAviso({ texto, tipo, id: Date.now() });
    requestAnimationFrame(() => document.getElementById('avisos')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }, []);
  return <AvisosContexto.Provider value={{ aviso, avisar }}>{children}</AvisosContexto.Provider>;
}

export function useAvisos() {
  return useContext(AvisosContexto).avisar;
}

export default function Pagina({ titulo, subtitulo, opciones, clase = '', children }) {
  const { aviso } = useContext(AvisosContexto);
  useEffect(() => { document.title = `${titulo} · Dulce Arte`; }, [titulo]);
  return (
    <>
      <section className="banner">
        <h1 className="banner__titulo">{titulo}</h1>
        <p className="banner__subtitulo">{subtitulo}</p>
        {opciones}
      </section>
      <main className={`pagina ${clase}`} id="contenido">
        <div id="avisos" className="mensajes" aria-live="polite">
          {aviso && (
            <div key={aviso.id} className={`mensaje mensaje--${aviso.tipo}`} role={aviso.tipo === 'error' ? 'alert' : 'status'}>
              {aviso.texto}
            </div>
          )}
        </div>
        {children}
      </main>
    </>
  );
}

/** Mientras llegan los datos de la API */
export function Cargando({ error }) {
  if (error) return <div className="mensaje mensaje--error" role="alert">{error}</div>;
  return <p className="cargando" role="status">Cargando…</p>;
}
