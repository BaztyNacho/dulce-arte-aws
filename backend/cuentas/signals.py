"""
Al iniciar sesión con contraseña (login del Django Admin o el endpoint /api/auth/admin/),
la sesión queda "verificada" por 10 minutos para entrar al panel de Administración.
"""

import time

from django.contrib.auth.signals import user_logged_in
from django.dispatch import receiver

from .middleware import CLAVE_SESION, DURACION_SEGUNDOS


@receiver(user_logged_in)
def marcar_sesion_verificada(sender, request, user, **kwargs):
    if request is not None and hasattr(request, 'session'):
        request.session[CLAVE_SESION] = time.time() + DURACION_SEGUNDOS
