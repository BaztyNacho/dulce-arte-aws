"""
Función Lambda "dulce-arte-tareas" de Dulce Arte (serverless: no vive en ningún servidor).

Hace dos trabajos, según quién la llame:

1) RESPALDO AUTOMÁTICO  (la llama EventBridge todos los días, o el botón "Probar")
   - Pide al backend, a través de la API Gateway, que genere un respaldo:
       POST https://<api-gateway>/api/respaldos/   con la cabecera X-Token-Respaldo
   - El backend exporta la base de datos (RDS) y la guarda en S3: respaldos/automaticos/
   - La Lambda publica el resultado (éxito o error) en el tema SNS -> llega un correo.

2) AVISO  (la llama el backend cuando un insumo queda bajo el mínimo o un pedido queda Listo)
   - Recibe {"tipo": "aviso", "asunto": "...", "mensaje": "..."}
   - Lo publica en el tema SNS -> llega un correo.

Variables de entorno (Configuración > Variables de entorno):
   API_URL         https://<id>.execute-api.us-east-1.amazonaws.com
   RESPALDO_TOKEN  el mismo valor que RESPALDO_TOKEN en el .env del backend
   SNS_TOPIC_ARN   ARN del tema SNS "dulce-arte-avisos"
"""

import json
import os
import urllib.error
import urllib.request

import boto3

sns = boto3.client('sns')


def publicar(asunto, mensaje):
    """Publica en SNS. El asunto de un correo SNS admite hasta 100 caracteres."""
    sns.publish(
        TopicArn=os.environ['SNS_TOPIC_ARN'],
        Subject=f'Dulce Arte · {asunto}'[:100],
        Message=mensaje,
    )


def hacer_respaldo():
    url = os.environ['API_URL'].rstrip('/') + '/api/respaldos/'
    peticion = urllib.request.Request(
        url,
        method='POST',
        data=b'{}',
        headers={
            'Content-Type': 'application/json',
            'X-Token-Respaldo': os.environ['RESPALDO_TOKEN'],
            'User-Agent': 'dulce-arte-lambda',
        },
    )
    try:
        with urllib.request.urlopen(peticion, timeout=50) as respuesta:
            datos = json.loads(respuesta.read())
    except urllib.error.HTTPError as error:
        detalle = error.read().decode(errors='replace')[:500]
        publicar('Respaldo FALLIDO', f'El backend respondió {error.code} al pedir el respaldo.\n\n{detalle}')
        raise
    except Exception as error:  # noqa: BLE001 - se informa cualquier problema por correo
        publicar('Respaldo FALLIDO', f'No se pudo contactar al backend ({url}).\n\nError: {error}')
        raise

    registros = '\n'.join(f'  - {nombre}: {cantidad}' for nombre, cantidad in datos['registros'].items())
    publicar(
        'Respaldo diario completado',
        f'Se respaldó la base de datos el {datos["fecha"]}.\n\n'
        f'Archivo: {datos["archivo"]}\n'
        f'Tamaño: {datos["tamano_kb"]} KB (comprimido)\n'
        f'Respaldos antiguos eliminados: {datos["borrados"]}\n\n'
        f'Registros respaldados:\n{registros}',
    )
    return datos


def lambda_handler(event, context):
    # Aviso enviado por el backend
    if isinstance(event, dict) and event.get('tipo') == 'aviso':
        publicar(event.get('asunto', 'Aviso'), event.get('mensaje', ''))
        return {'ok': True, 'trabajo': 'aviso'}

    # Cualquier otra llamada (EventBridge o prueba manual): respaldo
    datos = hacer_respaldo()
    return {'ok': True, 'trabajo': 'respaldo', 'archivo': datos['archivo']}
