/*
 * Dibujos SVG que se cargan una sola vez y se reutilizan en toda la app:
 *   <svg><use href="#sello-recibido" /></svg>   sellos de estado (9)
 *   <svg><use href="#icono-pedidos" /></svg>    iconos del menú (16)
 */
import sellos from '../sprites/sellos.svg?raw';
import iconos from '../sprites/iconos.svg?raw';

export default function Sprites() {
  return <div hidden dangerouslySetInnerHTML={{ __html: sellos + iconos }} />;
}
