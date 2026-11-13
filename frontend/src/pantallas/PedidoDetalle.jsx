/*
 * Detalle del pedido: comanda completa, diseño, historial y, si es una cotización
 * (rol Atención y Ventas), revisión de stock, confirmar y subir imagen de referencia.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { llamarApi, textosDeError } from '../api.js';
import { Sello } from '../componentes/Comanda.jsx';
import Pagina, { Cargando, useAvisos } from '../componentes/Pagina.jsx';
import { useSesion } from '../sesion.jsx';
import { useDatos } from '../useDatos.js';
import { clp, fechaCorta, fechaLarga, hora } from '../util.js';

function Texto({ children }) {
  return <p style={{ whiteSpace: 'pre-line' }}>{children}</p>;
}

export default function PedidoDetalle() {
  const { id } = useParams();
  const { usuario } = useSesion();
  const { datos: pedido, error, recargar } = useDatos(`/api/pedidos/${id}/`);

  if (!pedido) return <Pagina titulo={`Pedido #${id}`}><Cargando error={error} /></Pagina>;

  const esCotizacion = pedido.estado === 'cotizacion' && usuario.rol === 'ventas';
  const creado = new Date(pedido.creado_en);
  const fecha = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'long' }).format(creado);

  return (
    <Pagina
      titulo={`Pedido #${pedido.id}`}
      subtitulo={`Registrado el ${fecha}, ${hora(creado)}${pedido.creado_por_nombre ? ` por ${pedido.creado_por_nombre}` : ''}.`}
      opciones={<div className="banner__opciones"><Link className="boton boton--secundario" to="/pedidos">Volver a pedidos</Link></div>}
    >
      <div className="grilla-2">
        <div>
          <article className="comanda espacio-abajo">
            <Sello estado={pedido.estado} />
            <div className="comanda__cabecera">
              <span className="comanda__numero">Entrega</span>
              <span className={`estado estado--${pedido.estado}`}>{pedido.estado_display}</span>
            </div>
            <div className="comanda__hora comanda__hora--grande">{hora(pedido.fecha_entrega)}</div>
            <div className="comanda__fecha">{fechaLarga(pedido.fecha_entrega)} de {new Date(pedido.fecha_entrega).getFullYear()}</div>
            <div className="comanda__fecha">
              {pedido.tipo_entrega_display}{pedido.direccion_entrega && `: ${pedido.direccion_entrega}`}
            </div>
            <div className="comanda__cliente">{pedido.cliente_nombre}</div>
            <div className="nota">{pedido.cliente_telefono}{pedido.cliente_email && `, ${pedido.cliente_email}`}</div>
            <ul className="comanda__lineas">
              {pedido.detalles.map((d) => (
                <li key={d.id}>
                  <div className="fila-extremos">
                    <strong>{d.cantidad} × {d.producto_nombre}</strong>
                    <span>{clp(d.subtotal)}</span>
                  </div>
                  {d.personalizaciones.map((p) => (
                    <div className="nota" key={p.opcion}>
                      {p.porciones > 0
                        ? `Más ${p.opcion_nombre.toLowerCase()} (+${p.porciones})`
                        : `Menos ${p.opcion_nombre.toLowerCase()} (${p.porciones})`}
                    </div>
                  ))}
                  {d.comentario && <div className="nota">Comentario: {d.comentario}</div>}
                </li>
              ))}
            </ul>
            <div className="comanda__pie">
              <span>Total</span>
              <span className="resumen__total">{clp(pedido.total)}</span>
            </div>
          </article>

          <section className="panel espacio-abajo" aria-labelledby="t-diseno">
            <h2 id="t-diseno">Diseño</h2>
            {pedido.diseno ? <Texto>{pedido.diseno}</Texto> : <p className="nota">Sin descripción de diseño.</p>}
            {pedido.imagen_referencia && (
              <img className="imagen-referencia" src={pedido.imagen_referencia}
                   alt={`Imagen de referencia del diseño del pedido ${pedido.id}`} />
            )}
            {esCotizacion && <SubirImagen pedido={pedido} recargar={recargar} />}
            {pedido.observaciones && (
              <>
                <h3 className="espacio-arriba-medio">Observaciones internas</h3>
                <Texto>{pedido.observaciones}</Texto>
              </>
            )}
          </section>
        </div>

        <aside>
          {esCotizacion && <Confirmar pedido={pedido} recargar={recargar} />}
          <section className="panel" aria-labelledby="t-historial">
            <h2 id="t-historial">Historial</h2>
            <ol className="linea-tiempo">
              {pedido.historial.map((c, i) => (
                <li key={i}>
                  <strong>{c.estado_nuevo_display}</strong>
                  {c.comentario && <div>{c.comentario}</div>}
                  <time dateTime={c.fecha}>{fechaCorta(c.fecha)}{c.usuario_nombre && `, ${c.usuario_nombre}`}</time>
                </li>
              ))}
              {!pedido.historial.length && <li className="nota">Sin cambios registrados.</li>}
            </ol>
          </section>
        </aside>
      </div>
    </Pagina>
  );
}

/** Revisa si hay stock y confirma la cotización (descuenta insumos y la envía a cocina) */
function Confirmar({ pedido, recargar }) {
  const avisar = useAvisos();
  const [stock, setStock] = useState(null);       // null = revisando
  const [confirmando, setConfirmando] = useState(false);

  const revisar = useCallback(async () => {
    const { ok, datos } = await llamarApi(`/api/pedidos/${pedido.id}/disponibilidad/`);
    setStock(ok ? datos : { error: true });
  }, [pedido.id]);
  useEffect(() => { revisar(); }, [revisar]);

  async function confirmar() {
    setConfirmando(true);
    const { ok, datos } = await llamarApi(`/api/pedidos/${pedido.id}/confirmar/`, { metodo: 'POST' });
    setConfirmando(false);
    if (ok) {
      avisar(`Pedido #${pedido.id} confirmado y enviado a cocina. Los insumos se descontaron de bodega.`, 'success');
      recargar();
    } else {
      avisar(textosDeError(datos).join(' '), 'error');
      revisar();
    }
  }

  const puede = stock && (stock.error || stock.hay_stock_suficiente);
  return (
    <section className="panel espacio-abajo" aria-labelledby="t-confirmar">
      <h2 id="t-confirmar">Confirmar cotización</h2>
      <p className="nota">Al confirmar, se descuentan los insumos de bodega y el pedido pasa a cocina. Después no se pueden cambiar los productos.</p>
      <ul className="disponibilidad">
        {!stock && <li className="nota">Revisando stock…</li>}
        {stock?.error && <li className="nota">No se pudo revisar el stock. Igual puedes intentar confirmar.</li>}
        {stock?.insumos?.map((item) => {
          const necesario = Number(item.necesario);
          const disponible = Number(item.disponible);
          return (
            <li key={item.insumo}>
              <div>{item.insumo}: necesita {necesario.toLocaleString('es-CL')} {item.unidad}, hay {disponible.toLocaleString('es-CL')}</div>
              <div className={`barra-stock${item.suficiente ? '' : ' barra-stock--falta'}`}>
                <span style={{ width: `${Math.min(100, disponible > 0 ? (necesario / disponible) * 100 : 100)}%` }} />
              </div>
            </li>
          );
        })}
        {stock?.insumos && !stock.insumos.length && (
          <li className="nota">Los productos no tienen receta registrada; no se descontarán insumos.</li>
        )}
        {stock?.insumos && !stock.hay_stock_suficiente && (
          <li className="error-campo">Falta stock para confirmar. Repón los insumos en rojo o ajusta la cotización.</li>
        )}
      </ul>
      <button className="boton boton--grande espacio-arriba" type="button" disabled={!puede || confirmando} onClick={confirmar}>
        {confirmando ? 'Confirmando…' : 'Confirmar y enviar a cocina'}
      </button>
    </section>
  );
}

function SubirImagen({ pedido, recargar }) {
  const avisar = useAvisos();
  const [archivo, setArchivo] = useState(null);
  async function subir(evento) {
    evento.preventDefault();
    if (!archivo) { avisar('Elige una imagen antes de subirla.', 'error'); return; }
    const form = new FormData();
    form.append('imagen_referencia', archivo);
    const { ok, datos } = await llamarApi(`/api/pedidos/${pedido.id}/imagen-referencia/`, { metodo: 'POST', form });
    if (ok) { avisar('Imagen de referencia actualizada.', 'success'); recargar(); }
    else avisar(textosDeError(datos).join(' '), 'error');
  }
  return (
    <form className="espacio-arriba" onSubmit={subir}>
      <div className="campo">
        <label htmlFor="imagen">{pedido.imagen_referencia ? 'Reemplazar imagen de referencia' : 'Subir imagen de referencia'}</label>
        <input type="file" id="imagen" accept="image/*" required onChange={(e) => setArchivo(e.target.files[0])} />
      </div>
      <button className="boton boton--secundario" type="submit">Subir imagen</button>
    </form>
  );
}
