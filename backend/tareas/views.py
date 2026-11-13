"""
Respaldo de la base de datos, pedido por la función Lambda cada día (EventBridge).

POST /api/respaldos/   (cabecera X-Token-Respaldo: <RESPALDO_TOKEN>)

1. Exporta todos los datos con "dumpdata" (formato JSON, comprimido con gzip).
2. Lo sube al bucket S3, carpeta privada respaldos/  (la EC2 usa el rol LabRole).
3. Borra los respaldos automáticos más antiguos y deja los últimos RESPALDOS_A_CONSERVAR.
4. Responde un resumen que la Lambda envía por correo (SNS).
"""

import gzip
import hmac
import io

from django.conf import settings
from django.core.management import call_command
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from despachos.models import Despacho
from inventario.models import Insumo, MovimientoInsumo
from pedidos.models import Cliente, Pedido

PREFIJO = 'respaldos/automaticos/'


@extend_schema(exclude=True)
@api_view(['POST'])
@authentication_classes([])          # no usa JWT: se protege con un token propio
@permission_classes([AllowAny])
def respaldo(request):
    token = request.headers.get('X-Token-Respaldo', '')
    if not settings.RESPALDO_TOKEN or not hmac.compare_digest(token, settings.RESPALDO_TOKEN):
        return Response({'detail': 'Token de respaldo inválido.'}, status=403)

    # 1. Exportar los datos (sin sesiones ni caché, que no hacen falta para restaurar)
    salida = io.StringIO()
    call_command(
        'dumpdata', '--natural-foreign', '--natural-primary', '--indent', '0',
        '--exclude', 'contenttypes', '--exclude', 'auth.permission',
        '--exclude', 'sessions', '--exclude', 'admin.logentry',
        stdout=salida,
    )
    contenido = gzip.compress(salida.getvalue().encode('utf-8'))

    ahora = timezone.localtime()
    nombre = f'{PREFIJO}respaldo_{ahora:%Y-%m-%d_%H%M}.json.gz'
    resumen = {
        'archivo': f's3://{settings.AWS_STORAGE_BUCKET_NAME}/{nombre}' if settings.USAR_S3 else nombre,
        'tamano_kb': round(len(contenido) / 1024, 1),
        'fecha': ahora.strftime('%d-%m-%Y %H:%M'),
        'registros': {
            'pedidos': Pedido.objects.count(),
            'clientes': Cliente.objects.count(),
            'insumos': Insumo.objects.count(),
            'movimientos': MovimientoInsumo.objects.count(),
            'despachos': Despacho.objects.count(),
        },
        'borrados': 0,
    }

    # 2 y 3. Subir a S3 y conservar solo los últimos N
    if settings.USAR_S3:
        import boto3

        s3 = boto3.client('s3', region_name=getattr(settings, 'AWS_S3_REGION_NAME', 'us-east-1'))
        s3.put_object(
            Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=nombre, Body=contenido,
            ContentType='application/gzip',
        )
        listado = s3.list_objects_v2(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Prefix=PREFIJO).get('Contents', [])
        antiguos = sorted(listado, key=lambda o: o['Key'])[:-settings.RESPALDOS_A_CONSERVAR]
        for objeto in antiguos:
            s3.delete_object(Bucket=settings.AWS_STORAGE_BUCKET_NAME, Key=objeto['Key'])
        resumen['borrados'] = len(antiguos)

    return Response(resumen, status=201)
