"""
Avisos por correo: el backend NO envía correos directamente.
Invoca de forma asíncrona la función Lambda "dulce-arte-tareas" (serverless), y la Lambda
publica el mensaje en el tema SNS, que lo reparte por correo a los suscriptores.

    Backend (EC2) --invoca--> Lambda --publica--> SNS --correo--> Administrador

Si la variable LAMBDA_AVISOS está vacía (por ejemplo en tu computador), no se envía nada.
"""

import json
import logging

from django.conf import settings
from django.db import transaction

registro = logging.getLogger(__name__)


def _invocar(asunto, mensaje):
    try:
        import boto3  # se importa aquí para no exigir boto3 si los avisos están apagados

        cliente = boto3.client('lambda', region_name=settings.AWS_REGION_AVISOS)
        cliente.invoke(
            FunctionName=settings.LAMBDA_AVISOS,
            InvocationType='Event',          # asíncrono: el usuario no espera la respuesta
            Payload=json.dumps({'tipo': 'aviso', 'asunto': asunto, 'mensaje': mensaje}).encode(),
        )
    except Exception:  # noqa: BLE001 - un aviso fallido nunca debe romper un pedido
        registro.exception('No se pudo enviar el aviso "%s"', asunto)


def enviar_aviso(asunto, mensaje):
    """Envía el aviso solo si la operación se guardó en la base de datos (on_commit)."""
    if not settings.LAMBDA_AVISOS:
        return
    transaction.on_commit(lambda: _invocar(asunto, mensaje))
