/*
 * Hook para cargar los datos de una pantalla desde la API.
 *   const { datos, error, recargar } = useDatos('/api/pantallas/inicio/');
 * Cada vez que cambia la URL (por ejemplo, un filtro) se vuelve a pedir.
 */
import { useCallback, useEffect, useState } from 'react';

import { llamarApi, primerError } from './api.js';

export function useDatos(url) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vigente = true;
    setError(null);
    llamarApi(url).then(({ ok, datos: respuesta }) => {
      if (!vigente) return;
      if (ok) setDatos(respuesta);
      else setError(primerError(respuesta));
    });
    return () => { vigente = false; };
  }, [url, version]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  return { datos, error, recargar };
}
