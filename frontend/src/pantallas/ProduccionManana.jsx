/* Producción de mañana (Cocina): cuántas unidades de cada producto y las comandas del día. */
import { Link } from 'react-router-dom';

import { Comanda } from '../componentes/Comanda.jsx';
import Pagina, { Cargando } from '../componentes/Pagina.jsx';
import { useDatos } from '../useDatos.js';
import { fechaLarga, plural } from '../util.js';

export default function ProduccionManana() {
  const { datos, error } = useDatos('/api/pantallas/produccion-manana/');
  const volver = <Link className="boton boton--secundario" to="/cocina">Volver al tablero</Link>;
  const dia = datos ? fechaLarga(datos.manana) : '';
  return (
    <Pagina titulo="Producción de mañana"
            subtitulo={datos ? `${dia[0].toUpperCase()}${dia.slice(1)}: lo que hay que preparar con anticipación.` : ''}
            opciones={<div className="banner__opciones">{volver}</div>}>
      {!datos ? <Cargando error={error} /> : datos.pedidos.length ? (
        <div className="produccion">
          <section className="panel produccion__resumen" aria-labelledby="t-resumen">
            <h2 id="t-resumen">A preparar</h2>
            <ul className="produccion__lista">
              {datos.resumen.map((r) => <li key={r.producto}><span className="produccion__cantidad">{r.cantidad}</span> {r.producto}</li>)}
            </ul>
            <p className="nota">{datos.pedidos.length} pedido{plural(datos.pedidos.length)} para mañana.</p>
          </section>
          <section aria-labelledby="t-comandas">
            <h2 id="t-comandas" className="oculto-visual">Pedidos de mañana</h2>
            <div className="comandas comandas--marco">
              {datos.pedidos.map((p) => <Comanda key={p.id} pedido={p} />)}
            </div>
          </section>
        </div>
      ) : (
        <div className="panel vacio"><p>No hay pedidos confirmados para mañana.</p>{volver}</div>
      )}
    </Pagina>
  );
}
