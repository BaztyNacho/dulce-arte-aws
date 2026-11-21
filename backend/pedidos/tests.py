"""Pruebas de la app pedidos."""

from django.test import TestCase, override_settings
from django.utils import timezone


class ComprobantePdfTests(TestCase):
    """GET /api/pedidos/<id>/pdf/ entrega el comprobante y guarda una copia en S3."""

    @classmethod
    def setUpTestData(cls):
        from django.contrib.auth.models import Group, User
        from django.core.management import call_command

        from inventario.models import Producto
        from pedidos.models import Cliente, DetallePedido, Pedido

        call_command('crear_roles', verbosity=0)
        cls.ventas = User.objects.create_user('vende', password='x')
        cls.ventas.groups.add(Group.objects.get(name='Atención y Ventas'))
        cls.bodega = User.objects.create_user('bodeguero', password='x')
        cls.bodega.groups.add(Group.objects.get(name='Bodega'))
        cliente = Cliente.objects.create(nombre='Ana <b>Pérez</b>', telefono='+56 9 1111 1111')
        producto = Producto.objects.create(nombre='Torta de lúcuma', categoria='tortas', precio_base=25000)
        cls.pedido = Pedido.objects.create(cliente=cliente, fecha_entrega=timezone.now() + timezone.timedelta(days=2),
                                           diseno='Flores & "mensaje"\\nFeliz día')
        DetallePedido.objects.create(pedido=cls.pedido, producto=producto, cantidad=2, precio_unitario=25000)

    def test_descarga_pdf_y_guarda_copia(self):
        from unittest import mock

        from rest_framework.test import APIClient

        cliente = APIClient()
        cliente.force_authenticate(self.ventas)
        with override_settings(USAR_S3=True, AWS_STORAGE_BUCKET_NAME='bucket-prueba'):
            s3 = mock.MagicMock()
            with mock.patch('boto3.client', return_value=s3):
                respuesta = cliente.get(f'/api/pedidos/{self.pedido.pk}/pdf/')
        self.assertEqual(respuesta.status_code, 200)
        self.assertEqual(respuesta['Content-Type'], 'application/pdf')
        self.assertTrue(respuesta.content.startswith(b'%PDF'))
        self.assertIn('attachment', respuesta['Content-Disposition'])
        self.assertEqual(s3.put_object.call_args.kwargs['Key'], f'descargas/pedidos/pedido-{self.pedido.pk}.pdf')
        self.assertEqual(respuesta['X-Copia-S3'], f's3://bucket-prueba/descargas/pedidos/pedido-{self.pedido.pk}.pdf')

    def test_bodega_no_puede_descargar(self):
        from rest_framework.test import APIClient

        cliente = APIClient()
        cliente.force_authenticate(self.bodega)
        self.assertEqual(cliente.get(f'/api/pedidos/{self.pedido.pk}/pdf/').status_code, 403)
