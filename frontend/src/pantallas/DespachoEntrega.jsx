/*
 * Entrega con firma (Repartidor).
 * La firma se dibuja en un <canvas> (dedo, mouse o lápiz) y se envía como PNG en base64,
 * junto con la foto del comprobante: POST /api/despachos/<id>/confirmar-entrega/
 * También se puede registrar un intento fallido (vuelve a "Por asignar").
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { llamarApi, textosDeError } from '../api.js';
import { Mapa, Sello } from '../componentes/Comanda.jsx';
import Pagina, { Cargando, useAvisos } from '../componentes/Pagina.jsx';
import { useDatos } from '../useDatos.js';
import { fechaLarga, hora } from '../util.js';

const COLOR_ESTADO = { entregado: 'entregado', en_camino: 'en_despacho', fallido: 'cancelado' };

export default function DespachoEntrega() {
  const { id } = useParams();
  const { datos: d, error } = useDatos(`/api/pantallas/despachos/${id}/`);
  const volver = <div className="banner__opciones"><Link className="boton boton--secundario" to="/despachos">Volver a despachos</Link></div>;

  if (!d) return <Pagina titulo="Entrega" opciones={volver}><Cargando error={error} /></Pagina>;

  const creado = d.fecha_entrega_real && new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: 'numeric', month: 'long' }).format(new Date(d.fecha_entrega_real));
  return (
    <Pagina titulo={`Entrega del pedido #${d.pedido}`}
            subtitulo={d.ruta ? `${d.ruta_nombre}, parada ${d.orden}.` : 'Sin ruta asignada.'}
            opciones={volver}>
      <div className="grilla-2">
        <article className="comanda">
          <Sello estado={d.pedido_estado} />
          <div className="comanda__cabecera">
            <span className="comanda__numero">Entregar a las</span>
            <span className={`estado estado--${COLOR_ESTADO[d.estado] || 'cotizacion'}`}>{d.estado_display}</span>
          </div>
          <div className="comanda__hora comanda__hora--grande">{hora(d.fecha_entrega_programada)}</div>
          <div className="comanda__fecha">{fechaLarga(d.fecha_entrega_programada)}</div>
          <div className="comanda__cliente">{d.cliente_nombre}</div>
          <p className="comanda__direccion">{d.direccion_entrega}</p>
          <Mapa direccion={d.direccion_entrega} />
          <div className="comanda__acciones comanda__acciones--separadas">
            <a className="boton boton--chico boton--secundario" href={`tel:${d.cliente_telefono.replaceAll(' ', '')}`}>Llamar al cliente</a>
          </div>
          <ul className="comanda__lineas">
            {d.productos.map((p, i) => <li key={i}>{p.cantidad} × {p.nombre}</li>)}
          </ul>
        </article>

        <div>
          {d.estado === 'entregado' ? (
            <section className="panel">
              <h2>Entregado</h2>
              <p>Recibió <strong>{d.nombre_receptor}</strong> el {creado}, {hora(d.fecha_entrega_real)}.</p>
              {d.firma && <><h3>Firma</h3><img className="firma-guardada" src={d.firma} alt={`Firma de ${d.nombre_receptor}`} /></>}
              {d.comprobante && <><h3 className="espacio-arriba">Comprobante</h3><img className="imagen-referencia" src={d.comprobante} alt="Foto del comprobante de entrega" /></>}
              {d.observaciones && <p className="nota espacio-arriba">{d.observaciones}</p>}
            </section>
          ) : <FormularioEntrega despacho={d} />}
        </div>
      </div>
    </Pagina>
  );
}

function FormularioEntrega({ despacho }) {
  const avisar = useAvisos();
  const navegar = useNavigate();
  const lienzo = useRef(null);
  const hayFirma = useRef(false);
  const [receptor, setReceptor] = useState('');
  const [foto, setFoto] = useState(null);
  const [obs, setObs] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Lienzo de la firma
  useEffect(() => {
    const canvas = lienzo.current;
    const ctx = canvas.getContext('2d');
    let dibujando = false;
    let ultimo = null;

    function ajustarTamano() {     // tamaño real según la pantalla (nítido en celulares)
      const escala = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * escala;
      canvas.height = canvas.clientHeight * escala;
      ctx.scale(escala, escala);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#3B2420';
      hayFirma.current = false;
    }
    const punto = (e) => { const c = canvas.getBoundingClientRect(); return { x: e.clientX - c.left, y: e.clientY - c.top }; };
    const abajo = (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      dibujando = true;
      ultimo = punto(e);
      ctx.beginPath();
      ctx.arc(ultimo.x, ultimo.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      hayFirma.current = true;
    };
    const mover = (e) => {
      if (!dibujando) return;
      const actual = punto(e);
      const medio = { x: (ultimo.x + actual.x) / 2, y: (ultimo.y + actual.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(ultimo.x, ultimo.y);
      ctx.quadraticCurveTo(ultimo.x, ultimo.y, medio.x, medio.y);
      ctx.lineTo(actual.x, actual.y);
      ctx.stroke();
      ultimo = actual;
    };
    const terminar = () => { dibujando = false; };
    const alRedimensionar = () => { if (!hayFirma.current) ajustarTamano(); };

    ajustarTamano();
    canvas.addEventListener('pointerdown', abajo);
    canvas.addEventListener('pointermove', mover);
    canvas.addEventListener('pointerup', terminar);
    canvas.addEventListener('pointercancel', terminar);
    window.addEventListener('resize', alRedimensionar);
    return () => {
      canvas.removeEventListener('pointerdown', abajo);
      canvas.removeEventListener('pointermove', mover);
      canvas.removeEventListener('pointerup', terminar);
      canvas.removeEventListener('pointercancel', terminar);
      window.removeEventListener('resize', alRedimensionar);
    };
  }, []);

  function borrarFirma() {
    const canvas = lienzo.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    hayFirma.current = false;
  }

  async function confirmar(evento) {
    evento.preventDefault();
    if (!receptor.trim()) { avisar('Escribe el nombre de quien recibe.', 'error'); return; }
    if (!hayFirma.current && !foto) { avisar('Pide la firma del cliente o toma una foto del comprobante.', 'error'); return; }
    const form = new FormData();
    form.append('nombre_receptor', receptor.trim());
    form.append('observaciones', obs.trim());
    if (hayFirma.current) form.append('firma', lienzo.current.toDataURL('image/png'));
    if (foto) form.append('comprobante', foto);
    setEnviando(true);
    const { ok, datos } = await llamarApi(`/api/despachos/${despacho.id}/confirmar-entrega/`, { metodo: 'POST', form });
    setEnviando(false);
    if (ok) navegar('/despachos', { state: { aviso: { texto: `Pedido #${datos.pedido} entregado a ${datos.nombre_receptor}.`, tipo: 'success', id: 1 } } });
    else avisar(textosDeError(datos).join(' '), 'error');
  }

  async function fallido(evento) {
    evento.preventDefault();
    if (!motivo.trim()) { avisar('Cuenta qué pasó con la entrega.', 'error'); return; }
    const { ok, datos } = await llamarApi(`/api/despachos/${despacho.id}/`, {
      metodo: 'PATCH', json: { estado: 'fallido', observaciones: motivo.trim(), ruta: null },
    });
    if (ok) {
      navegar('/despachos', { state: { aviso: { texto: `Intento fallido registrado para el pedido #${datos.pedido}. Quedó en "Por asignar" para reintentar.`, tipo: 'success', id: 1 } } });
    } else avisar(textosDeError(datos).join(' '), 'error');
  }

  return (
    <>
      <form className="panel" noValidate onSubmit={confirmar}>
        <h2>Confirmar entrega</h2>
        <div className="campo">
          <label htmlFor="receptor">Nombre de quien recibe</label>
          <input type="text" id="receptor" maxLength={150} autoComplete="off" required value={receptor} onChange={(e) => setReceptor(e.target.value)} />
        </div>
        <div className="campo">
          <span className="etiqueta" id="etiqueta-firma">Firma</span>
          <canvas ref={lienzo} id="firma" className="firma" aria-labelledby="etiqueta-firma" />
          <div className="fila-extremos">
            <small>Firma con el dedo o el mouse dentro del recuadro.</small>
            <button type="button" className="quitar" onClick={borrarFirma}>Borrar firma</button>
          </div>
        </div>
        <div className="campo">
          <label htmlFor="comprobante">Foto del comprobante (opcional si hay firma)</label>
          <input type="file" id="comprobante" accept="image/*" capture="environment" onChange={(e) => setFoto(e.target.files[0] || null)} />
        </div>
        <div className="campo">
          <label htmlFor="obs">Observaciones (opcional)</label>
          <textarea id="obs" rows={2} placeholder="Ej.: se dejó con el conserje" value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
        <button className="boton boton--grande" type="submit" disabled={enviando}>{enviando ? 'Confirmando…' : 'Confirmar entrega'}</button>
      </form>
      <details className="panel espacio-arriba-medio">
        <summary><strong>No se pudo entregar</strong></summary>
        <form className="espacio-arriba" onSubmit={fallido}>
          <div className="campo">
            <label htmlFor="motivo-fallido">¿Qué pasó?</label>
            <input type="text" id="motivo-fallido" maxLength={200} placeholder="Ej.: no había nadie en el domicilio" required
                   value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
          <button className="boton boton--peligro" type="submit">Registrar intento fallido</button>
        </form>
      </details>
    </>
  );
}
