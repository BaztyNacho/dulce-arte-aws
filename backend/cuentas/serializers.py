"""
Inicio de sesión con JWT (JSON Web Token) para el frontend en React.

Flujo:
  1. React envía usuario y contraseña a POST /api/auth/token/
  2. El backend responde con dos tokens:
     - access:  dura 30 minutos y va en cada petición (cabecera Authorization: Bearer <access>)
     - refresh: dura 8 horas (una jornada) y sirve para pedir un access nuevo
  3. Junto a los tokens se envían los datos del usuario y su rol, para armar el menú.
"""

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from pedidos.permisos import NOMBRES_ROL, rol_principal, roles_de


def datos_usuario(usuario):
    rol = rol_principal(usuario)
    nombre = usuario.first_name or usuario.username
    iniciales = (nombre[:1] + usuario.last_name[:1]).upper()
    return {
        'id': usuario.pk,
        'username': usuario.username,
        'nombre': nombre,
        'nombre_completo': usuario.get_full_name() or usuario.username,
        'iniciales': iniciales,
        'email': usuario.email,
        'rol': rol,                              # el rol que define la interfaz
        'nombre_rol': NOMBRES_ROL.get(rol, ''),
        'roles': sorted(roles_de(usuario)),
    }


class TokenConRolSerializer(TokenObtainPairSerializer):
    default_error_messages = {
        'no_active_account': 'Usuario o contraseña incorrectos.',
    }

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        # Datos extra dentro del token (React puede leerlos sin otra petición)
        token['username'] = user.username
        token['rol'] = rol_principal(user)
        return token

    def validate(self, attrs):
        datos = super().validate(attrs)
        if not roles_de(self.user):
            raise serializers.ValidationError(
                {'detail': 'Tu usuario no tiene un rol asignado. Pide al Administrador que te asigne uno.'}
            )
        datos['usuario'] = datos_usuario(self.user)
        return datos


class PasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False)
