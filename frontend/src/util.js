/*
 * Funciones de formato (equivalen a los filtros de template de la versión en Django).
 * Todas las horas se muestran en la zona horaria de Chile.
 */

const ZONA = 'America/Santiago';

/** 25000 -> "$25.000" */
export function clp(valor) {
  return '$' + Math.round(Number(valor) || 0).toLocaleString('es-CL');
}

/** "2.500" -> "2,5" (quita ceros sobrantes, como floatformat:"-3") */
export function cantidad(valor) {
  const numero = Number(valor);
  if (Number.isNaN(numero)) return valor;
  return numero.toLocaleString('es-CL', { maximumFractionDigits: 3 });
}

function partes(fecha, opciones) {
  const d = typeof fecha === 'string' && fecha.length === 10 ? new Date(fecha + 'T12:00:00') : new Date(fecha);
  return new Intl.DateTimeFormat('es-CL', { timeZone: ZONA, ...opciones }).formatToParts(d)
    .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
}

/** "jueves 12 de noviembre" */
export function fechaLarga(fecha = new Date()) {
  const p = partes(fecha, { weekday: 'long', day: 'numeric', month: 'long' });
  return `${p.weekday} ${p.day} de ${p.month}`;
}

/** "14:30" */
export function hora(fecha) {
  const p = partes(fecha, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return `${p.hour}:${p.minute}`;
}

/** "12 nov, 14:30" */
export function fechaCorta(fecha) {
  const p = partes(fecha, { day: 'numeric', month: 'short' });
  return `${p.day} ${p.month.replace('.', '')}, ${hora(fecha)}`;
}

/** "12-11-2026 14:30" */
export function fechaHora(fecha) {
  const p = partes(fecha, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${p.day}-${p.month}-${p.year} ${hora(fecha)}`;
}

/** Primera letra en mayúscula (reemplazo de fotos faltantes) */
export function inicial(texto) {
  const t = String(texto || '').trim();
  return t ? t[0].toUpperCase() : '?';
}

/** Uno de 4 tonos según el nombre (siempre el mismo para cada nombre) */
export function tono(texto) {
  return [...String(texto || '')].reduce((suma, c) => suma + c.codePointAt(0), 0) % 4;
}

/** "1" -> "", "2" -> "s" */
export function plural(n, sufijo = 's') {
  return Number(n) === 1 ? '' : sufijo;
}
