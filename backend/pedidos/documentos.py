"""
Comprobante del pedido en PDF (descarga para el cliente).

- Se genera con ReportLab: datos del cliente, entrega, productos con extras, total y,
  si ya se entregó, quién recibió y su firma.
- Cada PDF generado se guarda en Amazon S3, en la carpeta PRIVADA  descargas/pedidos/
  (no es pública porque tiene datos personales del cliente).
- La descarga pasa por la API (con JWT y permisos por rol) a través de la API Gateway:
  GET /api/pedidos/<id>/pdf/
"""

import io
import logging
from pathlib import Path

from django.conf import settings
from django.core.files.storage import default_storage
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

registro = logging.getLogger(__name__)

LOGO = Path(settings.BASE_DIR) / 'recursos' / 'img' / 'logo-dulce-arte.png'
CHOCOLATE = colors.HexColor('#3B2420')
FRAMBUESA = colors.HexColor('#C8456C')
CREMA = colors.HexColor('#FBF0DD')
BORDE = colors.HexColor('#EBDDD3')


def clp(valor):
    return '$' + f'{round(valor):,}'.replace(',', '.')


def _estilos():
    base = getSampleStyleSheet()
    return {
        'titulo': ParagraphStyle('titulo', parent=base['Title'], textColor=CHOCOLATE, fontSize=20, alignment=0, spaceAfter=2),
        'sub': ParagraphStyle('sub', parent=base['Normal'], textColor=colors.HexColor('#6E4F48'), fontSize=9),
        'seccion': ParagraphStyle('seccion', parent=base['Heading3'], textColor=FRAMBUESA, spaceBefore=10, spaceAfter=4),
        'texto': ParagraphStyle('texto', parent=base['Normal'], textColor=CHOCOLATE, fontSize=10, leading=14),
        'nota': ParagraphStyle('nota', parent=base['Normal'], textColor=colors.HexColor('#6E4F48'), fontSize=8.5, leading=11),
        'derecha': ParagraphStyle('derecha', parent=base['Normal'], textColor=CHOCOLATE, fontSize=10, alignment=TA_RIGHT),
    }


def _fecha(valor):
    return timezone.localtime(valor).strftime('%d-%m-%Y %H:%M')


def _texto(valor):
    """Escapa el texto escrito por usuarios antes de ponerlo en el PDF."""
    return (str(valor or '')
            .replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;').replace('\n', '<br/>'))


def generar_comprobante(pedido):
    """Devuelve el PDF del pedido como bytes."""
    e = _estilos()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.6 * cm, bottomMargin=1.6 * cm,
        title=f'Pedido {pedido.pk} - Dulce Arte', author='Dulce Arte',
    )
    partes = []

    # Encabezado: logo y número de pedido
    logo = Image(str(LOGO), width=3.2 * cm, height=2.8 * cm) if LOGO.exists() else Spacer(1, 1)
    cabecera = Table([[logo, [
        Paragraph(f'Comprobante del pedido #{pedido.pk}', e['titulo']),
        Paragraph(f'Estado: <b>{pedido.get_estado_display()}</b> · Registrado el {_fecha(pedido.creado_en)}', e['sub']),
        Paragraph('Dulce Arte · Repostería artesanal', e['sub']),
    ]]], colWidths=[3.8 * cm, None])
    cabecera.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
    partes += [cabecera, Spacer(1, 6)]

    # Cliente y entrega
    cliente = pedido.cliente
    entrega = pedido.get_tipo_entrega_display()
    if pedido.direccion_entrega:
        entrega += f': {_texto(pedido.direccion_entrega)}'
    datos = Table([
        [Paragraph('<b>Cliente</b>', e['texto']), Paragraph(_texto(cliente.nombre), e['texto'])],
        [Paragraph('<b>Contacto</b>', e['texto']),
         Paragraph(_texto(cliente.telefono) + (f', {_texto(cliente.email)}' if cliente.email else ''), e['texto'])],
        [Paragraph('<b>Entrega</b>', e['texto']), Paragraph(f'{_fecha(pedido.fecha_entrega)} · {entrega}', e['texto'])],
    ], colWidths=[3.2 * cm, None])
    datos.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), CREMA), ('BOX', (0, 0), (-1, -1), 0.5, BORDE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'), ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    partes += [Paragraph('Datos del pedido', e['seccion']), datos]

    # Productos
    filas = [[Paragraph(f'<b>{t}</b>', e['texto']) for t in ('Cant.', 'Producto', 'Precio unit.', 'Subtotal')]]
    for detalle in pedido.detalles.select_related('producto').prefetch_related('personalizaciones__opcion'):
        descripcion = _texto(detalle.producto.nombre)
        for p in detalle.personalizaciones.all():
            signo = 'Más' if p.porciones > 0 else 'Menos'
            descripcion += f'<br/><font size="8.5" color="#6E4F48">{signo} {_texto(p.opcion.nombre).lower()} ({p.porciones:+d})</font>'
        if detalle.comentario:
            descripcion += f'<br/><font size="8.5" color="#6E4F48">Comentario: {_texto(detalle.comentario)}</font>'
        filas.append([
            Paragraph(str(detalle.cantidad), e['texto']), Paragraph(descripcion, e['texto']),
            Paragraph(clp(detalle.precio_unitario), e['derecha']), Paragraph(clp(detalle.subtotal), e['derecha']),
        ])
    filas.append(['', '', Paragraph('<b>Total</b>', e['derecha']), Paragraph(f'<b>{clp(pedido.total)}</b>', e['derecha'])])
    tabla = Table(filas, colWidths=[1.6 * cm, None, 3 * cm, 3 * cm], repeatRows=1)
    tabla.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (-1, 0), 1, CHOCOLATE),
        ('LINEBELOW', (0, 1), (-1, -2), 0.4, BORDE),
        ('LINEABOVE', (0, -1), (-1, -1), 1, CHOCOLATE),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    partes += [Paragraph('Productos', e['seccion']), tabla]

    if pedido.diseno:
        partes += [Paragraph('Diseño', e['seccion']), Paragraph(_texto(pedido.diseno), e['texto'])]

    # Evidencia de entrega (si ya se entregó por despacho)
    despacho = getattr(pedido, 'despacho', None)
    if despacho and despacho.fecha_entrega_real:
        partes.append(Paragraph('Entrega realizada', e['seccion']))
        partes.append(Paragraph(
            f'Recibió <b>{_texto(despacho.nombre_receptor)}</b> el {_fecha(despacho.fecha_entrega_real)}.', e['texto']))
        if despacho.firma:
            try:
                with default_storage.open(despacho.firma.name, 'rb') as archivo:
                    firma = Image(io.BytesIO(archivo.read()), width=6 * cm, height=2.4 * cm, kind='proportional', hAlign='LEFT')
                partes += [Spacer(1, 4), firma, Paragraph('Firma de quien recibió', e['nota'])]
            except Exception:  # noqa: BLE001 - sin la imagen, el comprobante igual se entrega
                registro.warning('No se pudo leer la firma del despacho %s', despacho.pk)

    partes += [Spacer(1, 18), Paragraph(
        f'Documento generado el {_fecha(timezone.now())}. Dulce Arte · Sistema de Trazabilidad y Pedidos.', e['nota'])]
    doc.build(partes)
    return buffer.getvalue()


def guardar_en_s3(nombre, contenido):
    """
    Guarda el PDF en la carpeta privada descargas/ del bucket.
    En el computador (sin S3) lo guarda en media/descargas/.
    Devuelve la ubicación, o None si no se pudo guardar (la descarga igual funciona).
    """
    clave = f'descargas/{nombre}'
    try:
        if settings.USAR_S3:
            import boto3

            boto3.client('s3', region_name=getattr(settings, 'AWS_S3_REGION_NAME', 'us-east-1')).put_object(
                Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=clave, Body=contenido,
                ContentType='application/pdf',
            )
            return f's3://{settings.AWS_STORAGE_BUCKET_NAME}/{clave}'
        ruta = Path(settings.MEDIA_ROOT) / clave
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_bytes(contenido)
        return str(ruta)
    except Exception:  # noqa: BLE001
        registro.exception('No se pudo guardar %s en S3', clave)
        return None
