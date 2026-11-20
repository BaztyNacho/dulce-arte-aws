"""
Muestra si la conexión de Django con RDS va cifrada (TLS) y con qué algoritmo.
Uso (en la EC2 backend):
    cd ~/dulce-arte-aws/backend && venv/bin/python manage.py shell < deploy/verificar_cifrado.py
"""
from django.conf import settings
from django.db import connection

with connection.cursor() as cursor:
    cursor.execute('SELECT ssl, version, cipher, bits FROM pg_stat_ssl WHERE pid = pg_backend_pid()')
    ssl, version, cifrado, bits = cursor.fetchone()
    cursor.execute('SHOW rds.force_ssl')
    forzado = cursor.fetchone()[0]

print('Conexión Django -> RDS')
print(f'  Cifrada (TLS):        {"SÍ" if ssl else "NO"}')
print(f'  Versión de TLS:       {version}')
print(f'  Algoritmo:            {cifrado} ({bits} bits)')
print(f'  sslmode de Django:    {settings.DATABASES["default"]["OPTIONS"].get("sslmode")}')
print(f'  RDS exige TLS:        {"SÍ" if forzado == "1" else "NO"} (rds.force_ssl = {forzado})')
