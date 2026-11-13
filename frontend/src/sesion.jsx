/*
 * Sesión del usuario (contexto de React).
 * Guarda quién inició sesión y su rol, y ofrece iniciarSesion / cerrarSesion
 * a cualquier componente mediante useSesion().
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { borrarTokens, guardarTokens, hayToken, llamarApi, primerError } from './api.js';

const SesionContexto = createContext(null);

export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(hayToken());

  // Al abrir la página: si hay un token guardado, se piden los datos del usuario
  useEffect(() => {
    if (!hayToken()) return;
    llamarApi('/api/auth/yo/').then(({ ok, datos }) => {
      if (ok) setUsuario(datos);
      else borrarTokens();
      setCargando(false);
    });
  }, []);

  // Si el token vence y no se puede renovar, se vuelve al login
  useEffect(() => {
    const alExpirar = () => setUsuario(null);
    window.addEventListener('sesion-expirada', alExpirar);
    return () => window.removeEventListener('sesion-expirada', alExpirar);
  }, []);

  const iniciarSesion = useCallback(async (username, password) => {
    const { ok, datos } = await llamarApi('/api/auth/token/', {
      metodo: 'POST', json: { username, password },
    });
    if (!ok) return primerError(datos);
    guardarTokens(datos);
    setUsuario(datos.usuario);
    return null;
  }, []);

  const cerrarSesion = useCallback(() => {
    borrarTokens();
    setUsuario(null);
  }, []);

  return (
    <SesionContexto.Provider value={{ usuario, cargando, iniciarSesion, cerrarSesion }}>
      {children}
    </SesionContexto.Provider>
  );
}

export function useSesion() {
  return useContext(SesionContexto);
}
