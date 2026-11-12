"""
API de PANTALLAS: un endpoint por cada pantalla del frontend en React.

Los endpoints de recursos (/api/pedidos/, /api/insumos/, /api/rutas/...) sirven para
crear, modificar y ejecutar acciones. Estos endpoints, en cambio, entregan de una sola vez
todo lo que una pantalla necesita mostrar (cifras, listas, filtros), con las mismas reglas
que tenía la versión en Django templates. Así React hace una sola petición por pantalla.

Todas exigen el token JWT (cabecera Authorization: Bearer <access>) y validan el rol.
"""

from datetime import timedelta
from decimal import Decimal

from django.core.paginator import Paginator
from django.db.models import F, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from despachos.models import Despacho, Ruta
from inventario.models import Insumo, MovimientoInsumo, OpcionPersonalizacion, Producto
from pedidos.models import Pedido
from pedidos.permisos import rol_principal, roles_de


# ---------------------------------------------------------------
# Permiso por rol (equivale al decorador rol_requerido de la versión web)
# ---------------------------------------------------------------
def RolRequerido(*roles, incluir_admin=True):
    """
    RolRequerido()                       -> cualquier usuario con rol
    RolRequerido('cocina')               -> Cocina y el Administrador
    RolRequerido('ventas', incluir_admin=False) -> solo Atención y Ventas
    """

    class _Permiso(BasePermission):
        message = 'Tu rol no tiene acceso a esta pantalla.'

        def has_permission(self, request, view):
            del_usuario = roles_de(request.user)
            if not del_usuario:
                return False
            if not roles:
                return True
            permitidos = set(roles) | ({'admin'} if incluir_admin else set())
            return bool(del_usuario & permitidos)

    return _Permiso


# ---------------------------------------------------------------
# Ayudantes: convierten modelos en diccionarios (JSON)
# ---------------------------------------------------------------
def url_archivo(request, archivo):
    """URL completa de una imagen. En AWS ya viene completa (S3 a través de la API Gateway)."""
    if not archivo:
        return None
    url = archivo.url
    return url if url.startswith('http') else request.build_absolute_uri(url)


def limite_urgente():
    """Un pedido es urgente si se entrega en menos de 3 horas."""
    return timezone.now() + timedelta(hours=3)


def pedido_resumen(pedido, urgente_antes=None):
    urgente_antes = urgente_antes or limite_urgente()
    return {
        'id': pedido.pk,
        'cliente_nombre': pedido.cliente.nombre,
        'cliente_telefono': pedido.cliente.telefono,
        'estado': pedido.estado,
        'estado_display': pedido.get_estado_display(),
        'tipo_entrega': pedido.tipo_entrega,
        'tipo_entrega_display': pedido.get_tipo_entrega_display(),
        'fecha_entrega': pedido.fecha_entrega,
        'direccion_entrega': pedido.direccion_entrega,
        'diseno': pedido.diseno,
        'total': pedido.total,
        'productos': [
            {'cantidad': d.cantidad, 'nombre': d.producto.nombre} for d in pedido.detalles.all()
        ],
        'urgente': pedido.fecha_entrega <= urgente_antes
        and pedido.estado not in (Pedido.Estado.ENTREGADO, Pedido.Estado.CANCELADO),
    }


def insumo_resumen(request, insumo):
    # Barra de stock: la escala es 3 veces el mínimo (o el stock actual, si es mayor).
    escala = max(insumo.stock_minimo * 3, insumo.stock_actual, 1)
    return {
        'id': insumo.pk,
        'nombre': insumo.nombre,
        'unidad': insumo.unidad,
        'stock_actual': insumo.stock_actual,
        'stock_minimo': insumo.stock_minimo,
        'stock_bajo': insumo.stock_bajo,
        'imagen': url_archivo(request, insumo.imagen),
        'porcentaje_barra': round(insumo.stock_actual / escala * 100),
        'porcentaje_minimo': round(insumo.stock_minimo / escala * 100),
    }


def movimiento_resumen(mov):
    return {
        'id': mov.pk,
        'insumo': mov.insumo_id,
        'insumo_nombre': mov.insumo.nombre,
        'unidad': mov.insumo.unidad,
        'tipo': mov.tipo,
        'tipo_display': mov.get_tipo_display(),
        'suma': mov.tipo in (MovimientoInsumo.Tipo.ENTRADA, MovimientoInsumo.Tipo.DEVOLUCION),
        'cantidad': mov.cantidad,
        'motivo': mov.motivo,
        'pedido': mov.pedido_id,
        'usuario_nombre': mov.usuario.username if mov.usuario else None,
        'fecha': mov.fecha,
    }


def despacho_resumen(request, despacho, con_productos=False):
    pedido = despacho.pedido
    datos = {
        'id': despacho.pk,
        'pedido': pedido.pk,
        'cliente_nombre': pedido.cliente.nombre,
        'cliente_telefono': pedido.cliente.telefono,
        'direccion_entrega': pedido.direccion_entrega,
        'fecha_entrega_programada': pedido.fecha_entrega,
        'total': pedido.total,
        'ruta': despacho.ruta_id,
        'ruta_nombre': despacho.ruta.nombre if despacho.ruta_id else None,
        'orden': despacho.orden,
        'estado': despacho.estado,
        'estado_display': despacho.get_estado_display(),
        'nombre_receptor': despacho.nombre_receptor,
        'firma': url_archivo(request, despacho.firma),
        'comprobante': url_archivo(request, despacho.comprobante),
        'fecha_entrega_real': despacho.fecha_entrega_real,
        'observaciones': despacho.observaciones,
    }
    if con_productos:
        datos['productos'] = [
            {'cantidad': d.cantidad, 'nombre': d.producto.nombre} for d in pedido.detalles.all()
        ]
    return datos


def ruta_completa(request, ruta, paradas, con_productos=False):
    """Hoja de ruta: paradas en orden, avance y cuál es la siguiente parada."""
    total = len(paradas)
    entregados = sum(1 for d in paradas if d.estado == Despacho.Estado.ENTREGADO)
    pendientes = [d for d in paradas if d.estado != Despacho.Estado.ENTREGADO]
    responsable = ruta.responsable
    return {
        'id': ruta.pk,
        'nombre': ruta.nombre,
        'fecha': ruta.fecha,
        'estado': ruta.estado,
        'estado_display': ruta.get_estado_display(),
        'responsable_nombre': (responsable.get_full_name() or responsable.username) if responsable else None,
        'total': total,
        'entregados': entregados,
        'faltan': total - entregados,
        'porcentaje': round(entregados / total * 100) if total else 0,
        'completa': total > 0 and not pendientes,
        'siguiente_id': pendientes[0].pk if pendientes else None,
        'paradas': [despacho_resumen(request, d, con_productos) for d in paradas],
    }


# ---------------------------------------------------------------
# INICIO: cada rol tiene su propio inicio
# ---------------------------------------------------------------
@extend_schema(responses=OpenApiTypes.OBJECT, tags=['pantallas'])
@api_view(['GET'])
@permission_classes([RolRequerido()])
def inicio(request):
    rol = rol_principal(request.user)
    if rol == 'cocina':
        datos = _inicio_cocina()
    elif rol == 'bodega':
        datos = _inicio_bodega(request)
    elif rol == 'repartidor':
        datos = _inicio_repartidor(request)
    else:
        datos = _inicio_general(request, rol)
    return Response({'rol': rol, **datos})


def _inicio_general(request, rol):
    """Inicio de Atención y Ventas y del Administrador."""
    hoy = timezone.localdate()
    urgente = limite_urgente()
    activos = Pedido.objects.exclude(
        estado__in=[Pedido.Estado.ENTREGADO, Pedido.Estado.CANCELADO]
    ).select_related('cliente').prefetch_related('detalles__producto')
    proximas = activos.exclude(estado=Pedido.Estado.COTIZACION).order_by('fecha_entrega')
    datos = {
        'cotizaciones': activos.filter(estado=Pedido.Estado.COTIZACION).count(),
        'en_cocina': activos.filter(estado__in=Pedido.ESTADOS_KANBAN).exclude(
            estado=Pedido.Estado.LISTO
        ).count(),
        'listos': activos.filter(estado=Pedido.Estado.LISTO).count(),
        'entregas_hoy': activos.filter(fecha_entrega__date=hoy).exclude(
            estado=Pedido.Estado.COTIZACION
        ).count(),
        # Todas las entregas pendientes: la columna muestra 3 y la ventana "Próximas entregas", todas
        'entregas_proximas': [pedido_resumen(p, urgente) for p in proximas],
    }
    if rol == 'admin':
        datos['insumos_bajos'] = [
            insumo_resumen(request, i)
            for i in Insumo.objects.filter(activo=True, stock_actual__lte=F('stock_minimo')).order_by('nombre')
        ]
    return datos


def _inicio_cocina():
    ahora = timezone.localtime()
    urgente = limite_urgente()
    en_cocina = Pedido.objects.filter(estado__in=Pedido.ESTADOS_KANBAN).select_related(
        'cliente'
    ).prefetch_related('detalles__producto')
    conteo = {estado: 0 for estado in Pedido.ESTADOS_KANBAN}
    for pedido in en_cocina:
        conteo[pedido.estado] += 1
    return {
        # Urgentes: aún no están listos y se entregan en menos de 3 horas
        'urgentes': [
            pedido_resumen(p, urgente)
            for p in en_cocina.exclude(estado=Pedido.Estado.LISTO).filter(
                fecha_entrega__lte=urgente
            ).order_by('fecha_entrega')
        ],
        'etapas': [
            {'estado': e, 'titulo': Pedido.Estado(e).label, 'cantidad': conteo[e]}
            for e in Pedido.ESTADOS_KANBAN
        ],
        'para_manana': en_cocina.filter(fecha_entrega__date=ahora.date() + timedelta(days=1)).count(),
    }


def _inicio_bodega(request):
    hoy = timezone.localdate()
    activos = Insumo.objects.filter(activo=True)
    # Reponer pronto: bajo el mínimo o a menos de un 25 % por sobre él
    reponer = [i for i in activos.order_by('nombre') if i.stock_actual <= i.stock_minimo * Decimal('1.25')]
    reponer.sort(key=lambda i: (not i.stock_bajo, i.nombre))
    movimientos_hoy = MovimientoInsumo.objects.filter(fecha__date=hoy)
    return {
        'reponer': [insumo_resumen(request, i) for i in reponer],
        'bajo_minimo': sum(1 for i in reponer if i.stock_bajo),
        'insumos_activos': activos.count(),
        'movimientos_hoy': movimientos_hoy.count(),
        'pedidos_hoy': movimientos_hoy.filter(pedido__isnull=False).values('pedido').distinct().count(),
    }


def ruta_del_dia():
    """La ruta en curso o, si no hay, la próxima planificada (de hoy o atrasada)."""
    hoy = timezone.localdate()
    abiertas = Ruta.objects.filter(fecha__lte=hoy).exclude(estado=Ruta.Estado.FINALIZADA)
    return (
        abiertas.filter(estado=Ruta.Estado.EN_CURSO).order_by('fecha').first()
        or abiertas.filter(estado=Ruta.Estado.PLANIFICADA).order_by('fecha').first()
    )


def _inicio_repartidor(request):
    hoy = timezone.localdate()
    ruta = ruta_del_dia()
    datos_ruta = None
    if ruta:
        paradas = list(
            ruta.despachos.select_related('pedido__cliente', 'ruta')
            .prefetch_related('pedido__detalles__producto')
            .order_by('orden')
        )
        datos_ruta = ruta_completa(request, ruta, paradas, con_productos=True)
    return {
        'ruta': datos_ruta,
        'por_asignar': Despacho.objects.filter(ruta__isnull=True).exclude(
            estado=Despacho.Estado.ENTREGADO
        ).count(),
        'entregados_hoy': Despacho.objects.filter(
            estado=Despacho.Estado.ENTREGADO, fecha_entrega_real__date=hoy
        ).count(),
        'rutas_abiertas': Ruta.objects.exclude(estado=Ruta.Estado.FINALIZADA).count(),
    }


# ---------------------------------------------------------------
# PEDIDOS (Ventas y Cocina; el Administrador mira)
# ---------------------------------------------------------------
FILTROS_ESTADO = [
    ('activos', 'Activos'),
    ('cotizacion', 'Cotizaciones'),
    ('cocina', 'En cocina'),
    ('listo', 'Listos'),
    ('en_despacho', 'En despacho'),
    ('entregado', 'Entregados'),
    ('cancelado', 'Cancelados'),
]


def _pagina(lista, request, por_pagina):
    pagina = Paginator(lista, por_pagina).get_page(request.query_params.get('pagina'))
    return pagina, {
        'pagina': pagina.number,
        'total_paginas': pagina.paginator.num_pages,
        'total': pagina.paginator.count,
    }


@extend_schema(responses=OpenApiTypes.OBJECT, tags=['pantallas'])
@api_view(['GET'])
@permission_classes([RolRequerido('ventas', 'cocina')])
def pedidos(request):
    """?estado=activos|cotizacion|cocina|listo|en_despacho|entregado|cancelado  ?q=texto  ?pagina=2"""
    filtro = request.query_params.get('estado', 'activos')
    texto = request.query_params.get('q', '').strip()

    lista = Pedido.objects.select_related('cliente').prefetch_related('detalles__producto')
    if filtro == 'activos':
        lista = lista.exclude(estado__in=[Pedido.Estado.ENTREGADO, Pedido.Estado.CANCELADO])
    elif filtro == 'cocina':
        lista = lista.filter(estado__in=Pedido.ESTADOS_KANBAN).exclude(estado=Pedido.Estado.LISTO)
    elif filtro in Pedido.Estado.values:
        lista = lista.filter(estado=filtro)

    if texto:
        condicion = Q(cliente__nombre__icontains=texto) | Q(cliente__telefono__icontains=texto)
        if texto.lstrip('#').isdigit():
            condicion |= Q(pk=int(texto.lstrip('#')))
        lista = lista.filter(condicion)

    orden = '-fecha_entrega' if filtro in ('entregado', 'cancelado') else 'fecha_entrega'
    pagina, info = _pagina(lista.order_by(orden), request, 24)
    urgente = limite_urgente()
    return Response({
        'filtros': [{'valor': v, 'texto': t} for v, t in FILTROS_ESTADO],
        'filtro_actual': filtro,
        'q': texto,
        **info,
        'resultados': [pedido_resumen(p, urgente) for p in pagina],
    })


@extend_schema(responses=OpenApiTypes.OBJECT, tags=['pantallas'])
@api_view(['GET'])
@permission_classes([RolRequerido('cocina')])
def produccion_manana(request):
    """Lo que hay que preparar para mañana: resumen por producto y las comandas."""
    manana = timezone.localdate() + timedelta(days=1)
    lista = Pedido.objects.filter(
        fecha_entrega__date=manana, estado__in=Pedido.ESTADOS_KANBAN
    ).select_related('cliente').prefetch_related(
        'detalles__producto', 'detalles__personalizaciones__opcion'
    ).order_by('fecha_entrega')
    resumen = {}
    comandas = []
    urgente = limite_urgente()
    for pedido in lista:
        datos = pedido_resumen(pedido, urgente)
        # La comanda de cocina lleva el detalle completo: extras, comentarios y precios
        datos['detalles'] = [
            {
                'cantidad': d.cantidad,
                'producto': d.producto.nombre,
                'precio_unitario': d.precio_unitario,
                'subtotal': d.subtotal,
                'comentario': d.comentario,
                'personalizaciones': [
                    {'nombre': p.opcion.nombre, 'porciones': p.porciones, 'precio': p.precio_adicional}
                    for p in d.personalizaciones.all()
                ],
            }
            for d in pedido.detalles.all()
        ]
        datos['observaciones'] = pedido.observaciones
        comandas.append(datos)
        for detalle in pedido.detalles.all():
            resumen[detalle.producto.nombre] = resumen.get(detalle.producto.nombre, 0) + detalle.cantidad
    return Response({
        'manana': manana,
        'resumen': [
            {'producto': nombre, 'cantidad': cantidad}
            for nombre, cantidad in sorted(resumen.items(), key=lambda par: (-par[1], par[0]))
        ],
        'pedidos': comandas,
    })


# ---------------------------------------------------------------
# CATÁLOGO y COTIZADOR (solo Atención y Ventas)
# ---------------------------------------------------------------
@extend_schema(responses=OpenApiTypes.OBJECT, tags=['pantallas'])
@api_view(['GET'])
@permission_classes([RolRequerido('ventas', incluir_admin=False)])
def catalogo(request):
    """?categoria=tortas  Productos disponibles con su receta y sus extras."""
    categoria = request.query_params.get('categoria', '')
    productos = (
        Producto.objects.filter(activo=True)
        .prefetch_related('receta__insumo', 'opciones')
        .order_by('categoria', 'nombre')
    )
    if categoria in Producto.Categoria.values:
        productos = productos.filter(categoria=categoria)
    con_productos = set(Producto.objects.filter(activo=True).values_list('categoria', flat=True))
    return Response({
        'categorias': [
            {'valor': v, 'texto': t} for v, t in Producto.Categoria.choices if v in con_productos
        ],
        'categoria_actual': categoria,
        'productos': [
            {
                'id': p.pk,
                'nombre': p.nombre,
                'categoria': p.categoria,
                'categoria_display': p.get_categoria_display(),
                'descripcion': p.descripcion,
                'precio_base': p.precio_base,
                'tiempo_preparacion': p.tiempo_preparacion,
                'tiempo_legible': p.tiempo_legible,
                'imagen': url_archivo(request, p.imagen),
                'ingredientes': [item.insumo.nombre for item in p.receta.all()],
                'extras': [
                    {'id': o.pk, 'nombre': o.nombre, 'precio_por_porcion': o.precio_por_porcion}
                    for o in p.opciones.all() if o.activo
                ],
            }
            for p in productos
        ],
    })


@extend_schema(responses=OpenApiTypes.OBJECT, tags=['pantallas'])
@api_view(['GET'])
@permission_classes([RolRequerido('ventas', incluir_admin=False)])
def cotizador(request):
    """Datos para armar una nueva cotización: productos, extras y la fecha mínima de entrega."""
    productos = Producto.objects.filter(activo=True).prefetch_related('opciones').order_by('categoria', 'nombre')
    opciones = OpcionPersonalizacion.objects.filter(activo=True).order_by('nombre')
    fecha_minima = timezone.localtime() + Pedido.ANTICIPACION_MINIMA + timedelta(minutes=5)
    return Response({
        'productos': [
            {
                'id': p.pk,
                'nombre': p.nombre,
                'categoria': p.get_categoria_display(),
                'precio': p.precio_base,
                'imagen': url_archivo(request, p.imagen),
                'opciones': [o.pk for o in p.opciones.all() if o.activo],
            }
            for p in productos
        ],
        'opciones': [{'id': o.pk, 'nombre': o.nombre, 'precio': o.precio_por_porcion} for o in opciones],
        'fecha_minima': fecha_minima.strftime('%Y-%m-%dT%H:%M'),
    })


# ---------------------------------------------------------------
# BODEGA (Bodega; el Administrador mira)
# ---------------------------------------------------------------
@extend_schema(responses=OpenApiTypes.OBJECT, tags=['pantallas'])
@api_view(['GET'])
@permission_classes([RolRequerido('bodega')])
def bodega(request):
    """?stock=bajo  Inventario con barras de stock y los últimos movimientos."""
    solo_bajo = request.query_params.get('stock') == 'bajo'
    insumos = Insumo.objects.filter(activo=True).order_by('nombre')
    if solo_bajo:
        insumos = insumos.filter(stock_actual__lte=F('stock_minimo'))
    return Response({
        'solo_bajo': solo_bajo,
        'total_bajo': Insumo.objects.filter(activo=True, stock_actual__lte=F('stock_minimo')).count(),
        'insumos': [insumo_resumen(request, i) for i in insumos],
        'movimientos': [
            movimiento_resumen(m)
            for m in MovimientoInsumo.objects.select_related('insumo', 'usuario').order_by('-fecha')[:8]
        ],
        # El Administrador ve el inventario, pero no registra movimientos
        'solo_lectura': rol_principal(request.user) == 'admin',
    })


FILTROS_MOVIMIENTO = [
    ('todos', 'Todos'),
    ('entrada', 'Entradas'),
    ('ajuste', 'Mermas'),
    ('salida', 'Consumo por pedidos'),
    ('devolucion', 'Devoluciones'),
]
PERIODOS = [('hoy', 'Hoy'), ('semana', 'Últimos 7 días'), ('todo', 'Todo')]


@extend_schema(responses=OpenApiTypes.OBJECT, tags=['pantallas'])
@api_view(['GET'])
@permission_classes([RolRequerido('bodega')])
def movimientos(request):
    """?tipo=entrada|ajuste|salida|devolucion  ?periodo=hoy|semana|todo  ?pagina=2"""
    tipo = request.query_params.get('tipo', 'todos')
    periodo = request.query_params.get('periodo', 'semana')
    lista = MovimientoInsumo.objects.select_related('insumo', 'usuario').order_by('-fecha')
    if tipo in MovimientoInsumo.Tipo.values:
        lista = lista.filter(tipo=tipo)
    hoy = timezone.localdate()
    if periodo == 'hoy':
        lista = lista.filter(fecha__date=hoy)
    elif periodo == 'semana':
        lista = lista.filter(fecha__date__gte=hoy - timedelta(days=6))
    pagina, info = _pagina(lista, request, 30)
    return Response({
        'filtros_tipo': [{'valor': v, 'texto': t} for v, t in FILTROS_MOVIMIENTO],
        'periodos': [{'valor': v, 'texto': t} for v, t in PERIODOS],
        'tipo': tipo,
        'periodo': periodo,
        **info,
        'resultados': [movimiento_resumen(m) for m in pagina],
    })


# ---------------------------------------------------------------
# DESPACHOS (Repartidor; el Administrador ve "Entregados")
# ---------------------------------------------------------------
FILTROS_DIA = [('hoy', 'Hoy'), ('manana', 'Mañana'), ('todas', 'Todas')]
PASOS = [(1, 'Asignar a una ruta'), (2, 'Iniciar ruta'), (3, 'Entregar con firma'), (4, 'Finalizar ruta')]


@extend_schema(responses=OpenApiTypes.OBJECT, tags=['pantallas'])
@api_view(['GET'])
@permission_classes([RolRequerido('repartidor', incluir_admin=False)])
def despachos(request):
    """
    Tablero de reparto: Por asignar | Rutas | Entregados hoy.
    ?dia=hoy (incluye lo atrasado) | manana | todas
    """
    hoy = timezone.localdate()
    manana = hoy + timedelta(days=1)
    dia = request.query_params.get('dia', 'hoy')
    if dia not in dict(FILTROS_DIA):
        dia = 'hoy'

    sin_ruta = Despacho.objects.filter(ruta__isnull=True).exclude(
        estado=Despacho.Estado.ENTREGADO
    ).select_related('pedido__cliente', 'ruta').order_by('pedido__fecha_entrega')
    rutas = Ruta.objects.exclude(estado=Ruta.Estado.FINALIZADA).select_related(
        'responsable'
    ).prefetch_related('despachos__pedido__cliente', 'despachos__ruta').order_by('fecha', 'nombre')
    # Al asignar se puede elegir cualquier ruta abierta (aunque no sea del día filtrado)
    rutas_asignables = [{'id': r.pk, 'nombre': r.nombre, 'fecha': r.fecha} for r in rutas]

    if dia == 'hoy':
        sin_ruta = sin_ruta.filter(pedido__fecha_entrega__date__lte=hoy)
        rutas = rutas.filter(fecha__lte=hoy)
    elif dia == 'manana':
        sin_ruta = sin_ruta.filter(pedido__fecha_entrega__date=manana)
        rutas = rutas.filter(fecha=manana)

    hojas = [ruta_completa(request, r, sorted(r.despachos.all(), key=lambda d: d.orden)) for r in rutas]
    sin_ruta = [despacho_resumen(request, d) for d in sin_ruta]

    # Paso de la guía que corresponde ahora (1 asignar, 2 iniciar, 3 entregar, 4 finalizar)
    if any(h['estado'] == Ruta.Estado.EN_CURSO and h['faltan'] for h in hojas):
        paso = 3
    elif any(h['estado'] == Ruta.Estado.EN_CURSO and h['completa'] for h in hojas):
        paso = 4
    elif any(h['estado'] == Ruta.Estado.PLANIFICADA and h['total'] for h in hojas):
        paso = 2
    elif sin_ruta:
        paso = 1
    else:
        paso = 0   # todo al día

    entregados_hoy = Despacho.objects.filter(
        estado=Despacho.Estado.ENTREGADO, fecha_entrega_real__date=hoy
    ).select_related('pedido__cliente', 'ruta').order_by('-fecha_entrega_real')
    return Response({
        'hoy': hoy,
        'dia': dia,
        'filtros_dia': [{'valor': v, 'texto': t} for v, t in FILTROS_DIA],
        'paso': paso,
        'pasos': [{'numero': n, 'texto': t} for n, t in PASOS],
        'sin_ruta': sin_ruta,
        'rutas': hojas,
        'rutas_asignables': rutas_asignables,
        'entregados_hoy': [despacho_resumen(request, d) for d in entregados_hoy],
    })


@extend_schema(responses=OpenApiTypes.OBJECT, tags=['pantallas'], operation_id='pantalla_despacho_entrega')
@api_view(['GET'])
@permission_classes([RolRequerido('repartidor', incluir_admin=False)])
def despacho_entrega(request, pk):
    """Pantalla de entrega con firma: datos del despacho, productos y estado."""
    despacho = get_object_or_404(
        Despacho.objects.select_related('pedido__cliente', 'ruta').prefetch_related(
            'pedido__detalles__producto'
        ),
        pk=pk,
    )
    return Response(despacho_resumen(request, despacho, con_productos=True))


@extend_schema(responses=OpenApiTypes.OBJECT, tags=['pantallas'])
@api_view(['GET'])
@permission_classes([RolRequerido('repartidor')])
def entregados(request):
    """?periodo=hoy|semana|todo  Historial de entregas con quién recibió y la evidencia."""
    periodo = request.query_params.get('periodo', 'hoy')
    hoy = timezone.localdate()
    lista = Despacho.objects.filter(estado=Despacho.Estado.ENTREGADO).select_related(
        'pedido__cliente', 'ruta__responsable'
    ).prefetch_related('pedido__detalles__producto').order_by('-fecha_entrega_real')
    if periodo == 'hoy':
        lista = lista.filter(fecha_entrega_real__date=hoy)
    elif periodo == 'semana':
        lista = lista.filter(fecha_entrega_real__date__gte=hoy - timedelta(days=6))
    entregas = []
    for despacho in lista[:100]:
        datos = despacho_resumen(request, despacho, con_productos=True)
        responsable = despacho.ruta.responsable if despacho.ruta_id else None
        datos['repartidor'] = (responsable.get_full_name() or responsable.username) if responsable else None
        # ¿Se entregó a la hora? (margen de 15 minutos)
        datos['atraso'] = despacho.fecha_entrega_real > despacho.pedido.fecha_entrega + timedelta(minutes=15)
        entregas.append(datos)
    return Response({
        'periodo': periodo,
        'periodos': [{'valor': v, 'texto': t} for v, t in PERIODOS],
        'entregas': entregas,
    })
