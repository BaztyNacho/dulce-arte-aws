/*
 * Ventana modal basada en el elemento <dialog> del navegador.
 * - abierta: true/false controla si se muestra
 * - alCerrar: se llama con Escape, con la ×, o al hacer clic en el fondo oscuro
 */
import { useEffect, useRef } from 'react';

function esClicFuera(evento, dialogo) {
  if (evento.target !== dialogo) return false;
  const r = dialogo.getBoundingClientRect();
  return evento.clientX < r.left || evento.clientX > r.right || evento.clientY < r.top || evento.clientY > r.bottom;
}

export default function Ventana({ abierta, alCerrar, ancha = false, etiqueta, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (abierta && !dialogo.open) dialogo.showModal();
    if (!abierta && dialogo.open) dialogo.close();
  }, [abierta]);

  return (
    <dialog
      ref={ref}
      className={`ventana${ancha ? ' ventana--ancha' : ''}`}
      aria-labelledby={etiqueta}
      onClose={alCerrar}
      onClick={(e) => { if (esClicFuera(e, ref.current)) alCerrar(); }}
    >
      {abierta && children}
    </dialog>
  );
}
