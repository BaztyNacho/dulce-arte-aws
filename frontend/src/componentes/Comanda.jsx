/* Piezas pequeñas reutilizables: sello, foto, comanda (ticket de pedido) y mapa. */
import { Link } from 'react-router-dom';

import { clp, fechaLarga, hora, inicial, tono } from '../util.js';

/** Sello decorativo de estado (recibido, en_preparacion, entregado...) */
export function Sello({ estado }) {
  return (
    <span className={`comanda__sello sello--${estado}`} aria-hidden="true">
      <svg viewBox="0 0 100 100"><use href={`#sello-${estado}`} /></svg>
    </span>
  );
}

/** Foto con reemplazo elegante (inicial sobre un color) si no hay imagen */
export function Foto({ src, nombre, clase = '' }) {
  if (src) return <img className={`foto ${clase}`} src={src} alt={nombre} loading="lazy" />;
  return (
    <div className={`foto foto--vacia foto--tono-${tono(nombre)} ${clase}`} role="img" aria-label={`${nombre} (sin foto)`}>
      <span>{inicial(nombre)}</span>
    </div>
  );
}

/** Comanda: ticket de un pedido (lista de pedidos, inicio, próximas entregas) */
export function Comanda({ pedido }) {
  return (
    <Link className={`comanda${pedido.urgente ? ' comanda--urgente' : ''}`} to={`/pedidos/${pedido.id}`}>
      <Sello estado={pedido.estado} />
      <div className="comanda__cabecera">
        <span className="comanda__numero">Pedido #{pedido.id}</span>
        <span className={`estado estado--${pedido.estado}`}>{pedido.estado_display}</span>
      </div>
      <div className="comanda__hora">{hora(pedido.fecha_entrega)}</div>
      <div className="comanda__fecha">
        {fechaLarga(pedido.fecha_entrega)}, {pedido.tipo_entrega_display.toLowerCase()}
      </div>
      <div className="comanda__cliente">{pedido.cliente_nombre}</div>
      <ul className="comanda__lineas">
        {pedido.productos.map((p, i) => <li key={i}>{p.cantidad} × {p.nombre}</li>)}
      </ul>
      <div className="comanda__pie">
        <span className="nota">{pedido.cliente_telefono}</span>
        <span className="comanda__total">{clp(pedido.total)}</span>
      </div>
    </Link>
  );
}

/** Mapa de Google Maps incrustado (sin clave de API); "Ampliar mapa" abre Google Maps */
export function Mapa({ direccion }) {
  const consulta = encodeURIComponent(`${direccion}, Santiago, Chile`);
  return (
    <figure className="mapa">
      <iframe
        className="mapa__marco"
        src={`https://www.google.com/maps?q=${consulta}&z=16&output=embed`}
        title={`Mapa de ${direccion}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
      <figcaption className="mapa__pie">
        <span className="mapa__direccion">{direccion}</span>
        <a className="boton boton--chico boton--secundario" target="_blank" rel="noopener noreferrer"
           href={`https://www.google.com/maps/search/?api=1&query=${consulta}`}>Ampliar mapa</a>
      </figcaption>
    </figure>
  );
}

/** Icono del menú de acceso rápido */
export function Icono({ nombre }) {
  return <svg aria-hidden="true"><use href={`#icono-${nombre}`} /></svg>;
}
