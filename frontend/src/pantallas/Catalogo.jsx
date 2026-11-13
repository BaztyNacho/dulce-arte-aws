/* Catálogo de productos (Atención y Ventas): receta, extras y tiempo de preparación. */
import { Link, useSearchParams } from 'react-router-dom';

import { Foto } from '../componentes/Comanda.jsx';
import Pagina, { Cargando } from '../componentes/Pagina.jsx';
import { useDatos } from '../useDatos.js';
import { clp } from '../util.js';

export default function Catalogo() {
  const [params, setParams] = useSearchParams();
  const categoria = params.get('categoria') || '';
  const { datos, error } = useDatos(`/api/pantallas/catalogo/?categoria=${encodeURIComponent(categoria)}`);

  return (
    <Pagina
      titulo="Catálogo"
      opciones={datos && datos.categorias.length > 1 && (
        <div className="banner__opciones">
          <nav className="chips" aria-label="Filtrar por categoría">
            <button type="button" className="chip" aria-current={!categoria ? 'true' : undefined} onClick={() => setParams({})}>Todos</button>
            {datos.categorias.map((c) => (
              <button key={c.valor} type="button" className="chip" aria-current={c.valor === categoria ? 'true' : undefined}
                      onClick={() => setParams({ categoria: c.valor })}>{c.texto}</button>
            ))}
          </nav>
        </div>
      )}
    >
      {!datos ? <Cargando error={error} /> : datos.productos.length ? (
        <ul className="catalogo-lista">
          {datos.productos.map((p) => (
            <li className="ficha" id={`producto-${p.id}`} key={p.id}>
              {/* La foto queda de fondo a la izquierda y se desvanece hacia el texto */}
              <div className="ficha__fondo" aria-hidden="true"><Foto src={p.imagen} nombre={p.nombre} /></div>
              <div className="ficha__cuerpo">
                <div className="ficha__cabecera">
                  <div>
                    <span className="ficha__categoria">{p.categoria_display}</span>
                    <h2 className="ficha__nombre">{p.nombre}</h2>
                  </div>
                  <div className="ficha__precio">{clp(p.precio_base)}</div>
                </div>
                {p.descripcion && <p className="ficha__descripcion">{p.descripcion}</p>}
                <dl className="ficha__datos">
                  <div><dt>Ingredientes</dt><dd>{p.ingredientes.join(', ') || 'Sin receta registrada'}</dd></div>
                  <div>
                    <dt>Extras disponibles</dt>
                    <dd>{p.extras.map((e) => `${e.nombre} (${clp(e.precio_por_porcion)} por porción)`).join(', ') || 'Sin extras'}</dd>
                  </div>
                  <div><dt>Tiempo de preparación</dt><dd>{p.tiempo_legible}</dd></div>
                </dl>
                <Link className="boton boton--chico" to={`/pedidos/nuevo?producto=${p.id}`}>Cotizar este producto</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel vacio">
          <p>No hay productos disponibles en esta categoría.</p>
          <button className="boton boton--secundario" type="button" onClick={() => setParams({})}>Ver todo el catálogo</button>
        </div>
      )}
    </Pagina>
  );
}
