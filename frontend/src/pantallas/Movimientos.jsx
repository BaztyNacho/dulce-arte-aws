/* Movimientos de bodega: entradas, mermas, consumos por pedido y devoluciones. */
import { Link, useSearchParams } from 'react-router-dom';

import Pagina, { Cargando } from '../componentes/Pagina.jsx';
import { useDatos } from '../useDatos.js';
import { cantidad, fechaCorta } from '../util.js';

export default function Movimientos() {
  const [params, setParams] = useSearchParams();
  const tipo = params.get('tipo') || 'todos';
  const periodo = params.get('periodo') || 'semana';
  const pagina = params.get('pagina') || '1';
  const { datos, error } = useDatos(`/api/pantallas/movimientos/?${new URLSearchParams({ tipo, periodo, pagina })}`);
  const ir = (cambios) => setParams({ tipo, periodo, ...cambios });

  return (
    <Pagina
      titulo="Movimientos"
      subtitulo="Historial de entradas, mermas, consumos por pedido y devoluciones."
      opciones={datos && (
        <div className="banner__opciones">
          <nav className="chips" aria-label="Filtrar por período">
            {datos.periodos.map((p) => (
              <button key={p.valor} type="button" className="chip" aria-current={p.valor === periodo ? 'true' : undefined}
                      onClick={() => setParams({ periodo: p.valor, tipo })}>{p.texto}</button>
            ))}
          </nav>
          <Link className="boton" to="/bodega">Ir al inventario</Link>
        </div>
      )}
    >
      {!datos ? <Cargando error={error} /> : (
        <>
          <nav className="chips chips--centrados espacio-abajo" aria-label="Filtrar por tipo">
            {datos.filtros_tipo.map((f) => (
              <button key={f.valor} type="button" className="chip" aria-current={f.valor === tipo ? 'true' : undefined}
                      onClick={() => setParams({ tipo: f.valor, periodo })}>{f.texto}</button>
            ))}
          </nav>
          {datos.resultados.length ? (
            <>
              <div className="panel tabla-contenedor">
                <table className="tabla">
                  <caption className="oculto-visual">Movimientos de bodega</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th><th scope="col">Insumo</th><th scope="col">Tipo</th>
                      <th scope="col" className="tabla__numero">Cantidad</th><th scope="col">Motivo</th><th scope="col">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {datos.resultados.map((m) => (
                      <tr key={m.id}>
                        <td>{fechaCorta(m.fecha)}</td>
                        <td><strong>{m.insumo_nombre}</strong></td>
                        <td><span className={`tipo-mov tipo-mov--${m.tipo}`}>{m.tipo_display}</span></td>
                        <td className={`tabla__numero tabla__numero--${m.suma ? 'mas' : 'menos'}`}>
                          {m.suma ? '+' : '−'}{cantidad(m.cantidad)} {m.unidad}
                        </td>
                        <td>{m.motivo || '—'}{m.pedido && !m.motivo && <span className="nota"> (pedido #{m.pedido})</span>}</td>
                        <td className="nota">{m.usuario_nombre || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {datos.total_paginas > 1 && (
                <nav className="paginacion" aria-label="Páginas">
                  {datos.pagina > 1 && <button className="boton boton--secundario" type="button" onClick={() => ir({ pagina: datos.pagina - 1 })}>Anterior</button>}
                  <span>Página {datos.pagina} de {datos.total_paginas}</span>
                  {datos.pagina < datos.total_paginas && <button className="boton boton--secundario" type="button" onClick={() => ir({ pagina: datos.pagina + 1 })}>Siguiente</button>}
                </nav>
              )}
            </>
          ) : (
            <div className="panel vacio">
              <p>No hay movimientos con estos filtros.</p>
              <button className="boton boton--secundario" type="button" onClick={() => setParams({ periodo: 'todo' })}>Ver todos los movimientos</button>
            </div>
          )}
        </>
      )}
    </Pagina>
  );
}
