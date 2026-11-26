"""
Ayudas para usar S3 con boto3.

ExpectedBucketOwner: en cada llamada a S3 se indica la cuenta AWS dueña del bucket.
Si el bucket llegara a pertenecer a otra cuenta (por ejemplo, alguien lo borró y otra
persona creó uno con el mismo nombre), S3 rechaza la petición con 403 en vez de
entregarle o escribirle los datos a un tercero.

La cuenta se lee de AWS_BUCKET_OWNER en el .env; si no está, se consulta una vez
a STS (GetCallerIdentity, que no necesita permisos) con el rol de la EC2.
"""

from functools import lru_cache

from django.conf import settings


@lru_cache(maxsize=1)
def dueno_del_bucket():
    cuenta = getattr(settings, 'AWS_BUCKET_OWNER', '')
    if cuenta:
        return cuenta
    import boto3

    return boto3.client('sts', region_name=getattr(settings, 'AWS_S3_REGION_NAME', 'us-east-1')).get_caller_identity()['Account']
