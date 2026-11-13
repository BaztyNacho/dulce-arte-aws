/*
 * Barra superior: enlaces a ambos lados del logo (repartidos según el rol),
 * la tarjeta del usuario y la ventana que pide la contraseña antes de entrar a Administración.
 */
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { llamarApi, primerError } from '../api.js';
import logo from '../img/logo-dulce-arte.png';
import { useSesion } from '../sesion.jsx';
import Ventana from './Ventana.jsx';

// Menú por rol: [izquierda del logo, derecha del logo]. "admin: true" abre la ventana de contraseña.
const MENUS = {
  ventas: [
    [['/', 'Inicio'], ['/catalogo', 'Catálogo']],
    [['/pedidos', 'Pedidos'], ['/pedidos/nuevo', 'Nueva cotización']],
  ],
  admin: [
    [['/', 'Inicio'], ['/pedidos', 'Pedidos'], ['/cocina', 'Cocina']],
    [['/bodega', 'Bodega'], ['/despachos/entregados', 'Despachos'], ['/admin/', 'Administración', true]],
  ],
  cocina: [
    [['/', 'Inicio'], ['/cocina', 'Cocina']],
    [['/pedidos', 'Pedidos'], ['/cocina/manana', 'Mañana']],
  ],
  bodega: [
    [['/', 'Inicio'], ['/bodega', 'Bodega']],
    [['/bodega/movimientos', 'Movimientos']],
  ],
  repartidor: [
    [['/', 'Inicio'], ['/despachos', 'Mi ruta']],
    [['/despachos/entregados', 'Entregados']],
  ],
};

// El enlace queda marcado también en sus subpáginas (ej.: "Pedidos" en /pedidos/15).
// Para el Administrador, "Cocina" incluye Mañana y "Bodega" incluye Movimientos.
function activo(ruta, actual, rol) {
  const agrupa = rol === 'admin';
  switch (ruta) {
    case '/': return actual === '/';
    case '/pedidos': return actual === '/pedidos' || /^\/pedidos\/\d+/.test(actual);
    case '/cocina': return actual === '/cocina' || (agrupa && actual === '/cocina/manana');
    case '/bodega': return actual === '/bodega' || (agrupa && actual === '/bodega/movimientos');
    case '/despachos': return actual === '/despachos' || /^\/despachos\/\d+/.test(actual);
    default: return actual === ruta;
  }
}

function Enlaces({ lista, abrirAdmin, clase, actual, rol }) {
  return (
    <div className={clase}>
      {lista.map(([ruta, texto, esAdmin]) =>
        esAdmin ? (
          <a key={ruta} href={ruta} onClick={(e) => { e.preventDefault(); abrirAdmin(); }}>{texto}</a>
        ) : (
          <Link key={ruta} to={ruta} aria-current={activo(ruta, actual, rol) ? 'page' : undefined}>{texto}</Link>
        ),
      )}
    </div>
  );
}

function TarjetaUsuario({ usuario, cerrarSesion }) {
  const [abierta, setAbierta] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!abierta) return undefined;
    const alClic = (e) => { if (!ref.current.contains(e.target)) setAbierta(false); };
    const alTecla = (e) => { if (e.key === 'Escape') setAbierta(false); };
    document.addEventListener('click', alClic);
    document.addEventListener('keydown', alTecla);
    return () => { document.removeEventListener('click', alClic); document.removeEventListener('keydown', alTecla); };
  }, [abierta]);
  return (
    <div className="usuario" ref={ref}>
      <button className="usuario__boton" type="button" aria-expanded={abierta} aria-controls="usuario-tarjeta"
              aria-haspopup="true" onClick={() => setAbierta(!abierta)}>
        <span className="usuario__avatar" aria-hidden="true">{usuario.iniciales}</span>
        <span className="usuario__nombre">{usuario.nombre}</span>
        <span className={`rol-insignia rol-insignia--${usuario.rol}`}>{usuario.nombre_rol}</span>
      </button>
      <div className="usuario__tarjeta" id="usuario-tarjeta" hidden={!abierta}>
        <div className="usuario__cabecera">
          <span className="usuario__avatar usuario__avatar--grande" aria-hidden="true">{usuario.iniciales}</span>
          <div>
            <strong>{usuario.nombre_completo}</strong>
            <span className={`rol-insignia rol-insignia--${usuario.rol}`}>{usuario.nombre_rol}</span>
          </div>
        </div>
        <dl className="usuario__datos">
          <div><dt>Usuario</dt><dd>{usuario.username}</dd></div>
          <div><dt>Correo</dt><dd>{usuario.email || 'Sin correo registrado'}</dd></div>
        </dl>
        <div className="usuario__salir">
          <button className="boton boton--secundario ancho-completo" type="button" onClick={cerrarSesion}>Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}

/** Ventana que pide la contraseña antes de abrir el Django Admin (lo valida el backend) */
export function VentanaAdmin({ abierta, alCerrar }) {
  const { usuario, cerrarSesion } = useSesion();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    setEnviando(true);
    const { ok, datos } = await llamarApi('/api/auth/admin/', { metodo: 'POST', json: { password } });
    setEnviando(false);
    setPassword('');
    if (ok) {
      window.location.href = datos.url;          // el Django Admin vive en el backend
    } else if (datos?.cerrar_sesion) {
      cerrarSesion();
    } else {
      setError(primerError(datos));
    }
  }

  return (
    <Ventana abierta={abierta} alCerrar={() => { setError(null); alCerrar(); }} etiqueta="ventana-admin-titulo">
      <form onSubmit={enviar}>
        <h2 id="ventana-admin-titulo">Entrar a Administración</h2>
        <p className="ventana__detalle">Por seguridad, confirma la contraseña de <strong>{usuario?.username}</strong>.</p>
        <div className="campo">
          <label htmlFor="ventana-admin-password">Contraseña</label>
          <input type="password" id="ventana-admin-password" autoComplete="current-password" required autoFocus
                 value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="ventana__error" role="alert">{error}</p>}
        <div className="ventana__acciones">
          <button className="boton boton--secundario" type="button" onClick={alCerrar}>Cancelar</button>
          <button className="boton" type="submit" disabled={enviando}>Entrar</button>
        </div>
      </form>
    </Ventana>
  );
}

export default function Barra({ abrirAdmin }) {
  const { usuario, cerrarSesion } = useSesion();
  const { pathname } = useLocation();
  const [izquierda, derecha] = MENUS[usuario.rol] || [[['/', 'Inicio']], []];
  return (
    <header className="barra">
      <nav className="barra__contenido" aria-label="Principal">
        <Enlaces lista={izquierda} abrirAdmin={abrirAdmin} clase="nav nav--izquierda" actual={pathname} rol={usuario.rol} />
        <Link className="marca" to="/">
          <img src={logo} alt="Dulce Arte, ir al inicio" />
        </Link>
        <div className="barra__derecha">
          <Enlaces lista={derecha} abrirAdmin={abrirAdmin} clase="nav" actual={pathname} rol={usuario.rol} />
          <TarjetaUsuario usuario={usuario} cerrarSesion={cerrarSesion} />
        </div>
      </nav>
    </header>
  );
}
