/*
 * Bodega: inventario en tarjetas y registro de entradas y mermas (POST /api/movimientos-insumo/).
 *   1. Botón "Añadir" de cada tarjeta: ventana con el insumo ya elegido.
 *   2. Formulario lateral: se elige el insumo de la lista.
 * El Administrador ve el inventario en modo lectura.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { llamarApi, textosDeError } from '../api.js';
import { Foto } from '../componentes/Comanda.jsx';
import Pagina, { Cargando, useAvisos } from '../componentes/Pagina.jsx';
import Ventana from '../componentes/Ventana.jsx';
import { useDatos } from '../useDatos.js';
import { cantidad, fechaCorta } from '../util.js';

const EJEMPLOS_MOTIVO = { entrada: 'Ej.: compra a proveedor', ajuste: 'Ej.: producto vencido' };

async function registrar({ insumo, tipo, cantidad: valor, motivo }) {
  const { ok, datos } = await llamarApi('/api/movimientos-insumo/', {
    metodo: 'POST', json: { insumo: Number(insumo), tipo, cantidad: valor, motivo },
  });
  if (ok) return { ok, mensaje: `Movimiento registrado: ${datos.tipo_display}, ${Number(datos.cantidad).toLocaleString('es-CL')} de ${datos.insumo_nombre}.` };
  return { ok, mensaje: textosDeError(datos).join(' ') };
}

export default function Bodega() {
  const avisar = useAvisos();
  const { hash } = useLocation();
  const [params, setParams] = useSearchParams();
  const soloBajo = params.get('stock') === 'bajo';
  const accion = params.get('accion');
  const { datos, error, recargar } = useDatos(`/api/pantallas/bodega/${soloBajo ? '?stock=bajo' : ''}`);
  const [elegido, setElegido] = useState(null);   // insumo de la ventana "Añadir"

  // Desde Inicio: /bodega#insumo-5 lleva a esa tarjeta
  useEffect(() => {
    if (datos && hash) document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [datos, hash]);

  const alRegistrar = (resultado) => {
    if (resultado.ok) { avisar(resultado.mensaje, 'success'); recargar(); }
    return resultado;
  };

  return (
    <Pagina
      titulo="Bodega"
      subtitulo={datos?.solo_lectura
        ? 'Vista de supervisión: el inventario y su historial. Las entradas y mermas las registra Bodega.'
        : 'El stock baja solo al confirmar pedidos. Aquí registras compras, mermas y correcciones.'}
      opciones={datos && (
        <div className="banner__opciones">
          <nav className="chips" aria-label="Filtrar insumos">
            <button type="button" className="chip" aria-current={!soloBajo ? 'true' : undefined} onClick={() => setParams({})}>Todos</button>
            <button type="button" className="chip" aria-current={soloBajo ? 'true' : undefined} onClick={() => setParams({ stock: 'bajo' })}>
              Stock bajo ({datos.total_bajo})
            </button>
          </nav>
          <Link className="boton boton--secundario" to="/bodega/movimientos">Ver movimientos</Link>
        </div>
      )}
    >
      {!datos ? <Cargando error={error} /> : (
        <div className="grilla-2">
          <section className="vitrina" aria-labelledby="t-insumos">
            <h2 id="t-insumos" className="oculto-visual">Insumos</h2>
            {datos.insumos.length ? (
              <ul className="insumos-grilla">
                {datos.insumos.map((i) => (
                  <li key={i.id} className={`tarjeta-insumo${i.stock_bajo ? ' tarjeta-insumo--bajo' : ''}`} id={`insumo-${i.id}`}>
                    <h3 className="tarjeta-insumo__nombre">{i.nombre}</h3>
                    <Foto src={i.imagen} nombre={i.nombre} clase="tarjeta-insumo__foto" />
                    <p className="tarjeta-insumo__cantidad">Cantidad: <strong>{cantidad(i.stock_actual)} {i.unidad}</strong></p>
                    <p className="tarjeta-insumo__minimo">
                      Mínimo: {cantidad(i.stock_minimo)} {i.unidad}
                      {i.stock_bajo && <span className="etiqueta-reponer">Reponer</span>}
                    </p>
                    {!datos.solo_lectura && (
                      <button className="boton boton--chico ancho-completo" type="button" aria-label={`Añadir movimiento de ${i.nombre}`}
                              onClick={() => setElegido(i)}>Añadir</button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="vacio">
                <p>{soloBajo ? 'Ningún insumo está bajo el mínimo.' : 'No hay insumos registrados. Créalos en Administración.'}</p>
              </div>
            )}
          </section>

          <aside>
            {!datos.solo_lectura && (
              <FormularioLateral insumos={datos.insumos} accion={accion} alRegistrar={alRegistrar} avisar={avisar} />
            )}
            <section className="panel" aria-labelledby="t-movimientos">
              <div className="fila-extremos">
                <h2 id="t-movimientos">Últimos movimientos</h2>
                <Link className="nota" to="/bodega/movimientos">Ver todos</Link>
              </div>
              <ol className="linea-tiempo">
                {datos.movimientos.map((m) => (
                  <li key={m.id}>
                    <strong>{m.suma ? '+' : '−'}{cantidad(m.cantidad)} {m.unidad}</strong> {m.insumo_nombre}
                    <div className="nota">{m.tipo_display}{m.motivo && `: ${m.motivo}`}</div>
                    <time dateTime={m.fecha}>{fechaCorta(m.fecha)}{m.usuario_nombre && `, ${m.usuario_nombre}`}</time>
                  </li>
                ))}
                {!datos.movimientos.length && <li className="nota">Aún no hay movimientos.</li>}
              </ol>
            </section>
          </aside>
        </div>
      )}

      <VentanaMovimiento insumo={elegido} alCerrar={() => setElegido(null)}
                         alRegistrar={async (valores) => {
                           const r = alRegistrar(await registrar({ insumo: elegido.id, ...valores }));
                           if (r.ok) setElegido(null);
                           return r;
                         }} />
    </Pagina>
  );
}

function FormularioLateral({ insumos, accion, alRegistrar, avisar }) {
  const [insumo, setInsumo] = useState('');
  const [tipo, setTipo] = useState(['entrada', 'ajuste'].includes(accion) ? accion : 'entrada');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const ref = useRef(null);

  // Acceso directo desde Inicio: ?accion=entrada o ?accion=ajuste destaca este formulario
  useEffect(() => {
    if (['entrada', 'ajuste'].includes(accion)) {
      setTipo(accion);
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ref.current?.querySelector('#m-insumo')?.focus({ preventScroll: true });
    }
  }, [accion]);

  async function enviar(evento) {
    evento.preventDefault();
    if (!insumo) { avisar('Elige el insumo.', 'error'); return; }
    if (!(Number(valor) > 0)) { avisar('Ingresa una cantidad mayor que cero.', 'error'); return; }
    setEnviando(true);
    const r = alRegistrar(await registrar({ insumo, tipo, cantidad: valor, motivo: motivo.trim() }));
    setEnviando(false);
    if (r.ok) { setValor(''); setMotivo(''); } else avisar(r.mensaje, 'error');
  }

  return (
    <form ref={ref} className={`panel espacio-abajo${accion ? ' panel--destacado' : ''}`} noValidate onSubmit={enviar}>
      <h2>Registrar movimiento</h2>
      <div className="campo">
        <label htmlFor="m-insumo">Insumo</label>
        <select id="m-insumo" required value={insumo} onChange={(e) => setInsumo(e.target.value)}>
          <option value="">Elige un insumo</option>
          {insumos.map((i) => <option key={i.id} value={i.id}>{i.nombre} ({i.unidad})</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="m-tipo">Tipo</label>
        <select id="m-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="entrada">Entrada: compra o reposición</option>
          <option value="ajuste">Ajuste: merma o pérdida</option>
        </select>
      </div>
      <div className="campo">
        <label htmlFor="m-cantidad">Cantidad</label>
        <input type="number" id="m-cantidad" min="0.001" step="0.001" inputMode="decimal" required value={valor} onChange={(e) => setValor(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="m-motivo">Motivo</label>
        <input type="text" id="m-motivo" maxLength={200} placeholder={EJEMPLOS_MOTIVO[tipo]} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <button className="boton ancho-completo" type="submit" disabled={enviando}>Registrar movimiento</button>
    </form>
  );
}

function VentanaMovimiento({ insumo, alCerrar, alRegistrar }) {
  const [tipo, setTipo] = useState('entrada');
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  useEffect(() => { setTipo('entrada'); setValor(''); setMotivo(''); setError(''); }, [insumo]);

  async function enviar(evento) {
    evento.preventDefault();
    if (!(Number(valor) > 0)) { setError('Ingresa una cantidad mayor que cero.'); return; }
    setEnviando(true);
    const r = await alRegistrar({ tipo, cantidad: valor, motivo: motivo.trim() });
    setEnviando(false);
    if (!r.ok) setError(r.mensaje);     // el error se muestra dentro de la ventana
  }

  return (
    <Ventana abierta={Boolean(insumo)} alCerrar={alCerrar} etiqueta="vm-titulo">
      {insumo && (
        <form noValidate onSubmit={enviar}>
          <h2 id="vm-titulo">{insumo.nombre}</h2>
          <p className="ventana__detalle">Stock actual: {cantidad(insumo.stock_actual)} {insumo.unidad}</p>
          <div className="campo">
            <label htmlFor="vm-tipo">Tipo</label>
            <select id="vm-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="entrada">Entrada: compra o reposición</option>
              <option value="ajuste">Ajuste: merma o pérdida</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor="vm-cantidad">Cantidad ({insumo.unidad})</label>
            <input type="number" id="vm-cantidad" min="0.001" step="0.001" inputMode="decimal" required autoFocus
                   value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="vm-motivo">Motivo</label>
            <input type="text" id="vm-motivo" maxLength={200} placeholder={EJEMPLOS_MOTIVO[tipo]} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          {error && <p className="ventana__error" role="alert">{error}</p>}
          <div className="ventana__acciones">
            <button className="boton boton--secundario" type="button" onClick={alCerrar}>Cancelar</button>
            <button className="boton" type="submit" disabled={enviando}>Registrar</button>
          </div>
        </form>
      )}
    </Ventana>
  );
}
