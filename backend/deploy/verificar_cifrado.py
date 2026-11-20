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
    # current_setting(..., true) devuelve NULL en vez de error si el parámetro no es visible
    cursor.execute("SELECT current_setting('rds.force_ssl', true)")
    forzado = cursor.fetchone()[0]

print('Conexión Django -> RDS')
print(f'  Cifrada (TLS):        {"SÍ" if ssl else "NO"}')
print(f'  Versión de TLS:       {version}')
print(f'  Algoritmo:            {cifrado} ({bits} bits)')
print(f'  sslmode de Django:    {settings.DATABASES["default"]["OPTIONS"].get("sslmode")}')
if forzado is None:
    print('  RDS exige TLS:        ver "rds.force_ssl" en el grupo de parámetros de RDS')
else:
    print(f'  RDS exige TLS:        {"SÍ" if forzado == "1" else "NO"} (rds.force_ssl = {forzado})')
