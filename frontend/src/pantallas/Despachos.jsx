/*
 * Mi ruta (Repartidor): guía de 4 pasos y tres columnas
 *   Por asignar | Rutas (hojas de ruta) | Entregados hoy
 * Datos: GET /api/pantallas/despachos/?dia=hoy|manana|todas
 * Acciones: ver rutas.js (crear ruta, asignar, quitar, iniciar y finalizar).
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import Pagina, { Cargando, useAvisos } from '../componentes/Pagina.jsx';
import Ventana from '../componentes/Ventana.jsx';
import { asignarARuta, crearRuta, quitarDeRuta } from '../rutas.js';
import { useDatos } from '../useDatos.js';
import { fechaLarga, hora, plural } from '../util.js';
import { BotonRuta } from './Inicio.jsx';

const formatoDia = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short' });
const formatoCorto = new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'short' });

export default function Despachos() {
  const avisar = useAvisos();
  const [params, setParams] = useSearchParams();
  const dia = params.get('dia') || 'hoy';
  const { datos, error, recargar } = useDatos(`/api/pantallas/despachos/?dia=${dia}`);
  const [ventanaRuta, setVentanaRuta] = useState(false);

  const resultado = ({ ok, mensaje }) => { avisar(mensaje, ok ? 'success' : 'error'); if (ok) recargar(); return ok; };

  return (
    <Pagina
      titulo="Despachos"
      clase="pagina--ancha"
      subtitulo="Asigna los pedidos a una ruta, iníciala y confirma cada entrega con firma o foto."
      opciones={(
        <div className="banner__opciones">
          <nav className="chips" aria-label="Filtrar por día">
            {(datos?.filtros_dia || [{ valor: 'hoy', texto: 'Hoy' }, { valor: 'manana', texto: 'Mañana' }, { valor: 'todas', texto: 'Todas' }]).map((f) => (
              <button key={f.valor} type="button" className="chip" aria-current={f.valor === dia ? 'true' : undefined}
                      onClick={() => setParams({ dia: f.valor })}>{f.texto}</button>
            ))}
          </nav>
          <Link className="boton boton--secundario" to="/despachos/entregados">Entregados</Link>
          <button className="boton" type="button" onClick={() => setVentanaRuta(true)}>+ Nueva ruta</button>
        </div>
      )}
    >
      {!datos ? <Cargando error={error} /> : (
        <>
          {/* Guía de 4 pasos: se destaca el que corresponde hacer ahora */}
          <ol className="guia-pasos" aria-label="Cómo despachar un pedido">
            {datos.pasos.map((p) => (
              <li key={p.numero} className={`guia-pasos__paso${p.numero === datos.paso ? ' guia-pasos__paso--activo' : ''}`}
                  aria-current={p.numero === datos.paso ? 'step' : undefined}>
                <span className="guia-pasos__numero">{p.numero}</span>
                <span>{p.texto}</span>
              </li>
            ))}
          </ol>
          {datos.paso === 0 && <p className="guia-pasos__listo">Todo al día: no hay pedidos por despachar en esta vista.</p>}

          <div className="reparto">
            {/* 1. Por asignar */}
            <section className="reparto__columna reparto__asignar" aria-labelledby="t-sin-ruta">
              <h2 id="t-sin-ruta" className="reparto__titulo">
                <svg className="reparto__icono" aria-hidden="true"><use href="#icono-bodega" /></svg>
                Por asignar ({datos.sin_ruta.length})
              </h2>
              {datos.sin_ruta.map((d) => (
                <TarjetaPorAsignar key={d.id} despacho={d} rutas={datos.rutas_asignables}
                                   asignar={async (ruta) => resultado(await asignarARuta(d.id, ruta))} />
              ))}
              {!datos.sin_ruta.length && <p className="reparto__vacio">No hay pedidos esperando ruta.</p>}
            </section>

            {/* 2. Rutas */}
            <section className="reparto__columna reparto__rutas" aria-labelledby="t-rutas">
              <h2 id="t-rutas" className="reparto__titulo">
                <svg className="reparto__icono" aria-hidden="true"><use href="#icono-despachos" /></svg>
                {dia === 'hoy' ? 'Rutas de hoy' : dia === 'manana' ? 'Rutas de mañana' : 'Todas las rutas'}
              </h2>
              {datos.rutas.map((ruta) => (
                <HojaRuta key={ruta.id} ruta={ruta} recargar={recargar}
                          quitar={async (id) => resultado(await quitarDeRuta(id))} />
              ))}
              {!datos.rutas.length && (
                <p className="reparto__vacio">
                  No hay rutas {dia === 'hoy' ? 'para hoy' : dia === 'manana' ? 'para mañana' : 'abiertas'}. Crea una con "+ Nueva ruta".
                </p>
              )}
            </section>

            {/* 3. Entregados hoy */}
            <section className="reparto__columna reparto__entregados" aria-labelledby="t-entregados">
              <h2 id="t-entregados" className="reparto__titulo">
                <svg className="reparto__icono" aria-hidden="true"><use href="#sello-entregado" /></svg>
                Entregados hoy ({datos.entregados_hoy.length})
              </h2>
              {datos.entregados_hoy.map((d) => (
                <article key={d.id} className="tarjeta-despacho tarjeta-despacho--entregado">
                  <strong>Pedido #{d.pedido} · {d.cliente_nombre}</strong>
                  <span>Recibió {d.nombre_receptor}</span>
                  <span className="nota">
                    {hora(d.fecha_entrega_real)} · {[d.firma && 'con firma', d.comprobante && 'con foto'].filter(Boolean).join(' y ')}
                  </span>
                  {d.firma && <img className="tarjeta-despacho__firma" src={d.firma} alt={`Firma de ${d.nombre_receptor}`} />}
                </article>
              ))}
              {!datos.entregados_hoy.length && <p className="reparto__vacio">Aún no hay entregas hoy.</p>}
            </section>
          </div>
        </>
      )}

      <VentanaNuevaRuta abierta={ventanaRuta} hoy={datos?.hoy} alCerrar={() => setVentanaRuta(false)}
                        alCrear={async (nombre, fecha) => {
                          const r = await crearRuta(nombre, fecha);
                          if (r.ok) { setVentanaRuta(false); resultado(r); }
                          return r;
                        }} />
    </Pagina>
  );
}

function TarjetaPorAsignar({ despacho: d, rutas, asignar }) {
  const [ruta, setRuta] = useState(rutas[0]?.id || '');
  const [ocupado, setOcupado] = useState(false);
  return (
    <article className={`tarjeta-despacho${d.estado === 'fallido' ? ' tarjeta-despacho--fallido' : ''}`}>
      <strong>{d.cliente_nombre}</strong>
      <span>{d.direccion_entrega}</span>
      <span className="nota">{formatoDia.format(new Date(d.fecha_entrega_programada))}, {hora(d.fecha_entrega_programada)} · Pedido #{d.pedido}</span>
      {d.estado === 'fallido' && <span className="etiqueta-reponer">Intento fallido{d.observaciones && `: ${d.observaciones}`}</span>}
      {rutas.length ? (
        <form className="tarjeta-despacho__asignar"
              onSubmit={async (e) => { e.preventDefault(); setOcupado(true); await asignar(Number(ruta || rutas[0].id)); setOcupado(false); }}>
          <label className="oculto-visual" htmlFor={`ruta-${d.id}`}>Ruta para el pedido {d.pedido}</label>
          <select id={`ruta-${d.id}`} required value={ruta} onChange={(e) => setRuta(e.target.value)}>
            {rutas.map((r) => <option key={r.id} value={r.id}>{r.nombre} ({formatoCorto.format(new Date(r.fecha + 'T12:00:00'))})</option>)}
          </select>
          <button className="boton boton--chico" type="submit" disabled={ocupado}>Agregar a ruta</button>
        </form>
      ) : (
        <span className="nota">Crea una ruta con "+ Nueva ruta" para asignarlo.</span>
      )}
    </article>
  );
}

function HojaRuta({ ruta, recargar, quitar }) {
  return (
    <article className="hoja-ruta" aria-labelledby={`ruta-${ruta.id}`}>
      <header className="hoja-ruta__cabecera">
        <div>
          <h3 id={`ruta-${ruta.id}`}>{ruta.nombre}</h3>
          <span className="nota">{fechaLarga(ruta.fecha)}{ruta.responsable_nombre && ` · ${ruta.responsable_nombre}`}</span>
        </div>
        <span className={`estado estado--${ruta.estado === 'en_curso' ? 'en_preparacion' : 'recibido'}`}>{ruta.estado_display}</span>
      </header>
      {ruta.total ? (
        <>
          <div className="hoja-ruta__avance">
            <span>{ruta.entregados} de {ruta.total} entregado{plural(ruta.total)}</span>
            <div className="hoja-ruta__barra" role="progressbar" aria-valuemin="0" aria-valuemax={ruta.total}
                 aria-valuenow={ruta.entregados} aria-label={`Avance de ${ruta.nombre}`}>
              <span style={{ width: `${ruta.porcentaje}%` }} />
            </div>
          </div>
          <ol className="hoja-ruta__paradas">
            {ruta.paradas.map((d, i) => {
              const hecha = d.estado === 'entregado';
              const siguiente = d.id === ruta.siguiente_id && ruta.estado === 'en_curso';
              return (
                <li key={d.id} className={`parada-ruta${hecha ? ' parada-ruta--hecha' : siguiente ? ' parada-ruta--siguiente' : ''}`}>
                  <span className="parada-ruta__numero" aria-hidden="true">{hecha ? '✓' : i + 1}</span>
                  <div className="parada-ruta__datos">
                    <strong>{d.cliente_nombre}</strong>
                    <span className="nota">{d.direccion_entrega} · {hora(d.fecha_entrega_programada)} · #{d.pedido}</span>
                  </div>
                  <div className="parada-ruta__accion">
                    {hecha ? <span className="nota">Entregado {hora(d.fecha_entrega_real)}</span>
                      : ruta.estado === 'en_curso' ? (
                        <Link className={`boton${d.id !== ruta.siguiente_id ? ' boton--secundario' : ''} boton--chico`} to={`/despachos/${d.id}/entregar`}>Entregar</Link>
                      ) : <button className="quitar" type="button" onClick={() => quitar(d.id)}>Quitar</button>}
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <p className="nota hoja-ruta__vacia">Sin paradas. Agrégalas desde "Por asignar".</p>
      )}
      <div className="hoja-ruta__pie">
        {ruta.estado === 'en_curso' && !ruta.completa ? (
          <p className="nota">Falta{plural(ruta.faltan, 'n')} {ruta.faltan} entrega{plural(ruta.faltan)} para finalizar la ruta.</p>
        ) : <BotonRuta ruta={ruta} recargar={recargar} clase="boton ancho-completo" />}
      </div>
    </article>
  );
}

function VentanaNuevaRuta({ abierta, hoy, alCerrar, alCrear }) {
  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState(hoy || '');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    const dia = fecha || hoy;
    if (!nombre.trim() || !dia) { setError('Indica el nombre y la fecha de la ruta.'); return; }
    setEnviando(true);
    const r = await alCrear(nombre.trim(), dia);
    setEnviando(false);
    if (r.ok) { setNombre(''); setError(''); } else setError(r.mensaje);
  }

  return (
    <Ventana abierta={abierta} alCerrar={alCerrar} etiqueta="vr-titulo">
      <form noValidate onSubmit={enviar}>
        <h2 id="vr-titulo">Nueva ruta</h2>
        <div className="campo">
          <label htmlFor="r-nombre">Nombre</label>
          <input type="text" id="r-nombre" maxLength={100} placeholder="Ej.: Ruta oriente, tarde" required autoFocus
                 value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="r-fecha">Fecha de reparto</label>
          <input type="date" id="r-fecha" required value={fecha || hoy || ''} onChange={(e) => setFecha(e.target.value)} />
        </div>
        {error && <p className="ventana__error" role="alert">{error}</p>}
        <div className="ventana__acciones">
          <button className="boton boton--secundario" type="button" onClick={alCerrar}>Cancelar</button>
          <button className="boton" type="submit" disabled={enviando}>Crear ruta</button>
        </div>
      </form>
    </Ventana>
  );
}
