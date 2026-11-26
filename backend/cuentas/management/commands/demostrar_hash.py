"""
Evidencia de que las contraseñas NO se guardan en texto plano.

Uso (en la EC2 backend):
    venv/bin/python manage.py demostrar_hash                    # demostración con una contraseña de ejemplo
    venv/bin/python manage.py demostrar_hash --usuario cocina1  # además muestra cómo está guardado ese usuario en RDS
"""

import secrets

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password, identify_hasher, make_password
from django.core.management.base import BaseCommand
from django.db import connection


def partes(codificada):
    """Separa el hash guardado en: algoritmo, parámetros, salt y hash."""
    hasher = identify_hasher(codificada)
    datos = hasher.decode(codificada)
    parametros = {k: v for k, v in datos.items() if k not in ('algorithm', 'salt', 'hash', 'params')}
    return datos['algorithm'], parametros, datos.get('salt', ''), datos.get('hash', '')


class Command(BaseCommand):
    help = 'Demuestra que Django guarda las contraseñas con hash y salt (Argon2), no en texto plano.'

    def add_arguments(self, parser):
        parser.add_argument('--usuario', help='Usuario real cuyo registro en la base de datos se mostrará')

    def handle(self, *args, **opciones):
        linea = '-' * 70
        self.stdout.write(linea)
        self.stdout.write('1. Configuración (settings.PASSWORD_HASHERS)')
        for i, nombre in enumerate(settings.PASSWORD_HASHERS):
            marca = '  <- se usa para contraseñas nuevas' if i == 0 else ''
            self.stdout.write(f'   {nombre.rsplit(".", 1)[-1]}{marca}')

        self.stdout.write(linea)
        self.stdout.write('2. La misma contraseña, guardada dos veces')
        # Contraseña de ejemplo generada al azar en cada ejecución (no queda escrita en el código)
        ejemplo = secrets.token_urlsafe(12)
        uno, dos = make_password(ejemplo), make_password(ejemplo)
        self.stdout.write(f'   Contraseña de ejemplo: {ejemplo}')
        for etiqueta, valor in (('Hash 1', uno), ('Hash 2', dos)):
            algoritmo, parametros, salt, _ = partes(valor)
            self.stdout.write(f'   {etiqueta}: {valor}')
            self.stdout.write(f'           algoritmo={algoritmo}  parámetros={parametros}')
            self.stdout.write(f'           salt={salt}')
        self.stdout.write(f'   ¿Los dos hash son iguales?            {"SÍ" if uno == dos else "NO (cada uno tiene su propio salt)"}')
        self.stdout.write(f'   ¿Aparece la contraseña en el hash?    {"SÍ" if ejemplo in uno else "NO"}')
        self.stdout.write(f'   check_password(correcta)   -> {check_password(ejemplo, uno)}')
        self.stdout.write(f'   check_password(incorrecta) -> {check_password(ejemplo + "x", uno)}')

        usuario = opciones.get('usuario')
        if usuario:
            self.stdout.write(linea)
            self.stdout.write(f'3. Lo que hay realmente en la base de datos ({connection.vendor}, tabla auth_user, columna password)')
            # El ORM lee el valor tal como está guardado en la columna "password" de RDS
            fila = get_user_model().objects.filter(username=usuario).values_list('username', 'password').first()
            if not fila:
                self.stdout.write(self.style.ERROR(f'   No existe el usuario "{usuario}".'))
            else:
                algoritmo, parametros, salt, _ = partes(fila[1])
                self.stdout.write(f'   usuario  = {fila[0]}')
                self.stdout.write(f'   password = {fila[1]}')
                self.stdout.write(f'   algoritmo={algoritmo}  parámetros={parametros}  salt={salt}')
                if algoritmo != 'argon2':
                    self.stdout.write('   (Usa el algoritmo anterior. Se convertirá a Argon2 la próxima vez que este usuario inicie sesión.)')
        self.stdout.write(linea)
