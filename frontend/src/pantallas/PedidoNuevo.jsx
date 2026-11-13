/*
 * Nueva cotización, en tres columnas: Datos del cliente | Catálogo disponible | Recibo.
 * Al guardar llama a la API:
 *   1. (si es cliente nuevo) POST /api/clientes/
 *   2. POST /api/pedidos/  con productos y extras
 *   3. (si hay imagen)     POST /api/pedidos/<id>/imagen-referencia/
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { llamarApi, textosDeError } from '../api.js';
import Pagina, { Cargando, useAvisos } from '../componentes/Pagina.jsx';
import { useDatos } from '../useDatos.js';
import { clp } from '../util.js';

let siguienteUid = 1;

function Contador({ valor, min, max, alCambiar, etiqueta }) {
  return (
    <span className="contador">
      <button type="button" aria-label={`Disminuir ${etiqueta}`} onClick={() => valor > min && alCambiar(valor - 1)}>−</button>
      <output aria-live="polite">{valor > 0 && min < 0 ? `+${valor}` : valor}</output>
      <button type="button" aria-label={`Aumentar ${etiqueta}`} onClick={() => valor < max && alCambiar(valor + 1)}>+</button>
    </span>
  );
}

function subtotal(linea, opciones) {
  let total = linea.producto.precio * linea.cantidad;
  for (const [id, porciones] of Object.entries(linea.extras)) {
    const opcion = opciones.find((o) => o.id === Number(id));
    if (opcion && porciones > 0) total += porciones * opcion.precio * linea.cantidad;
  }
  return total;
}

export default function PedidoNuevo() {
  const { datos, error } = useDatos('/api/pantallas/cotizador/');
  return (
    <Pagina titulo="Nueva cotización" clase="pagina--ancha"
            subtitulo="Registra lo que pide el cliente. El pedido se envía a cocina cuando confirmes la cotización.">
      {datos ? <Cotizador productos={datos.productos} opciones={datos.opciones} fechaMinima={datos.fecha_minima} />
             : <Cargando error={error} />}
    </Pagina>
  );
}

function Cotizador({ productos, opciones, fechaMinima }) {
  const avisar = useAvisos();
  const navegar = useNavigate();
  const [params] = useSearchParams();

  const [cliente, setCliente] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [sugerencias, setSugerencias] = useState(null);
  const [nuevo, setNuevo] = useState({ nombre: '', telefono: '', email: '', direccion: '' });
  const [fecha, setFecha] = useState('');
  const [tipo, setTipo] = useState('retiro');
  const [direccion, setDireccion] = useState('');
  const [diseno, setDiseno] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [imagen, setImagen] = useState(null);
  const [lineas, setLineas] = useState([]);
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const ultimaNueva = useRef(null);

  const limpiar = (campo) => setErrores((e) => ({ ...e, [campo]: '' }));

  function agregar(producto) {
    const uid = siguienteUid++;
    ultimaNueva.current = uid;
    setLineas((ls) => [...ls, { uid, producto, cantidad: 1, comentario: '', extras: {} }]);
    limpiar('detalles');
  }
  const cambiarLinea = (uid, cambios) => setLineas((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...cambios } : l)));

  // Si se llega desde el Catálogo con ?producto=<id>, ese producto queda agregado
  const yaAgregado = useRef(false);   // evita agregarlo dos veces (React en modo estricto)
  useEffect(() => {
    if (yaAgregado.current) return;
    yaAgregado.current = true;
    const encontrado = productos.find((p) => p.id === Number(params.get('producto')));
    if (encontrado) agregar(encontrado);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Búsqueda de clientes (espera 250 ms después de la última tecla)
  useEffect(() => {
    const texto = busqueda.trim();
    if (texto.length < 2) { setSugerencias(null); return undefined; }
    const temporizador = setTimeout(async () => {
      const { ok, datos } = await llamarApi(`/api/clientes/?q=${encodeURIComponent(texto)}`);
      setSugerencias(ok ? datos.slice(0, 8) : []);
    }, 250);
    return () => clearTimeout(temporizador);
  }, [busqueda]);

  function elegirCliente(c) {
    setCliente(c);
    limpiar('cliente');
    setSugerencias(null);
    if (!direccion && c.direccion) setDireccion(c.direccion);
  }

  function mostrarErrores(datosError) {
    const porCampo = {};
    let general = [];
    if (datosError && typeof datosError === 'object' && !Array.isArray(datosError)) {
      for (const [campo, valor] of Object.entries(datosError)) {
        if (['cliente', 'fecha_entrega', 'direccion_entrega', 'detalles'].includes(campo)) porCampo[campo] = textosDeError(valor).join(' ');
        else general = general.concat(textosDeError(valor));
      }
    } else general = textosDeError(datosError);
    setErrores(porCampo);
    avisar(general.length ? general.join(' ') : 'Revisa los campos marcados en rojo.', 'error');
  }

  async function guardar(evento) {
    evento.preventDefault();
    setErrores({});
    // Validaciones rápidas antes de llamar a la API
    const e = {};
    if (!cliente && !(nuevo.nombre.trim() && nuevo.telefono.trim())) e.cliente = 'Elige un cliente o ingresa nombre y teléfono del cliente nuevo.';
    if (!fecha) e.fecha_entrega = 'Indica la fecha y hora de entrega.';
    if (!lineas.length) e.detalles = 'Agrega al menos un producto.';
    if (tipo === 'despacho' && !direccion.trim()) e.direccion_entrega = 'Indica la dirección de entrega.';
    if (Object.keys(e).length) { mostrarErrores(e); return; }

    setGuardando(true);
    try {
      // 1. Cliente nuevo
      let elegido = cliente;
      if (!elegido) {
        const r = await llamarApi('/api/clientes/', {
          metodo: 'POST', json: Object.fromEntries(Object.entries(nuevo).map(([k, v]) => [k, v.trim()])),
        });
        if (!r.ok) { mostrarErrores({ cliente: textosDeError(r.datos).join(' ') }); return; }
        elegido = r.datos;
        elegirCliente(elegido);
      }
      // 2. Cotización
      const r = await llamarApi('/api/pedidos/', {
        metodo: 'POST',
        json: {
          cliente: elegido.id,
          fecha_entrega: fecha,
          tipo_entrega: tipo,
          direccion_entrega: tipo === 'despacho' ? direccion.trim() : '',
          diseno: diseno.trim(),
          observaciones: observaciones.trim(),
          detalles: lineas.map((l) => ({
            producto: l.producto.id,
            cantidad: l.cantidad,
            comentario: l.comentario.trim(),
            personalizaciones: Object.entries(l.extras).map(([opcion, porciones]) => ({ opcion: Number(opcion), porciones })),
          })),
        },
      });
      if (!r.ok) { mostrarErrores(r.datos); return; }
      const pedido = r.datos;
      // 3. Imagen de referencia
      let aviso = null;
      if (imagen) {
        const form = new FormData();
        form.append('imagen_referencia', imagen);
        const ri = await llamarApi(`/api/pedidos/${pedido.id}/imagen-referencia/`, { metodo: 'POST', form });
        if (!ri.ok) aviso = { texto: 'La cotización se guardó, pero la imagen no se pudo subir. Puedes subirla desde aquí.', tipo: 'warning', id: 1 };
      }
      // El aviso viaja con la navegación y aparece en el detalle del pedido
      navegar(`/pedidos/${pedido.id}`, {
        state: { aviso: aviso || { texto: 'Cotización guardada. Revisa el stock y confírmala cuando el cliente la apruebe.', tipo: 'success', id: 1 } },
      });
    } finally {
      setGuardando(false);
    }
  }

  let total = 0;
  const resumen = lineas.map((l) => {
    const s = subtotal(l, opciones);
    total += s;
    return <li key={l.uid}><span>{l.cantidad} × {l.producto.nombre}</span><span>{clp(s)}</span></li>;
  });

  return (
    <form className="cotizador" noValidate onSubmit={guardar}>
      {/* ---------- 1. Datos del cliente ---------- */}
      <div className="cotizador__datos">
        <h2 className="cotizador__titulo">Datos del cliente</h2>
        <section className="panel espacio-abajo" aria-labelledby="t-cliente">
          <h3 id="t-cliente">Cliente</h3>
          {cliente ? (
            <div className="cliente-elegido">
              <span>{cliente.nombre} ({cliente.telefono})</span>
              <button type="button" className="quitar" onClick={() => { setCliente(null); setBusqueda(''); }}>Cambiar</button>
            </div>
          ) : (
            <div>
              <div className="campo">
                <label htmlFor="busqueda-cliente">Buscar cliente existente</label>
                <input type="search" id="busqueda-cliente" placeholder="Nombre o teléfono" autoComplete="off"
                       value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
                {sugerencias && (
                  <ul className="sugerencias">
                    {sugerencias.length ? sugerencias.map((c) => (
                      <li key={c.id}><button type="button" onClick={() => elegirCliente(c)}>{c.nombre} ({c.telefono})</button></li>
                    )) : <li className="nota sugerencias__vacio">Sin resultados. Regístralo como cliente nuevo.</li>}
                  </ul>
                )}
              </div>
              <details>
                <summary>Es un cliente nuevo</summary>
                <div className="fila espacio-arriba">
                  <div className="campo"><label htmlFor="c-nombre">Nombre completo</label>
                    <input type="text" id="c-nombre" value={nuevo.nombre} onChange={(e) => { setNuevo({ ...nuevo, nombre: e.target.value }); limpiar('cliente'); }} /></div>
                  <div className="campo"><label htmlFor="c-telefono">Teléfono</label>
                    <input type="tel" id="c-telefono" placeholder="+56 9 1234 5678" value={nuevo.telefono} onChange={(e) => { setNuevo({ ...nuevo, telefono: e.target.value }); limpiar('cliente'); }} /></div>
                </div>
                <div className="fila">
                  <div className="campo"><label htmlFor="c-email">Correo (opcional)</label>
                    <input type="email" id="c-email" value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} /></div>
                  <div className="campo"><label htmlFor="c-direccion">Dirección (opcional)</label>
                    <input type="text" id="c-direccion" value={nuevo.direccion} onChange={(e) => setNuevo({ ...nuevo, direccion: e.target.value })} /></div>
                </div>
              </details>
            </div>
          )}
          <p className="error-campo">{errores.cliente}</p>
        </section>

        <section className="panel espacio-abajo" aria-labelledby="t-entrega">
          <h3 id="t-entrega">Entrega</h3>
          <div className="campo">
            <label htmlFor="fecha-entrega">Fecha y hora</label>
            <input type="datetime-local" id="fecha-entrega" min={fechaMinima} required value={fecha}
                   onChange={(e) => { setFecha(e.target.value); limpiar('fecha_entrega'); }} />
            <small>Con al menos 24 horas de anticipación.</small>
            <span className="error-campo">{errores.fecha_entrega}</span>
          </div>
          <div className="campo">
            <span className="etiqueta">Tipo de entrega</span>
            <div className="opciones-radio">
              <label><input type="radio" name="tipo_entrega" value="retiro" checked={tipo === 'retiro'} onChange={() => setTipo('retiro')} /><span>Retiro en tienda</span></label>
              <label><input type="radio" name="tipo_entrega" value="despacho" checked={tipo === 'despacho'} onChange={() => setTipo('despacho')} /><span>Despacho a domicilio</span></label>
            </div>
          </div>
          {tipo === 'despacho' && (
            <div className="campo">
              <label htmlFor="direccion-entrega">Dirección de entrega</label>
              <input type="text" id="direccion-entrega" value={direccion} onChange={(e) => { setDireccion(e.target.value); limpiar('direccion_entrega'); }} />
              <span className="error-campo">{errores.direccion_entrega}</span>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="t-diseno">
          <h3 id="t-diseno">Diseño</h3>
          <div className="campo">
            <label htmlFor="diseno">Descripción del diseño</label>
            <textarea id="diseno" placeholder="Colores, decoración, mensaje sobre la torta…" value={diseno} onChange={(e) => setDiseno(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="imagen">Imagen de referencia (opcional)</label>
            <input type="file" id="imagen" accept="image/*" onChange={(e) => setImagen(e.target.files[0] || null)} />
          </div>
          <div className="campo">
            <label htmlFor="observaciones">Observaciones internas (opcional)</label>
            <textarea id="observaciones" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>
        </section>
      </div>

      {/* ---------- 2. Catálogo disponible y productos agregados ---------- */}
      <div className="cotizador__catalogo">
        <h2 className="cotizador__titulo">Catálogo disponible</h2>
        <section className="panel espacio-abajo" aria-labelledby="t-productos">
          <h3 id="t-productos">Productos</h3>
          <p className="nota">Toca un producto para agregarlo. Luego ajusta la cantidad y los extras más abajo.</p>
          <div className="catalogo">
            {productos.length ? productos.map((p) => (
              <button key={p.id} type="button" className="producto" aria-label={`Agregar ${p.nombre}`} onClick={() => agregar(p)}>
                {p.imagen && <img src={p.imagen} alt="" />}
                <span className="producto__nombre">{p.nombre}</span>
                <span className="producto__precio">{p.categoria}, {clp(p.precio)}</span>
              </button>
            )) : <p className="nota">No hay productos activos. Un administrador debe crearlos en el panel de administración.</p>}
          </div>
          <p className="error-campo">{errores.detalles}</p>
        </section>

        {lineas.length > 0 && (
          <section className="panel" aria-labelledby="t-agregados">
            <h3 id="t-agregados">Productos agregados</h3>
            {lineas.map((l) => {
              const extras = opciones.filter((o) => l.producto.opciones.includes(o.id));
              return (
                <div key={l.uid} className={`linea-pedido${l.uid === ultimaNueva.current ? ' nueva' : ''}`}>
                  <div className="linea-pedido__cabecera">
                    <span className="linea-pedido__nombre">{l.producto.nombre} ({clp(l.producto.precio)} c/u)</span>
                    <Contador valor={l.cantidad} min={1} max={50} etiqueta={`cantidad de ${l.producto.nombre}`}
                              alCambiar={(v) => cambiarLinea(l.uid, { cantidad: v })} />
                    <button type="button" className="quitar" onClick={() => setLineas((ls) => ls.filter((x) => x.uid !== l.uid))}>Quitar</button>
                  </div>
                  {extras.length > 0 && (
                    <div className="personalizaciones">
                      <span className="etiqueta">Extras</span>
                      {extras.map((o) => {
                        const porciones = l.extras[o.id] || 0;
                        let nota = 'Normal';
                        if (porciones > 0) nota = `${porciones} porción${porciones > 1 ? 'es' : ''} extra, ${clp(porciones * o.precio)} por unidad`;
                        if (porciones < 0) nota = `Menos cantidad (${porciones}), sin costo`;
                        return (
                          <div className="personalizacion" key={o.id}>
                            <span>{o.nombre}<br /><span className="personalizacion__nota">{nota}</span></span>
                            <Contador valor={porciones} min={-5} max={5} etiqueta={o.nombre}
                                      alCambiar={(v) => {
                                        const nuevos = { ...l.extras };
                                        if (v === 0) delete nuevos[o.id]; else nuevos[o.id] = v;
                                        cambiarLinea(l.uid, { extras: nuevos });
                                      }} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="campo comentario-linea">
                    <label htmlFor={`comentario-${l.uid}`}>Comentario o añadido extra</label>
                    <textarea id={`comentario-${l.uid}`} rows={2} placeholder='Ej.: escribir "Feliz cumpleaños, Sofía"'
                              value={l.comentario} onChange={(e) => cambiarLinea(l.uid, { comentario: e.target.value })} />
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>

      {/* ---------- 3. Recibo ---------- */}
      <aside className="cotizador__recibo" aria-labelledby="t-recibo">
        <h2 className="cotizador__titulo" id="t-recibo">Recibo</h2>
        <div className="resumen">
          <div className="comanda">
            <h3 className="resumen__titulo">Resumen</h3>
            <ul className="comanda__lineas">
              {resumen.length ? resumen : <li><span className="nota">Aún no agregas productos.</span></li>}
            </ul>
            <div className="comanda__pie">
              <span>Total estimado</span>
              <span className="resumen__total">{clp(total)}</span>
            </div>
            <p className="nota espacio-arriba-chico">El sistema recalcula el total al guardar.</p>
            <button className="boton boton--grande" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cotización'}</button>
          </div>
        </div>
      </aside>
    </form>
  );
}
