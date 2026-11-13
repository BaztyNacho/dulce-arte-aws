/* Lista de pedidos como "comandas", con filtros por estado, búsqueda y páginas. */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { Comanda } from '../componentes/Comanda.jsx';
import Pagina, { Cargando } from '../componentes/Pagina.jsx';
import { useSesion } from '../sesion.jsx';
import { useDatos } from '../useDatos.js';
import { plural } from '../util.js';

export default function Pedidos() {
  const { usuario } = useSesion();
  const [params, setParams] = useSearchParams();
  const estado = params.get('estado') || 'activos';
  const q = params.get('q') || '';
  const pagina = params.get('pagina') || '1';
  const [texto, setTexto] = useState(q);
  const { datos, error } = useDatos(`/api/pantallas/pedidos/?${new URLSearchParams({ estado, q, pagina })}`);
  const esVentas = usuario.rol === 'ventas';

  const ir = (cambios) => setParams({ estado, ...(q && { q }), ...cambios });
  const botonCrear = esVentas && <Link className="boton" to="/pedidos/nuevo">Crear cotización</Link>;

  return (
    <Pagina
      titulo="Pedidos"
      subtitulo={datos ? `${datos.total} pedido${plural(datos.total)} en esta vista.` : ''}
      opciones={datos && (
        <div className="banner__opciones">
          <nav className="chips" aria-label="Filtrar por estado">
            {datos.filtros.map((f) => (
              <button key={f.valor} type="button" className="chip"
                      aria-current={f.valor === estado ? 'true' : undefined}
                      onClick={() => setParams({ estado: f.valor, ...(q && { q }) })}>{f.texto}</button>
            ))}
          </nav>
          {botonCrear}
        </div>
      )}
    >
      <form className="filtros" role="search"
            onSubmit={(e) => { e.preventDefault(); setParams({ estado, ...(texto.trim() && { q: texto.trim() }) }); }}>
        <label className="oculto-visual" htmlFor="buscar">Buscar pedido</label>
        <input type="search" id="buscar" value={texto} onChange={(e) => setTexto(e.target.value)}
               placeholder="Cliente, teléfono o n° de pedido" />
        <button className="boton" type="submit">Buscar</button>
      </form>

      {!datos ? <Cargando error={error} /> : datos.resultados.length ? (
        <>
          <div className="comandas comandas--marco">
            {datos.resultados.map((p) => <Comanda key={p.id} pedido={p} />)}
          </div>
          {datos.total_paginas > 1 && (
            <nav className="paginacion" aria-label="Páginas">
              {datos.pagina > 1 && (
                <button className="boton boton--secundario" type="button" onClick={() => ir({ pagina: datos.pagina - 1 })}>Anterior</button>
              )}
              <span>Página {datos.pagina} de {datos.total_paginas}</span>
              {datos.pagina < datos.total_paginas && (
                <button className="boton boton--secundario" type="button" onClick={() => ir({ pagina: datos.pagina + 1 })}>Siguiente</button>
              )}
            </nav>
          )}
        </>
      ) : (
        <div className="panel vacio">
          <p>{q ? `No encontramos pedidos para "${q}". Prueba con otro nombre, teléfono o número.` : 'No hay pedidos en esta vista todavía.'}</p>
          {botonCrear}
        </div>
      )}
    </Pagina>
  );
}
