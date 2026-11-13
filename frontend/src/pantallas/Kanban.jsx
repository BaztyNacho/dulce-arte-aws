/*
 * Tablero Kanban de cocina.
 * - Carga los pedidos desde GET /api/pedidos/kanban/ (se actualiza solo cada minuto)
 * - Cada cambio de etapa (arrastrando o con los botones) se confirma en una ventana
 * - Avanzar:  POST /api/pedidos/<id>/avanzar/
 * - Rechazar: POST /api/pedidos/<id>/rechazar-calidad/
 * Las reglas (no saltarse etapas, historial...) las aplica el backend.
 * El Administrador ve el tablero en modo lectura: sin botones ni arrastrar.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Sortable from 'sortablejs';

import { llamarApi, textosDeError } from '../api.js';
import { Sello } from '../componentes/Comanda.jsx';
import Pagina, { Cargando, useAvisos } from '../componentes/Pagina.jsx';
import Ventana from '../componentes/Ventana.jsx';
import { useSesion } from '../sesion.jsx';
import { hora } from '../util.js';

const ORDEN = ['recibido', 'en_preparacion', 'horneado_decorado', 'control_calidad', 'listo'];
const TITULOS = {
  recibido: 'Recibido', en_preparacion: 'En Preparación', horneado_decorado: 'Horneado/Decorado',
  control_calidad: 'Control de Calidad', listo: 'Listo', en_despacho: 'En Despacho', entregado: 'Entregado',
};
// Qué significa llegar a cada etapa (se muestra en la ventana de confirmación)
const EXPLICACIONES = {
  en_preparacion: 'La cocina comienza a preparar el pedido.',
  horneado_decorado: 'El pedido pasa a horneado y decoración.',
  control_calidad: 'El pedido queda listo para revisar su calidad.',
  listo: 'El pedido aprobó el control de calidad y queda listo para entregar.',
  en_despacho: 'Se crea el despacho y el pedido aparecerá en Despachos para asignarle una ruta.',
  entregado: 'El pedido se marca como entregado al cliente en la tienda. Esta acción no se puede deshacer.',
  rechazo: 'El pedido vuelve a En Preparación y el motivo queda registrado en su historial.',
};

const formatoDia = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short' });
const formatoCompleto = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function etapaSiguiente(pedido) {
  if (pedido.estado === 'listo') return pedido.tipo_entrega === 'despacho' ? 'en_despacho' : 'entregado';
  return ORDEN[ORDEN.indexOf(pedido.estado) + 1];
}

function textoAvanzar(pedido) {
  if (pedido.estado === 'listo') return pedido.tipo_entrega === 'despacho' ? 'Enviar a despacho' : 'Entregado en tienda';
  return `Pasar a ${TITULOS[etapaSiguiente(pedido)]}`;
}

// Solo se puede pasar a la columna siguiente, o devolver de Control de Calidad a En Preparación
function movimientoPermitido(desde, hacia) {
  const i = ORDEN.indexOf(desde);
  const j = ORDEN.indexOf(hacia);
  return j === i + 1 || (desde === 'control_calidad' && hacia === 'en_preparacion');
}

export default function Kanban() {
  const { usuario } = useSesion();
  const avisar = useAvisos();
  const [params] = useSearchParams();
  const soloLectura = usuario.rol === 'admin';
  const [columnas, setColumnas] = useState(null);
  const [error, setError] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);   // { pedido, hacia, rechazo }
  const pedidosRef = useRef(new Map());
  const ocupadoRef = useRef(false);                          // arrastrando o confirmando
  const listasRef = useRef({});

  const cargar = useCallback(async () => {
    const { ok, datos } = await llamarApi('/api/pedidos/kanban/');
    if (!ok) { setError('No se pudo cargar el tablero. ' + textosDeError(datos).join(' ')); return; }
    pedidosRef.current = new Map(datos.flatMap((c) => c.pedidos.map((p) => [String(p.id), p])));
    setColumnas(datos);
  }, []);

  useEffect(() => {
    cargar();
    // Recarga automática cada minuto, salvo mientras se arrastra o se confirma
    const intervalo = setInterval(() => { if (!ocupadoRef.current) cargar(); }, 60000);
    return () => clearInterval(intervalo);
  }, [cargar]);

  // Destaca la columna si se llega con ?etapa=control_calidad (desde Inicio)
  const etapa = params.get('etapa');
  useEffect(() => {
    if (columnas && etapa) {
      document.getElementById(`col-${etapa}`)?.closest('.columna')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [columnas, etapa]);

  const pedirConfirmacion = (pedido, hacia, rechazo = false) => {
    ocupadoRef.current = true;
    setConfirmacion({ pedido, hacia, rechazo });
  };

  // Arrastrar y soltar (SortableJS). Al soltar, la tarjeta vuelve a su lugar y React
  // la mueve de verdad solo si el usuario confirma y el backend acepta el cambio.
  const hayColumnas = Boolean(columnas);
  useEffect(() => {
    if (!hayColumnas || soloLectura) return undefined;
    const instancias = Object.values(listasRef.current).map((lista) => new Sortable(lista, {
      group: { name: 'cocina', put: (hacia, desde) => movimientoPermitido(desde.el.dataset.estado, hacia.el.dataset.estado) },
      sort: false,
      draggable: '.comanda--kanban',
      filter: 'button, a, input',
      preventOnFilter: false,
      animation: 180,
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      ghostClass: 'comanda--fantasma',
      dragClass: 'comanda--arrastrada',
      onStart: () => { ocupadoRef.current = true; },
      onEnd: (evento) => {
        // Se deshace el movimiento en el HTML: React es quien dibuja el tablero
        evento.from.insertBefore(evento.item, evento.from.children[evento.oldIndex] || null);
        if (evento.from === evento.to) { ocupadoRef.current = false; return; }
        const pedido = pedidosRef.current.get(evento.item.dataset.id);
        const rechazo = evento.from.dataset.estado === 'control_calidad' && evento.to.dataset.estado === 'en_preparacion';
        pedirConfirmacion(pedido, rechazo ? 'en_preparacion' : etapaSiguiente(pedido), rechazo);
      },
    }));
    return () => instancias.forEach((s) => s.destroy());
  }, [hayColumnas, soloLectura]);

  async function ejecutar(motivo) {
    const { pedido, rechazo } = confirmacion;
    setConfirmacion(null);
    if (rechazo) {
      const { ok, datos } = await llamarApi(`/api/pedidos/${pedido.id}/rechazar-calidad/`, {
        metodo: 'POST', json: { motivo: motivo || 'Rechazado en control de calidad' },
      });
      avisar(ok ? `Pedido #${pedido.id} devuelto a En Preparación.` : textosDeError(datos).join(' '), ok ? 'warning' : 'error');
    } else {
      const { ok, datos } = await llamarApi(`/api/pedidos/${pedido.id}/avanzar/`, { metodo: 'POST' });
      if (ok) {
        const destino = datos.estado === 'en_despacho' ? 'enviado a despacho'
          : datos.estado === 'entregado' ? 'marcado como entregado' : `ahora está en ${TITULOS[datos.estado]}`;
        avisar(`Pedido #${pedido.id} ${destino}.`, 'success');
      } else avisar(textosDeError(datos).join(' '), 'error');
    }
    ocupadoRef.current = false;
    cargar();
  }

  return (
    <Pagina
      titulo="Cocina"
      clase="pagina--ancha"
      subtitulo={soloLectura
        ? 'Vista de supervisión: puedes ver cómo avanza cada pedido. Las etapas las mueve Cocina.'
        : 'Arrastra cada comanda a la siguiente etapa o usa su botón. El tablero se actualiza solo cada minuto.'}
      opciones={(
        <div className="banner__opciones">
          <button className="boton boton--secundario" type="button" onClick={cargar}>Actualizar ahora</button>
          <Link className="boton boton--secundario" to="/cocina/manana">Producción de mañana</Link>
        </div>
      )}
    >
      {!columnas ? <Cargando error={error} /> : (
        <div className={`tablero${soloLectura ? ' tablero--solo-lectura' : ''}`}>
          {columnas.map((c) => (
            <section key={c.estado} className={`columna${etapa === c.estado ? ' columna--destacada' : ''}`} aria-labelledby={`col-${c.estado}`}>
              <header className="columna__cabecera">
                <h2 id={`col-${c.estado}`}>{c.titulo}</h2>
                <span className="columna__cuenta">{c.pedidos.length}</span>
              </header>
              <div className="columna__lista" data-estado={c.estado} ref={(el) => { if (el) listasRef.current[c.estado] = el; }}>
                {!c.pedidos.length && <p className="columna__vacia">Sin pedidos</p>}
                {c.pedidos.map((p) => (
                  <Tarjeta key={p.id} pedido={p} soloLectura={soloLectura} pedirConfirmacion={pedirConfirmacion} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <VentanaConfirmar confirmacion={confirmacion} alConfirmar={ejecutar}
                        alCancelar={() => { setConfirmacion(null); ocupadoRef.current = false; }} />
    </Pagina>
  );
}

function Tarjeta({ pedido, soloLectura, pedirConfirmacion }) {
  const entrega = new Date(pedido.fecha_entrega);
  const urgente = entrega - Date.now() < 3 * 3600 * 1000;
  return (
    <article className={`comanda comanda--kanban${urgente ? ' comanda--urgente' : ''}`} data-id={pedido.id}
             aria-label={`Pedido ${pedido.id} de ${pedido.cliente_nombre}`}>
      <Sello estado={pedido.estado} />
      <div className="comanda__cabecera">
        <Link className="comanda__numero" to={`/pedidos/${pedido.id}`}>Pedido #{pedido.id}</Link>
        <span className="nota">{pedido.tipo_entrega === 'despacho' ? 'Despacho' : 'Retiro'}</span>
      </div>
      <div className="comanda__hora">{hora(entrega)}</div>
      <div className="comanda__fecha">{formatoDia.format(entrega)}{urgente && ', entrega en menos de 3 horas'}</div>
      <div className="comanda__cliente">{pedido.cliente_nombre}</div>
      <ul className="comanda__lineas">
        {pedido.productos.map((texto, i) => <li key={i}>{texto}</li>)}
        {pedido.diseno && <li className="nota">{pedido.diseno.length > 90 ? pedido.diseno.slice(0, 90) + '…' : pedido.diseno}</li>}
      </ul>
      {!soloLectura && (
        <div className="comanda__acciones">
          <button type="button" className="boton boton--chico" onClick={() => pedirConfirmacion(pedido, etapaSiguiente(pedido))}>
            {textoAvanzar(pedido)}
          </button>
          {pedido.estado === 'control_calidad' && (
            <button type="button" className="boton boton--chico boton--secundario"
                    onClick={() => pedirConfirmacion(pedido, 'en_preparacion', true)}>Rechazar</button>
          )}
        </div>
      )}
    </article>
  );
}

function VentanaConfirmar({ confirmacion, alConfirmar, alCancelar }) {
  const [motivo, setMotivo] = useState('');
  useEffect(() => { setMotivo(''); }, [confirmacion]);
  const c = confirmacion;
  return (
    <Ventana abierta={Boolean(c)} alCerrar={alCancelar} etiqueta="vc-titulo">
      {c && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); alConfirmar(motivo.trim()); }}>
          <h2 id="vc-titulo">{c.rechazo ? '¿Rechazar en Control de Calidad?' : '¿Confirmar cambio de etapa?'}</h2>
          <div className="ventana__etapas">
            <span className={`estado estado--${c.pedido.estado}`}>{TITULOS[c.pedido.estado]}</span>
            <span aria-hidden="true">→</span>
            <span className={`estado estado--${c.hacia}`}>{TITULOS[c.hacia]}</span>
          </div>
          <p className="ventana__detalle">{c.rechazo ? EXPLICACIONES.rechazo : EXPLICACIONES[c.hacia]}</p>
          <dl className="ventana__datos">
            <div><dt>Pedido</dt><dd>#{c.pedido.id} · {c.pedido.tipo_entrega === 'despacho' ? 'Despacho a domicilio' : 'Retiro en tienda'}</dd></div>
            <div><dt>Cliente</dt><dd>{c.pedido.cliente_nombre}</dd></div>
            <div><dt>Entrega</dt><dd>{formatoCompleto.format(new Date(c.pedido.fecha_entrega))}</dd></div>
            <div><dt>Productos</dt><dd><ul>{c.pedido.productos.map((t, i) => <li key={i}>{t}</li>)}</ul></dd></div>
          </dl>
          {c.rechazo && (
            <div className="campo">
              <label htmlFor="vc-motivo">¿Qué hay que corregir?</label>
              <input type="text" id="vc-motivo" maxLength={200} placeholder="Ej.: decoración dispareja" autoFocus
                     value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          )}
          <div className="ventana__acciones">
            <button className="boton boton--secundario" type="button" onClick={alCancelar}>Cancelar</button>
            <button className={`boton${c.rechazo || c.hacia === 'entregado' ? ' boton--peligro' : ''}`} type="submit" autoFocus={!c.rechazo}>
              {c.rechazo ? 'Devolver a preparación' : 'Confirmar'}
            </button>
          </div>
        </form>
      )}
    </Ventana>
  );
}
