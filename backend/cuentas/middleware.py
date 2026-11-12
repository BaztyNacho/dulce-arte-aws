"""
Middlewares de seguridad del backend.

1) SoloDesdeGateway: el backend solo responde a peticiones que pasan por la API Gateway.
   La API Gateway agrega una cabecera secreta (X-Origen-Gateway) a cada petición; si alguien
   intenta entrar directo a la IP de la EC2, no trae esa cabecera y recibe un 403.
   Se activa solo si la variable GATEWAY_SECRETO está definida en el .env.

2) VerificarAccesoAdmin: aunque el usuario ya tenga sesión, para usar /admin/ debe haber
   escrito su contraseña hace menos de 10 minutos. Si no, se cierra esa sesión y se le
   muestra el login del Admin otra vez. La verificación se renueva mientras siga trabajando.
"""

import hmac
import time

from django.conf import settings
from django.contrib.auth import logout
from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import reverse

CLAVE_SESION = 'admin_verificado_hasta'
DURACION_SEGUNDOS = 10 * 60

# Rutas que responden aunque no vengan desde la API Gateway (revisión de salud de la EC2)
RUTAS_LIBRES = ('/api/salud/',)


class SoloDesdeGateway:
    def __init__(self, get_response):
        self.get_response = get_response
        self.secreto = getattr(settings, 'GATEWAY_SECRETO', '')

    def __call__(self, request):
        if self.secreto and request.path not in RUTAS_LIBRES:
            recibido = request.headers.get('X-Origen-Gateway', '')
            # compare_digest compara en tiempo constante (no da pistas a quien adivina)
            if not hmac.compare_digest(recibido, self.secreto):
                return JsonResponse(
                    {'detail': 'Acceso directo no permitido. Usa la dirección de la API Gateway.'},
                    status=403,
                )
        return self.get_response(request)


class VerificarAccesoAdmin:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        prefijo_admin = reverse('admin:index')               # "/admin/"
        exentas = (reverse('admin:login'), reverse('admin:logout'))
        if (
            request.path.startswith(prefijo_admin)
            and request.path not in exentas
            and request.user.is_authenticated
        ):
            ahora = time.time()
            if request.session.get(CLAVE_SESION, 0) < ahora:
                # Pasaron más de 10 minutos: se vuelve a pedir la contraseña
                logout(request)
                return redirect(f"{reverse('admin:login')}?next={request.get_full_path()}")
            request.session[CLAVE_SESION] = ahora + DURACION_SEGUNDOS
        return self.get_response(request)
