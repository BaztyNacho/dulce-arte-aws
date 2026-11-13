/*
 * Rutas del frontend. Cada ruta indica qué roles pueden verla
 * (las mismas reglas que valida el backend en /api/pantallas/...).
 * Las URL son las mismas que tenía la versión en Django templates.
 */
import { useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';

import Barra, { VentanaAdmin } from './componentes/Barra.jsx';
import Pagina, { AvisosProvider } from './componentes/Pagina.jsx';
import Sprites from './componentes/Sprites.jsx';
import { useSesion } from './sesion.jsx';

import Bodega from './pantallas/Bodega.jsx';
import Catalogo from './pantallas/Catalogo.jsx';
import DespachoEntrega from './pantallas/DespachoEntrega.jsx';
import Despachos from './pantallas/Despachos.jsx';
import Entregados from './pantallas/Entregados.jsx';
import Inicio from './pantallas/Inicio.jsx';
import Kanban from './pantallas/Kanban.jsx';
import Login from './pantallas/Login.jsx';
import Movimientos from './pantallas/Movimientos.jsx';
import PedidoDetalle from './pantallas/PedidoDetalle.jsx';
import PedidoNuevo from './pantallas/PedidoNuevo.jsx';
import Pedidos from './pantallas/Pedidos.jsx';
import ProduccionManana from './pantallas/ProduccionManana.jsx';

/** Estructura de las pantallas internas: dibujos SVG, barra y contenido */
function Marco() {
  const { usuario, cargando } = useSesion();
  const ubicacion = useLocation();
  const [ventanaAdmin, setVentanaAdmin] = useState(false);
  if (cargando) return null;
  if (!usuario) return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;
  return (
    <AvisosProvider>
      <Sprites />
      <Barra abrirAdmin={() => setVentanaAdmin(true)} />
      <Outlet context={{ abrirAdmin: () => setVentanaAdmin(true) }} />
      {usuario.rol === 'admin' && <VentanaAdmin abierta={ventanaAdmin} alCerrar={() => setVentanaAdmin(false)} />}
    </AvisosProvider>
  );
}

/** Solo deja pasar a los roles indicados (el Administrador entra si incluirAdmin) */
function Rol({ roles, incluirAdmin = true, children }) {
  const { usuario } = useSesion();
  const permitidos = new Set(incluirAdmin ? [...roles, 'admin'] : roles);
  if (!usuario.roles.some((r) => permitidos.has(r))) {
    return (
      <Pagina titulo="Sin acceso" subtitulo="Esta pantalla no corresponde a tu rol.">
        <div className="vacio"><p>Vuelve al inicio para ver tus tareas.</p><a className="boton" href="/">Ir al inicio</a></div>
      </Pagina>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/ingresar" element={<Login />} />
      <Route element={<Marco />}>
        <Route path="/" element={<Inicio />} />
        <Route path="/catalogo" element={<Rol roles={['ventas']} incluirAdmin={false}><Catalogo /></Rol>} />
        <Route path="/pedidos" element={<Rol roles={['ventas', 'cocina']}><Pedidos /></Rol>} />
        <Route path="/pedidos/nuevo" element={<Rol roles={['ventas']} incluirAdmin={false}><PedidoNuevo /></Rol>} />
        <Route path="/pedidos/:id" element={<Rol roles={['ventas', 'cocina']}><PedidoDetalle /></Rol>} />
        <Route path="/cocina" element={<Rol roles={['cocina']}><Kanban /></Rol>} />
        <Route path="/cocina/manana" element={<Rol roles={['cocina']}><ProduccionManana /></Rol>} />
        <Route path="/bodega" element={<Rol roles={['bodega']}><Bodega /></Rol>} />
        <Route path="/bodega/movimientos" element={<Rol roles={['bodega']}><Movimientos /></Rol>} />
        <Route path="/despachos" element={<Rol roles={['repartidor']} incluirAdmin={false}><Despachos /></Rol>} />
        <Route path="/despachos/entregados" element={<Rol roles={['repartidor']}><Entregados /></Rol>} />
        <Route path="/despachos/:id/entregar" element={<Rol roles={['repartidor']} incluirAdmin={false}><DespachoEntrega /></Rol>} />
        <Route path="*" element={<Pagina titulo="Página no encontrada" subtitulo="La dirección no existe."><div className="vacio"><a className="boton" href="/">Ir al inicio</a></div></Pagina>} />
      </Route>
    </Routes>
  );
}
