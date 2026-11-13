/* Entregados (Repartidor) / Historial de despachos (Administrador): cada entrega con su evidencia. */
import { useSearchParams } from 'react-router-dom';

import { Sello } from '../componentes/Comanda.jsx';
import Pagina, { Cargando } from '../componentes/Pagina.jsx';
import { useSesion } from '../sesion.jsx';
import { useDatos } from '../useDatos.js';
import { clp, hora } from '../util.js';

const formatoDia = new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', weekday: 'short', day: 'numeric', month: 'short' });
const diaHora = (f) => `${formatoDia.format(new Date(f))}, ${hora(f)}`;

export default function Entregados() {
  const { usuario } = useSesion();
  const [params, setParams] = useSearchParams();
  const periodo = params.get('periodo') || 'hoy';
  const { datos, error } = useDatos(`/api/pantallas/entregados/?periodo=${periodo}`);
  const titulo = usuario.rol === 'admin' ? 'Historial de despachos' : 'Entregados';

  return (
    <Pagina
      titulo={titulo}
      subtitulo="Cada entrega con quién la recibió, a qué hora, en qué ruta y la evidencia (firma o comprobante)."
      opciones={datos && (
        <div className="banner__opciones">
          <nav className="chips" aria-label="Filtrar por período">
            {datos.periodos.map((p) => (
              <button key={p.valor} type="button" className="chip" aria-current={p.valor === periodo ? 'true' : undefined}
                      onClick={() => setParams({ periodo: p.valor })}>{p.texto}</button>
            ))}
          </nav>
        </div>
      )}
    >
      {!datos ? <Cargando error={error} /> : datos.entregas.length ? (
        <div className="entregas-grilla">
          {datos.entregas.map((d) => (
            <article key={d.id} className="tarjeta-despacho tarjeta-despacho--entregado tarjeta-entrega">
              <Sello estado="entregado" />
              <strong>Pedido #{d.pedido} · {d.cliente_nombre}</strong>
              <span>{d.direccion_entrega}</span>
              <dl className="tarjeta-entrega__datos">
                <div><dt>Recibió</dt><dd>{d.nombre_receptor}</dd></div>
                <div>
                  <dt>Entregado</dt>
                  <dd>{diaHora(d.fecha_entrega_real)}{' '}
                    {d.atraso ? <span className="etiqueta-reponer">Con atraso</span> : <span className="etiqueta-a-tiempo">A tiempo</span>}
                  </dd>
                </div>
                <div><dt>Programado</dt><dd>{diaHora(d.fecha_entrega_programada)}</dd></div>
                {d.ruta_nombre && <div><dt>Ruta</dt><dd>{d.ruta_nombre}{d.repartidor && ` · ${d.repartidor}`}</dd></div>}
                <div><dt>Productos</dt><dd>{d.productos.map((p) => `${p.cantidad} × ${p.nombre}`).join(', ')}</dd></div>
                <div><dt>Total</dt><dd>{clp(d.total)}</dd></div>
              </dl>
              <div className="tarjeta-entrega__evidencias">
                {d.firma && <figure><img src={d.firma} alt={`Firma de ${d.nombre_receptor}`} /><figcaption>Firma</figcaption></figure>}
                {d.comprobante && (
                  <figure>
                    <a href={d.comprobante} target="_blank" rel="noopener noreferrer">
                      <img src={d.comprobante} alt={`Foto del comprobante del pedido ${d.pedido}`} />
                    </a>
                    <figcaption>Comprobante</figcaption>
                  </figure>
                )}
              </div>
              {d.observaciones && <p className="nota">Observaciones: {d.observaciones}</p>}
            </article>
          ))}
        </div>
      ) : (
        <div className="panel vacio">
          <p>No hay entregas en este período.</p>
          <button className="boton boton--secundario" type="button" onClick={() => setParams({ periodo: 'todo' })}>Ver todas las entregas</button>
        </div>
      )}
    </Pagina>
  );
}
