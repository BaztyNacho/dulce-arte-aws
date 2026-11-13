/*
 * Acciones del reparto (las usan "Inicio" del Repartidor y "Mi ruta").
 * Llaman a /api/rutas/ y /api/despachos/. Devuelven { ok, mensaje }.
 */
import { llamarApi, textosDeError } from './api.js';

const error = (datos) => ({ ok: false, mensaje: textosDeError(datos).join(' ') });

export async function crearRuta(nombre, fecha) {
  const { ok, datos } = await llamarApi('/api/rutas/', { metodo: 'POST', json: { nombre, fecha } });
  return ok ? { ok, mensaje: `Ruta "${datos.nombre}" creada. Ahora agrégale pedidos desde "Por asignar".` } : error(datos);
}

/** Agrega un pedido a una ruta como última parada. Si la ruta ya salió, queda "En camino". */
export async function asignarARuta(despachoId, ruta) {
  const actual = await llamarApi(`/api/rutas/${ruta}/`);
  const orden = actual.ok ? actual.datos.despachos.length + 1 : 1;
  const enCurso = actual.ok && actual.datos.estado === 'en_curso';
  const { ok, datos } = await llamarApi(`/api/despachos/${despachoId}/`, {
    metodo: 'PATCH', json: { ruta, orden, estado: enCurso ? 'en_camino' : 'pendiente' },
  });
  return ok ? { ok, mensaje: `Pedido #${datos.pedido} agregado a ${datos.ruta_nombre} como parada ${orden}.` } : error(datos);
}

export async function quitarDeRuta(despachoId) {
  const { ok, datos } = await llamarApi(`/api/despachos/${despachoId}/`, {
    metodo: 'PATCH', json: { ruta: null, estado: 'pendiente' },
  });
  return ok ? { ok, mensaje: `Pedido #${datos.pedido} volvió a "Por asignar".` } : error(datos);
}

/** Iniciar (en_curso) o finalizar una ruta. Al iniciarla, sus paradas pendientes quedan "En camino". */
export async function cambiarEstadoRuta(id, estado) {
  const { ok, datos } = await llamarApi(`/api/rutas/${id}/`, { metodo: 'PATCH', json: { estado } });
  if (!ok) return error(datos);
  if (estado === 'en_curso') {
    for (const despacho of datos.despachos.filter((d) => d.estado === 'pendiente')) {
      await llamarApi(`/api/despachos/${despacho.id}/`, { metodo: 'PATCH', json: { estado: 'en_camino' } });
    }
    return { ok, mensaje: `${datos.nombre} iniciada. Entrega cada parada con el botón "Entregar".` };
  }
  return { ok, mensaje: `${datos.nombre} finalizada. ¡Buen trabajo!` };
}
