/* Pantalla de ingreso: usuario y contraseña -> tokens JWT del backend. */
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import logo from '../img/logo-dulce-arte.png';
import { useSesion } from '../sesion.jsx';

export default function Login() {
  const { usuario, iniciarSesion } = useSesion();
  const ubicacion = useLocation();
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to={ubicacion.state?.desde || '/'} replace />;

  async function enviar(evento) {
    evento.preventDefault();
    const datos = new FormData(evento.target);
    setEnviando(true);
    const mensaje = await iniciarSesion(datos.get('username').trim(), datos.get('password'));
    setEnviando(false);
    setError(mensaje);
  }

  document.title = 'Ingresar · Dulce Arte';
  return (
    <main className="acceso">
      <form className="comanda acceso__tarjeta" onSubmit={enviar} noValidate>
        <img className="acceso__logo" src={logo} alt="Dulce Arte, repostería" />
        <h1 className="oculto-visual">Ingresar a Dulce Arte</h1>
        {error && <div className="mensaje mensaje--error" role="alert">{error}</div>}
        <div className="campo">
          <label htmlFor="id_username">Usuario</label>
          <input type="text" name="username" id="id_username" autoComplete="username" required autoFocus />
        </div>
        <div className="campo">
          <label htmlFor="id_password">Contraseña</label>
          <input type="password" name="password" id="id_password" autoComplete="current-password" required />
        </div>
        <button className="boton boton--grande" type="submit" disabled={enviando}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </main>
  );
}
