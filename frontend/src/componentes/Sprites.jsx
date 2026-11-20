/*
 * Dibujos SVG que se cargan una sola vez y se reutilizan en toda la app:
 *   <svg><use href="#sello-recibido" /></svg>   sellos de estado (9)
 *   <svg><use href="#icono-pedidos" /></svg>    iconos del menú (16)
 *
 * Seguridad: dangerouslySetInnerHTML solo recibe archivos SVG propios del proyecto
 * (importados al compilar), nunca texto escrito por usuarios. Por eso es seguro.
 */
import sellos from '../sprites/sellos.svg?raw';
import iconos from '../sprites/iconos.svg?raw';

const dibujos = { __html: sellos + iconos };

export default function Sprites() {
  return (
    <div
      hidden
      // nosemgrep: contenido fijo del proyecto (ver comentario de arriba)
      dangerouslySetInnerHTML={dibujos}
    />
  );
}
