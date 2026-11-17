"""
Rate limit de Django: cómo se identifica a cada cliente.

Detrás de la API Gateway, Django no ve la IP del usuario sino la de la API Gateway
(por eso todos los usuarios parecerían "la misma persona"). La solución:
la API Gateway escribe la IP real del cliente en la cabecera X-Ip-Cliente,
con el mapeo de parámetros  Sobrescribir header.X-Ip-Cliente = $context.identity.sourceIp

"Sobrescribir" reemplaza cualquier valor que el cliente intente enviar, así nadie puede
falsificar su IP. Y como el backend solo acepta peticiones con la cabecera secreta de la
API Gateway, esta cabecera siempre viene de ella. Sin la cabecera (en tu computador),
se usa la IP normal de la conexión.
"""

from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class IpDelCliente:
    def get_ident(self, request):
        ip = request.META.get('HTTP_X_IP_CLIENTE', '').split(',')[0].strip()
        return ip or super().get_ident(request)


class LimiteAnonimo(IpDelCliente, AnonRateThrottle):
    """Sin sesión: 60 peticiones por minuto por IP."""


class LimiteUsuario(IpDelCliente, UserRateThrottle):
    """Con sesión: 600 peticiones por minuto por usuario."""


class LimiteLogin(IpDelCliente, AnonRateThrottle):
    """Máximo 10 intentos de inicio de sesión por minuto desde una misma IP (contra fuerza bruta)."""

    scope = 'login'


class LimiteAccesoAdmin(IpDelCliente, UserRateThrottle):
    """Máximo 5 intentos por minuto de la contraseña antes del Admin."""

    scope = 'admin_acceso'
