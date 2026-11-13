/*
 * Comunicación con el backend (API de Django) usando tokens JWT.
 *
 * - Al iniciar sesión, el backend entrega dos tokens:
 *     access  (30 min): se envía en cada petición -> Authorization: Bearer <access>
 *     refresh (8 h):    sirve para pedir un access nuevo cuando el anterior vence
 * - Si una petición responde 401 (token vencido), se renueva el access una vez
 *   y se repite la petición. Si tampoco se puede, se cierra la sesión.
 *
 * Las rutas son relativas (/api/...): en AWS la API Gateway las envía al backend,
 * y en desarrollo lo hace el proxy de Vite (vite.config.js).
 */

const CLAVE_ACCESS = 'dulce_access';
const CLAVE_REFRESH = 'dulce_refresh';

// localStorage puede fallar (modo privado o bloqueado): por eso cada uso va en try/catch
function leer(clave) {
  try { return localStorage.getItem(clave); } catch { return null; }
}
function guardar(clave, valor) {
  try {
    if (valor) localStorage.setItem(clave, valor);
    else localStorage.removeItem(clave);
  } catch { /* sin almacenamiento: la sesión dura mientras la pestaña esté abierta */ }
}

let accessEnMemoria = leer(CLAVE_ACCESS);

export function guardarTokens({ access, refresh }) {
  accessEnMemoria = access;
  guardar(CLAVE_ACCESS, access);
  if (refresh) guardar(CLAVE_REFRESH, refresh);
}

export function borrarTokens() {
  accessEnMemoria = null;
  guardar(CLAVE_ACCESS, null);
  guardar(CLAVE_REFRESH, null);
}

export function hayToken() {
  return Boolean(accessEnMemoria || leer(CLAVE_REFRESH));
}

// Si varias peticiones vencen a la vez, se renueva el token una sola vez
let renovando = null;
async function renovarAccess() {
  const refresh = leer(CLAVE_REFRESH);
  if (!refresh) return false;
  if (!renovando) {
    renovando = fetch('/api/auth/token/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh }),
    })
      .then(async (r) => {
        if (!r.ok) return false;
        const datos = await r.json();
        guardarTokens({ access: datos.access });
        return true;
      })
      .catch(() => false)
      .finally(() => { renovando = null; });
  }
  return renovando;
}

/**
 * Llama a la API.
 *   llamarApi('/api/pedidos/5/')                               -> GET
 *   llamarApi('/api/pedidos/', { metodo: 'POST', json: {...} }) -> envía JSON
 *   llamarApi(url, { metodo: 'POST', form: formData })          -> sube archivos
 * Devuelve { ok, status, datos } (nunca lanza error).
 */
export async function llamarApi(url, { metodo = 'GET', json = null, form = null } = {}, reintento = true) {
  const cabeceras = { Accept: 'application/json' };
  if (accessEnMemoria) cabeceras.Authorization = `Bearer ${accessEnMemoria}`;
  let cuerpo = null;
  if (json !== null) {
    cabeceras['Content-Type'] = 'application/json';
    cuerpo = JSON.stringify(json);
  } else if (form !== null) {
    cuerpo = form;
  }

  let respuesta;
  try {
    respuesta = await fetch(url, { method: metodo, headers: cabeceras, body: cuerpo });
  } catch {
    return { ok: false, status: 0, datos: { detail: 'No hay conexión con el servidor. Revisa tu conexión e inténtalo de nuevo.' } };
  }

  // Token vencido: se renueva y se repite la petición una vez
  if (respuesta.status === 401 && reintento && !url.startsWith('/api/auth/token')) {
    if (await renovarAccess()) return llamarApi(url, { metodo, json, form }, false);
    borrarTokens();
    window.dispatchEvent(new Event('sesion-expirada'));
  }

  let datos = null;
  if (respuesta.status !== 204) datos = await respuesta.json().catch(() => null);
  return { ok: respuesta.ok, status: respuesta.status, datos };
}

/** Convierte los errores de la API (DRF) en una lista de textos legibles. */
export function textosDeError(datos) {
  if (!datos) return ['Ocurrió un error inesperado. Inténtalo de nuevo.'];
  if (typeof datos === 'string') return [datos];
  if (Array.isArray(datos)) return datos.flatMap(textosDeError);
  const textos = [];
  for (const valor of Object.values(datos)) {
    const mensajes = Array.isArray(valor) ? valor : [valor];
    for (const m of mensajes) {
      if (typeof m === 'object' && m !== null) textos.push(...textosDeError(m));
      else textos.push(String(m));
    }
  }
  return textos;
}

export function primerError(datos) {
  return textosDeError(datos)[0];
}
