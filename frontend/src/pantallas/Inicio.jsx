/*
 * Inicio: cada rol ve su propio inicio (datos de GET /api/pantallas/inicio/).
 *   Ventas y Administrador -> próximas entregas, menú y cifras
 *   Cocina                 -> urgentes, menú y pedidos por etapa
 *   Bodega                 -> insumos por reponer, menú y resumen
 *   Repartidor             -> ruta del día con la siguiente parada y el mapa
 */
import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';

import { Comanda, Foto, Icono, Mapa, Sello } from '../componentes/Comanda.jsx';
import Pagina, { Cargando, useAvisos } from '../componentes/Pagina.jsx';
import Ventana from '../componentes/Ventana.jsx';
import { cambiarEstadoRuta } from '../rutas.js';
import { useSesion } from '../sesion.jsx';
import { useDatos } from '../useDatos.js';
import { cantidad, fechaLarga, hora, plural } from '../util.js';

export default function Inicio() {
  const { usuario } = useSesion();
  const { datos, error, recargar } = useDatos('/api/pantallas/inicio/');
  const hola = `Hola, ${usuario.nombre}`;
  const hoy = fechaLarga();
  const capital = hoy[0].toUpperCase() + hoy.slice(1);

  if (!datos) return <Pagina titulo={hola} subtitulo={capital}><Cargando error={error} /></Pagina>;
  if (datos.rol === 'cocina') return <InicioCocina d={datos} hola={hola} hoy={capital} />;
  if (datos.rol === 'bodega') return <InicioBodega d={datos} hola={hola} hoy={capital} />;
  if (datos.rol === 'repartidor') return <InicioRepartidor d={datos} hola={hola} hoy={capital} recargar={recargar} />;
  return <InicioGeneral d={datos} hola={hola} hoy={capital} />;
}

function Acceso({ a, icono, texto, onClick }) {
  if (onClick) {
    return <button className="acceso-rapido" type="button" onClick={onClick}><Icono nombre={icono} /><span>{texto}</span></button>;
  }
  return <Link className="acceso-rapido" to={a}><Icono nombre={icono} /><span>{texto}</span></Link>;
}

function Cifra({ a, valor, texto, alerta = false, children }) {
  const clase = `cifra${alerta ? ' cifra--alerta' : ''}`;
  const contenido = <>{children}<strong>{valor}</strong><span>{texto}</span></>;
  return a ? <Link className={clase} to={a}>{contenido}</Link> : <div className={clase}>{contenido}</div>;
}

/* ---------------- Ventas y Administrador ---------------- */
function InicioGeneral({ d, hola, hoy }) {
  const { abrirAdmin } = useOutletContext();
  const [ventana, setVentana] = useState(false);
  const esAdmin = d.rol === 'admin';
  const esVentas = d.rol === 'ventas';
  const entregas = d.entregas_proximas;
  return (
    <Pagina titulo={hola} subtitulo={`${hoy}. Esto es lo que está pasando en la pastelería.`} clase="pagina--ancha"
      opciones={esVentas && <div className="banner__opciones"><Link className="boton" to="/pedidos/nuevo">Crear cotización</Link></div>}>
      <div className="inicio">
        <section className="inicio__entregas" aria-labelledby="t-proximas">
          <h2 id="t-proximas" className="inicio__titulo">Próximas entregas</h2>
          <div className="marco">
            {entregas.slice(0, 3).map((p) => <Comanda key={p.id} pedido={p} />)}
            {!entregas.length && <p className="marco__vacio">No hay entregas pendientes. Las cotizaciones confirmadas aparecerán aquí.</p>}
            {entregas.length > 3 && (
              <button className="boton boton--secundario ancho-completo" type="button" onClick={() => setVentana(true)}>
                Ver las {entregas.length} entregas
              </button>
            )}
          </div>
        </section>

        <section className="inicio__menu" aria-labelledby="t-menu">
          <h2 id="t-menu" className="oculto-visual">Acceso rápido</h2>
          {esAdmin && d.insumos_bajos.length > 0 && (
            <div className="mensaje mensaje--warning espacio-abajo" role="status">
              Reponer pronto: {d.insumos_bajos.map((i) => `${i.nombre} (quedan ${cantidad(i.stock_actual)} ${i.unidad})`).join(', ')}.
            </div>
          )}
          <nav className="accesos" aria-label="Acceso rápido">
            {esVentas && <Acceso a="/catalogo" icono="catalogo" texto="Catálogo" />}
            <Acceso a="/pedidos" icono="pedidos" texto="Pedidos" />
            <Acceso icono="entregas" texto="Próximas entregas" onClick={() => setVentana(true)} />
            {esVentas && <Acceso a="/pedidos/nuevo" icono="cotizacion" texto="Nueva cotización" />}
            {esAdmin && (
              <>
                <Acceso a="/cocina" icono="cocina" texto="Cocina" />
                <Acceso a="/bodega" icono="bodega" texto="Bodega" />
                <Acceso a="/despachos/entregados" icono="despachos" texto="Despachos" />
                <Acceso icono="administracion" texto="Administración" onClick={abrirAdmin} />
              </>
            )}
          </nav>
        </section>

        <section className="inicio__cifras" aria-label="Resumen del día">
          <div className="marco">
            <Cifra a="/pedidos?estado=cotizacion" valor={d.cotizaciones} texto="cotizaciones por confirmar" />
            <Cifra a="/pedidos?estado=cocina" valor={d.en_cocina} texto="pedidos en cocina" />
            <Cifra a="/pedidos?estado=listo" valor={d.listos} texto="listos para entregar" />
            <Cifra valor={d.entregas_hoy} texto="entregas programadas hoy" />
            {esAdmin && (
              <Cifra a="/bodega?stock=bajo" valor={d.insumos_bajos.length} texto="insumos con stock bajo" alerta={d.insumos_bajos.length > 0} />
            )}
          </div>
        </section>
      </div>

      <Ventana abierta={ventana} alCerrar={() => setVentana(false)} ancha etiqueta="ve-titulo">
        <div className="ventana__cabecera">
          <h2 id="ve-titulo">Próximas entregas ({entregas.length})</h2>
          <button className="ventana__cerrar" type="button" aria-label="Cerrar" onClick={() => setVentana(false)}>×</button>
        </div>
        {entregas.length
          ? <div className="comandas">{entregas.map((p) => <Comanda key={p.id} pedido={p} />)}</div>
          : <p className="ventana__detalle">No hay entregas pendientes.</p>}
      </Ventana>
    </Pagina>
  );
}

/* ---------------- Cocina ---------------- */
function InicioCocina({ d, hola, hoy }) {
  return (
    <Pagina titulo={hola} subtitulo={`${hoy}. Esto es lo que hay en la cocina.`} clase="pagina--ancha"
      opciones={<div className="banner__opciones"><Link className="boton" to="/cocina">Abrir tablero de cocina</Link></div>}>
      <div className="inicio">
        <section className="inicio__entregas" aria-labelledby="t-urgentes">
          <h2 id="t-urgentes" className="inicio__titulo">Urgentes (menos de 3 h)</h2>
          <div className="marco">
            {d.urgentes.map((p) => <Comanda key={p.id} pedido={p} />)}
            {!d.urgentes.length && <p className="marco__vacio">No hay pedidos urgentes. ¡Vamos bien!</p>}
          </div>
        </section>
        <section className="inicio__menu" aria-labelledby="t-menu">
          <h2 id="t-menu" className="oculto-visual">Acceso rápido</h2>
          <nav className="accesos" aria-label="Acceso rápido">
            <Acceso a="/cocina" icono="tablero" texto="Tablero de cocina" />
            <Acceso a="/pedidos?estado=cocina" icono="pedidos" texto="Pedidos en cocina" />
            <Acceso a="/cocina/manana" icono="manana" texto="Producción de mañana" />
            <Acceso a="/cocina?etapa=control_calidad" icono="calidad" texto="Control de calidad" />
          </nav>
        </section>
        <section className="inicio__cifras" aria-label="Pedidos por etapa">
          <div className="marco">
            {d.etapas.map((e) => (
              <Link key={e.estado} className="cifra cifra--etapa" to={`/cocina?etapa=${e.estado}`}>
                <Sello estado={e.estado} />
                <strong>{e.cantidad}</strong><span>{e.titulo.toLowerCase()}</span>
              </Link>
            ))}
            <Cifra a="/cocina/manana" valor={d.para_manana} texto="para mañana" />
          </div>
        </section>
      </div>
    </Pagina>
  );
}

/* ---------------- Bodega ---------------- */
function InicioBodega({ d, hola, hoy }) {
  return (
    <Pagina titulo={hola} subtitulo={`${hoy}. Así está la bodega.`} clase="pagina--ancha"
      opciones={<div className="banner__opciones"><Link className="boton" to="/bodega?accion=entrada">Registrar entrada</Link></div>}>
      <div className="inicio">
        <section className="inicio__entregas" aria-labelledby="t-reponer">
          <h2 id="t-reponer" className="inicio__titulo">Reponer pronto</h2>
          <div className="marco">
            {d.reponer.map((i) => (
              <Link key={i.id} className={`aviso-insumo${i.stock_bajo ? ' aviso-insumo--bajo' : ''}`} to={`/bodega#insumo-${i.id}`}>
                <Foto src={i.imagen} nombre={i.nombre} clase="aviso-insumo__foto" />
                <span className="aviso-insumo__datos">
                  <strong>{i.nombre}</strong>
                  <span>Quedan {cantidad(i.stock_actual)} {i.unidad}</span>
                  <span className="nota">Mínimo {cantidad(i.stock_minimo)} {i.unidad}</span>
                </span>
                <span className={`etiqueta-reponer${i.stock_bajo ? '' : ' etiqueta-reponer--pronto'}`}>{i.stock_bajo ? 'Reponer' : 'Pronto'}</span>
              </Link>
            ))}
            {!d.reponer.length && <p className="marco__vacio">Todo el inventario está sobre el mínimo.</p>}
          </div>
        </section>
        <section className="inicio__menu" aria-labelledby="t-menu">
          <h2 id="t-menu" className="oculto-visual">Acceso rápido</h2>
          <nav className="accesos" aria-label="Acceso rápido">
            <Acceso a="/bodega" icono="bodega" texto="Inventario" />
            <Acceso a="/bodega?accion=entrada" icono="entrada" texto="Registrar entrada" />
            <Acceso a="/bodega?accion=ajuste" icono="merma" texto="Registrar merma" />
            <Acceso a="/bodega/movimientos" icono="movimientos" texto="Movimientos" />
          </nav>
        </section>
        <section className="inicio__cifras" aria-label="Resumen de bodega">
          <div className="marco">
            <Cifra a="/bodega?stock=bajo" valor={d.bajo_minimo} texto="bajo el mínimo" alerta={d.bajo_minimo > 0} />
            <Cifra a="/bodega" valor={d.insumos_activos} texto="insumos activos" />
            <Cifra a="/bodega/movimientos?periodo=hoy" valor={d.movimientos_hoy} texto="movimientos hoy" />
            <Cifra a="/bodega/movimientos?periodo=hoy&tipo=salida" valor={d.pedidos_hoy} texto="pedidos que descontaron stock hoy" />
          </div>
        </section>
      </div>
    </Pagina>
  );
}

/* ---------------- Repartidor ---------------- */
export function BotonRuta({ ruta, recargar, clase = 'boton boton--grande' }) {
  const avisar = useAvisos();
  const [ocupado, setOcupado] = useState(false);
  let estado = null;
  let texto = '';
  if (ruta.estado === 'planificada' && ruta.total) { estado = 'en_curso'; texto = 'Iniciar ruta'; }
  else if (ruta.completa && ruta.estado === 'en_curso') { estado = 'finalizada'; texto = 'Finalizar ruta'; }
  if (!estado) return null;
  async function cambiar() {
    setOcupado(true);
    const { ok, mensaje } = await cambiarEstadoRuta(ruta.id, estado);
    setOcupado(false);
    avisar(mensaje, ok ? 'success' : 'error');
    if (ok) recargar();
  }
  return <button className={clase} type="button" disabled={ocupado} onClick={cambiar}>{texto}</button>;
}

function InicioRepartidor({ d, hola, hoy, recargar }) {
  const ruta = d.ruta;
  const siguiente = ruta && ruta.estado === 'en_curso' ? ruta.paradas.find((p) => p.id === ruta.siguiente_id) : null;
  const subtitulo = ruta ? `${ruta.nombre} · ${ruta.entregados} de ${ruta.total} entregado${plural(ruta.total)}` : hoy;
  return (
    <Pagina titulo={hola} subtitulo={subtitulo}>
      <div className="reparto-inicio">
        <section className="reparto-inicio__ruta" aria-labelledby="t-mi-ruta">
          <h2 id="t-mi-ruta" className="inicio__titulo">Mi ruta de hoy</h2>
          {ruta ? (
            <div className="marco">
              {siguiente && (
                <article className="siguiente-parada" aria-labelledby="t-siguiente">
                  <span className="siguiente-parada__etiqueta">Siguiente parada</span>
                  <h3 id="t-siguiente"><span className="parada-ruta__numero">{siguiente.orden}</span> {siguiente.cliente_nombre}</h3>
                  <p className="siguiente-parada__direccion">{siguiente.direccion_entrega}</p>
                  <p className="nota">Entregar a las {hora(siguiente.fecha_entrega_programada)} · Pedido #{siguiente.pedido}</p>
                  <ul className="siguiente-parada__productos">
                    {siguiente.productos.map((p, i) => <li key={i}>{p.cantidad} × {p.nombre}</li>)}
                  </ul>
                  <Mapa direccion={siguiente.direccion_entrega} />
                  <div className="siguiente-parada__botones">
                    <a className="boton boton--secundario" href={`tel:${siguiente.cliente_telefono.replaceAll(' ', '')}`}>Llamar al cliente</a>
                  </div>
                  <Link className="boton boton--grande" to={`/despachos/${siguiente.id}/entregar`}>Entregar con firma</Link>
                </article>
              )}
              <article className="hoja-ruta" aria-labelledby={`ruta-${ruta.id}`}>
                <header className="hoja-ruta__cabecera">
                  <div>
                    <h3 id={`ruta-${ruta.id}`}>{ruta.nombre}</h3>
                    <span className="nota">{fechaLarga(ruta.fecha)}</span>
                  </div>
                  <span className={`estado estado--${ruta.estado === 'en_curso' ? 'en_preparacion' : 'recibido'}`}>{ruta.estado_display}</span>
                </header>
                {ruta.total ? (
                  <>
                    <div className="hoja-ruta__avance">
                      <span>{ruta.entregados} de {ruta.total} entregado{plural(ruta.total)}</span>
                      <div className="hoja-ruta__barra" role="progressbar" aria-valuemin="0" aria-valuemax={ruta.total}
                           aria-valuenow={ruta.entregados} aria-label="Avance de la ruta">
                        <span style={{ width: `${ruta.porcentaje}%` }} />
                      </div>
                    </div>
                    <ol className="hoja-ruta__paradas">
                      {ruta.paradas.map((p, i) => {
                        const hecha = p.estado === 'entregado';
                        const esSiguiente = siguiente && p.id === siguiente.id;
                        return (
                          <li key={p.id} className={`parada-ruta${hecha ? ' parada-ruta--hecha' : esSiguiente ? ' parada-ruta--siguiente' : ''}`}>
                            <span className="parada-ruta__numero" aria-hidden="true">{hecha ? '✓' : i + 1}</span>
                            <div className="parada-ruta__datos">
                              <strong>{p.cliente_nombre}</strong>
                              <span className="nota">{p.direccion_entrega} · {hora(p.fecha_entrega_programada)}</span>
                            </div>
                            <div className="parada-ruta__accion">
                              {hecha && <span className="nota">Entregado {hora(p.fecha_entrega_real)}</span>}
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </>
                ) : (
                  <p className="nota hoja-ruta__vacia">La ruta aún no tiene paradas. Agrégalas en "Mi ruta".</p>
                )}
                <div className="hoja-ruta__pie"><BotonRuta ruta={ruta} recargar={recargar} /></div>
              </article>
            </div>
          ) : (
            <div className="marco">
              <p className="marco__vacio">No tienes una ruta para hoy. Revisa los pedidos por despachar en "Mi ruta".</p>
              <Link className="boton boton--secundario ancho-completo boton--sobre-marco" to="/despachos">Ir a Mi ruta</Link>
            </div>
          )}
        </section>
        <aside className="reparto-inicio__lateral" aria-label="Accesos y resumen">
          <nav className="accesos accesos--compactos" aria-label="Acceso rápido">
            <Acceso a="/despachos" icono="ruta" texto="Mi ruta" />
            <Acceso a="/despachos/entregados" icono="entregados" texto="Entregados" />
          </nav>
          <div className="marco espacio-arriba">
            <Cifra a="/despachos?dia=todas" valor={d.por_asignar} texto="pedidos sin ruta" />
            <Cifra a="/despachos/entregados" valor={d.entregados_hoy} texto="entregados hoy" />
            <Cifra a="/despachos?dia=todas" valor={d.rutas_abiertas} texto="rutas abiertas" />
          </div>
        </aside>
      </div>
    </Pagina>
  );
}
