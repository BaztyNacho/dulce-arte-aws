"""
Pruebas del backend para AWS: login con JWT, permisos por rol en las pantallas,
acceso al Admin y protección de la API Gateway.

Ejecutar (sin RDS, usa SQLite):
    python manage.py test --settings=config.test_settings
"""

from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.test import RequestFactory, TestCase
from django.http import HttpResponse
from rest_framework.test import APIClient

from cuentas.middleware import SoloDesdeGateway


class BaseDulceArte(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command('crear_roles', verbosity=0)
        cls.admin = User.objects.create_superuser('jefa', 'jefa@dulcearte.cl', 'clave-segura-1')
        cls.ventas = cls._usuario('vendedora', 'Atención y Ventas')
        cls.cocina = cls._usuario('cocinero', 'Cocina')
        cls.bodega = cls._usuario('bodeguero', 'Bodega')
        cls.repartidor = cls._usuario('repartidor', 'Repartidor')

    @staticmethod
    def _usuario(nombre, grupo):
        usuario = User.objects.create_user(nombre, password='clave-segura-1')
        usuario.groups.add(Group.objects.get(name=grupo))
        return usuario

    def cliente_con_token(self, usuario):
        respuesta = APIClient().post(
            '/api/auth/token/', {'username': usuario.username, 'password': 'clave-segura-1'}, format='json'
        )
        self.assertEqual(respuesta.status_code, 200)
        cliente = APIClient()
        cliente.credentials(HTTP_AUTHORIZATION='Bearer ' + respuesta.json()['access'])
        return cliente


class LoginJWTTests(BaseDulceArte):
    def test_login_entrega_tokens_y_rol(self):
        datos = APIClient().post(
            '/api/auth/token/', {'username': 'cocinero', 'password': 'clave-segura-1'}, format='json'
        ).json()
        self.assertIn('access', datos)
        self.assertIn('refresh', datos)
        self.assertEqual(datos['usuario']['rol'], 'cocina')

    def test_contrasena_incorrecta(self):
        respuesta = APIClient().post(
            '/api/auth/token/', {'username': 'cocinero', 'password': 'otra'}, format='json'
        )
        self.assertEqual(respuesta.status_code, 401)

    def test_sin_token_no_entra(self):
        self.assertEqual(APIClient().get('/api/pantallas/inicio/').status_code, 401)

    def test_yo(self):
        datos = self.cliente_con_token(self.bodega).get('/api/auth/yo/').json()
        self.assertEqual(datos['rol'], 'bodega')


class PantallasPorRolTests(BaseDulceArte):
    def test_cada_rol_ve_su_inicio(self):
        for usuario, rol in [(self.admin, 'admin'), (self.ventas, 'ventas'), (self.cocina, 'cocina'),
                             (self.bodega, 'bodega'), (self.repartidor, 'repartidor')]:
            datos = self.cliente_con_token(usuario).get('/api/pantallas/inicio/').json()
            self.assertEqual(datos['rol'], rol)

    def test_permisos_de_pantallas(self):
        casos = [
            ('/api/pantallas/catalogo/', self.ventas, 200), ('/api/pantallas/catalogo/', self.admin, 403),
            ('/api/pantallas/bodega/', self.bodega, 200), ('/api/pantallas/bodega/', self.cocina, 403),
            ('/api/pantallas/despachos/', self.repartidor, 200), ('/api/pantallas/despachos/', self.admin, 403),
            ('/api/pantallas/entregados/', self.admin, 200), ('/api/pantallas/pedidos/', self.bodega, 403),
        ]
        for url, usuario, esperado in casos:
            with self.subTest(url=url, usuario=usuario.username):
                self.assertEqual(self.cliente_con_token(usuario).get(url).status_code, esperado)


class AccesoAdminTests(BaseDulceArte):
    def test_contrasena_correcta_abre_el_admin(self):
        cliente = self.cliente_con_token(self.admin)
        respuesta = cliente.post('/api/auth/admin/', {'password': 'clave-segura-1'}, format='json')
        self.assertEqual(respuesta.json()['url'], '/admin/')
        self.assertEqual(cliente.get('/admin/').status_code, 200)

    def test_solo_el_administrador(self):
        cliente = self.cliente_con_token(self.ventas)
        self.assertEqual(cliente.post('/api/auth/admin/', {'password': 'clave-segura-1'}, format='json').status_code, 403)


class GatewayTests(TestCase):
    def test_cabecera_secreta(self):
        middleware = SoloDesdeGateway(lambda request: HttpResponse('ok'))
        middleware.secreto = 'secreto-de-prueba'
        fabrica = RequestFactory()
        self.assertEqual(middleware(fabrica.get('/api/pedidos/')).status_code, 403)
        self.assertEqual(
            middleware(fabrica.get('/api/pedidos/', HTTP_X_ORIGEN_GATEWAY='secreto-de-prueba')).status_code, 200
        )
        self.assertEqual(middleware(fabrica.get('/api/salud/')).status_code, 200)
