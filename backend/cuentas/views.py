"""
Endpoints de cuentas: login con JWT, datos del usuario y acceso al panel de Administración.
"""

from django.contrib.auth import login
from django.core.cache import cache
from django.db import connection
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView

from pedidos.permisos import EsAdministrador

from .serializers import PasswordSerializer, TokenConRolSerializer, datos_usuario

MAX_INTENTOS_ADMIN = 5


class IniciarSesionView(TokenObtainPairView):
    """POST usuario + contraseña -> tokens JWT y datos del usuario con su rol."""

    serializer_class = TokenConRolSerializer


@extend_schema(responses=OpenApiTypes.OBJECT)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def yo(request):
    """Datos del usuario conectado (React lo usa al recargar la página)."""
    return Response(datos_usuario(request.user))


@extend_schema(request=PasswordSerializer, responses=None)
@api_view(['POST'])
@permission_classes([EsAdministrador])
def acceso_admin(request):
    """
    Antes de entrar al panel de Administración (Django Admin) se vuelve a pedir la contraseña.
    Si es correcta, se crea una sesión de Django (cookie) y React redirige a /admin/.
    Tras 5 intentos fallidos se responde 'cerrar_sesion': React cierra la sesión del usuario.
    """
    datos = PasswordSerializer(data=request.data)
    datos.is_valid(raise_exception=True)
    clave_intentos = f'intentos_admin_{request.user.pk}'

    if request.user.check_password(datos.validated_data['password']):
        cache.delete(clave_intentos)
        # login() crea la sesión de Django y dispara la señal que la marca como verificada
        login(request, request.user, backend='django.contrib.auth.backends.ModelBackend')
        return Response({'url': '/admin/'})

    intentos = cache.get(clave_intentos, 0) + 1
    cache.set(clave_intentos, intentos, timeout=15 * 60)
    if intentos >= MAX_INTENTOS_ADMIN:
        cache.delete(clave_intentos)
        return Response(
            {'detail': 'Se cerró la sesión por demasiados intentos fallidos. Vuelve a ingresar.',
             'cerrar_sesion': True},
            status=status.HTTP_403_FORBIDDEN,
        )
    return Response(
        {'detail': f'Contraseña incorrecta. Te quedan {MAX_INTENTOS_ADMIN - intentos} intento(s).'},
        status=status.HTTP_400_BAD_REQUEST,
    )


@extend_schema(responses=None)
@api_view(['GET'])
@permission_classes([AllowAny])
def salud(request):
    """
    Revisión de salud: la usa la API Gateway / el profesor para comprobar que el backend
    está vivo y conectado a la base de datos RDS.
    """
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
        base_datos = 'ok'
    except Exception:  # noqa: BLE001 - solo informamos el estado
        base_datos = 'sin conexión'
    return Response({'estado': 'ok', 'base_datos': base_datos})
